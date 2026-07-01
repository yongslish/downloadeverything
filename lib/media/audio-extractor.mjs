import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

function runCommand(command, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const abort = () => child.kill('SIGTERM');
    if (signal) {
      if (signal.aborted) abort();
      signal.addEventListener('abort', abort, { once: true });
    }
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (signal) signal.removeEventListener('abort', abort);
      if (code === 0) resolve();
      else reject(new Error(stderr || `${command} 执行失败（退出码 ${code ?? 'unknown'}）。`));
    });
  });
}

export async function isFfmpegAvailable(ffmpegPath = 'ffmpeg') {
  try {
    await runCommand(ffmpegPath, ['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function extractAudio({
  inputPath,
  outputPath,
  ffmpegPath = 'ffmpeg',
  signal,
  optional = false,
}) {
  if (optional) {
    await writeFile(outputPath, `fake-asr audio placeholder for ${inputPath}\n`, 'utf8');
    return {
      audioPath: outputPath,
      codec: 'fake-placeholder',
      sampleRate: 16000,
      channels: 1,
      usedFfmpeg: false,
    };
  }

  if (!(await isFfmpegAvailable(ffmpegPath))) {
    throw new Error('服务器缺少 FFmpeg，无法抽取音频。');
  }

  await runCommand(ffmpegPath, [
    '-y',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-f', 'wav',
    outputPath,
  ], { signal });

  return {
    audioPath: outputPath,
    codec: 'pcm_s16le',
    sampleRate: 16000,
    channels: 1,
    usedFfmpeg: true,
  };
}
