# AGENTS

Project operating guidance for AI agents working in this repo.

## Source Of Truth
- Use `WORKLOG.md` first to understand current task state.
- If `WORKLOG.md` is stale, ask the user to refresh it before risky changes.

## Session Startup
1. Read `WORKLOG.md`.
2. Confirm branch and scope.
3. Restate active goal and immediate next step.

## Development Rules
- Keep changes focused to current scope.
- Avoid broad refactors unless requested.
- Do not modify secrets or auth config without explicit user request.
- Prefer safe, reversible migrations over destructive database actions.
- **Backend is Firebase only** — Firestore, Firebase Auth, Cloud Functions, Storage. Do not add Supabase dependencies or SQL migrations.

## Required Verification After Substantive Changes
- Run `npm run build`.
- Run `npm run test` (DM identity, avatar cache, and other foundation unit tests).
- If relevant, run `npm run lint`.
- Manually verify impacted user flow.

## Debug Scan Protocol ("do a debug")
When the user says **"do a debug"**, run the full scan (do not skip steps):

1. Read `WORKLOG.md` for current scope and known blockers.
2. Run `npm run debug` (or `node scripts/debug-scan.mjs`) — build, lint, CSS, Cloud Function reference check, Firebase probes.
3. Run `npm run build` and `npm run lint` if not already green.
4. Compare **client-invoked** function names to `functions/src/` exports (all must exist locally).
5. Probe **Firebase production** (`vybe-daaab`) — hosting, Firestore rules, sample callables (see `DEPLOY.md`).
6. Report: pass/fail table, production gaps, uncommitted local changes, exact unblock steps (Lovable Publish, `firebase deploy`).
7. Fix safe code issues in-repo.
8. Update `WORKLOG.md` with scan date, results, and next actions.

## Handoff Standard
Before ending a task:
- Update `WORKLOG.md`:
  - what changed
  - tests run
  - blockers
  - next 3 tasks
- **Push client changes to `origin/main`** before telling the user to Lovable Publish; include commit SHA in handoff.
- Firebase-only deploys (`vybe-daaab.web.app`) are staging — **vybehub.app requires Lovable Publish**.

## Deploy Safety
- Follow `DEPLOY.md`.
- **Web production (`vybehub.app`)** is published via **Lovable → Share → Publish**, not Vercel/Netlify CLI in this repo.
- **Firebase project:** `vybe-daaab` (hosting, Firestore, Auth, Functions).
- Never assume publish credentials are available; verify first.
- If deployment cannot be completed, provide exact unblock steps (usually Lovable Publish or `npx firebase login`).
