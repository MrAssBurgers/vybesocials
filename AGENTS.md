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

## Required Verification After Substantive Changes
- Run `npm run build`.
- If relevant, run `npm run lint`.
- Manually verify impacted user flow.

## Debug Scan Protocol ("do a debug")
When the user says **"do a debug"**, run the full scan (do not skip steps):

1. Read `WORKLOG.md` for current scope and known blockers.
2. Run `npm run debug` (or `node scripts/debug-scan.mjs`) — build, lint, CSS, edge-function reference check, production RPC/edge probes.
3. Run `npm run build` and `npm run lint` if not already green.
4. Compare **client-invoked** edge function names to `supabase/functions/` (all must exist locally).
5. Probe **production** (`agtcyxjxgkdyoxwxkjth`) — live users and auth (see `DEPLOY.md`, `.env`, `index.html` preconnect):
   - RPCs: `get_public_user_count`, `sync_signup_username`, `ensure_user_level`
   - Edge samples: `livekit-token`, `generate-advanced-theme`, `ai-catch-up`, `share-preview`, `community-voice-token`, `auth-2fa-preauth`
6. Report: pass/fail table, production gaps (404 RPC/functions), uncommitted local changes, exact unblock steps (Lovable Publish, SQL Editor, Backend deploy).
7. Fix safe code issues in-repo; do **not** canonicalize auth to `hprmicwhlaaqfgshucec` (empty migration sandbox — breaks login).
8. Update `WORKLOG.md` with scan date, results, and next actions.

## Handoff Standard
Before ending a task:
- Update `WORKLOG.md`:
  - what changed
  - tests run
  - blockers
  - next 3 tasks

## Deploy Safety
- Follow `DEPLOY.md`.
- **Web production (`vybehub.app`)** is published via **Lovable → Share → Publish**, not Vercel/Netlify CLI in this repo.
- **Supabase** production project ref: **`agtcyxjxgkdyoxwxkjth`** (Lovable-managed; see `DEPLOY.md`, `.env`, published HTML preconnect).
- **Sandbox:** `hprmicwhlaaqfgshucec` — migration target only; do not point vybehub.app auth at it until users are migrated.
- Never assume publish credentials are available; verify first.
- If deployment cannot be completed, provide exact unblock steps (usually Lovable Publish or `npx supabase login`).
