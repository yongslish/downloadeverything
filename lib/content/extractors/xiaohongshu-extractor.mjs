// Xiaohongshu (小红书) content extractor.
//
// Turns an already-resolved (or resolvable) XHS note into a Canonical Document
// (see lib/core/canonical-document.mjs) by layering three optional stages:
//
//   1. post-text   – title + 正文(description) + tags. Always attempted; this is
//                     the primary source for image-text notes and is "free"
//                     (no subprocess, no network) because XhsProvider already
//                     parses it while resolving note details.
//   2. image-ocr   – for image-text notes only. Runs local OCR over the
//                     downloaded images to pick up text baked into pictures
//                     (infographics, screenshots, text-over-photo posts).
//   3. video-asr   – for every video note, unconditionally. A caption's
//                     length says nothing about whether it actually describes
//                     what's said/shown in the video — most 小红书 video
//                     captions are short evocative quotes, not transcripts —
//                     so this used to skip ASR whenever the caption was
//                     "long enough" and silently produced caption-only
//                     documents for real videos. design-system.md's content
//                     matrix documents 小红书视频 as 100%-by-duration ASR
//                     cost with no such exception; matches that now.
//                     Extracts audio with ffmpeg and transcribes it with
//                     LocalFunAsrProvider.
//
// The module is written in a functional, dependency-injected style so it can
// be unit tested without a network connection, without a real Python
// subprocess, and without a real OCR/ASR engine:
//
//   - `details` (or a `resolveDetails` callback) replaces calling into
//     XhsProvider#resolveDetails directly.
//   - `images` (already-downloaded local paths) plus an injectable
//     `ocrImage` callback replace a real tesseract.js invocation.
//   - `videoPath` plus injectable `extractAudio`/`asrProvider` replace a real
//     ffmpeg + LocalFunAsrProvider invocation.
//   - `createDocument` replaces importing lib/core/canonical-document.mjs
//     directly; when omitted, it is loaded lazily (dynamic import) so this
//     module never fails to load just because that shared file doesn't exist
//     yet in a given checkout.
//
// Recommended runtime OCR dependency (NOT added to package.json by this
// change — add it centrally): `tesseract.js` (pure JS/WASM OCR engine, no
// Python, no API key, no per-call quota). Example production wiring:
//
//   import { createWorker } from 'tesseract.js';
//   const ocrImage = async ({ imagePath }) => {
//     const worker = await createWorker('chi_sim+eng');
//     try {
//       const { data } = await worker.recognize(imagePath);
//       return data.text;
//     } finally {
//       await worker.terminate();
//     }
//   };

import { extractAudio as ffmpegExtractAudio } from '../../media/audio-extractor.mjs';

function splitTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof rawTags === 'string') {
    return rawTags
      .split(/[,，\s#]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function normaliseNoteType(details) {
  return details?.type === 'video' ? 'video' : 'image';
}

async function defaultCreateDocument(payload) {
  const mod = await import('../../core/canonical-document.mjs');
  const factory = mod.createCanonicalDocument || mod.default;
  if (typeof factory !== 'function') {
    throw new Error('lib/core/canonical-document.mjs 没有导出 createCanonicalDocument。');
  }
  return factory(payload);
}

async function defaultOcrImage({ imagePath }) {
  // Lazy import so that environments without tesseract.js installed can
  // still load this module (and run the post-text-only paths) without error.
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('chi_sim+eng');
  try {
    const { data } = await worker.recognize(imagePath);
    return data?.text || '';
  } finally {
    await worker.terminate();
  }
}

/**
 * Builds the 'post-body'/'metadata' blocks for the native note text.
 */
function buildPostTextBlocks({ titleText, descriptionText, tagList }) {
  const blocks = [];
  if (titleText) {
    blocks.push({ source: 'post-body', start: null, end: null, text: titleText });
  }
  if (descriptionText) {
    blocks.push({ source: 'post-body', start: null, end: null, text: descriptionText });
  }
  if (tagList.length) {
    blocks.push({ source: 'metadata', start: null, end: null, text: `标签：${tagList.join(' ')}` });
  }
  return blocks;
}

/**
 * Runs OCR over already-downloaded images for an image-text note.
 * Returns { images, ocrBlocks, produced } where `produced` indicates whether
 * any image actually yielded recognizable text (used to decide stagesUsed).
 */
async function runImageOcrStage({ images, ocrImage, signal }) {
  const resultImages = [];
  const ocrBlocks = [];
  let produced = false;

  for (const image of images) {
    const path = image?.path ?? null;
    const entry = { path, ocrText: '' };

    if (path && ocrImage) {
      try {
        const recognized = await ocrImage({ imagePath: path, signal });
        const text = typeof recognized === 'string' ? recognized.trim() : '';
        if (text) {
          entry.ocrText = text;
          ocrBlocks.push({ source: 'ocr', start: null, end: null, text });
          produced = true;
        }
      } catch (error) {
        entry.ocrError = error?.message || String(error);
      }
    }

    resultImages.push(entry);
  }

  return { images: resultImages, ocrBlocks, produced };
}

/**
 * Extracts audio from the note's video and transcribes it with the injected
 * ASR provider. Returns { asrBlocks, produced, note }.
 */
async function runVideoAsrStage({
  videoPath,
  audioOutputPath,
  extractAudio,
  asrProvider,
  audioLanguage,
  signal,
}) {
  if (!videoPath || !asrProvider) {
    return {
      asrBlocks: [],
      produced: false,
      note: !videoPath
        ? '视频笔记缺少本地视频文件路径，已跳过语音转写。'
        : '没有提供语音识别 Provider（LocalFunAsrProvider），已跳过语音转写。',
    };
  }

  const outputPath = audioOutputPath || `${videoPath}.asr-audio.wav`;
  const audio = await extractAudio({ inputPath: videoPath, outputPath, signal });
  const result = await asrProvider.transcribe({
    audioPath: audio.audioPath,
    language: audioLanguage,
    audio,
    signal,
  });

  const segments = Array.isArray(result?.segments) ? result.segments : [];
  const asrBlocks = [];
  for (const segment of segments) {
    const text = (segment?.text || '').trim();
    if (!text) continue;
    asrBlocks.push({
      source: 'asr',
      start: Number.isFinite(segment.start) ? segment.start : null,
      end: Number.isFinite(segment.end) ? segment.end : null,
      text,
    });
  }

  return { asrBlocks, produced: asrBlocks.length > 0, note: null };
}

/**
 * Produces a Canonical Document for a Xiaohongshu (小红书) note.
 *
 * @param {object} options
 * @param {string} [options.url] - Note URL (used for `resolveDetails` and as an id/source fallback).
 * @param {string} [options.cookie] - Optional XHS web cookie, forwarded to `resolveDetails`.
 * @param {object} [options.details] - Already-resolved note details, shaped like the object
 *   returned by xhs-provider.mjs's `xhsDetailsFromPayload()`:
 *   { urls, title, type: 'image'|'video', description, authorNickname, authorId,
 *     noteId, noteUrl, publishedAt, updatedAt, tags, metrics }.
 *   Provide this directly in tests instead of calling into the real XHS-Downloader subprocess.
 * @param {(args: { url: string, cookie?: string }) => Promise<object>} [options.resolveDetails] -
 *   Callback used to resolve `details` when not provided directly, e.g.
 *   `({ url, cookie }) => xhsProvider.resolveDetails(url, cookie)`.
 * @param {Array<{ path: string, url?: string }>} [options.images] - Already-downloaded local
 *   image files for an image-text note, in display order.
 * @param {(args: { imagePath: string, signal?: AbortSignal }) => Promise<string>} [options.ocrImage] -
 *   Injectable OCR callback. Defaults to a lazy tesseract.js-based implementation.
 * @param {string} [options.videoPath] - Local path to an already-downloaded video file, used for
 *   the ASR fallback stage on video notes.
 * @param {string} [options.audioOutputPath] - Output path for the extracted audio (defaults to
 *   `${videoPath}.asr-audio.wav`).
 * @param {Function} [options.extractAudio] - Injectable audio extraction function, defaults to
 *   lib/media/audio-extractor.mjs's `extractAudio`.
 * @param {{ transcribe: Function }} [options.asrProvider] - Injectable ASR provider matching
 *   LocalFunAsrProvider's `transcribe({ audioPath, language, audio, signal })` interface.
 * @param {string} [options.audioLanguage='zh'] - Language hint forwarded to the ASR provider.
 * @param {Function} [options.createDocument] - Injectable replacement for
 *   `createCanonicalDocument` from lib/core/canonical-document.mjs. Defaults to a lazy dynamic
 *   import of that module.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} A Canonical Document.
 */
export async function extractXiaohongshuNote({
  url,
  cookie,
  details,
  resolveDetails,
  images: providedImages,
  ocrImage = defaultOcrImage,
  videoPath,
  audioOutputPath,
  extractAudio = ffmpegExtractAudio,
  asrProvider,
  audioLanguage = 'zh',
  createDocument = defaultCreateDocument,
  signal,
} = {}) {
  const noteDetails = details || (resolveDetails ? await resolveDetails({ url, cookie }) : null);
  if (!noteDetails) {
    throw new Error('xiaohongshu-extractor 需要 `details`，或提供 `resolveDetails` 来解析笔记详情。');
  }

  const stagesAttempted = [];
  const stagesUsed = [];
  const notes = [];
  const blocks = [];

  const titleText = String(noteDetails.title || '').trim();
  const descriptionText = String(noteDetails.description || '').trim();
  const tagList = splitTags(noteDetails.tags);
  const noteType = normaliseNoteType(noteDetails);

  // Stage 1: native post text — always attempted, this is the primary source
  // for image-text notes and is always available per XhsProvider's parsing.
  stagesAttempted.push('post-text');
  const postTextBlocks = buildPostTextBlocks({ titleText, descriptionText, tagList });
  blocks.push(...postTextBlocks);
  if (postTextBlocks.length) stagesUsed.push('post-text');

  const combinedPostText = [titleText, descriptionText].filter(Boolean).join('\n');

  // Stage 2: image OCR — only for image-text notes.
  let images = [];
  if (noteType === 'image') {
    stagesAttempted.push('image-ocr');
    const sourceImages = providedImages
      || (noteDetails.urls || []).map((imageUrl) => ({ path: null, url: imageUrl }));
    const ocrResult = await runImageOcrStage({ images: sourceImages, ocrImage, signal });
    images = ocrResult.images;
    blocks.push(...ocrResult.ocrBlocks);
    if (ocrResult.produced) stagesUsed.push('image-ocr');
    else if (sourceImages.length) notes.push('图片 OCR 没有识别出可用文字。');
  }

  // Stage 3: video ASR — every video note, unconditionally (see header comment).
  if (noteType === 'video') {
    stagesAttempted.push('video-asr');
    const asrResult = await runVideoAsrStage({
      videoPath,
      audioOutputPath,
      extractAudio,
      asrProvider,
      audioLanguage,
      signal,
    });
    blocks.push(...asrResult.asrBlocks);
    if (asrResult.produced) stagesUsed.push('video-asr');
    if (asrResult.note) notes.push(asrResult.note);
  }

  const author = noteDetails.authorNickname
    ? { name: noteDetails.authorNickname, id: noteDetails.authorId || null }
    : null;

  return createDocument({
    id: noteDetails.noteId || url || titleText || 'xiaohongshu-note',
    source: {
      platform: 'xiaohongshu',
      url: noteDetails.noteUrl || url || null,
      noteId: noteDetails.noteId || null,
    },
    title: titleText,
    author,
    publishedAt: noteDetails.publishedAt || null,
    tags: tagList,
    metrics: noteDetails.metrics || {},
    blocks,
    images,
    extraction: {
      stagesAttempted,
      stagesUsed,
      noteType,
      postTextLength: combinedPostText.length,
      notes,
    },
  });
}

export default extractXiaohongshuNote;
