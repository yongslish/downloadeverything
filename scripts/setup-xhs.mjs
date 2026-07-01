import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(rootDir, 'runtime');
const sourceDir = path.join(runtimeDir, 'xhs-downloader');
const pythonInVenv = process.platform === 'win32'
  ? path.join(runtimeDir, 'python', 'Scripts', 'python.exe')
  : path.join(runtimeDir, 'python', 'bin', 'python');
const repository = 'https://github.com/JoeanAmier/XHS-Downloader.git';
const revision = 'eb5dabb5fc97b5ffd61fd94c4b4a64ea9e04ef8c';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) throw new Error(`无法运行 ${command}：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败（退出码 ${result.status ?? 'unknown'}）。`);
}

async function sourceIsReady() {
  try {
    await Promise.all([
      access(path.join(sourceDir, 'main.py')),
      access(path.join(sourceDir, 'source', 'application', 'app.py')),
    ]);
    return true;
  } catch {
    return false;
  }
}

try {
  await access(pythonInVenv);
} catch {
  throw new Error('请先运行 npm run setup:engine，创建项目自己的 Python 环境。');
}

if (!(await sourceIsReady())) {
  await rm(sourceDir, { recursive: true, force: true });
  await mkdir(runtimeDir, { recursive: true });
  console.log('正在下载固定版本的小红书解析组件…');
  run('git', ['clone', '--depth=1', '--filter=blob:none', '--sparse', repository, sourceDir]);
  run('git', ['-C', sourceDir, 'sparse-checkout', 'set', '--no-cone', '/main.py', '/pyproject.toml', '/requirements.txt', '/source/']);
  run('git', ['-C', sourceDir, 'fetch', '--depth=1', 'origin', revision]);
  run('git', ['-C', sourceDir, 'checkout', '--detach', 'FETCH_HEAD']);
}

console.log('正在安装小红书解析组件依赖…');
run(pythonInVenv, ['-m', 'pip', 'install', '--upgrade', sourceDir]);
console.log('小红书解析组件已准备好（仅绑定本机 127.0.0.1）。');
