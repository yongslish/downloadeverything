import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binaryDir = path.join(rootDir, 'bin');
const targetName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const target = path.join(binaryDir, targetName);
const venvDir = path.join(rootDir, 'runtime', 'python');
const pythonInVenv = process.platform === 'win32'
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');

// macOS default python3 (Xcode Command Line Tools) frequently breaks after
// system upgrades — `python3 -m venv` half-creates the target dir but never
// writes bin/python3, so every subsequent step fails. Prefer a Homebrew build
// (or whatever the user pins with $PYTHON) and fall back to the system one
// only as a last resort.
function findPython() {
  const preferred = [
    process.env.PYTHON,
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11',
    '/usr/local/bin/python3',
    'python3.12',
    'python3.11',
    'python3',
  ].filter(Boolean);
  for (const candidate of preferred) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
    if (probe.status === 0) {
      return { command: candidate, path: probe.stdout.trim() };
    }
  }
  throw new Error('找不到可用的 Python 3。请先安装:brew install python@3.12,然后重试。');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.error) throw new Error(`无法运行 ${command}:${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败(退出码 ${result.status ?? 'unknown'})。`);
}

function hasUv() {
  return spawnSync('uv', ['--version'], { encoding: 'utf8' }).status === 0;
}

await mkdir(binaryDir, { recursive: true });
console.log('正在项目内安装 yt-dlp 下载引擎…');

// Prefer uv when available. `uv venv` skips the ensurepip step that stock
// python3 -m venv fails on across a lot of macOS installs, and `uv pip
// install` is dramatically faster. --seed drops pip + setuptools into the
// venv so downstream scripts (setup:xhs) that call `python -m pip install`
// keep working without change.
if (hasUv()) {
  console.log('使用 uv (绕过 ensurepip 的 macOS 坑)。');
  run('uv', ['venv', venvDir, '--seed', '--python', '3.12'].concat(process.env.PYTHON ? ['--python', process.env.PYTHON] : []));
  run('uv', ['pip', 'install', '--python', pythonInVenv, '--upgrade', 'yt-dlp']);
} else {
  const python = findPython();
  console.log(`使用 Python:${python.command} (${python.path})`);
  try {
    run(python.command, ['-m', 'venv', venvDir]);
  } catch (error) {
    const hint = '\n提示:macOS 的系统 Python (/usr/bin/python3) 和某些 Homebrew Python 组合下 `python3 -m venv` 会因为 ensurepip 挂掉。最省事的办法是装一次 uv:\n  brew install uv\n  npm run setup:engine\n再不行就用 pipx 或 conda 来管理 yt-dlp。';
    throw new Error(`${error.message}${hint}`);
  }
  run(pythonInVenv, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(pythonInVenv, ['-m', 'pip', 'install', '--upgrade', 'yt-dlp']);
}

if (process.platform === 'win32') {
  await writeFile(target, `@echo off\r\n"%~dp0..\\runtime\\python\\Scripts\\python.exe" -m yt_dlp %*\r\n`);
} else {
  await writeFile(target, `#!/bin/sh\nexec "$(dirname "$0")/../runtime/python/bin/python" -m yt_dlp "$@"\n`);
  await chmod(target, 0o755);
}

console.log(`已安装下载引擎:${target}`);
console.log('提示:需要"仅音频"或合并分离音视频时,请确保系统已安装 FFmpeg。');
