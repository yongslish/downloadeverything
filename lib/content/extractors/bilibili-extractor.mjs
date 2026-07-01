// Bilibili content extractor: turns a bilibili.com URL into a Canonical Document
// (see lib/core/canonical-document.mjs). Priority order, cheapest/most-trustworthy first:
//   1. native subtitles/captions that yt-dlp can fetch for this video (rare, but free and exact)
//   2. structured metadata (title/author/date/description/chapters) from yt-dlp's info.json
//   3. local FunASR transcription of the already-downloaded media, only when stage 1 found nothing
//
// This module never shells out to a paid/quota ASR — LocalFunAsrProvider is the only transcriber
// it is allowed to use, per the product's "no ASR budget this iteration" constraint.
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanonicalDocument } from '../../core/canonical-document.mjs';
import { extractAudio } from '../../media/audio-extractor.mjs';
import { LocalFunAsrProvider } from '../../transcription/providers/local-funasr-provider.mjs';

const STAGE_NATIVE_SUBTITLES = 'native-subtitles';
const STAGE_METADATA = 'metadata';
const STAGE_ASR = 'asr';

const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt', 'ass']);

function maxOutputBytes() {
  return 2 * 1024 * 1024;
}

function boundedAppend(current, chunk) {
  const next = `${current}${chunk}`;
  return next.length > maxOutputBytes()
    ? next.slice(next.length - maxOutputBytes())
    : next;
}

function defaultRunProcess(command, args, { signal, timeoutMs, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
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
    child.stdout.on('data', (chunk) => { stdout = boundedAppend(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = boundedAppend(stderr, chunk); });

    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs) : null;

    child.once('error', (error) => {
      finish(new Error(`无法启动 yt-dlp：${error.message}`));
    });
    child.once('close', (code) => {
      if (cancelled && timedOut) {
        finish(new Error(`yt-dlp 元数据抓取超时（${Math.round(timeoutMs / 1000)} 秒）。`));
        return;
      }
      if (cancelled) {
        finish(new Error('yt-dlp 元数据抓取已取消。'));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim().split(/\r?\n/).slice(-8).join('\n');
        finish(new Error(detail || `yt-dlp 执行失败（退出码 ${code ?? 'unknown'}）。`));
        return;
      }
      finish(null, { stdout, stderr });
    });
  });
}

function bilibiliVideoIdFromUrl(url) {
  const match = String(url || '').match(/\b(BV[0-9A-Za-z]{10})\b/) || String(url || '').match(/\bav(\d+)\b/i);
  return match ? match[1] || match[0] : null;
}

function toIsoDate(uploadDate) {
  const match = String(uploadDate || '').trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}T00:00:00.000Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : iso;
}

function parseTimestamp(value) {
  const match = String(value || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d+)$/);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  const fractionSeconds = Number(`0.${fraction}`);
  return (Number(hours || 0) * 3600) + (Number(minutes) * 60) + Number(seconds) + fractionSeconds;
}

// Parses SRT or WebVTT content into { start, end, text } cues. Deliberately tolerant: bilibili's
// native captions come through yt-dlp as either format depending on --sub-format negotiation.
function parseSubtitleCues(content) {
  const normalised = String(content || '')
    .replace(/^﻿/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT[^\n]*\n/, '');
  const rawBlocks = normalised.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  const cues = [];
  for (const raw of rawBlocks) {
    const lines = raw.split('\n');
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex === -1) continue;
    const match = lines[timeLineIndex].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    const text = lines
      .slice(timeLineIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (start === null || end === null || !text) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

function subtitleLangAndExtFromFilename(filename) {
  const match = filename.match(/\.([A-Za-z0-9_-]+)\.(srt|vtt|ass)$/i);
  if (!match) return null;
  return { lang: match[1], ext: match[2].toLowerCase() };
}

async function findWorkDirArtifacts(workDir) {
  let entries;
  try {
    entries = await readdir(workDir, { withFileTypes: true });
  } catch {
    return { infoJsonPath: null, subtitleFiles: [] };
  }

  let infoJsonPath = null;
  const subtitleFiles = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.info.json')) {
      infoJsonPath = path.join(workDir, entry.name);
      continue;
    }
    const parsed = subtitleLangAndExtFromFilename(entry.name);
    if (parsed && SUBTITLE_EXTENSIONS.has(parsed.ext)) {
      subtitleFiles.push({ ...parsed, path: path.join(workDir, entry.name) });
    }
  }
  return { infoJsonPath, subtitleFiles };
}

