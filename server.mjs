import crypto from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { ArtifactStore } from './lib/core/artifact-store.mjs';
import { NotebookStore } from './lib/core/notebook-store.mjs';
import { createDownloadProviderRegistry } from './lib/download/providers/index.mjs';
import { parseSupportedUrl } from './lib/download/url.mjs';
import { extractAudio } from './lib/media/audio-extractor.mjs';
import { buildNoteDocument, NOTE_PIPELINE_PLATFORMS } from './lib/content/note-pipeline.mjs';
import { documentFilename, renderCanonicalDocumentToMarkdown } from './lib/export/markdown-exporter.mjs';
import { getTranscriptionProvider, listTranscriptionProviders } from './lib/transcription/providers/index.mjs';
import { createTranscriptResult } from './lib/transcription/transcript-schema.mjs';
import { transcriptToJson, transcriptToSrt, transcriptToTxt, transcriptToVtt } from './lib/transcription/exporters.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(rootDir, 'public');
const downloadDir = path.join(rootDir, 'runtime', 'downloads');
const transcriptionDir = path.join(rootDir, 'runtime', 'transcriptions');
const transcriptionUploadDir = path.join(transcriptionDir, 'uploads');
const notesDir = path.join(rootDir, 'runtime', 'notes');
const xhsSourceDir = path.join(rootDir, 'runtime', 'xhs-downloader');
const xhsCookiePath = process.env.XHS_COOKIE_FILE || path.join(rootDir, 'runtime', 'xhs-cookie.txt');
const xhsRunnerPath = path.join(rootDir, 'scripts', 'run-xhs-api.py');
const pythonPath = process.env.PYTHON_PATH || path.join(rootDir, 'runtime', 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const ytDlpPath = process.env.YTDLP_PATH || path.join(rootDir, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const port = Number(process.env.PORT || 3030);
const xhsApiPort = Number(process.env.XHS_API_PORT || 5556);
const jobTtlMs = 30 * 60 * 1000;
const maxJobRuntimeMs = 20 * 60 * 1000;
const maxMediaSizeBytes = 750 * 1024 * 1024;
const maxTranscriptionUploadBytes = 500 * 1024 * 1024;
const maxConcurrentJobs = 1;
const maxQueuedJobs = 3;
const maxConcurrentTranscriptions = 1;
const maxQueuedTranscriptions = 3;
const maxConcurrentNotes = 1;
const maxQueuedNotes = 3;
const transcriptionStore = new ArtifactStore(transcriptionDir);
const notebookStore = new NotebookStore(notesDir);

const presets = {
  best: {
    label: '最佳画质',
    args: ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4'],
  },
  standard: {
    label: '720p 或以下',
    args: ['-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best', '--merge-output-format', 'mp4'],
  },
  audio: {
    label: '仅音频 MP3',
    args: ['-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3'],
  },
};

const downloadProviders = createDownloadProviderRegistry({
  downloadDir,
  ytDlpPath,
  presets,
  maxJobRuntimeMs,
  maxMediaSizeBytes,
  xhsSourceDir,
  xhsCookiePath,
  xhsRunnerPath,
  pythonPath,
  xhsApiPort,
});
const ytDlpProvider = downloadProviders.providers.find((provider) => provider.id === 'ytdlp');
const xhsProvider = downloadProviders.providers.find((provider) => provider.id === 'xhs');

const jobs = new Map();
const queue = [];
const transcriptionJobs = new Map();
const transcriptionQueue = [];
const noteJobs = new Map();
const noteQueue = [];
let runningJobs = 0;
let runningTranscriptions = 0;
let runningNotes = 0;

async function loadRuntimeEnv(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

await loadRuntimeEnv(path.join(rootDir, 'runtime', 'secrets.env'));
await mkdir(downloadDir, { recursive: true });
await mkdir(transcriptionUploadDir, { recursive: true });
await transcriptionStore.ensure();
await notebookStore.ensure();

function publicJob(job) {
  return {
    id: job.id,
    platform: job.platform,
    preset: presets[job.preset].label,
    status: job.status,
    progress: job.progress,
    message: job.message,
    filename: job.filename,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
  };
}

function publicTranscriptionJob(job) {
  const readyExports = job.status === 'ready' ? {
    txt: `/api/transcriptions/${job.id}/export/txt`,
    srt: `/api/transcriptions/${job.id}/export/srt`,
    vtt: `/api/transcriptions/${job.id}/export/vtt`,
    json: `/api/transcriptions/${job.id}/export/json`,
  } : null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    filename: job.filename,
    provider: job.provider,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    exports: readyExports,
  };
}

function publicNoteJob(job) {
  return {
    id: job.id,
    url: job.url,
    platform: job.platform,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    detailMessage: job.status === 'failed' ? job.detailMessage || null : null,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    noteId: job.status === 'ready' ? job.noteId : null,
  };
}

const acceptedTranscriptionExtensions = new Set([
  '.mp4', '.mov', '.mkv', '.webm',
  '.mp3', '.m4a', '.wav', '.aac', '.flac',
]);

function isAcceptedTranscriptionFile(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  return acceptedTranscriptionExtensions.has(extension) || /^audio\//.test(file.mimetype) || /^video\//.test(file.mimetype);
}

function cleanProviderCredential(value) {
  return typeof value === 'string' && value.trim().length <= 256 ? value.trim() : undefined;
}

function parseProviderConfig(rawValue, provider) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return {};

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error('讯飞密钥配置格式不正确。');
  }
  if (!parsed || typeof parsed !== 'object') return {};

  if (provider === 'xunfei-ifasr-llm') {
    return {
      appId: cleanProviderCredential(parsed.appId),
      apiKey: cleanProviderCredential(parsed.apiKey),
      apiSecret: cleanProviderCredential(parsed.apiSecret),
    };
  }
  if (provider === 'xunfei-lfasr') {
    return {
      appId: cleanProviderCredential(parsed.appId),
      secretKey: cleanProviderCredential(parsed.secretKey),
    };
  }
  return {};
}

