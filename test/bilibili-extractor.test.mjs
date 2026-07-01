import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  extractBilibiliContent,
  parseSubtitleCues,
  parseTimestamp,
  bilibiliVideoIdFromUrl,
} from '../lib/content/extractors/bilibili-extractor.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

async function createFixtureDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bilibili-extractor-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function workDirFromArgs(args) {
  const outputIndex = args.indexOf('-o');
  const template = args[outputIndex + 1];
  return path.dirname(template);
}

const SAMPLE_INFO = {
  id: 'BV1xx411c7mD',
  title: '示例讲解视频',
  uploader: '示例UP主',
  uploader_id: '123456',
  upload_date: '20260615',
  description: '这是一段用于测试的视频简介。',
  duration: 125,
  view_count: 1000,
  like_count: 50,
  comment_count: 5,
  tags: ['教程', '测试'],
  chapters: [
    { title: '开场', start_time: 0, end_time: 10 },
    { title: '正题', start_time: 10, end_time: 125 },
  ],
};

function makeMetadataOnlyRunProcess({ info = SAMPLE_INFO } = {}) {
  return async (command, args) => {
    const dir = workDirFromArgs(args);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${info.id}.info.json`), JSON.stringify(info), 'utf8');
    return { stdout: '', stderr: '' };
  };
}

function makeSubtitleRunProcess({ info = SAMPLE_INFO, srt } = {}) {
  const defaultSrt = `1\n00:00:00,000 --> 00:00:02,500\n大家好，欢迎观看本期视频。\n\n2\n00:00:02,500 --> 00:00:05,000\n今天我们来聊聊测试。\n`;
  return async (command, args) => {
    const dir = workDirFromArgs(args);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${info.id}.info.json`), JSON.stringify(info), 'utf8');
    await writeFile(path.join(dir, `${info.id}.zh-CN.srt`), srt ?? defaultSrt, 'utf8');
    return { stdout: '', stderr: '' };
  };
}

function makeFailingRunProcess(message = 'yt-dlp 元数据抓取失败：测试模拟错误') {
  return async () => {
    throw new Error(message);
  };
}

test('parseTimestamp handles srt (comma) and vtt (dot) separators, with and without hours', () => {
  assert.equal(parseTimestamp('00:00:02,500'), 2.5);
  assert.equal(parseTimestamp('00:00:02.500'), 2.5);
  assert.equal(parseTimestamp('01:02:03,250'), 3723.25);
  assert.equal(parseTimestamp('not-a-timestamp'), null);
});

test('parseSubtitleCues parses SRT blocks into ordered cues', () => {
  const srt = '1\n00:00:00,000 --> 00:00:02,500\n第一句话。\n\n2\n00:00:02,500 --> 00:00:05,000\n第二句话。\n';
  const cues = parseSubtitleCues(srt);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { start: 0, end: 2.5, text: '第一句话。' });
  assert.equal(cues[1].text, '第二句话。');
});

test('parseSubtitleCues parses WebVTT blocks and strips cue tags', () => {
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Speaker>你好世界</v>\n';
  const cues = parseSubtitleCues(vtt);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, '你好世界');
});

test('bilibiliVideoIdFromUrl extracts BV ids from typical URLs', () => {
  assert.equal(bilibiliVideoIdFromUrl('https://www.bilibili.com/video/BV1xx411c7mD/'), 'BV1xx411c7mD');
  assert.equal(bilibiliVideoIdFromUrl('https://www.bilibili.com/video/av12345'), '12345');
  assert.equal(bilibiliVideoIdFromUrl('https://www.bilibili.com/video/nothing-here'), null);
});

test('uses native subtitles as the timeline when yt-dlp can fetch them', async () => {
  const doc = await extractBilibiliContent({
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ytDlpPath: 'fake-yt-dlp',
    runProcess: makeSubtitleRunProcess(),
    downloadPath: '/tmp/should-not-be-used.mp4',
    extractAudioFn: async () => { throw new Error('ASR should not run when native captions exist'); },
  });

  const captionBlocks = doc.blocks.filter((block) => block.source === 'native-caption');
  assert.equal(captionBlocks.length, 2);
  assert.equal(captionBlocks[0].start, 0);
  assert.equal(captionBlocks[0].end, 2.5);
  assert.equal(captionBlocks[0].text, '大家好，欢迎观看本期视频。');

  assert.equal(doc.title, '示例讲解视频');
  assert.equal(doc.author.name, '示例UP主');
  assert.equal(doc.publishedAt, '2026-06-15T00:00:00.000Z');
  assert.equal(doc.metrics.duration, 125);
  assert.deepEqual(doc.tags, ['教程', '测试']);

  assert.ok(doc.extraction.stagesUsed.includes('native-subtitles'));
  assert.ok(doc.extraction.stagesUsed.includes('metadata'));
  assert.ok(!doc.extraction.stagesUsed.includes('asr'));
  const nativeStage = doc.extraction.stagesAttempted.find((entry) => entry.stage === 'native-subtitles');
  assert.equal(nativeStage.status, 'used');
  assert.equal(doc.extraction.asrProvider, null);

  const chapterBlocks = doc.blocks.filter((block) => block.text.startsWith('章节：'));
  assert.equal(chapterBlocks.length, 2);
  assert.equal(chapterBlocks[0].start, 0);
  assert.equal(chapterBlocks[0].end, 10);
});

