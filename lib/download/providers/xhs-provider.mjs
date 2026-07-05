import { access, readFile, rename, rm } from 'node:fs/promises';
import { createWriteStream, openSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import { normaliseXhsMediaUrl } from '../url.mjs';

function xhsResourceName(value) {
  const text = typeof value === 'string' ? value : '';
  const withoutControls = text.replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ').trim();
  return (withoutControls || 'xiaohongshu').slice(0, 80).replace(/\s+/g, ' ');
}

function extensionFromResponse(response, sourceUrl) {
  const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase();
  const byType = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/heic': 'heic',
  };
  if (byType[contentType]) return byType[contentType];
  const suffix = path.extname(new URL(sourceUrl).pathname).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(suffix) ? suffix : 'bin';
}

function xhsDetailsFromPayload(payload) {
  const data = payload?.data;
  const rawUrls = Array.isArray(data?.下载地址) ? data.下载地址 : [];
  const urls = rawUrls.map(normaliseXhsMediaUrl).filter(Boolean);
  if (!urls.length) {
    const upstreamMessage = typeof payload?.message === 'string' ? payload.message : '';
    const suffix = upstreamMessage ? `（解析器返回：${upstreamMessage}）` : '';
    throw new Error(`XHS-Downloader 在当前网络环境下没有拿到这篇笔记的详情数据，因此没有可保存的媒体地址。即使链接带 xsec_token，小红书也可能对无 Cookie 的服务端请求返回 404/sec 或风控页；如果你本机浏览器能打开这篇笔记，可以在高级选项里临时填写小红书网页版 Cookie 后重试。${suffix}`);
  }
  return {
    urls: [...new Set(urls)],
    title: xhsResourceName(data?.作品标题 || data?.作品ID),
    type: data?.作品类型 === '视频' ? 'video' : 'image',
    description: typeof data?.作品描述 === 'string' ? data.作品描述 : '',
    authorNickname: typeof data?.作者昵称 === 'string' ? data.作者昵称 : '',
    authorId: typeof data?.作者ID === 'string' ? data.作者ID : '',
    noteId: typeof data?.作品ID === 'string' ? data.作品ID : '',
    noteUrl: typeof data?.作品链接 === 'string' ? data.作品链接 : '',
    publishedAt: typeof data?.发布时间 === 'string' ? data.发布时间 : '',
    updatedAt: typeof data?.最后更新时间 === 'string' ? data.最后更新时间 : '',
    tags: typeof data?.作品标签 === 'string' ? data.作品标签 : '',
    metrics: {
      likes: data?.点赞数量 ?? null,
      collections: data?.收藏数量 ?? null,
      comments: data?.评论数量 ?? null,
      shares: data?.分享数量 ?? null,
    },
  };
}

function xhsNoteText(details) {
  return [
    `标题：${details.title}`,
    details.authorNickname ? `作者：${details.authorNickname}${details.authorId ? `（${details.authorId}）` : ''}` : '',
    details.publishedAt ? `发布时间：${details.publishedAt}` : '',
    details.updatedAt ? `最后更新：${details.updatedAt}` : '',
    details.tags ? `标签：${details.tags}` : '',
    details.noteUrl ? `链接：${details.noteUrl}` : '',
    '',
    '正文：',
    details.description || '（无正文）',
    '',
  ].filter((line) => line !== '').join('\n');
}

function xhsMetadataJson(details) {
  return `${JSON.stringify({
    title: details.title,
    type: details.type,
    description: details.description,
    author: {
      nickname: details.authorNickname,
      id: details.authorId,
    },
    note: {
      id: details.noteId,
      url: details.noteUrl,
      publishedAt: details.publishedAt,
      updatedAt: details.updatedAt,
      tags: details.tags,
    },
    metrics: details.metrics,
    mediaCount: details.urls.length,
    exportedAt: new Date().toISOString(),
  }, null, 2)}\n`;
}

async function createZip(entries, outputPath) {
  await new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = createWriteStream(outputPath);
    archive.on('error', reject);
    stream.on('error', reject);
    stream.on('close', resolve);
    archive.pipe(stream);
    for (const entry of entries) {
      if (entry.path) archive.file(entry.path, { name: entry.name });
      else archive.append(entry.content ?? '', { name: entry.name });
    }
    archive.finalize();
  });
}

export class XhsProvider {
  constructor({
    downloadDir,
    xhsSourceDir,
    xhsCookiePath,
    xhsRunnerPath,
    pythonPath,
    xhsApiPort,
    maxJobRuntimeMs,
    maxMediaSizeBytes,
  }) {
    this.id = 'xhs';
    this.downloadDir = downloadDir;
    this.xhsSourceDir = xhsSourceDir;
    this.xhsCookiePath = xhsCookiePath;
    this.xhsRunnerPath = xhsRunnerPath;
    this.pythonPath = pythonPath;
    this.xhsApiPort = xhsApiPort;
    this.maxJobRuntimeMs = maxJobRuntimeMs;
    this.maxMediaSizeBytes = maxMediaSizeBytes;
    this.process = null;
  }