const transcriptionUpload = multer({
  dest: transcriptionUploadDir,
  limits: {
    fileSize: maxTranscriptionUploadBytes,
    files: 1,
  },
  fileFilter(_req, file, callback) {
    if (isAcceptedTranscriptionFile(file)) callback(null, true);
    else callback(new Error('当前只支持 mp4、mov、mkv、webm、mp3、m4a、wav、aac、flac。'));
  },
});

function scheduleExpiry(job) {
  job.expiresAt = new Date(Date.now() + jobTtlMs).toISOString();
  job.expiryTimer = setTimeout(() => {
    discardJob(job.id).catch((error) => console.error('Could not clean up expired job', error));
  }, jobTtlMs);
  job.expiryTimer.unref();
}

async function removeJobFiles(jobId) {
  const filenames = await readdir(downloadDir).catch(() => []);
  await Promise.all(
    filenames
      .filter((filename) => filename.startsWith(`${jobId}.`))
      .map((filename) => rm(path.join(downloadDir, filename), { force: true })),
  );
}

async function discardJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  if (job.status === 'processing') {
    job.cancelled = true;
    job.process?.kill('SIGTERM');
    job.abortController?.abort();
  }

  const queueIndex = queue.indexOf(jobId);
  if (queueIndex !== -1) queue.splice(queueIndex, 1);
  clearTimeout(job.expiryTimer);
  jobs.delete(jobId);
  await removeJobFiles(jobId);
}

function scheduleTranscriptionExpiry(job) {
  job.expiresAt = new Date(Date.now() + jobTtlMs).toISOString();
  job.expiryTimer = setTimeout(() => {
    discardTranscriptionJob(job.id).catch((error) => console.error('Could not clean up expired transcription job', error));
  }, jobTtlMs);
  job.expiryTimer.unref();
}

async function discardTranscriptionJob(jobId) {
  const job = transcriptionJobs.get(jobId);
  if (!job) return;

  if (job.status === 'processing') {
    job.cancelled = true;
    job.abortController?.abort();
  }

  const queueIndex = transcriptionQueue.indexOf(jobId);
  if (queueIndex !== -1) transcriptionQueue.splice(queueIndex, 1);
  clearTimeout(job.expiryTimer);
  transcriptionJobs.delete(jobId);
  await rm(job.uploadPath || '', { force: true }).catch(() => {});
  await transcriptionStore.removeJob(jobId);
}

