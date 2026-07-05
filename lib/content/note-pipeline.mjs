// Orchestrates the "paste a link, get a note" pipeline: resolve platform -> download raw media
// -> run the matching content extractor -> return a Canonical Document (lib/core/canonical-document.mjs).
// Saving to the notebook store and rendering markdown happen in the caller (server.mjs), so this
// module stays a pure "URL in, document out" step and is easy to reuse outside the HTTP layer.
//
// Mutates the passed-in `job` object's stage/progress/message/process/abortController fields as it
// goes, following the same convention as the existing download/transcription job objects in
// server.mjs — this lets the caller poll `job` for a processing-page progress checklist and cancel
// it mid-flight via `job.process?.kill()` / `job.abortController?.abort()`.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractAudio as ffmpegExtractAudio } from '../media/audio-extractor.mjs';
import { LocalFunAsrProvider } from '../transcription/providers/local-funasr-provider.mjs';
import { extractBilibiliContent } from './extractors/bilibili-extractor.mjs';
import { extractXiaohongshuNote } from './extractors/xiaohongshu-extractor.mjs';

// MVP scope: only these two platforms get the full note pipeline. YouTube/抖音 keep their
// download-only provider but are not wired into note generation yet.
export const NOTE_PIPELINE_PLATFORMS = new Set(['Bilibili', '小红书']);

async function buildBilibiliDocument(job, {
  ytDlpProvider, ffmpegPath, language, extractAudioFn, createAsrProvider, extractBilibiliContentFn,
}) {
  job.stage = 'downloading';
  job.progress = 15;
  job.message = '正在下载音频…';
  job.preset = 'audio';
  await ytDlpProvider.download(job);

  job.stage = 'extracting';
  job.progress = 55;
  job.message = '正在提取标题、简介与语音文字…';
  job.abortController = new AbortController();
  try {
    return await extractBilibiliContentFn({
      url: job.url,
      id: job.id,
      downloadPath: job.downloadPath,
      // Without this, the extractor's own default ('yt-dlp' bare command
      // name) is used for its separate metadata-only invocation, which
      // fails with "spawn yt-dlp ENOENT" in every environment where yt-dlp
      // is only installed at the project-local bin/yt-dlp wrapper rather
      // than on $PATH — i.e. every environment this project's setup
      // scripts actually produce. That failure was swallowed (only
      // recorded in extraction.stagesAttempted, never thrown), so title
      // and author came back empty on every single note while the job
      // still reported "complete!" — the audio download above uses
      // ytDlpProvider's own resolved path and works fine, only this
      // second, separate call was missing it.
      ytDlpPath: ytDlpProvider.ytDlpPath,
      ffmpegPath,
      language,
      extractAudioFn,
      createAsrProvider,
      signal: job.abortController.signal,
    });
  } finally {
    if (job.downloadPath) await rm(job.downloadPath, { force: true }).catch(() => {});
  }
}

async function buildXiaohongshuDocument(job, {
  xhsProvider, workDir, extractAudioFn, createAsrProvider, extractXiaohongshuNoteFn,
}) {
  job.stage = 'downloading';
  job.progress = 15;
  job.message = '正在解析小红书笔记…';
  const { details, files } = await xhsProvider.resolveAndDownloadRaw(job, workDir);

  job.stage = 'extracting';
  job.progress = 55;
  job.message = '正在提取正文、图片文字与语音文字…';
  job.abortController = new AbortController();

  const isVideo = details.type === 'video';
  return extractXiaohongshuNoteFn({
    details,
    images: isVideo ? [] : files.map((file) => ({ path: file.path })),
    videoPath: isVideo ? files[0]?.path : undefined,
    audioOutputPath: isVideo ? path.join(workDir, 'asr-audio.wav') : undefined,
    extractAudio: extractAudioFn,
    asrProvider: createAsrProvider({ validateDependencies: false }),
    signal: job.abortController.signal,
  });
}

/**
 * Builds a Canonical Document for a note job.
 *
 * @param {object} job - mutated in place: `stage`/`progress`/`message` for a processing-page
 *   checklist, `process`/`abortController` for cancellation, `downloadPath`/`filename` as a
 *   byproduct of reusing the download providers. Must at least carry `{ id, url, platform }`,
 *   and for xiaohongshu, `xhsCookie` (may be an empty string).
 * @param {object} context
 * @param {object} context.ytDlpProvider - a YtDlpProvider instance (lib/download/providers/ytdlp-provider.mjs).
 * @param {object} context.xhsProvider - an XhsProvider instance (lib/download/providers/xhs-provider.mjs).
 * @param {string} [context.ffmpegPath='ffmpeg']
 * @param {string} [context.language='auto']
 * @returns {Promise<object>} a Canonical Document.
 */
export async function buildNoteDocument(job, {
  ytDlpProvider,
  xhsProvider,
  ffmpegPath = 'ffmpeg',
  language = 'auto',
  extractAudioFn,
  createAsrProvider,
  extractBilibiliContentFn = extractBilibiliContent,
  extractXiaohongshuNoteFn = extractXiaohongshuNote,
} = {}) {
  if (!NOTE_PIPELINE_PLATFORMS.has(job.platform)) {
    throw new Error(`暂时还不支持从${job.platform}生成学习笔记（目前仅支持 B 站视频与小红书图文/视频）。`);
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), 'note-pipeline-'));
  const resolvedExtractAudioFn = extractAudioFn || ((options) => ffmpegExtractAudio({ ffmpegPath, ...options }));
  const resolvedCreateAsrProvider = createAsrProvider || ((opts) => new LocalFunAsrProvider(opts));

  try {
    if (job.platform === 'Bilibili') {
      return await buildBilibiliDocument(job, {
        ytDlpProvider,
        ffmpegPath,
        language,
        extractAudioFn: resolvedExtractAudioFn,
        createAsrProvider: resolvedCreateAsrProvider,
        extractBilibiliContentFn,
      });
    }
    return await buildXiaohongshuDocument(job, {
      xhsProvider,
      workDir,
      extractAudioFn: resolvedExtractAudioFn,
      createAsrProvider: resolvedCreateAsrProvider,
      extractXiaohongshuNoteFn,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    job.abortController = undefined;
  }
}
