import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractXiaohongshuNote } from '../lib/content/extractors/xiaohongshu-extractor.mjs';

// A minimal fake standing in for lib/core/canonical-document.mjs's
// createCanonicalDocument, so these tests never depend on that module
// actually existing/being importable.
function fakeCreateDocument(payload) {
  return { ...payload };
}

function baseImageDetails(overrides = {}) {
  return {
    urls: ['https://xhs.example/image-one.jpg', 'https://xhs.example/image-two.jpg'],
    title: '在家做的减脂沙拉',
    type: 'image',
    description: '今天分享一个简单的减脂沙拉做法，食材便宜又好吃。',
    authorNickname: '小美食家',
    authorId: 'user-123',
    noteId: 'note-abc',
    noteUrl: 'https://www.xiaohongshu.com/explore/note-abc',
    publishedAt: '2026-06-20 10:00',
    updatedAt: '2026-06-21 09:00',
    tags: '减脂,沙拉,健康饮食',
    metrics: { likes: 100, collections: 20, comments: 5, shares: 1 },
    ...overrides,
  };
}

function baseVideoDetails(overrides = {}) {
  return {
    urls: ['https://xhs.example/video.mp4'],
    title: '',
    type: 'video',
    description: '',
    authorNickname: '旅行博主',
    authorId: 'user-456',
    noteId: 'note-xyz',
    noteUrl: 'https://www.xiaohongshu.com/explore/note-xyz',
    publishedAt: '2026-06-18 08:00',
    updatedAt: '',
    tags: '',
    metrics: { likes: 5, collections: 0, comments: 0, shares: 0 },
    ...overrides,
  };
}

test('image-text note: builds post-body/metadata blocks from title, description and tags', async () => {
  const document = await extractXiaohongshuNote({
    details: baseImageDetails(),
    createDocument: fakeCreateDocument,
    ocrImage: async () => '',
  });

  assert.equal(document.title, '在家做的减脂沙拉');
  assert.deepEqual(document.tags, ['减脂', '沙拉', '健康饮食']);
  assert.deepEqual(document.author, { name: '小美食家', id: 'user-123' });
  assert.equal(document.source.platform, 'xiaohongshu');
  assert.equal(document.source.noteId, 'note-abc');

  const postBodyBlocks = document.blocks.filter((block) => block.source === 'post-body');
  assert.equal(postBodyBlocks.length, 2);
  assert.equal(postBodyBlocks[0].text, '在家做的减脂沙拉');
  assert.equal(postBodyBlocks[1].text, '今天分享一个简单的减脂沙拉做法，食材便宜又好吃。');
  assert.equal(postBodyBlocks[0].start, null);
  assert.equal(postBodyBlocks[0].end, null);

  const metadataBlocks = document.blocks.filter((block) => block.source === 'metadata');
  assert.equal(metadataBlocks.length, 1);
  assert.match(metadataBlocks[0].text, /减脂 沙拉 健康饮食/);

  assert.deepEqual(document.extraction.stagesAttempted, ['post-text', 'image-ocr']);
  assert.deepEqual(document.extraction.stagesUsed, ['post-text']);
  assert.equal(document.extraction.noteType, 'image');
});

test('image-text note: OCR stage produces ocr blocks and populates images[].ocrText', async () => {
  const calls = [];
  const document = await extractXiaohongshuNote({
    details: baseImageDetails(),
    images: [
      { path: '/tmp/xhs/note-abc/image-01.jpg' },
      { path: '/tmp/xhs/note-abc/image-02.jpg' },
    ],
    createDocument: fakeCreateDocument,
    ocrImage: async ({ imagePath }) => {
      calls.push(imagePath);
      if (imagePath.endsWith('image-01.jpg')) return '  减脂沙拉配方  \n第一步：切菜';
      return ''; // second image has no baked-in text
    },
  });

  assert.deepEqual(calls, [
    '/tmp/xhs/note-abc/image-01.jpg',
    '/tmp/xhs/note-abc/image-02.jpg',
  ]);

  assert.equal(document.images.length, 2);
  assert.equal(document.images[0].path, '/tmp/xhs/note-abc/image-01.jpg');
  assert.equal(document.images[0].ocrText, '减脂沙拉配方  \n第一步：切菜');
  assert.equal(document.images[1].path, '/tmp/xhs/note-abc/image-02.jpg');
  assert.equal(document.images[1].ocrText, '');

  const ocrBlocks = document.blocks.filter((block) => block.source === 'ocr');
  assert.equal(ocrBlocks.length, 1);
  assert.equal(ocrBlocks[0].start, null);
  assert.equal(ocrBlocks[0].end, null);
  assert.match(ocrBlocks[0].text, /减脂沙拉配方/);

  assert.deepEqual(document.extraction.stagesUsed, ['post-text', 'image-ocr']);
});

test('image-text note: OCR errors on one image are recorded but do not fail extraction', async () => {
  const document = await extractXiaohongshuNote({
    details: baseImageDetails({ description: '' }),
    images: [{ path: '/tmp/broken.jpg' }],
    createDocument: fakeCreateDocument,
    ocrImage: async () => {
      throw new Error('OCR engine crashed');
    },
  });

  assert.equal(document.images.length, 1);
  assert.equal(document.images[0].ocrText, '');
  assert.equal(document.images[0].ocrError, 'OCR engine crashed');
  assert.equal(document.blocks.some((block) => block.source === 'ocr'), false);
});