async function writeTranscriptArtifacts(job, result) {
  const resultPath = await transcriptionStore.writeJson(job.id, 'transcript.json', result);
  const exportPaths = {
    txt: await transcriptionStore.writeText(job.id, 'transcript.txt', transcriptToTxt(result)),
    srt: await transcriptionStore.writeText(job.id, 'transcript.srt', transcriptToSrt(result)),
    vtt: await transcriptionStore.writeText(job.id, 'transcript.vtt', transcriptToVtt(result)),
    json: await transcriptionStore.writeText(job.id, 'transcript.export.json', transcriptToJson(result)),
  };
  job.resultPath = resultPath;
  job.exportPaths = exportPaths;
}

async function runTranscription(job) {
  job.abortController = new AbortController();
  try {
    job.stage = 'preparing';
    job.progress = 8;
    job.message = '正在保存上传文件…';
    const jobDir = await transcriptionStore.createJobDir(job.id);
    const extension = path.extname(job.originalName).toLowerCase() || '.media';
    const mediaPath = path.join(jobDir, `input${extension}`);
    await rename(job.uploadPath, mediaPath);
    job.uploadPath = null;
    job.mediaPath = mediaPath;

    const source = {
      type: 'upload',
      platform: 'local',
      title: path.basename(job.originalName, extension) || job.originalName,
      filename: job.originalName,
    };
    await transcriptionStore.writeJson(job.id, 'source.json', source);

    job.stage = 'extracting-audio';
    job.progress = 32;
    job.message = job.provider === 'fake' ? '正在准备音频上下文…' : '正在抽取音频…';
    const audio = await extractAudio({
      inputPath: mediaPath,
      outputPath: transcriptionStore.pathFor(job.id, job.provider === 'fake' ? 'audio.fake.txt' : 'audio.wav'),
      ffmpegPath,
      signal: job.abortController.signal,
      optional: job.provider === 'fake',
    });

    job.stage = 'transcribing';
    job.progress = 62;
    job.message = job.provider === 'fake' ? '正在生成演示转录…' : '正在转写音频…';
    const provider = getTranscriptionProvider(job.provider, job.providerConfig);
    const providerResult = await provider.transcribe({
      audioPath: audio.audioPath,
      language: job.language,
      source,
      audio,
      signal: job.abortController.signal,
    });

    job.stage = 'formatting';
    job.progress = 88;
    job.message = '正在整理字幕和导出文件…';
    const result = createTranscriptResult({
      jobId: job.id,
      source,
      audio,
      providerResult,
    });
    await writeTranscriptArtifacts(job, result);

    job.status = 'ready';
    job.stage = 'done';
    job.progress = 100;
    job.message = job.provider === 'fake'
      ? '演示转录已生成。真实识别将在接入 ASR 服务后启用。'
      : '转写完成。文字已经准备好了。';
    scheduleTranscriptionExpiry(job);
  } catch (error) {
    if (!job.cancelled) {
      job.status = 'failed';
      job.message = friendlyTranscriptionError(error);
      scheduleTranscriptionExpiry(job);
      await rm(job.uploadPath || '', { force: true }).catch(() => {});
      await transcriptionStore.removeJob(job.id);
    }
  } finally {
    job.abortController = undefined;
  }
}

function processNextTranscription() {
  if (runningTranscriptions >= maxConcurrentTranscriptions) return;
  const jobId = transcriptionQueue.shift();
  if (!jobId) return;
  const job = transcriptionJobs.get(jobId);
  if (!job || job.cancelled) return processNextTranscription();

  runningTranscriptions += 1;
  job.status = 'processing';
  job.stage = 'preparing';
  job.message = '正在准备转写…';

  runTranscription(job)
    .finally(() => {
      runningTranscriptions -= 1;
      processNextTranscription();
    });
}

