#!/usr/bin/env node
// One command to get this app running and ready to test: rebuild the
// frontend if web/src/ has changed since the last build, then hand off to
// project-doctor for everything else (dependency checks, starting +
// health-checking the Express server). Exists because the actual dev loop
// this project needs — "did I forget to rebuild", "is the server even
// running", "which port" — was three separate manual steps every time a
// change needed testing.
//
// Deliberately thin and linked to project-doctor rather than a copy of it:
// this script owns exactly one thing (the frontend staleness check + the
// `npm run web:build` call, since that's fast/safe enough to just fix
// automatically, unlike the heavy Python installs project-doctor
// intentionally only *reports* on). Everything after that is delegated to
// `node .claude/skills/project-doctor/scripts/doctor.mjs` as a child
// process, so the two skills can never disagree about what "healthy" means
// — there is only one place that logic lives.

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function rel(...segments) {
  return path.join(rootDir, ...segments);
}

// Same walk project-doctor's checkFrontendBuild() does — duplicated rather
// than imported because doctor.mjs isn't structured as an importable module
// (it's a run-to-completion script), and this one check is small enough
// that copying it is cheaper than refactoring doctor.mjs just to share it.
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

function isFrontendStale() {
  const indexHtml = rel('public', 'index.html');
  const assetsDir = rel('public', 'assets');
  if (!existsSync(indexHtml) || !existsSync(assetsDir) || readdirSync(assetsDir).length === 0) {
    return true; // never built at all
  }
  const builtAt = statSync(indexHtml).mtimeMs;
  const sourceNewest = Math.max(
    newestMtime(rel('web', 'src')),
    existsSync(rel('web', 'index.html')) ? statSync(rel('web', 'index.html')).mtimeMs : 0,
  );
  return sourceNewest > builtAt;
}

console.log(`\n${DIM}=== Downspace start-app ===${RESET}\n`);

if (isFrontendStale()) {
  console.log(`${DIM}前端构建产物缺失，或 web/src/ 有比上次构建更新的改动 — 正在重新构建…${RESET}`);
  const build = spawnSync('npm', ['run', 'web:build'], { cwd: rootDir, stdio: 'inherit' });
  if (build.status !== 0) {
    console.log(`${RED}✗ npm run web:build 失败，看上面的报错先修好再试。${RESET}`);
    process.exitCode = 1;
    process.exit();
  }
  console.log(`${GREEN}✓ 前端已重新构建${RESET}\n`);
} else {
  console.log(`${GREEN}✓ 前端构建已是最新，跳过重建${RESET}\n`);
}

const doctor = spawnSync(
  'node',
  [rel('.claude', 'skills', 'project-doctor', 'scripts', 'doctor.mjs')],
  { cwd: rootDir, stdio: 'inherit' },
);
process.exitCode = doctor.status ?? 0;
