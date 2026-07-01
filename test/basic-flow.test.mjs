import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { YtDlpProvider } from '../lib/download/providers/ytdlp-provider.mjs';
import { parseXunfeiOrderResult } from '../lib/transcription/providers/xunfei-lfasr-provider.mjs';
import { makeXunfeiLlmSignature } from '../lib/transcription/providers/xunfei-ifasr-llm-provider.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 31_000 + Math.floor(Math.random() * 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let xhsProvider;
let fixtureDir;
let xhsProviderUrl;

test('adds anti-blocking request headers only for Bilibili', () => {
  const provider = new YtDlpProvider({
    downloadDir: '',
    ytDlpPath: '',
    presets: {},
    maxJobRuntimeMs: 1,
  });
  assert.deepEqual(provider.platformRequestArgs({ platform: 'Bilibili' }), [
    '--add-header', 'Origin:https://www.bilibili.com',
    '--add-header', 'Referer:https://www.bilibili.com/',
  ]);
  assert.deepEqual(provider.platformRequestArgs({ platform: 'YouTube' }), []);
  assert.deepEqual(provider.platformRequestArgs({ platform: '抖音' }), []);
});

test('extracts plain text from Xunfei orderResult lattice', () => {
  const orderResult = JSON.stringify({
    lattice: [
      {
        json_1best: JSON.stringify({
          st: {
            bg: '0',
            ed: '1800',
            rt: [
              {
                ws: [
                  { wb: 0, we: 40, cw: [{ w: '今天' }] },
                  { wb: 41, we: 80, cw: [{ w: '开始' }] },
                  { wb: 81, we: 82, cw: [{ w: '。', wp: 'p' }] },
                ],
              },
            ],
          },
        }),
      },
      {
        json_1best: JSON.stringify({
          st: {
            bg: '1800',
            ed: '3200',
            rt: [
              {
                ws: [
                  { wb: 0, we: 30, cw: [{ w: '复盘' }] },
                  { wb: 31, we: 70, cw: [{ w: '面试' }] },
                  { wb: 71, we: 72, cw: [{ w: '。', wp: 'p' }] },
                ],
              },
            ],
          },
        }),
      },
    ],
  });

  const parsed = parseXunfeiOrderResult(orderResult);
  assert.equal(parsed.text, '今天开始。\n复盘面试。');
  assert.equal(parsed.segments.length, 2);
  assert.equal(parsed.segments[0].start, 0);
  assert.equal(parsed.segments[1].end, 3.2);
});

test('creates deterministic Xunfei large-model request signatures', () => {
  const signature = makeXunfeiLlmSignature('secret', {
    appId: 'app',
    accessKeyId: 'key',
    dateTime: '2026-06-26T10:00:00+0800',
    signatureRandom: 'random-string',
    fileName: 'audio.wav',
    fileSize: '123',
  });
  assert.equal(signature, makeXunfeiLlmSignature('secret', {
    fileSize: '123',
    fileName: 'audio.wav',
    signatureRandom: 'random-string',
    dateTime: '2026-06-26T10:00:00+0800',
    accessKeyId: 'key',
    appId: 'app',
  }));
  assert.ok(signature.length > 20);
});

async function waitForServer() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child process is still opening its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Test server did not become ready in time.');
}

async function waitForReadyJob(id) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/jobs/${id}`);
    const job = await response.json();
    if (job.status === 'ready' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Job did not finish in time.');
}

async function waitForReadyTranscription(id) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/transcriptions/${id}`);
    const job = await response.json();
    if (job.status === 'ready' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Transcription job did not finish in time.');
}

before(async () => {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'download-everything-test-'));
  xhsProvider = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', xhsProviderUrl || 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/openapi.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"openapi":"3.1.0"}');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/xhs/detail') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const requiresCookie = body.includes('xhs-cookie-required');
      if (requiresCookie && !body.includes('"cookie":"web_session=ok"')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: '获取小红书作品数据失败', data: {} }));
        return;
      }
      const isImagePost = body.includes('xhs-fixture-images');
      const data = isImagePost
        ? {
            作品类型: '图文',
            作品标题: '自测图文',
            下载地址: [`${xhsProviderUrl}/image-one.jpg`, `${xhsProviderUrl}/image-two.jpg`],
          }
        : {
            作品类型: '视频',
            作品标题: '自测视频',
            下载地址: [`${xhsProviderUrl}/video.mp4`],
          };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'ok', data }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/video.mp4') {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '17' });
      res.end('xhs video fixture');
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/image-')) {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': '17' });
      res.end('xhs image fixture');
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => xhsProvider.listen(0, '127.0.0.1', resolve));
  const providerAddress = xhsProvider.address();
  xhsProviderUrl = `http://127.0.0.1:${providerAddress.port}`;

  const fakeEngine = path.join(fixtureDir, 'yt-dlp');
  await writeFile(fakeEngine, `#!/bin/sh
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    output="$2"
    shift 2
    continue
  fi
  shift
done
file=$(printf '%s' "$output" | sed 's/%(title)s/sample/g; s/%(ext)s/mp4/g')
mkdir -p "$(dirname "$file")"
printf 'download fixture' > "$file"
printf '[download] 100.0%% of 1.00MiB at 1.00MiB/s ETA 00:00\\n'
`);
  await chmod(fakeEngine, 0o755);
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      YTDLP_PATH: fakeEngine,
      XHS_API_URL: xhsProviderUrl,
      XHS_TEST_MEDIA_ORIGIN: xhsProviderUrl,
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(async () => {
  server?.kill('SIGTERM');
  await new Promise((resolve) => xhsProvider?.close(resolve));
  await rm(fixtureDir, { recursive: true, force: true });
});

