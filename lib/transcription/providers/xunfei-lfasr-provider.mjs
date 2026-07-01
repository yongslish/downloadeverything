import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const defaultApiBase = 'https://raasr.xfyun.cn/v2/api';
const successCode = '000000';
const processingCode = '26605';

const languageMap = new Map([
  ['auto', 'cn'],
  ['zh', 'cn'],
  ['zh-cn', 'cn'],
  ['zh-CN', 'cn'],
  ['cn', 'cn'],
  ['en', 'en'],
  ['ja', 'ja'],
  ['ko', 'ko'],
  ['ru', 'ru'],
  ['fr', 'fr'],
  ['es', 'es'],
  ['vi', 'vi'],
  ['ar', 'ar'],
  ['de', 'de'],
  ['it', 'it'],
  ['cn_cantonese', 'cn_cantonese'],
]);

function requireEnv(name, value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`讯飞转写尚未配置：请先设置环境变量 ${name}。`);
}

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('任务已经取消。'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('任务已经取消。'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function requestSignal(parentSignal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
}

function parseJsonLike(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function maybeJoinText(parts) {
  return parts
    .join('')
    .replace(/\s+([，。！？、；：,.!?;:])/g, '$1')
    .replace(/([（【《“])\s+/g, '$1')
    .replace(/\s+([）】》”])/g, '$1')
    .trim();
}

function extractWordsFromSt(st) {
  const words = [];
  const rtList = Array.isArray(st?.rt) ? st.rt : [];
  const baseMs = Number(st?.bg) || 0;

  for (const rt of rtList) {
    const wsList = Array.isArray(rt?.ws) ? rt.ws : [];
    for (const ws of wsList) {
      const candidate = Array.isArray(ws?.cw) ? ws.cw[0] : null;
      const text = typeof candidate?.w === 'string' ? candidate.w : '';
      if (!text || candidate?.wp === 'g') continue;
      const wb = Number(ws?.wb);
      const we = Number(ws?.we);
      words.push({
        text,
        start: Number.isFinite(wb) ? (baseMs / 1000) + (wb * 0.01) : null,
        end: Number.isFinite(we) ? (baseMs / 1000) + (we * 0.01) : null,
        type: candidate?.wp || null,
      });
    }
  }

  return words;
}

function extractSegmentFromLatticeItem(item, index) {
  const best = parseJsonLike(item?.json_1best) || item?.json_1best || item;
  const st = best?.st || best?.onebest?.st || best;
  const words = extractWordsFromSt(st);
  const text = maybeJoinText(words.map((word) => word.text));
  if (!text) return null;

  const startMs = Number(st?.bg ?? item?.bg ?? 0);
  const endMs = Number(st?.ed ?? item?.ed ?? startMs);

  return {
    index,
    start: Number.isFinite(startMs) ? startMs / 1000 : 0,
    end: Number.isFinite(endMs) ? endMs / 1000 : 0,
    speaker: st?.rl ? `speaker-${st.rl}` : null,
    text,
    words,
  };
}

export function parseXunfeiOrderResult(orderResult) {
  const parsed = parseJsonLike(orderResult);
  if (!parsed) {
    const text = typeof orderResult === 'string' ? orderResult.trim() : '';
    return { text, segments: [] };
  }

  const lattice = Array.isArray(parsed.lattice) && parsed.lattice.length
    ? parsed.lattice
    : Array.isArray(parsed.lattice2)
      ? parsed.lattice2
      : [];

  const segments = lattice
    .map((item, index) => extractSegmentFromLatticeItem(item, index))
    .filter(Boolean);

  const text = segments.length
    ? segments.map((segment) => segment.text).join('\n')
    : String(parsed.text || parsed.result || '').trim();

  return { text, segments };
}

function normaliseLanguage(language) {
  return languageMap.get(language) || languageMap.get(String(language || '').toLowerCase()) || 'cn';
}

function makeSigna(appId, secretKey, ts) {
  const md5 = crypto.createHash('md5').update(`${appId}${ts}`).digest('hex');
  return crypto.createHmac('sha1', secretKey).update(md5).digest('base64');
}

async function readJsonResponse(response, context) {
  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${context}失败：讯飞返回了非 JSON 响应。`);
  }
  if (!response.ok) {
    throw new Error(`${context}失败：HTTP ${response.status}。`);
  }
  return payload;
}

function xunfeiError(payload, context) {
  const code = String(payload?.code || '');
  const detail = payload?.descInfo || payload?.message || payload?.content?.descInfo || '未知错误';
  return new Error(`${context}失败：讯飞返回 ${code || 'unknown'}，${detail}`);
}

export class XunfeiLfasrProvider {
  constructor(options = {}) {
    this.name = 'xunfei-lfasr';
    this.label = '讯飞录音文件转写标准版';
    this.appId = requireEnv('XUNFEI_LFASR_APP_ID', options.appId ?? process.env.XUNFEI_LFASR_APP_ID);
    this.secretKey = requireEnv('XUNFEI_LFASR_SECRET_KEY', options.secretKey ?? process.env.XUNFEI_LFASR_SECRET_KEY);
    this.apiBase = (options.apiBase ?? process.env.XUNFEI_LFASR_API_BASE ?? defaultApiBase).replace(/\/+$/, '');
    this.pollIntervalMs = toPositiveInteger(options.pollIntervalMs ?? process.env.XUNFEI_LFASR_POLL_INTERVAL_MS, 30_000);
    this.initialPollDelayMs = toPositiveInteger(options.initialPollDelayMs ?? process.env.XUNFEI_LFASR_INITIAL_POLL_DELAY_MS, 8_000);
    this.maxPollAttempts = toPositiveInteger(options.maxPollAttempts ?? process.env.XUNFEI_LFASR_MAX_POLL_ATTEMPTS, 100);
    this.requestTimeoutMs = toPositiveInteger(options.requestTimeoutMs ?? process.env.XUNFEI_LFASR_REQUEST_TIMEOUT_MS, 60_000);
  }

  authParams(extra = {}) {
    const ts = Math.floor(Date.now() / 1000);
    return {
      appId: this.appId,
      ts: String(ts),
      signa: makeSigna(this.appId, this.secretKey, ts),
      ...extra,
    };
  }

  endpoint(name, params) {
    const url = new URL(`${this.apiBase}/${name.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return url;
  }

  async upload({ audioPath, language, audio, signal }) {
    const fileInfo = await stat(audioPath);
    const xunfeiLanguage = normaliseLanguage(language);
    const durationMs = Math.max(1, Math.round((Number(audio?.duration) || 0.2) * 1000));
    const params = this.authParams({
      fileName: path.basename(audioPath),
      fileSize: String(fileInfo.size),
      duration: String(durationMs),
      language: xunfeiLanguage,
      audioMode: 'fileStream',
      standardWav: '1',
      ...(xunfeiLanguage === 'cn' ? { languageType: '1' } : {}),
    });

    const response = await fetch(this.endpoint('upload', params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: createReadStream(audioPath),
      duplex: 'half',
      signal: requestSignal(signal, this.requestTimeoutMs),
    });
    const payload = await readJsonResponse(response, '讯飞上传');
    if (String(payload.code) !== successCode) throw xunfeiError(payload, '讯飞上传');
    const orderId = payload?.content?.orderId;
    if (!orderId) throw new Error('讯飞上传成功但没有返回 orderId。');

    return {
      orderId,
      language: xunfeiLanguage,
      taskEstimateTime: Number(payload?.content?.taskEstimateTime) || null,
      raw: payload,
    };
  }

  async getResult(orderId, signal) {
    const params = this.authParams({
      orderId,
      resultType: 'transfer',
    });
    const response = await fetch(this.endpoint('getResult', params), {
      method: 'POST',
      signal: requestSignal(signal, this.requestTimeoutMs),
    });
    return readJsonResponse(response, '讯飞查询结果');
  }

  async waitForResult(uploadResult, signal) {
    const firstDelay = uploadResult.taskEstimateTime
      ? Math.max(this.initialPollDelayMs, Math.min(uploadResult.taskEstimateTime, 60_000))
      : this.initialPollDelayMs;
    await sleep(firstDelay, signal);

    let lastPayload = null;
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      const payload = await this.getResult(uploadResult.orderId, signal);
      lastPayload = payload;
      const code = String(payload?.code || '');
      const orderInfo = payload?.content?.orderInfo || {};
      const status = Number(orderInfo.status);

      if (code === processingCode || status === 0 || status === 3) {
        await sleep(this.pollIntervalMs, signal);
        continue;
      }
      if (code !== successCode) throw xunfeiError(payload, '讯飞查询结果');
      if (status === 4) return payload;
      if (status === -1) throw new Error(`讯飞转写失败：failType=${orderInfo.failType ?? 'unknown'}。`);

      await sleep(this.pollIntervalMs, signal);
    }

    const lastCode = lastPayload?.code ? `，最后一次状态码 ${lastPayload.code}` : '';
    throw new Error(`讯飞转写还没有完成${lastCode}。可以稍后调大 XUNFEI_LFASR_MAX_POLL_ATTEMPTS 或轮询间隔后重试。`);
  }

  async transcribe({ audioPath, language, source, audio, signal }) {
    const uploadResult = await this.upload({ audioPath, language, audio, signal });
    const resultPayload = await this.waitForResult(uploadResult, signal);
    const content = resultPayload?.content || {};
    const orderInfo = content.orderInfo || {};
    const parsed = parseXunfeiOrderResult(content.orderResult);

    return {
      provider: this.name,
      language: uploadResult.language,
      text: parsed.text,
      segments: parsed.segments,
      duration: Number(orderInfo.realDuration || orderInfo.originalDuration) / 1000 || audio?.duration || null,
      raw: {
        source,
        orderId: uploadResult.orderId,
        orderInfo,
        taskEstimateTime: uploadResult.taskEstimateTime,
        orderResult: content.orderResult,
      },
    };
  }
}
