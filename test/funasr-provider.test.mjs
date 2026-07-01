import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FakeTranscriptionProvider } from '../lib/transcription/providers/fake-provider.mjs';
import {
  LocalFunAsrProvider,
  normaliseFunAsrLanguage,
  normaliseFunAsrPayload,
} from '../lib/transcription/providers/local-funasr-provider.mjs';

const temporaryDirectories = [];
const currentTestPath = fileURLToPath(import.meta.url);

async function createAudioFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'funasr-provider-test-'));
  temporaryDirectories.push(directory);
  const audioPath = path.join(directory, 'audio.wav');
  await writeFile(audioPath, 'controlled audio fixture');
  return audioPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('normalises supported FunASR language values', () => {
  assert.deepEqual(normaliseFunAsrLanguage('zh-CN'), { runner: 'zh', result: 'zh-CN' });
  assert.deepEqual(normaliseFunAsrLanguage('en'), { runner: 'en', result: 'en' });
  assert.deepEqual(normaliseFunAsrLanguage('unknown'), { runner: 'auto', result: 'auto' });
});

test('normalises FunASR output and supplies a full-duration segment', () => {
  const result = normaliseFunAsrPayload({
    text: '  这是一段本地转写。 ',
    language: 'zh-CN',
    duration: 8.4,
    segments: [],
    raw: { model: 'fixture-model' },
  }, {
    fallbackDuration: 7,
    model: 'iic/SenseVoiceSmall',
    vadModel: 'fsmn-vad',
    device: 'cpu',
  });

  assert.equal(result.provider, 'funasr-local');
  assert.equal(result.text, '这是一段本地转写。');
  assert.equal(result.duration, 8.4);
  assert.deepEqual(result.segments, [{
    index: 0,
    start: 0,
    end: 8.4,
    speaker: null,
    text: '这是一段本地转写。',
    words: [],
  }]);
  assert.equal(result.raw.model, 'fixture-model');
});

test('rejects malformed or empty FunASR output', () => {
  assert.throws(
    () => normaliseFunAsrPayload({ text: '   ' }, {}),
    /没有返回可用文本/,
  );
  assert.throws(
    () => normaliseFunAsrPayload(null, {}),
    /无效结果/,
  );
});

test('runs the local provider behind the canonical transcription contract', async () => {
  const audioPath = await createAudioFixture();
  let invocation;
  const provider = new LocalFunAsrProvider({
    pythonPath: process.execPath,
    runnerPath: currentTestPath,
    validateDependencies: true,
    runProcess: async (command, args, options) => {
      invocation = { command, args, options };
      return {
        stdout: JSON.stringify({
          text: '模块契约测试通过。',
          language: 'zh-CN',
          duration: 3.2,
          segments: [{ start: 0, end: 3.2, text: '模块契约测试通过。' }],
          raw: { model: 'fixture-model' },
        }),
        stderr: '',
      };
    },
  });

  const result = await provider.transcribe({
    audioPath,
    language: 'zh-CN',
    audio: { duration: 3.2 },
  });

  assert.equal(invocation.command, process.execPath);
  assert.ok(invocation.args.includes('--audio'));
  assert.ok(invocation.args.includes(audioPath));
  assert.ok(invocation.args.includes('zh'));
  assert.equal(result.provider, 'funasr-local');
  assert.equal(result.text, '模块契约测试通过。');
  assert.equal(result.segments[0].end, 3.2);
});

test('rejects output that is not the JSON process contract', async () => {
  const audioPath = await createAudioFixture();
  const provider = new LocalFunAsrProvider({
    pythonPath: process.execPath,
    runnerPath: currentTestPath,
    runProcess: async () => ({ stdout: 'model log without json', stderr: '' }),
  });

  await assert.rejects(
    provider.transcribe({ audioPath, language: 'zh-CN' }),
    /无法解析/,
  );
});

test('terminates a local FunASR process when it times out', async () => {
  const audioPath = await createAudioFixture();
  const runnerPath = path.join(path.dirname(audioPath), 'slow-runner.mjs');
  await writeFile(runnerPath, 'setTimeout(() => {}, 10_000);');
  const provider = new LocalFunAsrProvider({
    pythonPath: process.execPath,
    runnerPath,
    timeoutMs: 50,
  });

  await assert.rejects(
    provider.transcribe({ audioPath, language: 'zh-CN' }),
    /超时/,
  );
});

test('terminates a local FunASR process when the user cancels', async () => {
  const audioPath = await createAudioFixture();
  const runnerPath = path.join(path.dirname(audioPath), 'cancel-runner.mjs');
  await writeFile(runnerPath, 'setTimeout(() => {}, 10_000);');
  const provider = new LocalFunAsrProvider({
    pythonPath: process.execPath,
    runnerPath,
    timeoutMs: 5_000,
  });
  const controller = new AbortController();
  const transcription = provider.transcribe({
    audioPath,
    language: 'zh-CN',
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 50);

  await assert.rejects(transcription, /取消/);
});

test('fake and local providers expose the shared minimum contract', async () => {
  const audioPath = await createAudioFixture();
  const providers = [
    new FakeTranscriptionProvider(),
    new LocalFunAsrProvider({
      pythonPath: process.execPath,
      runnerPath: currentTestPath,
      runProcess: async () => ({
        stdout: JSON.stringify({
          text: '本地结果',
          language: 'zh-CN',
          duration: 1,
          segments: [{ start: 0, end: 1, text: '本地结果' }],
        }),
        stderr: '',
      }),
    }),
  ];

  for (const provider of providers) {
    const result = await provider.transcribe({
      audioPath,
      source: { filename: 'fixture.wav' },
      audio: { duration: 1 },
      language: 'zh-CN',
    });
    assert.equal(result.provider, provider.name);
    assert.equal(typeof result.text, 'string');
    assert.ok(result.text.length > 0);
    assert.ok(Array.isArray(result.segments));
    assert.ok(result.segments.length > 0);
    assert.equal(typeof result.segments[0].text, 'string');
  }
});

test('reports missing local dependencies before accepting a job', () => {
  assert.throws(
    () => new LocalFunAsrProvider({
      pythonPath: path.join(os.tmpdir(), 'missing-funasr-python'),
      runnerPath: currentTestPath,
    }),
    /setup:funasr/,
  );
});