  canHandle(job) {
    return job.platform === '小红书' || job.platform === '小红书媒体';
  }

  apiBaseUrl() {
    const value = process.env.XHS_API_URL || `http://127.0.0.1:${this.xhsApiPort}`;
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('小红书解析服务地址配置无效。');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('小红书解析服务地址配置无效。');
    }
    return url;
  }

  apiEndpoint(endpoint) {
    return new URL(endpoint, this.apiBaseUrl()).toString();
  }

  async isApiAvailable() {
    try {
      const response = await fetch(this.apiEndpoint('/openapi.json'), {
        signal: AbortSignal.timeout(800),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async waitForApi() {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (await this.isApiAvailable()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('小红书解析服务没有在限定时间内启动。请运行 npm run setup 后重试。');
  }

  async ensureApi() {
    if (await this.isApiAvailable()) return;

    if (process.env.XHS_API_URL) {
      throw new Error('小红书解析服务暂时不可用。请确认 XHS_API_URL 指向可访问的本机服务。');
    }

    try {
      await Promise.all([access(this.xhsSourceDir), access(this.xhsRunnerPath), access(this.pythonPath)]);
    } catch {
      throw new Error('小红书解析组件尚未安装。请先在服务目录运行 npm run setup。');
    }

    if (!this.process || this.process.exitCode !== null) {
      // scripts/run-xhs-api.py does `from source import Settings, XHS`. Python
      // resolves that against sys.path[0], which is always the *script's own*
      // directory (scripts/), never the `cwd` a spawned process was given —
      // so `source` (which lives at runtime/xhs-downloader/source/) was never
      // actually importable here, regardless of cwd. PYTHONPATH is what
      // Python's import system does listen to, so point it at xhsSourceDir.
      const logPath = path.join(path.dirname(this.xhsSourceDir), 'xhs-api.log');
      const logFd = openSync(logPath, 'a');
      this.process = spawn(this.pythonPath, [this.xhsRunnerPath], {
        cwd: this.xhsSourceDir,
        env: {
          ...process.env,
          XHS_BIND_HOST: '127.0.0.1',
          XHS_API_PORT: String(this.xhsApiPort),
          PYTHONPATH: this.xhsSourceDir,
        },
        // Was 'ignore' — meant a crash on startup (e.g. an import error)
        // surfaced only as "没有在限定时间内启动" with zero diagnostic
        // info. Logging to a file makes the next failure debuggable instead
        // of another silent timeout.
        stdio: ['ignore', logFd, logFd],
      });
    }

    await this.waitForApi();
  }

  async readCookie() {
    if (process.env.XHS_COOKIE?.trim()) return process.env.XHS_COOKIE.trim();
    try {
      return (await readFile(this.xhsCookiePath, 'utf8')).trim();
    } catch {
      return '';
    }
  }

  async resolveDetails(url, cookieOverride) {
    await this.ensureApi();
    const body = { url, download: false };
    const cookie = cookieOverride || await this.readCookie();
    if (cookie) body.cookie = cookie;
    if (process.env.XHS_PROXY?.trim()) body.proxy = process.env.XHS_PROXY.trim();

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let response;
      try {
        response = await fetch(this.apiEndpoint('/xhs/detail'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(35_000),
        });
      } catch {
        lastError = new Error('小红书解析请求超时。请稍后重试，或使用刚从应用内复制的分享链接。');
      }
      if (response && !response.ok) {
        lastError = new Error('小红书解析服务暂时没有返回结果。请稍后重试。');
      }
      if (response?.ok) {
        try {
          return xhsDetailsFromPayload(await response.json());
        } catch (error) {
          lastError = error;
        }
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 900 * attempt));
    }
    throw lastError || new Error('小红书解析服务暂时没有返回结果。请稍后重试。');
  }

  async downloadMedia(job, mediaUrl, destination, index, total) {
    const response = await fetch(mediaUrl, {
      headers: { Referer: 'https://www.xiaohongshu.com/' },
      redirect: 'follow',
      signal: AbortSignal.any([AbortSignal.timeout(this.maxJobRuntimeMs), job.abortController.signal]),
    });
    const finalUrl = normaliseXhsMediaUrl(response.url);
    if (!finalUrl || !response.ok || !response.body) {
      throw new Error('小红书媒体地址已失效或不可访问。请重新复制笔记分享链接后再试。');
    }

    const expectedSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(expectedSize) && expectedSize > this.maxMediaSizeBytes) {
      throw new Error('媒体文件超过 750 MB 上限，暂时无法下载。');
    }

    let bytes = 0;
    const progressBase = (index / total) * 92;
    const progressSpan = 92 / total;
    const tracker = new Transform({
      transform: (chunk, _encoding, callback) => {
        bytes += chunk.length;
        if (bytes > this.maxMediaSizeBytes) {
          callback(new Error('媒体文件超过 750 MB 上限，暂时无法下载。'));
          return;
        }
        if (Number.isFinite(expectedSize) && expectedSize > 0) {
          job.progress = Math.min(96, Math.round(progressBase + (bytes / expectedSize) * progressSpan));
        }
        job.message = total > 1 ? `正在保存图片 ${index + 1}/${total}…` : '正在保存小红书媒体…';
        callback(null, chunk);
      },
    });

    await pipeline(Readable.fromWeb(response.body), tracker, createWriteStream(destination));
    return extensionFromResponse(response, finalUrl);
  }

  async downloadXhs(job) {
    job.message = '正在解析小红书笔记…';
    job.progress = 4;
    job.abortController = new AbortController();
    try {
      const details = await this.resolveDetails(job.url, job.xhsCookie);
      const downloaded = [];

      for (const [index, mediaUrl] of details.urls.entries()) {
        const temporaryPath = path.join(this.downloadDir, `${job.id}.xhs-${String(index + 1).padStart(2, '0')}.part`);
        const extension = await this.downloadMedia(job, mediaUrl, temporaryPath, index, details.urls.length);
        const finalPath = temporaryPath.replace(/\.part$/, `.${extension}`);
        await rm(finalPath, { force: true });
        await rename(temporaryPath, finalPath);
        downloaded.push({ path: finalPath, extension });
      }

      if (details.type === 'video' && downloaded.length === 1) {
        job.downloadPath = downloaded[0].path;
        job.filename = `${details.title}.${downloaded[0].extension}`;
        return;
      }

      const archivePath = path.join(this.downloadDir, `${job.id}.${details.title}.zip`);
      await createZip([
        ...downloaded.map((entry, index) => ({
          path: entry.path,
          name: `images/${String(index + 1).padStart(2, '0')}.${entry.extension}`,
        })),
        { name: 'note.txt', content: xhsNoteText(details) },
        { name: 'metadata.json', content: xhsMetadataJson(details) },
      ], archivePath);
      await Promise.all(downloaded.map((entry) => rm(entry.path, { force: true })));
      job.downloadPath = archivePath;
      job.filename = `${details.title}.zip`;
    } finally {
      job.xhsCookie = null;
      job.abortController = undefined;
    }
  }

  async downloadDirectMedia(job) {
    job.message = '正在保存小红书媒体直链…';
    job.progress = 8;
    job.abortController = new AbortController();
    try {
      const temporaryPath = path.join(this.downloadDir, `${job.id}.xhs-direct.part`);
      const extension = await this.downloadMedia(job, job.url, temporaryPath, 0, 1);
      const finalPath = temporaryPath.replace(/\.part$/, `.${extension}`);
      await rm(finalPath, { force: true });
      await rename(temporaryPath, finalPath);
      job.downloadPath = finalPath;
      job.filename = `xiaohongshu-media.${extension}`;
    } finally {
      job.xhsCookie = null;
      job.abortController = undefined;
    }
  }

  async download(job) {
    if (job.platform === '小红书媒体') return this.downloadDirectMedia(job);
    return this.downloadXhs(job);
  }

  // Used by the notes pipeline (lib/content/note-pipeline.mjs), which needs individual image
  // files for OCR rather than the zipped/deleted-after archive that download() produces for the
  // standalone "工具箱" download flow. Leaves files under destDir for the caller to clean up.
  async resolveAndDownloadRaw(job, destDir) {
    job.message = '正在解析小红书笔记…';
    job.progress = 4;
    job.abortController = new AbortController();
    try {
      const details = await this.resolveDetails(job.url, job.xhsCookie);
      const files = [];
      for (const [index, mediaUrl] of details.urls.entries()) {
        const temporaryPath = path.join(destDir, `media-${String(index + 1).padStart(2, '0')}.part`);
        const extension = await this.downloadMedia(job, mediaUrl, temporaryPath, index, details.urls.length);
        const finalPath = temporaryPath.replace(/\.part$/, `.${extension}`);
        await rm(finalPath, { force: true });
        await rename(temporaryPath, finalPath);
        files.push({ path: finalPath, extension });
      }
      return { details, files };
    } finally {
      job.xhsCookie = null;
      job.abortController = undefined;
    }
  }

  shutdown() {
    this.process?.kill('SIGTERM');
  }
}