function friendlyTranscriptionError(error) {
  const message = error instanceof Error ? error.message : '转写时发生未知错误。';
  if (/FFmpeg/i.test(message)) return '服务器缺少 FFmpeg，真实转写前需要先安装 FFmpeg。';
  if (/setup:funasr/i.test(message)) return '本地 FunASR 尚未安装，请先在项目目录运行 npm run setup:funasr。';
  if (/FunASR.*(timeout|超时)/i.test(message)) return '本地 FunASR 转写超时，请换一个较短文件或调大 FUNASR_TIMEOUT_MS。';
  if (/file too large|File too large|LIMIT_FILE_SIZE/i.test(message)) return '文件超过当前 500 MB 上限，请压缩或截取后再试。';
  if (/尚未接入|provider/i.test(message)) return message;
  if (/aborted|cancel/i.test(message)) return '任务已经取消。';
  return message.length > 180 ? '转写没有完成。请换一个更短的音视频文件再试。' : message;
}

function scheduleNoteJobExpiry(job) {
  // Only the job-tracking record expires — the note itself lives forever in notebookStore.
  job.expiresAt = new Date(Date.now() + jobTtlMs).toISOString();
  job.expiryTimer = setTimeout(() => {
    discardNoteJob(job.id).catch((error) => console.error('Could not clean up expired note job', error));
  }, jobTtlMs);
  job.expiryTimer.unref();
}

async function discardNoteJob(jobId) {
  const job = noteJobs.get(jobId);
  if (!job) return;

  if (job.status === 'processing') {
    job.cancelled = true;
    job.process?.kill('SIGTERM');
    job.abortController?.abort();
  }

  const queueIndex = noteQueue.indexOf(jobId);
  if (queueIndex !== -1) noteQueue.splice(queueIndex, 1);
  clearTimeout(job.expiryTimer);
  noteJobs.delete(jobId);
}

function friendlyNoteError(error) {
  const message = error instanceof Error ? error.message : '生成笔记时发生未知错误。';
  if (/private|login|sign in|cookies/i.test(message)) return '该内容需要登录或不是公开内容，无法处理。';
  if (/setup:funasr/i.test(message)) return '本地 FunASR 尚未安装，请先在项目目录运行 npm run setup:funasr。';
  if (/FunASR.*(timeout|超时)/i.test(message)) return '本地 FunASR 转写超时，请换一个较短的内容再试。';
  if (/FFmpeg|ffmpeg/i.test(message)) return '服务器缺少 FFmpeg，暂时无法抽取音频。';
  if (/暂时还不支持/.test(message)) return message;
  if (/小红书解析|XHS-Downloader/i.test(message)) return `${message} 请先运行 npm run setup:xhs 再试。`;
  if (/aborted|cancel/i.test(message)) return '任务已经取消。';
  // Canonical Document creation throws this exact string when every content
  // stage came back empty: no captions, no ASR (because FunASR isn't set up),
  // no metadata worth keeping. Point the user at the actionable fix.
  if (/Canonical Document 至少需要一个非空文本块/.test(message)) {
    return '该视频没有原生字幕，也没能通过 ASR 转写出任何文本。请运行 npm run setup:funasr 安装本地 ASR，或换一个有原生字幕的视频再试。';
  }
  return message.length > 180 ? '笔记没有生成完成。请确认链接公开有效后再试一次。' : message;
}

async function runNoteJob(job) {
  try {
    job.stage = 'resolving';
    job.progress = 5;
    job.message = '正在识别平台…';

    const document = await buildNoteDocument(job, {
      ytDlpProvider,
      xhsProvider,
      ffmpegPath,
      language: job.language,
    });

    if (job.cancelled) return;

    job.stage = 'saving';
    job.progress = 92;
    job.message = '正在保存笔记…';
    const markdown = renderCanonicalDocumentToMarkdown(document);
    await notebookStore.save(document, markdown);

    job.status = 'ready';
    job.stage = 'done';
    job.progress = 100;
    job.message = '笔记已经生成好了。';
    job.noteId = document.id;
    scheduleNoteJobExpiry(job);
  } catch (error) {
    if (!job.cancelled) {
      job.status = 'failed';
      job.message = friendlyNoteError(error);
      // Preserve the raw error for the frontend "详情" line so the user can see
      // what actually failed (e.g. yt-dlp exit code + URL) instead of only the
      // friendly one-liner. Truncated to keep the API payload small.
      const rawMessage = error instanceof Error ? error.message : String(error);
      job.detailMessage = rawMessage.length > 800 ? `${rawMessage.slice(0, 800)}…` : rawMessage;
      console.error(`[note ${job.id}] failed:`, rawMessage);
      scheduleNoteJobExpiry(job);
    }
  }
}

