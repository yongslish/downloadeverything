# Downspace / download-everything — agent notes

This project has three project-scoped skills under `.claude/skills/` that
exist specifically to stop re-deriving the same multi-step sequences by
hand every session. Use them instead of manually chaining the equivalent
`npm run ...` commands:

## To start/test the app, use start-app (not a manual npm chain)

```bash
npm run start-app
```

Rebuilds the frontend if `web/src/` has changed since the last build, then
delegates to project-doctor for dependency checks and starting/health-
checking the Express server. This is the single entry point for "get me
to a testable app" — use it any time you're about to say "let's test this
in the browser" instead of separately remembering `npm run web:build`,
then `npm start`, then checking whether port 3030 is already taken. It's
linked to project-doctor (calls it as its last step) rather than a
separate copy of its logic, so the two never disagree about what "healthy"
means. Full skill: `.claude/skills/start-app/`.

## To check what's broken, use project-doctor

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

Run this any time a processing job fails with an error you haven't already
diagnosed — most real failures here trace back to one of these Python
environments being missing, or having a broken interpreter symlink after a
Homebrew Python upgrade (see `.claude/skills/project-doctor/SKILL.md` for
the full detail on that failure pattern; it's bitten this project more
than once). `start-app` already calls this, so you don't need to run both
back to back — reach for `doctor` directly when you specifically want the
diagnostic report and don't need/want the frontend rebuilt or the server
touched.

## When the user asks to commit, use the ship-feature skill

Don't manually re-run checks and improvise a commit message each time.
`.claude/skills/ship-feature/` runs the full preflight (syntax, tests,
typecheck, a live app boot via project-doctor, a secret scan of the staged
diff) and drafts the commit in this project's established style
(imperative subject + a body that explains *why*, not just what). This
does not change the rule that commits only happen when the user asks for
one in that turn — invoking the skill is that ask, it isn't standing
permission for future commits.

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