test('rejects a non-supported URL before creating a job', async () => {
  const response = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/clip' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /仅支持/);
});

test('creates a job and delivers its completed file to the browser', async () => {
  const createResponse = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.bilibili.com/video/BV1xx411c7mD', preset: 'standard' }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  const completed = await waitForReadyJob(created.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.progress, 100);
  assert.equal(completed.filename, 'sample.mp4');

  const fileResponse = await fetch(`${baseUrl}/api/jobs/${created.id}/download`);
  assert.equal(fileResponse.status, 200);
  assert.match(fileResponse.headers.get('content-disposition') || '', /attachment/);
  assert.equal(await fileResponse.text(), 'download fixture');

  const deleteResponse = await fetch(`${baseUrl}/api/jobs/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);
});

test('uses the local XHS provider and returns its video through this app', async () => {
  const createResponse = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.xiaohongshu.com/explore/xhs-fixture-video' }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  const completed = await waitForReadyJob(created.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.filename, '自测视频.mp4');

  const fileResponse = await fetch(`${baseUrl}/api/jobs/${created.id}/download`);
  assert.equal(fileResponse.status, 200);
  assert.equal(await fileResponse.text(), 'xhs video fixture');
});

test('passes a request-scoped XHS cookie to the local provider', async () => {
  const createResponse = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.xiaohongshu.com/explore/xhs-cookie-required',
      xhsCookie: 'web_session=ok',
    }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  const completed = await waitForReadyJob(created.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.filename, '自测视频.mp4');
});

test('downloads a direct XHS media URL without asking the parser first', async () => {
  const createResponse = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: `${xhsProviderUrl}/video.mp4` }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  assert.equal(created.platform, '小红书媒体');
  const completed = await waitForReadyJob(created.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.filename, 'xiaohongshu-media.mp4');

  const fileResponse = await fetch(`${baseUrl}/api/jobs/${created.id}/download`);
  assert.equal(fileResponse.status, 200);
  assert.equal(await fileResponse.text(), 'xhs video fixture');
});

test('packages a multi-image XHS post before delivering it', async () => {
  const createResponse = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.xiaohongshu.com/explore/xhs-fixture-images' }),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  const completed = await waitForReadyJob(created.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.filename, '自测图文.zip');

  const fileResponse = await fetch(`${baseUrl}/api/jobs/${created.id}/download`);
  assert.equal(fileResponse.status, 200);
  assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()).subarray(0, 2), Buffer.from('PK'));
});

test('uploads local media and returns fake transcript exports', async () => {
  const form = new FormData();
  form.append('file', new Blob(['fake mp4 bytes'], { type: 'video/mp4' }), 'interview.mp4');
  form.append('provider', 'fake');
  form.append('language', 'zh-CN');

  const createResponse = await fetch(`${baseUrl}/api/transcriptions/upload`, {
    method: 'POST',
    body: form,
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  assert.equal(created.provider, 'fake');

  const completed = await waitForReadyTranscription(created.id);
  assert.equal(completed.status, 'ready');
  assert.equal(completed.progress, 100);
  assert.ok(completed.exports.txt);
  assert.ok(completed.exports.srt);
  assert.ok(completed.exports.vtt);
  assert.ok(completed.exports.json);

  const resultResponse = await fetch(`${baseUrl}/api/transcriptions/${created.id}/result`);
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.equal(result.transcription.provider, 'fake');
  assert.match(result.transcription.text, /演示转录/);

  const txtResponse = await fetch(`${baseUrl}${completed.exports.txt}`);
  assert.equal(txtResponse.status, 200);
  assert.match(await txtResponse.text(), /Fake ASR/);

  const srtResponse = await fetch(`${baseUrl}${completed.exports.srt}`);
  assert.equal(srtResponse.status, 200);
  assert.match(await srtResponse.text(), /00:00:00,000 --> 00:00:04,200/);

  const vttResponse = await fetch(`${baseUrl}${completed.exports.vtt}`);
  assert.equal(vttResponse.status, 200);
  assert.match(await vttResponse.text(), /^WEBVTT/);

  const deleteResponse = await fetch(`${baseUrl}/api/transcriptions/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);
});
