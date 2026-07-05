#!/usr/bin/env node
// Health-checks every runtime dependency this project's note pipeline needs
// (yt-dlp, XHS-Downloader, local FunASR), reports the frontend build state,
// and makes sure the Express server is actually running and answering — so
// an agent (or a human) can verify "does this still work" in one command
// instead of re-deriving `npm run setup:*` / `npm start` / curl checks from
// scratch every time. See ../SKILL.md for when to use this.
//
// Never installs anything itself — the installs this project needs are slow
// and heavy (FunASR alone downloads ~1GB of model weights), so silently
// triggering them from a "just check things" command would surprise
// whoever's running it. It only reports what's missing and the exact
// `npm run setup:*` command to fix it.

import { existsSync, openSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const port = Number(process.env.PORT || 3030);
const baseUrl = `http://127.0.0.1:${port}`;
const serverLogPath = path.join(rootDir, '.claude', 'skills', 'project-doctor', 'last-server.log');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function rel(...segments) {
  return path.join(rootDir, ...segments);
}

function ok(label, detail) {
  return { status: 'ok', label, detail };
}
function missing(label, detail, fix) {
  return { status: 'missing', label, detail, fix };
}
function warn(label, detail, fix) {
  return { status: 'warn', label, detail, fix };
}

function printResult(r) {
  const icon = r.status === 'ok' ? `${GREEN}✅${RESET}` : r.status === 'warn' ? `${YELLOW}⚠${RESET}` : `${RED}❌${RESET}`;
  console.log(`${icon} ${r.label}`);
  if (r.detail) console.log(`   ${DIM}${r.detail}${RESET}`);
  if (r.fix) console.log(`   ${YELLOW}→ ${r.fix}${RESET}`);
}

// Newest mtime across every file under `dir` (recursive). Used to detect
// "you edited web/src but forgot to rebuild" — the exact mistake that made
// several rounds of manual browser testing in this project show stale
// bundles without any error.
function newestMtime(dir) {
  let newest = 0;
  if (!existsSync(dir)) return newest;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      newest = Math.max(newest, newestMtime(full));
    } else {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

function checkYtDlp() {
  const wrapper = rel('bin', 'yt-dlp');
  const venvDir = rel('runtime', 'python');
  const venvPython = rel('runtime', 'python', 'bin', 'python');
  if (!existsSync(wrapper)) {
    return missing('yt-dlp (Bilibili 下载引擎)', 'bin/yt-dlp 不存在', 'npm run setup:engine');
  }
  if (!existsSync(venvDir)) {
    return missing('yt-dlp (Bilibili 下载引擎)', 'runtime/python/ 不存在', 'npm run setup:engine');
  }
  if (!existsSync(venvPython)) {
    // runtime/python/bin/python is a symlink chain (uv-managed pythons work
    // this way); existsSync() follows it, so this means the directory is
    // there but the interpreter it points at is gone. This is the exact bug
    // that blocked every Bilibili submission at the start of this project:
    // bin/yt-dlp execed a python path that no longer resolved to anything.
    return missing(
      'yt-dlp (Bilibili 下载引擎)',
      'runtime/python/ 存在，但 Python 解释器链接已经失效',
      'npm run setup:engine (会重新创建 venv)',
    );
  }
  return ok('yt-dlp (Bilibili 下载引擎)', 'bin/yt-dlp + runtime/python/ 都在');
}

function checkXhsDownloader() {
  // Shares runtime/python/ with yt-dlp (see checkYtDlp) — if that venv is
  // missing or its interpreter symlink is broken, XHS-Downloader can't run
  // either, so surface the same distinction here rather than a vaguer one.
  const venvDir = rel('runtime', 'python');
  const venvPython = rel('runtime', 'python', 'bin', 'python');
  const mainPy = rel('runtime', 'xhs-downloader', 'main.py');
  const appPy = rel('runtime', 'xhs-downloader', 'source', 'application', 'app.py');
  if (!existsSync(venvDir)) {
    return missing('XHS-Downloader (小红书解析)', '共享的 runtime/python/ 还没建立', 'npm run setup:engine 然后 npm run setup:xhs');
  }
  if (!existsSync(venvPython)) {
    return missing('XHS-Downloader (小红书解析)', '共享的 runtime/python/ 解释器链接已经失效', 'npm run setup:engine 然后 npm run setup:xhs');
  }
  if (!existsSync(mainPy) || !existsSync(appPy)) {
    return missing('XHS-Downloader (小红书解析)', 'runtime/xhs-downloader/ 源码不完整或缺失', 'npm run setup:xhs');
  }
  return ok('XHS-Downloader (小红书解析)', 'runtime/xhs-downloader/ 源码 + 依赖都在');
}

function checkFunAsr() {
  const venvDir = rel('runtime', 'funasr');
  const venvPython = rel('runtime', 'funasr', 'bin', 'python');
  const runner = rel('scripts', 'run-funasr.py');
  const modelCache = rel('runtime', 'funasr-models');
  if (!existsSync(runner)) {
    return missing('本地 FunASR (免费 ASR 兜底)', 'scripts/run-funasr.py 不存在', 'npm run setup:funasr');
  }
  if (!existsSync(venvDir)) {
    return missing('本地 FunASR (免费 ASR 兜底)', 'runtime/funasr/ 还没建立', 'npm run setup:funasr');
  }
  if (!existsSync(venvPython)) {
    // venvPython is usually a symlink chain down to a Homebrew python
    // binary (runtime/funasr/bin/python -> python3.13 -> /opt/homebrew/...).
    // existsSync() follows symlinks, so this branch means the venv directory
    // is there but the interpreter it points at is gone — almost always
    // because the Homebrew Python formula it was built against got upgraded
    // or removed since. Same failure shape as the yt-dlp bug earlier in this
    // project's history: a wrapper/symlink survives, but what it points to
    // doesn't, and every ASR call would fail with a confusing subprocess
    // ENOENT instead of this clear message.
    return missing(
      '本地 FunASR (免费 ASR 兜底)',
      'runtime/funasr/ 存在，但 Python 解释器链接已经失效（很可能是 Homebrew 的 Python 版本被卸载或升级了）',
      'npm run setup:funasr (会重新创建 venv)',
    );
  }
  // The model cache directory can exist-but-be-empty if setup was run with
  // FUNASR_SKIP_MODEL_DOWNLOAD=1, or if a previous download died partway —
  // either way, ASR calls will fail at runtime with a much more confusing
  // error than "model not downloaded", so catch it here instead.
  const hasModelContent = existsSync(modelCache)
    && readdirSync(modelCache).some((entry) => entry !== '.lock');
  if (!hasModelContent) {
    return warn(
      '本地 FunASR (免费 ASR 兜底)',
      'Python 环境已装好，但 runtime/funasr-models/ 里没有模型文件',
      'npm run setup:funasr (重新跑一次，确保模型下载完整)',
    );
  }
  return ok('本地 FunASR (免费 ASR 兜底)', 'Python 环境 + 模型缓存都在');
}

function checkFrontendBuild() {
  const indexHtml = rel('public', 'index.html');
  const assetsDir = rel('public', 'assets');
  if (!existsSync(indexHtml) || !existsSync(assetsDir) || readdirSync(assetsDir).length === 0) {
    return missing('前端构建产物 (public/)', 'public/index.html 或 public/assets/ 缺失', 'npm run web:build');
  }
  const builtAt = statSync(indexHtml).mtimeMs;
  const sourceNewest = Math.max(
    newestMtime(rel('web', 'src')),
    existsSync(rel('web', 'index.html')) ? statSync(rel('web', 'index.html')).mtimeMs : 0,
  );
  if (sourceNewest > builtAt) {
    return warn(
      '前端构建产物 (public/)',
      'web/src/ 里有比上次构建更新的改动 — 浏览器里看到的可能是旧版本',
      'npm run web:build',
    );
  }
  return ok('前端构建产物 (public/)', '已是最新构建');
}

async function fetchJson(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, body: await res.json() };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function isServerUp() {
  const result = await fetchJson(`${baseUrl}/api/health`, 1500);
  return result.ok ? result.body : null;
}

async function startServer() {
  const fd = openSync(serverLogPath, 'a');
  const child = spawn('node', ['server.mjs'], {
    cwd: rootDir,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, PORT: String(port) },
  });
  child.unref();
  return child.pid;
}

async function waitForHealth(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const health = await isServerUp();
    if (health) return { health, elapsedMs: Date.now() - start };
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function tailLog(lines = 20) {
  if (!existsSync(serverLogPath)) return '(no log file yet)';
  const content = readFileSync(serverLogPath, 'utf8');
  return content.split('\n').slice(-lines).join('\n');
}

async function main() {
  console.log(`\n${DIM}=== Downspace project-doctor ===${RESET}\n`);

  console.log(`${DIM}[Runtime dependencies]${RESET}`);
  const depResults = [checkYtDlp(), checkXhsDownloader(), checkFunAsr()];
  depResults.forEach(printResult);

  console.log(`\n${DIM}[Frontend build]${RESET}`);
  const buildResult = checkFrontendBuild();
  printResult(buildResult);

  console.log(`\n${DIM}[Backend server]${RESET}`);
  let health = await isServerUp();
  if (health) {
    console.log(`${GREEN}✅${RESET} 服务器已经在跑 (${baseUrl})`);
  } else {
    console.log(`${DIM}没检测到服务器，正在启动 node server.mjs …${RESET}`);
    const pid = await startServer();
    const result = await waitForHealth();
    if (!result) {
      console.log(`${RED}❌ 服务器 15 秒内没起来 (pid ${pid})。最近日志：${RESET}`);
      console.log(tailLog());
      process.exitCode = 1;
      return;
    }
    health = result.health;
    console.log(`${GREEN}✅${RESET} 服务器已启动 (pid ${pid})，${(result.elapsedMs / 1000).toFixed(1)}s 后健康 (${baseUrl})`);
  }

  // Cross-check the server's own live view (source of truth once it's up)
  // against our filesystem-based checks above — if they disagree, the
  // server process might be stale (started before a setup script finished).
  const engineLive = health.engineReady;
  const funasrLive = health.transcription?.providers?.find((p) => p.id === 'funasr-local')?.configured;
  if (engineLive === false && depResults[0].status === 'ok') {
    printResult(warn('yt-dlp 存活状态不一致', '文件都在，但服务器自己报告 engineReady=false — 可能需要重启服务器', null));
  }
  if (funasrLive === false && depResults[2].status === 'ok') {
    printResult(warn('FunASR 存活状态不一致', '文件都在，但服务器自己报告 configured=false — 可能需要重启服务器', null));
  }

  const notesCheck = await fetchJson(`${baseUrl}/api/notes`);
  if (notesCheck.ok) {
    console.log(`${GREEN}✅${RESET} GET /api/notes → 200 (${notesCheck.body.length} 条笔记)`);
  } else {
    printResult(warn('GET /api/notes', `没有返回 200 (${notesCheck.status ?? notesCheck.error})`, null));
  }

  const allResults = [...depResults, buildResult];
  const brokenOrMissing = allResults.filter((r) => r.status !== 'ok');
  console.log(`\n${DIM}=== Summary ===${RESET}`);
  if (brokenOrMissing.length === 0) {
    console.log(`${GREEN}全部就绪。${RESET} ${baseUrl} 可以直接测试。`);
  } else {
    console.log(`${YELLOW}${brokenOrMissing.length} 项需要处理：${RESET}`);
    for (const r of brokenOrMissing) {
      if (r.fix) console.log(`  ${r.fix}`);
    }
    console.log(`${DIM}其余功能仍可测试 — 例如没装 FunASR 不影响有原生字幕的 B 站视频。${RESET}`);
  }
}

main();
