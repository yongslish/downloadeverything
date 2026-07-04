import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export class YtDlpProvider {
  constructor({
    downloadDir,
    ytDlpPath,
    presets,
    maxJobRuntimeMs,
  }) {
    this.id = 'ytdlp';
    this.downloadDir = downloadDir;
    this.ytDlpPath = ytDlpPath;
    this.presets = presets;
    this.maxJobRuntimeMs = maxJobRuntimeMs;
  }

  canHandle(job) {
    return job.platform === 'Bilibili';
  }

  async isReady() {
    try {
      await access(this.ytDlpPath);
      return true;
    } catch {
      return false;
    }
  }

  platformRequestArgs(job) {
    if (job.platform !== 'Bilibili') return [];
    return [
      '--add-header', 'Origin:https://www.bilibili.com',
      '--add-header', 'Referer:https://www.bilibili.com/',
    ];
  }

  updateProgress(job, output) {
    const match = output.match(/\[download\]\s+([\d.]+)%.*?(?:ETA\s+(\S+))?/);
    if (!match) return;

    job.progress = Math.min(99, Math.max(0, Number(match[1])));
    job.message = match[2] ? `正在下载 · 预计 ${match[2]}` : '正在下载媒体文件…';
  }

  run(job, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let stderr = '';
      const timeout = setTimeout(() => child.kill('SIGTERM'), this.maxJobRuntimeMs);

      job.process = child;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        output += chunk;
        this.updateProgress(job, chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        this.updateProgress(job, chunk);
      });
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(output);
        else reject(new Error(stderr || `下载进程意外退出（代码 ${code ?? 'unknown'}）。`));
      });
    });
  }

  async locateDownload(jobId) {
    const files = await readdir(this.downloadDir, { withFileTypes: true });
    const candidates = files
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${jobId}.`) && !entry.name.endsWith('.part'))
      .map((entry) => entry.name)
      .sort();

    if (candidates.length === 0) throw new Error('下载完成，但没有找到可交付的文件。');
    return path.join(this.downloadDir, candidates.at(-1));
  }

  async download(job) {
    if (!(await this.isReady())) {
      throw new Error('下载引擎尚未安装。请先在服务目录运行 npm run setup。');
    }

    const outputTemplate = path.join(this.downloadDir, `${job.id}.%(title)s.%(ext)s`);
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--newline',
      '--restrict-filenames',
      '--socket-timeout', '20',
      '--retries', '2',
      '--max-filesize', '750M',
      ...this.platformRequestArgs(job),
      '-o', outputTemplate,
      ...this.presets[job.preset].args,
      job.url,
    ];
    await this.run(job, args);
    job.downloadPath = await this.locateDownload(job.id);
    job.filename = path.basename(job.downloadPath).replace(`${job.id}.`, '') || 'download';
  }
}