// Prefers Chinese-language tracks (the overwhelming majority of bilibili content), then whatever
// was written first. Only one caption track becomes the document's timeline to keep the transcript
// coherent — multiple languages could still be exposed later as separate documents if needed.
function pickBestSubtitleFile(subtitleFiles) {
  if (!subtitleFiles.length) return null;
  const zhLike = subtitleFiles.find((file) => /^zh/i.test(file.lang));
  return zhLike || subtitleFiles[0];
}

async function readInfoJson(infoJsonPath) {
  if (!infoJsonPath) return null;
  try {
    const raw = await readFile(infoJsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildMetadataAndChapterBlocks(info) {
  const blocks = [];
  if (!info) return blocks;

  const summaryLines = [];
  if (info.title) summaryLines.push(`标题：${info.title}`);
  const author = info.uploader || info.uploader_id || info.channel;
  if (author) summaryLines.push(`作者：${author}`);
  const publishedIso = toIsoDate(info.upload_date);
  if (publishedIso) summaryLines.push(`发布时间：${publishedIso.slice(0, 10)}`);
  if (Number.isFinite(Number(info.duration))) summaryLines.push(`时长：${Math.round(Number(info.duration))} 秒`);
  if (summaryLines.length) {
    blocks.push({ source: 'metadata', start: null, end: null, text: summaryLines.join('\n') });
  }

  const description = String(info.description || '').trim();
  if (description) {
    blocks.push({ source: 'post-body', start: null, end: null, text: description });
  }

  if (Array.isArray(info.chapters)) {
    for (const chapter of info.chapters) {
      const title = String(chapter?.title || '').trim();
      if (!title) continue;
      const start = Number(chapter.start_time);
      const end = Number(chapter.end_time);
      blocks.push({
        source: 'metadata',
        start: Number.isFinite(start) ? start : null,
        end: Number.isFinite(end) ? end : null,
        text: `章节：${title}`,
      });
    }
  }

  return blocks;
}

/**
 * Extracts a Canonical Document from a Bilibili video URL.
 *
 * @param {object} options
 * @param {string} options.url - the bilibili.com / b23.tv video URL.
 * @param {string} [options.id] - document id; defaults to the BV/av id parsed from the URL.
 * @param {string} [options.downloadPath] - path to an already-downloaded local media file
 *   (e.g. from YtDlpProvider). Only needed for the ASR fallback stage; if omitted, ASR is skipped.
 * @param {string} [options.ytDlpPath] - path to the yt-dlp binary, default 'yt-dlp'.
 * @param {string} [options.ffmpegPath] - path to ffmpeg, default 'ffmpeg'. Used only for the ASR
 *   fallback's audio extraction.
 * @param {string} [options.workDir] - scratch directory for yt-dlp's info.json/subtitle output;
 *   a temp directory is created and cleaned up automatically when omitted.
 * @param {boolean} [options.keepWorkFiles] - keep the scratch directory around (useful for debugging/tests).
 * @param {string} [options.language] - language hint passed to the ASR fallback, default 'auto'.
 * @param {Function} [options.runProcess] - injectable process runner for yt-dlp, signature
 *   `(command, args, { signal, timeoutMs, env }) => Promise<{ stdout, stderr }>`. Defaults to a
 *   real child_process.spawn wrapper; tests should inject a fake here instead of touching the network.
 * @param {Function} [options.extractAudioFn] - injectable audio extractor, defaults to
 *   lib/media/audio-extractor.mjs#extractAudio.
 * @param {object} [options.asrProvider] - a pre-built ASR provider (e.g. a test double, or a
 *   LocalFunAsrProvider configured elsewhere). If omitted and the ASR stage is reached, one is
 *   lazily constructed via `createAsrProvider`.
 * @param {Function} [options.createAsrProvider] - factory `(opts) => provider` used only when
 *   `asrProvider` isn't supplied and native captions were unavailable. Defaults to
 *   `(opts) => new LocalFunAsrProvider(opts)`.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} a Canonical Document (see lib/core/canonical-document.mjs).
 */
export async function extractBilibiliContent({
  url,
  id,
  downloadPath,
  ytDlpPath = 'yt-dlp',
  ffmpegPath = 'ffmpeg',
  workDir,
  keepWorkFiles = false,
  language = 'auto',
  runProcess = defaultRunProcess,
  extractAudioFn = extractAudio,
  asrProvider,
  createAsrProvider = (opts) => new LocalFunAsrProvider(opts),
  metadataTimeoutMs = 2 * 60 * 1000,
  signal,
} = {}) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('提取 Bilibili 内容需要提供视频链接。');
  }

  const stagesAttempted = [];
  const stagesUsed = [];
  const blocks = [];
  let info = null;
  let ownWorkDir = false;
  let effectiveWorkDir = workDir;
  let asrProviderName = null;

  if (!effectiveWorkDir) {
    effectiveWorkDir = await mkdtemp(path.join(os.tmpdir(), 'bilibili-extract-'));
    ownWorkDir = true;
  }

  try {
    // Stage 1 + 2 share one yt-dlp invocation: --skip-download keeps it cheap (no media transfer),
    // while --write-subs/--write-auto-subs/--write-info-json ask for everything captions + metadata
    // can offer in a single pass.
    const metadataArgs = [
      '--skip-download',
      '--no-warnings',
      '--restrict-filenames',
      '--write-info-json',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'all',
      '--sub-format', 'srt/best',
      '--add-header', 'Origin:https://www.bilibili.com',
      '--add-header', 'Referer:https://www.bilibili.com/',
      '-o', path.join(effectiveWorkDir, '%(id)s.%(ext)s'),
      url,
    ];

    let metadataError = null;
    try {
      await runProcess(ytDlpPath, metadataArgs, { signal, timeoutMs: metadataTimeoutMs, env: process.env });
    } catch (error) {
      metadataError = error;
    }

    const { infoJsonPath, subtitleFiles } = await findWorkDirArtifacts(effectiveWorkDir);
    info = await readInfoJson(infoJsonPath);

    if (metadataError && !info) {
      stagesAttempted.push({
        stage: STAGE_NATIVE_SUBTITLES,
        status: 'error',
        detail: metadataError.message,
      });
      stagesAttempted.push({ stage: STAGE_METADATA, status: 'error', detail: metadataError.message });
    } else {
      const bestSubtitle = pickBestSubtitleFile(subtitleFiles);
      if (bestSubtitle) {
        const subtitleContent = await readFile(bestSubtitle.path, 'utf8');
        const cues = parseSubtitleCues(subtitleContent);
        if (cues.length) {
          for (const cue of cues) {
            blocks.push({ source: 'native-caption', start: cue.start, end: cue.end, text: cue.text });
          }
          stagesAttempted.push({
            stage: STAGE_NATIVE_SUBTITLES,
            status: 'used',
            detail: `lang=${bestSubtitle.lang} cues=${cues.length}`,
          });
          stagesUsed.push(STAGE_NATIVE_SUBTITLES);
        } else {
          stagesAttempted.push({
            stage: STAGE_NATIVE_SUBTITLES,
            status: 'empty',
            detail: `字幕文件 ${bestSubtitle.lang} 未解析出任何有效字幕行。`,
          });
        }
      } else {
        stagesAttempted.push({
          stage: STAGE_NATIVE_SUBTITLES,
          status: 'not-available',
          detail: '该视频没有可供下载的原生字幕（这是常见情况，不代表出错）。',
        });
      }

      const metadataBlocks = buildMetadataAndChapterBlocks(info);
      if (metadataBlocks.length) {
        blocks.push(...metadataBlocks);
        stagesAttempted.push({ stage: STAGE_METADATA, status: 'used', detail: `blocks=${metadataBlocks.length}` });
        stagesUsed.push(STAGE_METADATA);
      } else {
        stagesAttempted.push({
          stage: STAGE_METADATA,
          status: info ? 'empty' : 'not-available',
          detail: info ? 'info.json 中没有可用的标题/简介/章节字段。' : '未能获取 info.json。',
        });
      }
    }

    // Stage 3: only spend ASR budget when stage 1 produced nothing usable — native captions,
    // when present, are free, exact, and already time-anchored, so they always win.
    const hasNativeCaptions = stagesUsed.includes(STAGE_NATIVE_SUBTITLES);
    if (!hasNativeCaptions) {
      if (!downloadPath) {
        stagesAttempted.push({
          stage: STAGE_ASR,
          status: 'skipped',
          detail: '没有可用的本地媒体文件（downloadPath 未提供），跳过语音转写回退。',
        });
      } else {
        try {
          const audioPath = path.join(effectiveWorkDir, 'asr-audio.wav');
          const audio = await extractAudioFn({
            inputPath: downloadPath,
            outputPath: audioPath,
            ffmpegPath,
            signal,
          });

          const provider = asrProvider || createAsrProvider({ validateDependencies: false });
          asrProviderName = provider?.name || 'funasr-local';
          const transcription = await provider.transcribe({
            audioPath: audio.audioPath,
            language,
            audio: { duration: info?.duration ?? null },
            signal,
          });

          const segments = Array.isArray(transcription?.segments) ? transcription.segments : [];
          if (segments.length) {
            for (const segment of segments) {
              if (!segment?.text) continue;
              blocks.push({ source: 'asr', start: segment.start, end: segment.end, text: segment.text });
            }
          } else if (transcription?.text) {
            blocks.push({ source: 'asr', start: 0, end: transcription.duration ?? null, text: transcription.text });
          }

          stagesAttempted.push({
            stage: STAGE_ASR,
            status: 'used',
            detail: `provider=${asrProviderName} segments=${segments.length}`,
          });
          stagesUsed.push(STAGE_ASR);
        } catch (error) {
          stagesAttempted.push({ stage: STAGE_ASR, status: 'error', detail: error.message });
        }
      }
    }

    const resolvedId = id || info?.id || bilibiliVideoIdFromUrl(url) || url;
    const publishedAt = toIsoDate(info?.upload_date);

    return createCanonicalDocument({
      id: resolvedId,
      source: { platform: 'Bilibili', url, contentType: 'video' },
      title: info?.title || '',
      author: {
        name: info?.uploader || info?.uploader_id || info?.channel || '',
        id: String(info?.uploader_id || info?.channel_id || ''),
      },
      publishedAt,
      tags: Array.isArray(info?.tags) ? info.tags.filter((tag) => typeof tag === 'string') : [],
      metrics: {
        viewCount: Number.isFinite(Number(info?.view_count)) ? Number(info.view_count) : null,
        likeCount: Number.isFinite(Number(info?.like_count)) ? Number(info.like_count) : null,
        commentCount: Number.isFinite(Number(info?.comment_count)) ? Number(info.comment_count) : null,
        duration: Number.isFinite(Number(info?.duration)) ? Number(info.duration) : null,
      },
      blocks,
      images: [],
      extraction: { stagesAttempted, stagesUsed, asrProvider: asrProviderName },
    });
  } finally {
    if (ownWorkDir && !keepWorkFiles) {
      await rm(effectiveWorkDir, { recursive: true, force: true });
    }
  }
}

export {
  parseSubtitleCues,
  parseTimestamp,
  bilibiliVideoIdFromUrl,
  toIsoDate,
};
