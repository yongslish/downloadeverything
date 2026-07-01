import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const maxProcessOutputBytes = 1024 * 1024;

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function defaultPythonPath() {
  return path.join(
    rootDir,
    'runtime',
    'funasr',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
}

function defaultRunnerPath() {
  return path.join(rootDir, 'scripts', 'run-funasr.py');
}

function defaultModelCache() {
  return path.join(rootDir, 'runtime', 'funasr-models');
}

function boundedAppend(current, chunk) {
  const next = `${current}${chunk}`;
  return next.length > maxProcessOutputBytes
    ? next.slice(next.length - maxProcessOutputBytes)
    : next;
}

function runProcess(command, args, { signal, timeoutMs, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let cancelled = false;
    let timedOut = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
    };

    const abort = () => {
      cancelled = true;
      child.kill('SIGTERM');
    };

    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = boundedAppend(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.once('error', (error) => {
      finish(new Error(`无法启动本地 FunASR：${error.message}`));
    });
    child.once('close', (code) => {
      if (cancelled) {
        finish(new Error('本地 FunASR 转写任务已经取消。'));
        return;
      }
      if (timedOut) {
        finish(new Error(`本地 FunASR 转写超时（${Math.round(timeoutMs / 1000)} 秒）。`));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim().split(/\r?\n/).slice(-8).join('\n');
        finish(new Error(detail || `本地 FunASR 执行失败（退出码 ${code ?? 'unknown'}）。`));
        return;
      }
      finish(null, { stdout, stderr });
    });
  });
}

export function normaliseFunAsrLanguage(language) {
  const value = String(language || '').trim().toLowerCase();
  if (value === 'zh' || value === 'zh-cn' || value === 'cn') {
    return { runner: 'zh', result: 'zh-CN' };
  }
  if (value === 'en' || value === 'english') {
    return { runner: 'en', result: 'en' };
  }
  if (value === 'ja' || value === 'jp' || value === 'japanese') {
    return { runner: 'ja', result: 'ja' };
  }
  if (value === 'ko' || value === 'korean') {
    return { runner: 'ko', result: 'ko' };
  }
  if (value === 'yue' || value === 'cantonese') {
    return { runner: 'yue', result: 'yue' };
  }
  return { runner: 'auto', result: 'auto' };
}

function normaliseSegment(segment, index) {
  const text = String(segment?.text || '').trim();
  if (!text) return null;
  const start = Math.max(0, Number(segment.start) || 0);
  const requestedEnd = Number(segment.end);
  const end = Number.isFinite(requestedEnd) ? Math.max(start, requestedEnd) : start;
  return {
    index,
    start,
    end,
    speaker: segment.speaker ?? null,
    text,
    words: Array.isArray(segment.words) ? segment.words : [],
  };
}

export function normaliseFunAsrPayload(payload, {
  fallbackDuration,
  fallbackLanguage = 'auto',
  model = 'iic/SenseVoiceSmall',
  vadModel = 'fsmn-vad',
  device = 'cpu',
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('本地 FunASR 返回了无效结果。');
  }

  const text = String(payload.text || '').trim();
  if (!text) throw new Error('本地 FunASR 没有返回可用文本。');

  let segments = Array.isArray(payload.segments)
    ? payload.segments.map(normaliseSegment).filter(Boolean)
    : [];
  const segmentDuration = segments.reduce((maximum, segment) => Math.max(maximum, segment.end), 0);
  const reportedDuration = Number(payload.duration);
  const duration = Number.isFinite(reportedDuration) && reportedDuration > 0
    ? reportedDuration
    : Number(fallbackDuration) > 0
      ? Number(fallbackDuration)
      : segmentDuration || null;

  if (!segments.length) {
    segments = [{
      index: 0,
      start: 0,
      end: duration || 0,
      speaker: null,
      text,
      words: [],
    }];
  } else {
    segments = segments.map((segment, index) => ({ ...segment, index }));
  }

  const raw = payload.raw && typeof payload.raw === 'object' && !Array.isArray(payload.raw)
    ? payload.raw
    : {};

  return {
    provider: 'funasr-local',
    language: String(payload.language || fallbackLanguage || 'auto'),
    duration,
    text,
    segments,
    raw: {
      model,
      vadModel,
      device,
      ...raw,
    },
  };
}

export function localFunAsrPaths(options = {}) {
  return {
    pythonPath: options.pythonPath ?? process.env.FUNASR_PYTHON_PATH ?? defaultPythonPath(),
    runnerPath: options.runnerPath ?? process.env.FUNASR_RUNNER_PATH ?? defaultRunnerPath(),
  };
}

export function isLocalFunAsrConfigured(options = {}) {
  const { pythonPath, runnerPath } = localFunAsrPaths(options);
  return existsSync(pythonPath) && existsSync(runnerPath);
}

export class LocalFunAsrProvider {
  constructor(options = {}) {
    this.name = 'funasr-local';
    this.label = '本地 FunASR（免费）';
    const paths = localFunAsrPaths(options);
    this.pythonPath = paths.pythonPath;
    this.runnerPath = paths.runnerPath;
    this.model = options.model ?? process.env.FUNASR_MODEL ?? 'iic/SenseVoiceSmall';
    this.vadModel = options.vadModel ?? process.env.FUNASR_VAD_MODEL ?? 'fsmn-vad';
    this.device = options.device ?? process.env.FUNASR_DEVICE ?? 'cpu';
    this.modelCache = options.modelCache ?? process.env.FUNASR_MODEL_CACHE ?? defaultModelCache();
    this.timeoutMs = toPositiveInteger(
      options.timeoutMs ?? process.env.FUNASR_TIMEOUT_MS,
      30 * 60 * 1000,
    );
    this.runProcess = options.runProcess ?? runProcess;

    if (options.validateDependencies !== false) {
      if (!existsSync(this.pythonPath)) {
        throw new Error('本地 FunASR 尚未安装。请先运行 npm run setup:funasr。');
      }
      if (!existsSync(this.runnerPath)) {
        throw new Error('本地 FunASR Runner 不存在，请重新获取项目文件或运行安装流程。');
      }
    }
  }

  async transcribe({ audioPath, language, audio, signal }) {
    if (typeof audioPath !== 'string' || !audioPath.trim() || !existsSync(audioPath)) {
      throw new Error('本地 FunASR 找不到待转写的音频文件。');
    }

    const normalisedLanguage = normaliseFunAsrLanguage(language);
    const args = [
      this.runnerPath,
      '--audio', audioPath,
      '--language', normalisedLanguage.runner,
      '--model', this.model,
      '--vad-model', this.vadModel,
      '--device', this.device,
    ];
    const { stdout } = await this.runProcess(this.pythonPath, args, {
      signal,
      timeoutMs: this.timeoutMs,
      env: {
        ...process.env,
        MODELSCOPE_CACHE: this.modelCache,
        FUNASR_MODEL_CACHE: this.modelCache,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });

    let payload;
    try {
      payload = JSON.parse(stdout.trim());
    } catch {
      throw new Error('本地 FunASR 返回了无法解析的结果。');
    }

    return normaliseFunAsrPayload(payload, {
      fallbackDuration: audio?.duration,
      fallbackLanguage: normalisedLanguage.result,
      model: this.model,
      vadModel: this.vadModel,
      device: this.device,
    });
  }
}
