#!/usr/bin/env node
// Mechanical pre-commit gate for this repo: syntax check, typecheck, backend
// tests, and a live app boot (via project-doctor), plus a secret-pattern
// scan over what's about to be committed. Judgment calls (drafting the
// commit message, deciding what to stage) stay with the agent — this script
// only runs the deterministic checks that would otherwise get silently
// skipped under time pressure. See ../SKILL.md for the full workflow this
// is one step of.
//
// Exit code 0 = all checks passed. Non-zero = something failed; the caller
// should NOT commit and should show the user what broke.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let failures = 0;

function run(label, command, args, options = {}) {
  console.log(`${DIM}→ ${label}${RESET}`);
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8', ...options });
  const combined = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) {
    console.log(`${RED}✗ ${label}${RESET}`);
    console.log(combined.split('\n').slice(-25).join('\n'));
    failures += 1;
    return false;
  }
  console.log(`${GREEN}✓ ${label}${RESET}`);
  return true;
}

// Patterns that suggest a secret is about to be committed. Deliberately
// broad and prone to false positives (e.g. matches the word "secret" in a
// comment) — this is a tripwire to make a human look, not a definitive
// verdict, since this project stores real credentials in runtime/secrets.env
// and API keys in gitignored .env-style files that should never be staged.
const SECRET_FILE_PATTERNS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.[^.]+$/,
  /secrets\.env$/,
  /\.pem$/,
  /xhs-cookie\.txt$/,
];
const SECRET_CONTENT_PATTERNS = [
  /sk-[a-zA-Z0-9]{16,}/, // OpenAI/DeepSeek/Anthropic-shaped API keys
  /XUNFEI_[A-Z_]*(KEY|SECRET)\s*=\s*\S+/,
  /api[_-]?key["']?\s*[:=]\s*["'][^"']{8,}["']/i,
];

function scanForSecrets() {
  console.log(`${DIM}→ 扫描待提交内容里的密钥迹象${RESET}`);
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: rootDir, encoding: 'utf8' });
  const files = staged.stdout.split('\n').filter(Boolean);
  const suspiciousFiles = files.filter((f) => SECRET_FILE_PATTERNS.some((p) => p.test(f)));
  if (suspiciousFiles.length) {
    console.log(`${RED}✗ 这些文件名看起来像密钥文件，不应该被提交：${RESET}`);
    suspiciousFiles.forEach((f) => console.log(`    ${f}`));
    failures += 1;
  }

  const diff = spawnSync('git', ['diff', '--cached'], { cwd: rootDir, encoding: 'utf8' });
  const hits = [];
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    const match = diff.stdout.match(pattern);
    if (match) hits.push(match[0].slice(0, 40));
  }
  if (hits.length) {
    console.log(`${RED}✗ 待提交的 diff 里有像密钥的字符串：${RESET}`);
    hits.forEach((h) => console.log(`    ${h}…`));
    failures += 1;
  }
  if (!suspiciousFiles.length && !hits.length) {
    console.log(`${GREEN}✓ 没有发现明显的密钥${RESET}`);
  }
}

console.log(`\n${DIM}=== ship-feature preflight ===${RESET}\n`);

run('node --check (server + scripts + lib)', 'npm', ['run', 'check']);
run('backend tests', 'npm', ['test']);
if (existsSync(path.join(rootDir, 'web', 'tsconfig.json'))) {
  run('frontend typecheck', 'npx', ['tsc', '--noEmit'], { cwd: path.join(rootDir, 'web') });
}
run('app boots (project-doctor)', 'npm', ['run', 'doctor']);
scanForSecrets();

console.log(`\n${DIM}=== Summary ===${RESET}`);
if (failures === 0) {
  console.log(`${GREEN}全部通过。可以提交。${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}${failures} 项检查没通过 — 不要提交，先修好上面这些。${RESET}`);
  process.exit(1);
}
