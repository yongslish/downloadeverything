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

function run(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) throw new Error(`无法运行 ${command}：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败（退出码 ${result.status ?? 'unknown'}）。`);
}

await mkdir(binaryDir, { recursive: true });
console.log('正在项目内安装 yt-dlp 下载引擎…');
run(process.env.PYTHON || 'python3', ['-m', 'venv', venvDir]);
run(pythonInVenv, ['-m', 'pip', 'install', '--upgrade', 'yt-dlp']);

if (process.platform === 'win32') {
  await writeFile(target, `@echo off\r\n"%~dp0..\\runtime\\python\\Scripts\\python.exe" -m yt_dlp %*\r\n`);
} else {
  await writeFile(target, `#!/bin/sh\nexec "$(dirname "$0")/../runtime/python/bin/python" -m yt_dlp "$@"\n`);
  await chmod(target, 0o755);
}

console.log(`已安装下载引擎：${target}`);
console.log('提示：需要“仅音频”或合并分离音视频时，请确保系统已安装 FFmpeg。');