function processNextNote() {
  if (runningNotes >= maxConcurrentNotes) return;
  const jobId = noteQueue.shift();
  if (!jobId) return;
  const job = noteJobs.get(jobId);
  if (!job || job.cancelled) return processNextNote();

  runningNotes += 1;
  job.status = 'processing';
  job.stage = 'resolving';
  job.message = '正在准备生成笔记…';

  runNoteJob(job)
    .finally(() => {
      runningNotes -= 1;
      processNextNote();
    });
}

async function processNext() {
  if (runningJobs >= maxConcurrentJobs) return;
  const jobId = queue.shift();
  if (!jobId) return;
  const job = jobs.get(jobId);
  if (!job || job.cancelled) return processNext();

  runningJobs += 1;
  job.status = 'processing';
  job.message = '正在准备下载…';

  try {
    await downloadProviders.download(job);

    if (job.cancelled) return;
    job.status = 'ready';
    job.progress = 100;
    job.message = '已经准备好了。把它带走吧。';
    scheduleExpiry(job);
  } catch (error) {
    if (!job.cancelled) {
      job.status = 'failed';
      job.message = friendlyError(error, job.platform);
      scheduleExpiry(job);
      await removeJobFiles(job.id);
    }
  } finally {
    job.process = undefined;
    runningJobs -= 1;
    processNext();
  }
}

function friendlyError(error, platform) {
  const message = error instanceof Error ? error.message : '下载时发生未知错误。';
  if (/private|login|sign in|cookies/i.test(message)) return '该内容需要登录或不是公开内容，无法处理。';
  if (/no video formats|requested format is not available/i.test(message)) {
    return '该链接没有公开可下载的视频或音频。图文笔记、已删除内容或受平台限制的内容暂不支持。';
  }
  if (/HTTP Error 412|precondition failed/i.test(message)) {
    return `${platform} 暂时拒绝自动解析（HTTP 412）。请稍后重试，或改用平台允许公开下载的内容。`;
  }
  if (/timed out|timeout|network is unreachable|connection reset/i.test(message)) {
    return `连接 ${platform} 超时。请检查网络后重试。`;
  }
  if (/unsupported|not available|unavailable/i.test(message)) return '这个链接暂时无法解析，或内容已经不可用。';
  if (/ffmpeg/i.test(message)) return '服务器缺少 FFmpeg，暂时无法合并或转换该媒体。';
  return message.length > 180 ? '下载没有完成。请确认链接公开有效后再试一次。' : message;
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use(express.static(publicDir, { extensions: ['html'], maxAge: '1h' }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    engineReady: await downloadProviders.engineReady(),
    queued: queue.length,
    running: runningJobs,
    transcription: {
      queued: transcriptionQueue.length,
      running: runningTranscriptions,
      providers: listTranscriptionProviders(),
    },
    notes: {
      queued: noteQueue.length,
      running: runningNotes,
      platforms: [...NOTE_PIPELINE_PLATFORMS],
    },
  });
});

app.post('/api/jobs', (req, res) => {
  try {
    if (queue.length >= maxQueuedJobs || runningJobs + queue.length >= maxConcurrentJobs + maxQueuedJobs) {
      return res.status(429).json({ error: '当前任务已满。请等这一项完成后再试。' });
    }

    const { href, platform } = parseSupportedUrl(req.body?.url);
    const preset = Object.hasOwn(presets, req.body?.preset) ? req.body.preset : 'best';
    const xhsCookie = typeof req.body?.xhsCookie === 'string' && req.body.xhsCookie.trim().length <= 20_000
      ? req.body.xhsCookie.trim()
      : '';
    const id = crypto.randomUUID();
    const job = {
      id,
      url: href,
      platform,
      preset,
      status: 'queued',
      progress: 0,
      message: '已经放进队列。',
      filename: null,
      xhsCookie: platform.includes('小红书') ? xhsCookie : '',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      cancelled: false,
    };

    jobs.set(id, job);
    queue.push(id);
    processNext();
    return res.status(202).json(publicJob(job));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '无法创建下载任务。' });
  }
});

