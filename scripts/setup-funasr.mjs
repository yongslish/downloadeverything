import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environmentDir = path.join(rootDir, 'runtime', 'funasr');
const modelCache = process.env.FUNASR_MODEL_CACHE || path.join(rootDir, 'runtime', 'funasr-models');
const bootstrapPython = process.env.FUNASR_BOOTSTRAP_PYTHON || 'python3';
const environmentPython = path.join(
  environmentDir,
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

function hasUv() {
  return spawnSync('uv', ['--version'], { encoding: 'utf8' }).status === 0;
}
const requirementsPath = path.join(rootDir, 'scripts', 'requirements-funasr.txt');
const runnerPath = path.join(rootDir, 'scripts', 'run-funasr.py');
const model = process.env.FUNASR_MODEL || 'iic/SenseVoiceSmall';
const vadModel = process.env.FUNASR_VAD_MODEL || 'fsmn-vad';
const device = process.env.FUNASR_DEVICE || 'cpu';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        MODELSCOPE_CACHE: modelCache,
        FUNASR_MODEL_CACHE: modelCache,
        PYTHONIOENCODING: 'utf-8',
        ...options.env,
      },
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 执行失败（退出码 ${code ?? 'unknown'}）。`));
    });
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(path.dirname(environmentDir), { recursive: true });
  await mkdir(modelCache, { recursive: true });

  if (!(await exists(environmentPython))) {
    console.log('正在创建本地 FunASR Python 环境…');
    // uv sidesteps the ensurepip step that stock python3 -m venv fails on
    // across a lot of macOS installs; prefer it if present.
    if (hasUv()) {
      console.log('使用 uv (绕过 ensurepip 的 macOS 坑)。');
      await run('uv', ['venv', environmentDir, '--python', '3.12']);
    } else {
      await run(bootstrapPython, ['-m', 'venv', environmentDir]);
    }
  }

  console.log('正在安装经过验证的 FunASR 依赖…');
  if (hasUv()) {
    await run('uv', ['pip', 'install', '--python', environmentPython, '-r', requirementsPath]);
  } else {
    await run(environmentPython, ['-m', 'pip', 'install', '-r', requirementsPath]);
  }

  if (process.env.FUNASR_SKIP_MODEL_DOWNLOAD === '1') {
    console.log('依赖安装完成；已按 FUNASR_SKIP_MODEL_DOWNLOAD 跳过模型预下载。');
    return;
  }

  console.log('正在下载并预加载 SenseVoiceSmall；首次执行约需 1 GB 模型空间…');
  await run(environmentPython, [
    runnerPath,
    '--preload',
    '--model', model,
    '--vad-model', vadModel,
    '--device', device,
  ]);
  console.log('本地 FunASR 已准备好。启动应用后选择“本地 FunASR（免费）”即可。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
