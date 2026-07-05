import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { buildNoteDocument, NOTE_PIPELINE_PLATFORMS } from '../lib/content/note-pipeline.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function createFixtureDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'note-pipeline-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

test('rejects any platform outside Bilibili/小红书 with a friendly message', async () => {
  assert.deepEqual([...NOTE_PIPELINE_PLATFORMS].sort(), ['Bilibili', '小红书'].sort());
  await assert.rejects(
    () => buildNoteDocument({ id: 'job1', url: 'https://example.com/x', platform: 'YouTube' }, {}),
    /暂时还不支持/,
  );
});

test('bilibili: downloads audio via ytDlpProvider then extracts, and cleans up the downloaded file', async () => {
  const fixtureDir = await createFixtureDir();
  const downloadedAudioPath = path.join(fixtureDir, 'job1.audio.mp3');
  await writeFile(downloadedAudioPath, 'fake audio bytes');

  const fakeYtDlpProvider = {
    ytDlpPath: '/fake/bin/yt-dlp',
    download: async (job) => {
      assert.equal(job.preset, 'audio');
      job.downloadPath = downloadedAudioPath;
      job.filename = 'audio.mp3';
    },
  };

  let extractCallArgs = null;
  const fakeDocument = { id: 'job1', blocks: [{ text: 'ok' }] };
  const extractBilibiliContentFn = async (options) => {
    extractCallArgs = options;
    return fakeDocument;
  };

  const job = { id: 'job1', url: 'https://www.bilibili.com/video/BV1xx411c7mD', platform: 'Bilibili' };
  const doc = await buildNoteDocument(job, {
    ytDlpProvider: fakeYtDlpProvider,
    extractBilibiliContentFn,
    extractAudioFn: async () => { throw new Error('should not be called directly by the pipeline'); },
    createAsrProvider: () => ({ transcribe: async () => ({ segments: [] }) }),
  });

  assert.equal(doc, fakeDocument);
  assert.equal(extractCallArgs.downloadPath, downloadedAudioPath);
  // Regression: this used to not be forwarded at all, so the extractor's
  // own metadata-only yt-dlp call fell back to the bare 'yt-dlp' command
  // name and failed with ENOENT in every environment where yt-dlp is only
  // installed at the project-local bin/yt-dlp wrapper (i.e. always, given
  // this project's own setup scripts) — silently, since that failure was
  // only recorded in extraction.stagesAttempted rather than thrown. Title
  // and author came back empty on every real note as a result.
  assert.equal(extractCallArgs.ytDlpPath, '/fake/bin/yt-dlp');
  assert.equal(job.stage, 'extracting');
  assert.equal(job.abortController, undefined);
  // The pipeline must delete the raw downloaded media once extraction is done.
  assert.equal(existsSync(downloadedAudioPath), false);
});

test('xiaohongshu: resolves+downloads raw files then extracts, without invoking the download-and-zip flow', async () => {
  const fakeDetails = { type: 'image', title: '标题', description: '正文', urls: ['https://x/1.jpg'] };
  const fakeXhsProvider = {
    resolveAndDownloadRaw: async (job, destDir) => {
      assert.equal(typeof destDir, 'string');
      return { details: fakeDetails, files: [{ path: path.join(destDir, 'media-01.jpg'), extension: 'jpg' }] };
    },
  };

  let extractCallArgs = null;
  const fakeDocument = { id: 'note1', blocks: [{ text: 'ok' }] };
  const extractXiaohongshuNoteFn = async (options) => {
    extractCallArgs = options;
    return fakeDocument;
  };

  const job = { id: 'job2', url: 'https://www.xiaohongshu.com/explore/abc', platform: '小红书', xhsCookie: '' };
  const doc = await buildNoteDocument(job, {
    xhsProvider: fakeXhsProvider,
    extractXiaohongshuNoteFn,
    createAsrProvider: () => ({ transcribe: async () => ({ segments: [] }) }),
  });

  assert.equal(doc, fakeDocument);
  assert.equal(extractCallArgs.details, fakeDetails);
  assert.equal(extractCallArgs.images.length, 1);
  assert.equal(extractCallArgs.videoPath, undefined);
});

test('xiaohongshu video note: passes videoPath instead of images', async () => {
  const fakeDetails = { type: 'video', title: '标题', description: '简介' };
  const fakeXhsProvider = {
    resolveAndDownloadRaw: async (_job, destDir) => ({
      details: fakeDetails,
      files: [{ path: path.join(destDir, 'media-01.mp4'), extension: 'mp4' }],
    }),
  };

  let extractCallArgs = null;
  const extractXiaohongshuNoteFn = async (options) => {
    extractCallArgs = options;
    return { id: 'note2', blocks: [{ text: 'ok' }] };
  };

  const job = { id: 'job3', url: 'https://www.xiaohongshu.com/explore/def', platform: '小红书', xhsCookie: '' };
  await buildNoteDocument(job, {
    xhsProvider: fakeXhsProvider,
    extractXiaohongshuNoteFn,
    createAsrProvider: () => ({ transcribe: async () => ({ segments: [] }) }),
  });

  assert.equal(extractCallArgs.images.length, 0);
  assert.ok(extractCallArgs.videoPath.endsWith('media-01.mp4'));
});