function handleTranscriptionUpload(req, res, next) {
  transcriptionUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? '文件超过当前 500 MB 上限，请压缩或截取后再试。'
      : error.message || '上传失败。';
    return res.status(400).json({ error: message });
  });
}

app.post('/api/transcriptions/upload', handleTranscriptionUpload, (req, res) => {
  try {
    if (transcriptionQueue.length >= maxQueuedTranscriptions || runningTranscriptions + transcriptionQueue.length >= maxConcurrentTranscriptions + maxQueuedTranscriptions) {
      rm(req.file?.path || '', { force: true }).catch(() => {});
      return res.status(429).json({ error: '当前转写任务已满。请等这一项完成后再试。' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请先选择一个视频或音频文件。' });
    }

    const provider = typeof req.body?.provider === 'string' && req.body.provider.trim()
      ? req.body.provider.trim()
      : 'fake';
    const providerConfig = parseProviderConfig(req.body?.providerConfig, provider);
    getTranscriptionProvider(provider, providerConfig);

    const id = crypto.randomUUID();
    const job = {
      id,
      sourceType: 'upload',
      uploadPath: req.file.path,
      originalName: req.file.originalname || req.file.filename,
      filename: req.file.originalname || req.file.filename,
      provider,
      providerConfig,
      language: typeof req.body?.language === 'string' ? req.body.language : 'auto',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: '已经放进转写队列。',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      cancelled: false,
      resultPath: null,
      exportPaths: null,
    };

    transcriptionJobs.set(id, job);
    transcriptionQueue.push(id);
    processNextTranscription();
    return res.status(202).json(publicTranscriptionJob(job));
  } catch (error) {
    rm(req.file?.path || '', { force: true }).catch(() => {});
    return res.status(400).json({ error: error instanceof Error ? error.message : '无法创建转写任务。' });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在或已经过期。' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(publicJob(job));
});

app.delete('/api/jobs/:id', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '任务不存在或已经过期。' });
  await discardJob(job.id);
  return res.status(204).end();
});

app.get('/api/jobs/:id/download', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'ready' || !job.downloadPath) {
    return res.status(404).json({ error: '文件还没有准备好，或已经过期。' });
  }

  const safePath = path.resolve(job.downloadPath);
  if (!safePath.startsWith(`${path.resolve(downloadDir)}${path.sep}`)) {
    return res.status(400).json({ error: '无效的文件路径。' });
  }

  return res.download(safePath, job.filename, (error) => {
    if (error && !res.headersSent) res.status(500).json({ error: '文件传送失败。' });
  });
});

app.get('/api/transcriptions/:id', (req, res) => {
  const job = transcriptionJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '转写任务不存在或已经过期。' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(publicTranscriptionJob(job));
});

app.get('/api/transcriptions/:id/result', async (req, res) => {
  const job = transcriptionJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '转写任务不存在或已经过期。' });
  if (job.status !== 'ready') return res.status(409).json({ error: '转写结果还没有准备好。' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await transcriptionStore.readJson(job.id, 'transcript.json'));
});

app.get('/api/transcriptions/:id/export/:format', (req, res) => {
  const job = transcriptionJobs.get(req.params.id);
  if (!job || job.status !== 'ready' || !job.exportPaths) {
    return res.status(404).json({ error: '导出文件还没有准备好，或已经过期。' });
  }

  const format = req.params.format;
  const filePath = job.exportPaths[format];
  if (!filePath) return res.status(404).json({ error: '不支持这个导出格式。' });

  const safePath = path.resolve(filePath);
  if (!safePath.startsWith(`${path.resolve(transcriptionDir)}${path.sep}`)) {
    return res.status(400).json({ error: '无效的文件路径。' });
  }

  const baseName = path.basename(job.filename, path.extname(job.filename)) || 'transcript';
  return res.download(safePath, `${baseName}.${format}`, (error) => {
    if (error && !res.headersSent) res.status(500).json({ error: '文件传送失败。' });
  });
});

