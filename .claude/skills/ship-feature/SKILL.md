---
name: ship-feature
description: >
  Runs the full pre-commit checklist for this repo (syntax check, backend
  tests, frontend typecheck, a live app boot via project-doctor, and a
  secret-pattern scan of the staged diff) and then drafts + creates a git
  commit in this project's established style. Use this whenever the user
  says something like "commit this", "ship this", "save a checkpoint", or
  after wrapping up a complete bug fix / feature / UI pass and the user
  wants it committed — instead of manually re-running each check by hand
  and improvising a commit message each time. Do NOT use this to commit
  silently or proactively; only invoke it when the user has actually asked
  for a commit in this turn — invoking this skill IS that explicit ask, it
  doesn't substitute for one.
---

# Ship Feature (download-everything / Downspace)

This project's commits, so far, have all followed the same shape: run every
check, review the diff, write a commit message that explains *why* (not
just what — the diff already shows what), commit, push. Doing that by hand
means re-deriving "which checks exist and how to run them" and "what does a
good commit message look like here" from scratch each time. This skill
fixes both.

**Important**: this skill does not override the system-level rule that
commits only happen when the user explicitly asks. The user asking for this
skill (by name, or by asking to "commit"/"ship" the current work) *is* that
explicit ask for this one commit — it is not standing permission to commit
again later without being asked again.

## Steps

1. **Stage what actually belongs in this commit, first.** Run
   `git status --short` and `git diff --stat` and look at what's there.
   Prefer explicit paths (`git add path/to/file`) over `git add -A`
   whenever the status shows anything you don't recognize as part of the
   current change. The existing `.gitignore` already excludes build output
   (`public/assets/`, `public/index.html`) and runtime data
   (`runtime/notes/`, `runtime/downloads/`, etc.), so `git add -A` is
   usually safe — but staging *before* preflight, not after, is what makes
   step 2's secret scan actually check something: it scans
   `git diff --cached`, which is empty (and trivially "passes") if nothing
   is staged yet. Don't run preflight against an empty stage and take the
   green result as meaningful.

2. **Run the preflight script**:
   ```bash
   node .claude/skills/ship-feature/scripts/preflight.mjs
   ```
   This runs, in order: `npm run check` (syntax), `npm test` (backend
   regression), `cd web && npx tsc --noEmit` (frontend types, skipped if
   `web/` doesn't exist), `npm run doctor` (confirms the app actually boots
   — see `.claude/skills/project-doctor/`), and a grep-based scan of
   `git diff --cached` for secret-shaped strings and secret-shaped
   filenames (`.env`, `secrets.env`, `*.pem`, `xhs-cookie.txt`, etc).

   If anything fails, **stop and report it** — don't commit broken code or
   a leaked credential. Fix the failure (or ask the user how to handle it),
   then re-run from this step (re-staging first if the fix touched files).

3. **Draft the commit message.** This repo's commits are not one-liners —
   look at `git log` for the established voice. The pattern:
   - Imperative summary line, under ~70 characters.
   - Body organized by area changed (e.g. one paragraph per file/module),
     each explaining the *reason* for the change, not a restatement of the
     diff.
   - For bug fixes: name the root cause explicitly (e.g. "X failed because
     Y", not just "fixed X"). If you had to dig for the root cause, the
     commit message is where that investigation earns its keep — the next
     person (or the next you) shouldn't have to re-derive it.
   - Close with a blank line then:
     ```
     Co-Authored-By: Claude <noreply@anthropic.com>
     ```

4. **Commit**:
   ```bash
   git commit -m "$(cat <<'EOF'
   <subject>

   <body>

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Push**, unless the user said not to or the branch isn't tracking a
   remote (`git status` will say so):
   ```bash
   git push origin <branch>
   ```

6. **Report back concisely**: the commit hash, a one-line summary of what
   shipped, and whether the push succeeded. If preflight caught something
   and you fixed it before committing, mention that too — it's exactly the
   kind of thing that's easy to forget happened.

## When preflight fails

- **Syntax/test/typecheck failure**: this is a real bug introduced by the
  current change (or an existing one this change exposed). Fix it, don't
  work around it, then re-run preflight from step 1.
- **App doesn't boot**: check `.claude/skills/project-doctor/last-server.log`
  — often a missing runtime dependency (see
  `.claude/skills/project-doctor/SKILL.md`) rather than a bug in the change
  itself, but confirm that before assuming it's unrelated.
- **Secret scan hit**: stop immediately. Do not commit. If it's a false
  positive (e.g. a legitimately public-looking string that happens to match
  the pattern), tell the user what matched and let them confirm before
  staging it anyway — don't silently override the tripwire yourself.
