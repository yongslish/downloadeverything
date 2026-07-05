import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  groupBlocksIntoParagraphs,
  renderCanonicalDocumentToPlainText,
} from '../lib/export/plaintext-exporter.mjs';

function block(overrides) {
  return { index: 0, type: 'text', source: 'asr', start: null, end: null, text: '', imageIndex: null, ...overrides };
}

test('groupBlocksIntoParagraphs merges consecutive same-source timed blocks under one paragraph', () => {
  const blocks = [
    block({ index: 0, start: 0, end: 3, text: '今天我们来聊聊' }),
    block({ index: 1, start: 3, end: 6, text: '深度学习的基础概念。' }),
    block({ index: 2, start: 6.2, end: 9, text: '先从张量开始讲起。' }),
  ];
  const paragraphs = groupBlocksIntoParagraphs(blocks);
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].text, '今天我们来聊聊深度学习的基础概念。先从张量开始讲起。');
  assert.equal(paragraphs[0].start, 0);
});

test('groupBlocksIntoParagraphs breaks on a long pause between blocks', () => {
  const blocks = [
    block({ index: 0, start: 0, end: 3, text: '第一段内容。' }),
    // 10-second gap — a real pause, not just VAD's usual sub-second breathing room.
    block({ index: 1, start: 13, end: 16, text: '第二段内容，换了个话题。' }),
  ];
  const paragraphs = groupBlocksIntoParagraphs(blocks);
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].text, '第一段内容。');
  assert.equal(paragraphs[1].text, '第二段内容，换了个话题。');
  assert.equal(paragraphs[1].start, 13);
});

test('groupBlocksIntoParagraphs breaks once a paragraph gets long enough, even with no pause', () => {
  const longChunk = '这是一段用来撑长度的重复文字。'.repeat(13); // 15 chars * 13 = 195, over the 180 target
  const blocks = [
    block({ index: 0, start: 0, end: 5, text: longChunk }),
    block({ index: 1, start: 5, end: 8, text: '这一句应该另起一段。' }),
  ];
  const paragraphs = groupBlocksIntoParagraphs(blocks);
  assert.equal(paragraphs.length, 2);
});

test('groupBlocksIntoParagraphs never merges blocks with no real timeline (image-text notes)', () => {
  // Matches lib/content/extractors/xiaohongshu-extractor.mjs's post-body blocks: start=end=0 is
  // the "no timeline" sentinel, not an actual timestamp at t=0.
  const blocks = [
    block({ index: 0, source: 'post-body', start: 0, end: 0, text: '标题' }),
    block({ index: 1, source: 'post-body', start: 0, end: 0, text: '正文第一句。正文第二句。' }),
  ];
  const paragraphs = groupBlocksIntoParagraphs(blocks);
  assert.equal(paragraphs.length, 2);
  assert.equal(paragraphs[0].start, null);
  assert.equal(paragraphs[1].start, null);
});

test('groupBlocksIntoParagraphs skips empty/whitespace-only blocks', () => {
  const blocks = [
    block({ index: 0, start: 0, end: 2, text: '有内容的一句。' }),
    block({ index: 1, start: 2, end: 2.1, text: '   ' }),
    block({ index: 2, start: 2.1, end: 4, text: '继续说下去。' }),
  ];
  const paragraphs = groupBlocksIntoParagraphs(blocks);
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].text, '有内容的一句。继续说下去。');
});

test('groupBlocksIntoParagraphs does not merge across different sources (e.g. caption vs. OCR)', () => {
  const blocks = [
    block({ index: 0, source: 'native-caption', start: 0, end: 2, text: '视频里说的话。' }),
    block({ index: 1, source: 'ocr', start: 2, end: 4, text: '画面里的文字。' }),
  ];
  const paragraphs = groupBlocksIntoParagraphs(blocks);
  assert.equal(paragraphs.length, 2);
});

test('renderCanonicalDocumentToPlainText has no timestamps or markdown syntax', () => {
  const document = {
    title: '深度学习入门',
    source: { platform: 'Bilibili' },
    author: { name: '沐神' },
    blocks: [
      { index: 0, source: 'native-caption', start: 0, end: 3, text: '大家好，今天讲深度学习。' },
      { index: 1, source: 'native-caption', start: 3, end: 6, text: '先从张量说起。' },
    ],
  };
  const text = renderCanonicalDocumentToPlainText(document);
  assert.match(text, /^深度学习入门/);
  assert.match(text, /Bilibili · 沐神/);
  assert.equal(/\*\*\[/.test(text), false, 'should not contain markdown timestamp markers');
  assert.equal(/\d{2}:\d{2}/.test(text), false, 'should not contain any mm:ss timestamps');
  assert.match(text, /大家好，今天讲深度学习。先从张量说起。/);
});

test('renderCanonicalDocumentToPlainText falls back to a placeholder title', () => {
  const text = renderCanonicalDocumentToPlainText({ title: '', source: {}, author: {}, blocks: [] });
  assert.match(text, /^未命名笔记/);
});
