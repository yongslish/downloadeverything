import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NotebookStore } from '../lib/core/notebook-store.mjs';

let baseDir;
let store;

before(async () => {
  baseDir = await mkdtemp(path.join(os.tmpdir(), 'notebook-store-test-'));
});

after(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

beforeEach(() => {
  store = new NotebookStore(path.join(baseDir, `case-${Date.now()}-${Math.random().toString(16).slice(2)}`));
});

function makeDocument(overrides = {}) {
  return {
    schemaVersion: 1,
    id: overrides.id || 'doc-1',
    source: { platform: 'Bilibili', url: 'https://www.bilibili.com/video/BV1xx', contentType: 'video' },
    title: overrides.title || '示例标题',
    author: { name: overrides.author || 'UP主', id: 'author-1' },
    publishedAt: null,
    tags: overrides.tags || ['科技'],
    metrics: {},
    blocks: [{ index: 0, type: 'text', source: 'metadata', start: null, end: null, text: '正文', imageIndex: null }],
    images: [],
    extraction: { stagesAttempted: [], stagesUsed: [], asrProvider: null },
    createdAt: overrides.createdAt || new Date().toISOString(),
    ...overrides,
  };
}

test('save + get roundtrips the full Canonical Document', async () => {
  const document = makeDocument({ id: 'roundtrip-1' });
  await store.save(document);

  const loaded = await store.get('roundtrip-1');
  assert.deepEqual(loaded, document);
});

test('save writes markdown alongside the document when provided', async () => {
  const document = makeDocument({ id: 'with-markdown' });
  await store.save(document, '# 示例标题\n\n正文\n');

  const markdown = await readFile(path.join(store.baseDir, 'with-markdown', 'note.md'), 'utf8');
  assert.equal(markdown, '# 示例标题\n\n正文\n');

  const rawDocument = JSON.parse(await readFile(path.join(store.baseDir, 'with-markdown', 'document.json'), 'utf8'));
  assert.equal(rawDocument.id, 'with-markdown');
});

test('save without markdown does not create note.md', async () => {
  const document = makeDocument({ id: 'no-markdown' });
  await store.save(document);

  await assert.rejects(() => stat(path.join(store.baseDir, 'no-markdown', 'note.md')));
});

test('list returns lightweight summaries sorted newest first', async () => {
  const oldest = makeDocument({ id: 'a', title: '最早', createdAt: '2026-01-01T00:00:00.000Z' });
  const middle = makeDocument({ id: 'b', title: '中间', createdAt: '2026-02-01T00:00:00.000Z' });
  const newest = makeDocument({ id: 'c', title: '最新', createdAt: '2026-03-01T00:00:00.000Z' });

  await store.save(oldest);
  await store.save(newest);
  await store.save(middle);

  const index = await store.list();
  assert.deepEqual(index.map((entry) => entry.id), ['c', 'b', 'a']);

  const first = index[0];
  assert.deepEqual(first, {
    id: 'c',
    title: '最新',
    author: 'UP主',
    platform: 'Bilibili',
    url: 'https://www.bilibili.com/video/BV1xx',
    tags: ['科技'],
    createdAt: '2026-03-01T00:00:00.000Z',
  });
});

test('re-saving an existing id updates the index in place instead of duplicating it', async () => {
  await store.save(makeDocument({ id: 'dup', title: '第一版', createdAt: '2026-01-01T00:00:00.000Z' }));
  await store.save(makeDocument({ id: 'dup', title: '第二版', createdAt: '2026-05-01T00:00:00.000Z' }));

  const index = await store.list();
  assert.equal(index.length, 1);
  assert.equal(index[0].title, '第二版');

  const loaded = await store.get('dup');
  assert.equal(loaded.title, '第二版');
});

test('remove deletes the note files and updates the index', async () => {
  await store.save(makeDocument({ id: 'keep' }));
  await store.save(makeDocument({ id: 'gone' }));

  await store.remove('gone');

  const index = await store.list();
  assert.deepEqual(index.map((entry) => entry.id), ['keep']);

  await assert.rejects(() => stat(path.join(store.baseDir, 'gone')));
  await assert.rejects(() => store.get('gone'));
});

test('get throws (does not return null/undefined) for an unknown id', async () => {
  await assert.rejects(() => store.get('does-not-exist'), /未找到笔记/);
});

test('remove throws (does not silently no-op) for an unknown id', async () => {
  await assert.rejects(() => store.remove('does-not-exist'), /未找到笔记/);
});

test('list on an empty/never-used store returns an empty array without creating files', async () => {
  const emptyStore = new NotebookStore(path.join(baseDir, `empty-${Date.now()}-${Math.random().toString(16).slice(2)}`));
  const index = await emptyStore.list();
  assert.deepEqual(index, []);
});
