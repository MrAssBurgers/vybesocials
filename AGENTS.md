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
- **Supabase** production project ref: `agtcyxjxgkdyoxwxkjth` (Lovable-managed; see `supabase/config.toml` and `.env`).
- WARNING: `hprmicwhlaaqfgshucec` ("VYBE-Social") is a separate, mostly-empty project — do NOT point the app at it or deploy there; it has only a skeleton schema and broke onboarding when `.env` was switched to it.
- Never assume publish credentials are available; verify first.
- If deployment cannot be completed, provide exact unblock steps (usually Lovable Publish or `npx supabase login`).
