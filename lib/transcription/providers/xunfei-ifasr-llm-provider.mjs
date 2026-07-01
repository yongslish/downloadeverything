import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { parseXunfeiOrderResult } from './xunfei-lfasr-provider.mjs';

const defaultApiBase = 'https://office-api-ist-dx.iflyaisol.com';
const successCode = '000000';
const unfinishedCode = '100013';

function firstEnv(names, fallback) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function requireEnv(names, value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`讯飞大模型转写尚未配置：请先设置环境变量 ${names.join(' 或 ')}。`);
}

function toPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function pad2(value) {
  return String(Math.trunc(value)).padStart(2, '0');
}

function formatXunfeiDateTime(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  return [
    date.getFullYear(),
    '-',
    pad2(date.getMonth() + 1),
    '-',
    pad2(date.getDate()),
    'T',
    pad2(date.getHours()),
    ':',
    pad2(date.getMinutes()),
    ':',
    pad2(date.getSeconds()),
    sign,
    pad2(Math.floor(absoluteOffset / 60)),
    pad2(absoluteOffset % 60),
  ].join('');
}

function randomSignatureString() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
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

function encodeParam(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function makeXunfeiLlmSignature(apiSecret, params) {
  const baseString = Object.entries(params)
    .filter(([key, value]) => key !== 'signature' && value !== undefined && value !== null && String(value) !== '')
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, value]) => `${encodeParam(key)}=${encodeParam(value)}`)
    .join('&');

  return crypto.createHmac('sha1', apiSecret).update(baseString).digest('base64');
}

function normaliseLanguage(language) {
  const value = String(language || '').toLowerCase();
  if (value === 'autominor' || value === 'multi' || value === 'multilingual') return 'autominor';
  return 'autodialect';
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

export class XunfeiIfasrLlmProvider {
  constructor(options = {}) {
    this.name = 'xunfei-ifasr-llm';
    this.label = '讯飞录音文件转写大模型';
    this.appId = requireEnv(
      ['XUNFEI_LLM_ASR_APP_ID', 'XUNFEI_ASR_APP_ID', 'XUNFEI_APP_ID'],
      options.appId ?? firstEnv(['XUNFEI_LLM_ASR_APP_ID', 'XUNFEI_ASR_APP_ID', 'XUNFEI_APP_ID']),
    );
    this.apiKey = requireEnv(
      ['XUNFEI_LLM_ASR_API_KEY', 'XUNFEI_ASR_API_KEY', 'XUNFEI_API_KEY'],
      options.apiKey ?? firstEnv(['XUNFEI_LLM_ASR_API_KEY', 'XUNFEI_ASR_API_KEY', 'XUNFEI_API_KEY']),
    );
    this.apiSecret = requireEnv(
      ['XUNFEI_LLM_ASR_API_SECRET', 'XUNFEI_ASR_API_SECRET', 'XUNFEI_API_SECRET'],
      options.apiSecret ?? firstEnv(['XUNFEI_LLM_ASR_API_SECRET', 'XUNFEI_ASR_API_SECRET', 'XUNFEI_API_SECRET']),
    );
    this.apiBase = (options.apiBase ?? process.env.XUNFEI_LLM_ASR_API_BASE ?? defaultApiBase).replace(/\/+$/, '');
    this.pollIntervalMs = toPositiveInteger(options.pollIntervalMs ?? process.env.XUNFEI_LLM_ASR_POLL_INTERVAL_MS, 20_000);
    this.initialPollDelayMs = toPositiveInteger(options.initialPollDelayMs ?? process.env.XUNFEI_LLM_ASR_INITIAL_POLL_DELAY_MS, 8_000);
    this.maxPollAttempts = toPositiveInteger(options.maxPollAttempts ?? process.env.XUNFEI_LLM_ASR_MAX_POLL_ATTEMPTS, 100);
    this.requestTimeoutMs = toPositiveInteger(options.requestTimeoutMs ?? process.env.XUNFEI_LLM_ASR_REQUEST_TIMEOUT_MS, 60_000);
  }

  signedEndpoint(name, params) {
    const signature = makeXunfeiLlmSignature(this.apiSecret, params);
    const url = new URL(`${this.apiBase}/${name.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return { url, signature };
  }

  async upload({ audioPath, language, signal }) {
    const fileInfo = await stat(audioPath);
    const signatureRandom = randomSignatureString();
    const params = {
      appId: this.appId,
      accessKeyId: this.apiKey,
      dateTime: formatXunfeiDateTime(),
      signatureRandom,
      fileSize: String(fileInfo.size),
      fileName: path.basename(audioPath),
      durationCheckDisable: 'true',
      language: normaliseLanguage(language),
      audioMode: 'fileStream',
      roleType: '0',
    };
    const { url, signature } = this.signedEndpoint('v2/upload', params);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        signature,
      },
      body: createReadStream(audioPath),
      duplex: 'half',
      signal: requestSignal(signal, this.requestTimeoutMs),
    });
    const payload = await readJsonResponse(response, '讯飞大模型上传');
    if (String(payload.code) !== successCode) throw xunfeiError(payload, '讯飞大模型上传');
    const orderId = payload?.content?.orderId;
    if (!orderId) throw new Error('讯飞大模型上传成功但没有返回 orderId。');

    return {
      orderId,
      language: params.language,
      signatureRandom,
      taskEstimateTime: Number(payload?.content?.taskEstimateTime) || null,
      raw: payload,
    };
  }

  async getResult(uploadResult, signal) {
    const params = {
      accessKeyId: this.apiKey,
      dateTime: formatXunfeiDateTime(),
      signatureRandom: uploadResult.signatureRandom,
      orderId: uploadResult.orderId,
      resultType: 'transfer',
    };
    const { url, signature } = this.signedEndpoint('v2/getResult', params);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        signature,
      },
      body: '{}',
      signal: requestSignal(signal, this.requestTimeoutMs),
    });
    return readJsonResponse(response, '讯飞大模型查询结果');
  }

  async waitForResult(uploadResult, signal) {
    const firstDelay = uploadResult.taskEstimateTime
      ? Math.max(this.initialPollDelayMs, Math.min(uploadResult.taskEstimateTime, 60_000))
      : this.initialPollDelayMs;
    await sleep(firstDelay, signal);

    let lastPayload = null;
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      const payload = await this.getResult(uploadResult, signal);
      lastPayload = payload;
      const code = String(payload?.code || '');
      const orderInfo = payload?.content?.orderInfo || {};
      const status = Number(orderInfo.status);

      if (code === unfinishedCode || status === 0 || status === 3) {
        await sleep(this.pollIntervalMs, signal);
        continue;
      }
      if (code !== successCode) throw xunfeiError(payload, '讯飞大模型查询结果');
      if (status === 4) return payload;
      if (status === -1) throw new Error(`讯飞大模型转写失败：failType=${orderInfo.failType ?? 'unknown'}。`);

      await sleep(this.pollIntervalMs, signal);
    }

    const lastCode = lastPayload?.code ? `，最后一次状态码 ${lastPayload.code}` : '';
    throw new Error(`讯飞大模型转写还没有完成${lastCode}。可以稍后调大 XUNFEI_LLM_ASR_MAX_POLL_ATTEMPTS 后重试。`);
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
      duration: Number(orderInfo.originalDuration) / 1000 || audio?.duration || null,
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