test('video note with a substantial caption: ASR still runs (caption length is not a substitute for a transcript)', async () => {
  // Regression test: this used to skip ASR whenever the caption was "long
  // enough", on the theory that a long caption already describes the video.
  // A real 小红书 video with a ~30-character poetic caption ("大多数的放弃，
  // 是你败给了你自己，而不是命运"——《我与地坛》) hit exactly this path in
  // production and produced a caption-only document for a video that was
  // never actually transcribed. Captions are rarely transcripts, regardless
  // of length, so video notes always get ASR now — matching
  // design-system.md's 小红书视频 = 100%-by-duration ASR cost model.
  let transcribeCalled = false;
  const document = await extractXiaohongshuNote({
    details: baseVideoDetails({
      title: '重庆三日游完整攻略',
      description: '这次去重庆玩了三天，把吃喝玩乐路线都整理好了，建议收藏慢慢看，交通住宿美食都有详细说明。',
    }),
    createDocument: fakeCreateDocument,
    videoPath: '/tmp/xhs/note-xyz/video.mp4',
    extractAudio: async ({ inputPath, outputPath }) => ({
      audioPath: outputPath ?? `${inputPath}.asr-audio.wav`,
      codec: 'pcm_s16le',
      sampleRate: 16000,
      channels: 1,
      usedFfmpeg: true,
    }),
    asrProvider: {
      transcribe: async () => {
        transcribeCalled = true;
        return { segments: [{ start: 0, end: 2, text: '大家好' }] };
      },
    },
  });

  assert.equal(transcribeCalled, true);
  assert.deepEqual(document.extraction.stagesAttempted, ['post-text', 'video-asr']);
  assert.deepEqual(document.extraction.stagesUsed, ['post-text', 'video-asr']);
  assert.equal(document.blocks.some((block) => block.source === 'asr'), true);
});

test('video note with a short/empty caption: extracts audio and maps ASR segments to asr blocks', async () => {
  const extractAudioCalls = [];
  const transcribeCalls = [];

  const document = await extractXiaohongshuNote({
    details: baseVideoDetails(),
    createDocument: fakeCreateDocument,
    videoPath: '/tmp/xhs/note-xyz/video.mp4',
    extractAudio: async ({ inputPath, outputPath }) => {
      extractAudioCalls.push({ inputPath, outputPath });
      return { audioPath: outputPath, codec: 'pcm_s16le', sampleRate: 16000, channels: 1, usedFfmpeg: true };
    },
    asrProvider: {
      transcribe: async ({ audioPath, language }) => {
        transcribeCalls.push({ audioPath, language });
        return {
          segments: [
            { start: 0, end: 3.2, text: '大家好，今天带大家看看重庆。' },
            { start: 3.2, end: 6.5, text: '   ' }, // blank segment should be dropped
            { start: 6.5, end: 9.9, text: '我们先去解放碑。' },
          ],
        };
      },
    },
  });

  assert.equal(extractAudioCalls.length, 1);
  assert.equal(extractAudioCalls[0].inputPath, '/tmp/xhs/note-xyz/video.mp4');
  assert.equal(extractAudioCalls[0].outputPath, '/tmp/xhs/note-xyz/video.mp4.asr-audio.wav');

  assert.equal(transcribeCalls.length, 1);
  assert.equal(transcribeCalls[0].audioPath, '/tmp/xhs/note-xyz/video.mp4.asr-audio.wav');
  assert.equal(transcribeCalls[0].language, 'zh');

  const asrBlocks = document.blocks.filter((block) => block.source === 'asr');
  assert.equal(asrBlocks.length, 2);
  assert.deepEqual(asrBlocks[0], { source: 'asr', start: 0, end: 3.2, text: '大家好，今天带大家看看重庆。' });
  assert.deepEqual(asrBlocks[1], { source: 'asr', start: 6.5, end: 9.9, text: '我们先去解放碑。' });

  assert.deepEqual(document.extraction.stagesAttempted, ['post-text', 'video-asr']);
  assert.deepEqual(document.extraction.stagesUsed, ['video-asr']);
});

test('video note with no ASR provider: attempts the stage but skips gracefully', async () => {
  const document = await extractXiaohongshuNote({
    details: baseVideoDetails(),
    createDocument: fakeCreateDocument,
    videoPath: '/tmp/xhs/note-xyz/video.mp4',
  });

  assert.deepEqual(document.extraction.stagesAttempted, ['post-text', 'video-asr']);
  assert.deepEqual(document.extraction.stagesUsed, []);
  assert.match(document.extraction.notes[0], /LocalFunAsrProvider/);
  assert.equal(document.blocks.some((block) => block.source === 'asr'), false);
});

test('video note with no local video path: attempts the stage but skips gracefully', async () => {
  const document = await extractXiaohongshuNote({
    details: baseVideoDetails(),
    createDocument: fakeCreateDocument,
    asrProvider: { transcribe: async () => ({ segments: [] }) },
  });

  assert.deepEqual(document.extraction.stagesAttempted, ['post-text', 'video-asr']);
  assert.deepEqual(document.extraction.stagesUsed, []);
  assert.match(document.extraction.notes[0], /本地视频文件路径/);
});

test('resolveDetails callback is used when `details` is not provided directly', async () => {
  const calls = [];
  const document = await extractXiaohongshuNote({
    url: 'https://www.xiaohongshu.com/explore/note-abc',
    cookie: 'web_session=ok',
    resolveDetails: async ({ url, cookie }) => {
      calls.push({ url, cookie });
      return baseImageDetails();
    },
    createDocument: fakeCreateDocument,
    ocrImage: async () => '',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.xiaohongshu.com/explore/note-abc');
  assert.equal(calls[0].cookie, 'web_session=ok');
  assert.equal(document.title, '在家做的减脂沙拉');
});

test('throws a clear error when neither `details` nor `resolveDetails` is provided', async () => {
  await assert.rejects(
    () => extractXiaohongshuNote({ url: 'https://www.xiaohongshu.com/explore/note-abc' }),
    /resolveDetails/,
  );
});
