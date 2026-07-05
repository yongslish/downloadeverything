# Downspace / download-everything — agent notes

## Before testing any change, run the project doctor

```bash
npm run doctor
```

This checks every runtime dependency the note pipeline needs (yt-dlp,
XHS-Downloader, local FunASR), reports whether the frontend build in
`public/` is stale relative to `web/src/`, and starts + health-checks the
Express server on port 3030 if it isn't already running. It never installs
anything itself — installs are slow (FunASR alone downloads ~1GB of model
weights) — it only tells you the exact `npm run setup:*` command to run for
whatever's missing.

Run this instead of manually starting the server or re-deriving setup
commands, and run it again any time a processing job fails with an error
you haven't already diagnosed — most real failures here trace back to one
of these Python environments being missing, or having a broken interpreter
symlink after a Homebrew Python upgrade (see
`.claude/skills/project-doctor/SKILL.md` for the full detail on that
failure pattern; it's bitten this project more than once).

Full skill: `.claude/skills/project-doctor/` (invoke via the Skill tool as
`project-doctor`, or just run `npm run doctor` directly — same script).

## Architecture at a glance

- `server.mjs` — Express backend. Legacy download-only endpoints
  (`/api/jobs`, `/api/transcriptions`) plus the note pipeline
  (`/api/notes*`) that drives the actual product.
- `lib/content/note-pipeline.mjs` — orchestrates platform resolve →
  download → extract → Canonical Document for the two supported
  platforms (Bilibili, 小红书).
- `lib/download/providers/` — one Provider per platform
  (`ytdlp-provider.mjs`, `xhs-provider.mjs`); see
  `docs/download-provider-architecture.md`.
- `lib/transcription/providers/` — ASR providers (local FunASR, 讯飞,
  fake); see `docs/funasr-provider-spec.md`.
- `web/` — the real frontend (Vite + React + TypeScript), builds into
  `public/` via `npm run web:build`. **Node changes need a server
  restart** (`npm start` isn't `--watch`d in prod mode); frontend
  changes need a rebuild before they show up at `http://localhost:3030`
  unless you're running `npm run web:dev` against the Vite dev server
  directly (proxies `/api` to port 3030).
- `public/legacy/` — the original vanilla-JS downloader UI, kept
  reachable at `/legacy/` until the Tools page (§6.5 in
  `docs/design-system.md`) absorbs its download/transcribe/subtitle
  flows. Not the primary UI anymore.
- `docs/design-system.md` + `docs/mockups/` — the frozen visual spec.
  Match these pixel-for-pixel; don't redesign colors/tokens without an
  explicit ask, and log any deviation in design-system.md §十三.
- `docs/product-requirements.md` — product scope/MVP boundaries.

## Known fragility pattern: broken Python interpreter symlinks

Three independent Python environments live under `runtime/` (`python/`
shared by yt-dlp + XHS-Downloader, `funasr/` for local ASR). Each one's
`bin/python` is a symlink chain that can end at a Homebrew-managed Python
binary. If that Homebrew formula gets upgraded or removed later, the venv
directory still looks fully populated but the interpreter itself is gone —
`fs.existsSync()` on the parent directory returns true while the actual
`bin/python` path resolves to nothing. This has broken both yt-dlp and
FunASR in this project's history, each time surfacing as a confusing
subprocess-level error deep in a job failure rather than a clear "not
installed" message. `npm run doctor` checks for this specifically; if
you're diagnosing by hand, `ls -la runtime/<tool>/bin/python` and follow
the symlink chain.
