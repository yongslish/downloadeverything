---
name: start-app
description: >
  One command to get this project running and ready to test: rebuilds the
  frontend if web/src/ has changed since the last build, then delegates to
  project-doctor for dependency checks and starting/health-checking the
  Express server. Use this whenever the user asks to start/run/launch the
  app, wants to test a change in the browser, or asks "is it running" —
  instead of manually chaining npm run web:build / npm start / port checks
  one step at a time. This is the single entry point for "get me to a
  testable app"; project-doctor stays the entry point for "just tell me
  what's broken" (this calls it internally, so invoking either one keeps
  their view of "healthy" in sync).
---

# Start App (download-everything / Downspace)

This project's actual dev loop, before this skill existed, was three
separate manual steps performed in a particular order every time a change
needed testing: rebuild the frontend (or forget to, and debug against a
stale bundle for a while), make sure the Express server was actually
running, and only then go look at the browser. This skill collapses that
into one command.

## How to run it

```bash
node .claude/skills/start-app/scripts/start.mjs
```

(Also available as `npm run start-app` — same script.)

## What it does, in order

1. **Checks whether the frontend build is stale** — compares
   `public/index.html`'s mtime against the newest file under `web/src/`
   (and `web/index.html`). If `public/index.html` or `public/assets/` don't
   exist at all, that counts as stale too (never built).
2. **If stale, runs `npm run web:build`** automatically. This is the one
   thing it does that `project-doctor` deliberately doesn't — doctor's
   philosophy is "report, don't install" because the runtime dependencies
   it checks (yt-dlp, XHS-Downloader, FunASR) are slow/heavy to install and
   nothing should trigger that silently. A frontend rebuild is neither —
   it's fast, safe, and idempotent, so auto-fixing it here doesn't violate
   that principle, it just doesn't extend it somewhere it doesn't apply.
3. **Delegates everything else to project-doctor**
   (`.claude/skills/project-doctor/scripts/doctor.mjs`, run as a child
   process): checks yt-dlp / XHS-Downloader / local FunASR, and
   starts + health-checks the Express server on port 3030 if it isn't
   already running. See `.claude/skills/project-doctor/SKILL.md` for what
   each of those checks means and how to fix what it finds missing.

If any runtime dependency is reported missing, this skill doesn't try to
install it either — same as project-doctor, it just tells you the
`npm run setup:*` command to run. Re-run `start-app` after that finishes;
it'll pick up from there.

## What this does *not* do

- Doesn't start the Vite dev server (`npm run web:dev`) for hot-reload
  frontend iteration — that's a different workflow (edit → see it update
  without a rebuild) from "get the app running to test a finished change",
  which is what this skill is for. Run `npm run web:dev` directly if you
  want HMR while actively iterating on `web/src/`.
- Doesn't run tests or typecheck — that's `ship-feature`'s job, for right
  before a commit. This skill is about getting a server up to look at,
  not verifying correctness.
