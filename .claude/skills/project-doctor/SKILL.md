---
name: project-doctor
description: >
  Verifies every runtime dependency this project's note pipeline needs
  (yt-dlp for Bilibili, XHS-Downloader for 小红书, local FunASR for
  free ASR fallback), checks whether the Vite-built frontend in public/
  is stale relative to web/src/, and starts+health-checks the Express
  server on port 3030 if it isn't already running. Use this BEFORE
  manually testing any change in this repo, and any time a feature that
  "should work" doesn't — instead of re-deriving `npm run setup:*` /
  `npm start` / curl commands from scratch or asking the user to start
  things by hand. Also use it any time a processing job fails with a
  vague or unexpected error, since most real failures in this project
  trace back to one of these dependencies being missing or having a
  broken Python interpreter symlink (e.g. after a `brew upgrade`).
---

# Project Doctor (download-everything / Downspace)

This project's "paste a link, get a note" pipeline depends on three
independent Python environments that live under `runtime/` and are never
installed by plain `npm install` (they're slow/heavy — FunASR alone
downloads ~1GB of model weights, so nothing should trigger that silently).
When one of them is missing or broken, jobs fail in the processing-page UI
with messages that are decent but still require reading a stack trace to
diagnose. This skill exists so that diagnosis is one command instead of
manually re-checking each `runtime/*` directory and re-deriving fixes.

## When to run this

- Right after pulling changes or starting a fresh session in this repo, before testing anything in the browser.
- Whenever you're about to say "let's test this in the browser" — run it first instead of assuming the server is up.
- Whenever a note-generation job fails with an error you haven't already diagnosed, since a broken/missing runtime dependency is the most common cause.
- After editing anything under `web/src/` — the check flags a stale build so you don't debug against an old bundle.

## How to run it

```bash
node .claude/skills/project-doctor/scripts/doctor.mjs
```

(Also available as `npm run doctor` from the repo root — same script.)

This is idempotent and safe to run repeatedly: it never re-installs
anything, and if the server is already up on port 3030 it detects that
and reuses it instead of spawning a second instance.

## What it checks, and what to do with the result

1. **yt-dlp** (`runtime/python/` + `bin/yt-dlp`) — needed for any Bilibili link.
2. **XHS-Downloader** (`runtime/xhs-downloader/`, shares the venv from #1) — needed for any 小红书 link. Beyond checking the files exist, this one also spawns
   `python -c "from source import Settings, XHS"` with the same `PYTHONPATH` the real provider
   uses, because file-existence checks already missed a real bug once: every file was present
   but the import itself failed (`ModuleNotFoundError: No module named 'source'` — Python's
   `sys.path[0]` is always the *script's own* directory, never a spawned process's `cwd`), and
   every 小红书 submission failed despite this check reporting ✅.
3. **Local FunASR** (`runtime/funasr/` + `runtime/funasr-models/`) — needed whenever a video has no native captions/subtitles.
4. **Frontend build freshness** (`public/index.html` / `public/assets/` vs. `web/src/` mtimes) — catches "I edited the React code but forgot to `npm run web:build`", which has silently caused stale-bundle confusion in this project before.
5. **Backend server** — checks `GET /api/health` on `http://127.0.0.1:3030`; if nothing answers, starts `node server.mjs` in the background (log at `.claude/skills/project-doctor/last-server.log`) and polls until healthy (or reports the log tail if it never comes up). Then hits `GET /api/notes` as a sanity check that the note pipeline's API surface actually responds.

For each dependency, the report is one of:
- ✅ **ok** — nothing to do.
- ❌ **missing** — the exact `npm run setup:*` command to fix it is printed. Tell the user to run it (these are slow/interactive-ish; don't run them yourself unless the user explicitly asks you to, since FunASR's model download alone can take several minutes).
- ⚠ **warn** — usually "installed but incomplete" (e.g. FunASR's Python env exists but `runtime/funasr-models/` has no model files) or "frontend build is stale." Same fix commands apply.

### A recurring failure pattern worth knowing about

More than once in this project, a `runtime/*` Python environment has looked
present (the directory and its `bin/python` symlink exist) but was actually
dead, because the symlink chain ends at a Homebrew-managed Python that got
upgraded or uninstalled later (e.g. `runtime/funasr/bin/python ->
python3.13 -> /opt/homebrew/opt/python@3.13/bin/python3.13`, and then
`python@3.13` gets removed by `brew upgrade`). Plain existence checks miss
this because a dangling symlink still "exists" as a directory entry but
`fs.existsSync()` on the symlink itself correctly returns `false` once you
check the file it's supposed to point to — which is exactly what this
script's checks do (they check `bin/python` itself, not just the parent
directory). If you ever need to debug this by hand instead of relying on
the script, the tell is: the `runtime/<tool>/` directory exists and looks
fully populated, but `runtime/<tool>/bin/python` fails `existsSync` (or a
manual `ls -la` on the same path shows a symlink target that itself doesn't
resolve). The fix is always the same: rerun that dependency's
`npm run setup:*`, which recreates the venv against whatever Python is
currently available.

## After running it

If everything is ✅, the server is running at `http://localhost:3030` (or
`$PORT` if set) — go test directly, no further setup needed. If something
is ❌ or ⚠, tell the user exactly which `npm run setup:*` command(s) are
needed and why (which feature they unblock — e.g. "小红书 links won't work
until you run `npm run setup:xhs`"), but don't run heavy installs yourself
without being asked to, since they're slow and the user may not want to
wait for them right now.
