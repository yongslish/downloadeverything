import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  documentFilename,
  formatTimestamp,
  renderCanonicalDocumentToMarkdown,
} from '../lib/export/markdown-exporter.mjs';

// Fixtures below are plain objects shaped like lib/core/canonical-document.mjs's
// createCanonicalDocument() output. This module stays dependency-free of the core/download
// layers, so the tests build the shape by hand rather than importing the factory.

function makeDocument(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'doc-1',
    source: {
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      contentType: 'video',
    },
    title: '如何高效复盘面试',
    author: { name: '张三', id: 'user-42' },
    publishedAt: '2026-01-05T08:00:00.000Z',
    tags: ['面试', '复盘'],
    metrics: { likes: 10 },
    blocks: [
      { index: 0, type: 'text', source: 'native-caption', start: 3, end: 8, text: '大家好，今天聊聊复盘。', imageIndex: null },
      { index: 1, type: 'text', source: 'ocr', start: null, end: null, text: 'PPT 第一页要点', imageIndex: 0 },
      { index: 2, type: 'text', source: 'post-body', start: null, end: null, text: '这是这条视频的简介文字。', imageIndex: null },
    ],
    images: [
      { index: 0, path: 'images/01.jpg', ocrText: 'PPT 第一页要点' },
    ],
    extraction: {
      stagesAttempted: ['native-caption', 'ocr', 'asr'],
      stagesUsed: ['native-caption', 'ocr'],
      asrProvider: null,
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('formatTimestamp renders mm:ss and switches to hh:mm:ss at one hour', () => {
  assert.equal(formatTimestamp(0), '00:00');
  assert.equal(formatTimestamp(59), '00:59');
  assert.equal(formatTimestamp(60), '01:00');
  assert.equal(formatTimestamp(3599), '59:59');
  assert.equal(formatTimestamp(3600), '01:00:00');
  assert.equal(formatTimestamp(3661), '01:01:01');
});

test('renders correct YAML frontmatter with provenance', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatterMatch, 'expected a YAML frontmatter block');
  const frontmatter = frontmatterMatch[1];

  assert.match(frontmatter, /title: "如何高效复盘面试"/);
  assert.match(frontmatter, /author:\n {2}name: "张三"\n {2}id: "user-42"/);
  assert.match(frontmatter, /source:\n {2}platform: "bilibili"\n {2}url: "https:\/\/www\.bilibili\.com\/video\/BV1xx411c7mD"\n {2}contentType: "video"/);
  assert.match(frontmatter, /publishedAt: "2026-01-05T08:00:00\.000Z"/);
  assert.match(frontmatter, /createdAt: "2026-07-01T00:00:00\.000Z"/);
  assert.match(frontmatter, /tags: \["面试", "复盘"\]/);
  assert.match(frontmatter, /extraction:\n {2}stagesAttempted: \["native-caption", "ocr", "asr"\]\n {2}stagesUsed: \["native-caption", "ocr"\]\n {2}asrProvider: null/);
});

test('marks time-anchored blocks with a timestamp so claims are traceable', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  assert.match(markdown, /\*\*\[00:03\]\*\* 大家好，今天聊聊复盘。/);
});

test('visually distinguishes OCR blocks from the author\'s own words', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  assert.match(markdown, /^> 📷 .*图片文字：PPT 第一页要点$/m);
  // Make sure OCR text is not rendered as an ordinary unmarked paragraph line.
  assert.doesNotMatch(markdown, /^PPT 第一页要点$/m);
});

test('renders post-body/metadata blocks as plain paragraphs without a timestamp', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  assert.match(markdown, /^这是这条视频的简介文字。$/m);
});

test('adds an image section with OCR text when images are present', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  assert.match(markdown, /## 图片/);
  assert.match(markdown, /1\. `images\/01\.jpg`/);
  assert.match(markdown, /- 图片文字：PPT 第一页要点/);
});

test('omits the image section entirely when there are no images', () => {
  const document = makeDocument({
    images: [],
    blocks: [
      { index: 0, type: 'text', source: 'post-body', start: null, end: null, text: '纯文字笔记，没有图片。', imageIndex: null },
    ],
  });
  const markdown = renderCanonicalDocumentToMarkdown(document);
  assert.doesNotMatch(markdown, /## 图片/);
});

test('renders an H1 title matching the document title', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  assert.match(markdown, /^# 如何高效复盘面试$/m);
});

test('documentFilename produces a filesystem-safe .md filename from the title', () => {
  assert.equal(documentFilename(makeDocument()), '如何高效复盘面试.md');
  assert.equal(
    documentFilename(makeDocument({ title: 'a/b:c*d?"e<f>g|h\\i' })),
    'a b c d e f g h i.md',
  );
  assert.equal(documentFilename(makeDocument({ title: '' })), 'untitled-note.md');
  assert.equal(documentFilename(makeDocument({ title: '  spaced   out  title  ' })), 'spaced out title.md');
});

test('renders a small end-to-end sample document', () => {
  const markdown = renderCanonicalDocumentToMarkdown(makeDocument());
  // Spot-check the overall shape: frontmatter, title, then blocks in order.
  const lines = markdown.split('\n');
  assert.equal(lines[0], '---');
  const titleIndex = lines.indexOf('# 如何高效复盘面试');
  assert.ok(titleIndex > 0);
  assert.ok(markdown.indexOf('大家好，今天聊聊复盘。') < markdown.indexOf('PPT 第一页要点'));
  assert.ok(markdown.indexOf('PPT 第一页要点') < markdown.indexOf('这是这条视频的简介文字。'));
});