app.delete('/api/transcriptions/:id', async (req, res) => {
  const job = transcriptionJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '转写任务不存在或已经过期。' });
  await discardTranscriptionJob(job.id);
  return res.status(204).end();
});

// Notes: "paste a link, get a study note" pipeline. Scope is Bilibili video + 小红书
// 图文/视频 only (NOTE_PIPELINE_PLATFORMS) — this is also the full set of platforms the whole
// app supports now (see lib/download/url.mjs); YouTube/抖音 support was removed entirely rather
// than just hidden, since the provider interface is pluggable and can be re-added cleanly later
// if needed. Job records (progress polling) expire like other job types; the generated note
// itself is kept forever in notebookStore, independent of job expiry.
app.post('/api/notes', (req, res) => {
  try {
    if (noteQueue.length >= maxQueuedNotes || runningNotes + noteQueue.length >= maxConcurrentNotes + maxQueuedNotes) {
      return res.status(429).json({ error: '当前笔记生成任务已满。请等这一项完成后再试。' });
    }

    const { href, platform } = parseSupportedUrl(req.body?.url);
    if (!NOTE_PIPELINE_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: `暂时还不支持从${platform}生成学习笔记（目前仅支持 B 站视频与小红书图文/视频）。` });
    }
    const xhsCookie = typeof req.body?.xhsCookie === 'string' && req.body.xhsCookie.trim().length <= 20_000
      ? req.body.xhsCookie.trim()
      : '';
    const language = typeof req.body?.language === 'string' ? req.body.language : 'auto';

    const id = crypto.randomUUID();
    const job = {
      id,
      url: href,
      platform,
      language,
      xhsCookie: platform === '小红书' ? xhsCookie : '',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      message: '已经放进队列。',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      cancelled: false,
      noteId: null,
    };

    noteJobs.set(id, job);
    noteQueue.push(id);
    processNextNote();
    return res.status(202).json(publicNoteJob(job));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : '无法创建笔记任务。' });
  }
});

app.get('/api/notes/jobs/:id', (req, res) => {
  const job = noteJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '笔记任务不存在或已经过期。' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(publicNoteJob(job));
});

app.delete('/api/notes/jobs/:id', async (req, res) => {
  const job = noteJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: '笔记任务不存在或已经过期。' });
  await discardNoteJob(job.id);
  return res.status(204).end();
});

app.get('/api/notes', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await notebookStore.list());
});

app.get('/api/notes/:id', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await notebookStore.get(req.params.id));
  } catch {
    return res.status(404).json({ error: '笔记不存在或已经删除。' });
  }
});

app.get('/api/notes/:id/markdown', async (req, res) => {
  let document;
  try {
    document = await notebookStore.get(req.params.id);
  } catch {
    return res.status(404).json({ error: '笔记不存在或已经删除。' });
  }

  const safePath = path.resolve(notebookStore.pathFor(req.params.id, 'note.md'));
  if (!safePath.startsWith(`${path.resolve(notesDir)}${path.sep}`)) {
    return res.status(400).json({ error: '无效的文件路径。' });
  }

  return res.download(safePath, documentFilename(document), (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: '这份笔记还没有生成 Markdown 导出。' });
  });
});

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await notebookStore.remove(req.params.id);
    return res.status(204).end();
  } catch {
    return res.status(404).json({ error: '笔记不存在或已经删除。' });
  }
});

// SPA fallback — the React Router deep links (/note/:id, /processing/:id,
// /archive, /tools, /config) don't map to physical files. Anything that
// wasn't handled by /api/*, express.static (which serves /, /assets/*,
// /legacy/*), or an explicit route falls back to the built index.html so the
// client-side router can render the target page.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/legacy/')) return next();
  if (req.path.startsWith('/assets/')) return next();
  return res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: '服务器暂时没能完成这个请求。' });
});

const httpServer = app.listen(port, () => {
  console.log(`Download Everything is listening on http://localhost:${port}`);
  console.log(`yt-dlp engine: ${ytDlpPath}`);
});

function shutdown() {
  downloadProviders.shutdown();
  for (const job of transcriptionJobs.values()) job.abortController?.abort();
  for (const job of noteJobs.values()) {
    job.process?.kill('SIGTERM');
    job.abortController?.abort();
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