test('falls back to metadata + description when no native captions exist (normal, not an error)', async () => {
  const doc = await extractBilibiliContent({
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ytDlpPath: 'fake-yt-dlp',
    runProcess: makeMetadataOnlyRunProcess(),
  });

  assert.equal(doc.blocks.some((block) => block.source === 'native-caption'), false);
  const metadataBlock = doc.blocks.find((block) => block.source === 'metadata' && block.text.includes('标题'));
  assert.ok(metadataBlock);
  const postBody = doc.blocks.find((block) => block.source === 'post-body');
  assert.equal(postBody.text, '这是一段用于测试的视频简介。');

  const nativeStage = doc.extraction.stagesAttempted.find((entry) => entry.stage === 'native-subtitles');
  assert.equal(nativeStage.status, 'not-available');
  assert.ok(doc.extraction.stagesUsed.includes('metadata'));
  assert.ok(!doc.extraction.stagesUsed.includes('native-subtitles'));

  // No downloadPath was supplied, so ASR must be explicitly skipped rather than silently absent.
  const asrStage = doc.extraction.stagesAttempted.find((entry) => entry.stage === 'asr');
  assert.equal(asrStage.status, 'skipped');
});

test('falls back to local FunASR transcription when native captions are unavailable', async () => {
  const fixtureDir = await createFixtureDir();
  const mediaPath = path.join(fixtureDir, 'video.mp4');
  await writeFile(mediaPath, 'fake media bytes');

  let transcribeCall = null;
  const fakeAsrProvider = {
    name: 'funasr-local',
    transcribe: async (options) => {
      transcribeCall = options;
      return {
        text: '这是本地 FunASR 的测试转写。',
        duration: 6.5,
        segments: [
          { start: 0, end: 3.2, text: '这是本地 FunASR 的测试转写。' },
          { start: 3.2, end: 6.5, text: '第二段转写内容。' },
        ],
      };
    },
  };

  let extractAudioCall = null;
  const doc = await extractBilibiliContent({
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ytDlpPath: 'fake-yt-dlp',
    runProcess: makeMetadataOnlyRunProcess(),
    downloadPath: mediaPath,
    extractAudioFn: async (options) => {
      extractAudioCall = options;
      return { audioPath: options.outputPath, codec: 'pcm_s16le', sampleRate: 16000, channels: 1, usedFfmpeg: true };
    },
    asrProvider: fakeAsrProvider,
  });

  assert.equal(extractAudioCall.inputPath, mediaPath);
  assert.equal(transcribeCall.language, 'auto');

  const asrBlocks = doc.blocks.filter((block) => block.source === 'asr');
  assert.equal(asrBlocks.length, 2);
  assert.equal(asrBlocks[0].start, 0);
  assert.equal(asrBlocks[0].end, 3.2);
  assert.equal(asrBlocks[1].text, '第二段转写内容。');

  assert.ok(doc.extraction.stagesUsed.includes('asr'));
  assert.equal(doc.extraction.asrProvider, 'funasr-local');
  const asrStage = doc.extraction.stagesAttempted.find((entry) => entry.stage === 'asr');
  assert.equal(asrStage.status, 'used');
});

test('still attempts ASR fallback even when the yt-dlp metadata call fails entirely', async () => {
  const fixtureDir = await createFixtureDir();
  const mediaPath = path.join(fixtureDir, 'video.mp4');
  await writeFile(mediaPath, 'fake media bytes');

  const fakeAsrProvider = {
    name: 'funasr-local',
    transcribe: async () => ({
      text: '容错路径下的转写。',
      duration: 2,
      segments: [{ start: 0, end: 2, text: '容错路径下的转写。' }],
    }),
  };

  const doc = await extractBilibiliContent({
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ytDlpPath: 'fake-yt-dlp',
    runProcess: makeFailingRunProcess(),
    downloadPath: mediaPath,
    extractAudioFn: async (options) => ({ audioPath: options.outputPath }),
    asrProvider: fakeAsrProvider,
  });

  assert.equal(doc.blocks.some((block) => block.source === 'asr'), true);
  assert.equal(doc.title, '');
  const nativeStage = doc.extraction.stagesAttempted.find((entry) => entry.stage === 'native-subtitles');
  assert.equal(nativeStage.status, 'error');
  assert.ok(doc.extraction.stagesUsed.includes('asr'));
});

test('records an error stage instead of throwing when ASR itself fails', async () => {
  const fixtureDir = await createFixtureDir();
  const mediaPath = path.join(fixtureDir, 'video.mp4');
  await writeFile(mediaPath, 'fake media bytes');

  const doc = await extractBilibiliContent({
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ytDlpPath: 'fake-yt-dlp',
    runProcess: makeMetadataOnlyRunProcess(),
    downloadPath: mediaPath,
    extractAudioFn: async () => {
      throw new Error('ffmpeg 测试失败');
    },
  });

  const asrStage = doc.extraction.stagesAttempted.find((entry) => entry.stage === 'asr');
  assert.equal(asrStage.status, 'error');
  assert.match(asrStage.detail, /ffmpeg 测试失败/);
  // Metadata blocks still make it into the document even though ASR failed.
  assert.ok(doc.blocks.some((block) => block.source === 'metadata'));
});

test('cleans up its own scratch work directory by default', async () => {
  let capturedDir;
  const doc = await extractBilibiliContent({
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    ytDlpPath: 'fake-yt-dlp',
    runProcess: async (command, args) => {
      capturedDir = workDirFromArgs(args);
      return makeMetadataOnlyRunProcess()(command, args);
    },
  });

  assert.ok(doc);
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(capturedDir), false);
});
