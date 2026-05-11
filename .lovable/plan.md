# Fix AI Features + Auto-Purge Old Challenges

## What I found while investigating

- The DB actually has **6 fresh daily + 6 fresh weekly challenges for today** (2026-05-11). So `generate-challenges` is running. But the `challenges` table has accumulated **~1,940 historical rows since Feb 3** (1,147 daily + 796 weekly) that were just flipped to `is_active = false` — never deleted. That matches your "old ones piling up" complaint.
- All AI edge functions are configured: `LOVABLE_API_KEY` (managed) and `GEMINI_API_KEY` are both present.
- Edge-function logs for `ai-safety-scan`, `ai-chat`, `generate-challenges` are **empty**, which usually means either (a) the client never reaches them, or (b) auth fails before any `console.log` runs.
- The most common silent-failure pattern across the AI client wrappers (e.g. `aiSafetyClient.ts`) is: on any non-OK response they `return { allowed: true, message: 'AI scan unavailable' }` — so the user sees no error, but AI is effectively bypassed.

## Plan

### 1. Diagnostic + UX surfacing pass (frontend)
For each AI client wrapper, replace the silent `allowed: true` swallow with:
- Console error including status + body
- A toast (`Vybe Check unavailable — please try again`) when it fails
- Return a typed `{ ok: false, reason }` so callers can decide

Files touched:
- `src/lib/aiSafetyClient.ts` (Vybe Check)
- `src/hooks/useAIChat*.ts`, `useAISmartReplies.ts`, `useAIMessageAssist.ts`, `useAIProfileWriter.ts`, `useAICommentSuggestions.ts`, `useAIHumanize.ts`, `useAICatchUp.ts`, `useDailyBrief.ts`
- `src/components/safety/VybeCheckOverlay.tsx` — show real failure reason instead of silent pass

### 2. Auth header consistency check
Audit each AI client to confirm it uses `getFunctionAuthHeaders()` (which sends a fresh JWT). Several older hooks call `supabase.functions.invoke()` directly, which can send a stale token after refresh. Standardize on `getFunctionAuthHeaders` + direct `fetch` for every AI endpoint.

### 3. Edge-function hardening
For every AI function under `supabase/functions/ai-*`, `vybe-commander`, `brief-topic-detail`, `detect-ai-content`, `generate-challenges`, `ai-safety-scan`:
- Verify `corsHeaders` includes all `x-supabase-client-*` headers (fixes 401 from browser preflight)
- Verify 402/429 from Lovable AI Gateway are forwarded to client with the original status (so toasts can react)
- Add structured `console.log` at entry/exit so future debugging works

### 4. Auto-purge old challenges (the storage save you asked for)
Two layers:
- **Inside `generate-challenges`**: after successful insert of new daily/weekly, run `DELETE FROM challenges WHERE type='daily' AND active_date < today - 7` and `WHERE type='weekly' AND active_week_start < weekStart - 28`. Keeps a small rolling history for analytics, drops the rest.
- **DB cron job** as belt-and-suspenders: a daily `pg_cron` job calls a new SQL function `prune_old_challenges()` that does the same delete plus removes orphaned `challenge_progress` rows for purged challenges.
- Also clear `challenge_templates` older than 30 days (currently never cleaned).

Retention chosen so today's UI never sees a missing challenge: keep 7 days of daily, 4 weeks of weekly. Tell me if you want a different window.

### 5. Verify after deploy
- Trigger Vybe Check on a test image from preview → confirm 200 + scan result, or a real error toast.
- Manually invoke `generate-challenges` → confirm new rows inserted AND old rows pruned (row count drops from ~1,940 to <100).
- Check `ChallengesHub` UI shows today's 6+6.

## Technical notes

- The purge SQL inside the edge function uses the service-role client already created in `generate-challenges/index.ts`, no new permissions needed.
- `prune_old_challenges()` will be `SECURITY DEFINER` with `SET search_path = public` per project memory.
- No schema changes required for the AI fixes; only behavior changes in client wrappers + edge functions.
- No changes to `_shared/auth.ts` — the `validateAuth` helper is correct; the issue is browsers sending preflight headers some functions don't whitelist.

## Out of scope
- Re-architecting any AI feature (e.g. switching models)
- Adding new AI features
- Changing rate limits

Approve and I'll implement.
