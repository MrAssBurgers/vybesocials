# Plan

## 1. Hide passkeys for everyone except the owner (keep code intact)

Goal: keep all passkey code/edge functions intact, but make sure no regular user ever sees passkey UI or can call register/login passkey flows. Only the owner account (`mrassburgers`) sees it.

- Add a tiny `useIsOwner()` hook that wraps `isCurrentUserOwner()` from `src/lib/ownerBypass.ts` and returns `{ isOwner, ready }`.
- Gate every visible passkey surface behind `isOwner === true`:
  - `src/components/settings/SecuritySection.tsx` — only render `<PasskeysCard />` if owner.
  - `src/components/settings/PasskeysCard.tsx` — early-return `null` if not owner (defense in depth).
  - `src/pages/Landing.tsx` (lines ~642–685) — the "Sign in with Face ID / passkey" block: only render if owner. Since owner state isn't known on a logged-out landing page, the simplest rule is **never show the passkey login button on Landing** (owner can still use email/password/Google and then add a passkey from Settings). This matches "users will never know it's there".
  - `src/components/auth/Enable2FANudge.tsx` — remove/skip any passkey suggestion for non-owners.
  - `src/components/settings/SettingsNav.tsx` — change the Security label/description from "Two-factor, passkeys, devices" → "Two-factor and devices" for non-owners.
- No backend changes, no deleted files, no deleted edge functions. The 4 `auth-passkey-*` functions stay deployed. Owner can flip back on instantly by simply being signed in.

## 2. 2FA toggles not staying on + "we can't send verification email"

Root cause analysis:
- `SecuritySection.updateSetting` upserts into `public.user_2fa_settings` from the client. If RLS on that table doesn't allow the user to insert/update their own row, the upsert silently fails on reload (the row never actually persists, even though the toast says "Saved" because we optimistically set state first and only revert on a thrown error — a `{ error: null }` no-op with 0 rows updated also "succeeds"). The `ensure_2fa_settings` RPC reloads the original row and the switch flips back.
- `auth-2fa-request` uses `sendTransactional('login-verification', …)`. The "we can't send you a verification email" toast comes from `Landing.tsx` line 268 when the edge function returns `email_failed`. That happens when `sendTransactional` returns `{ ok: false }` — typically because the `login-verification` template isn't registered in the transactional registry OR the email queue infra isn't fully provisioned on the live project.

Fixes:
- Inspect `user_2fa_settings` RLS via `supabase--read_query` against `pg_policies`. If missing/broken, add a migration with:
  - RLS enabled, plus `SELECT/INSERT/UPDATE` policies `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
- Switch `updateSetting` to use the existing `ensure_2fa_settings` RPC pattern + an explicit update that returns the row, so we can detect a 0-row update and surface an error instead of a false "Saved".
- Inspect `auth-2fa-request` logs (`supabase--edge_function_logs`) for the exact `email_failed` reason. Likely fixes:
  - Confirm `login-verification` exists in the transactional templates registry; if missing, add it.
  - Verify the email queue cron and `enqueue_email` RPC exist on the live project (re-run email infra setup if not).

## 3. Spotify connect — white screen / URL fallback

Root cause: `spotify-oauth-callback` redirects to `https://accounts.spotify.com/authorize` with `redirect_uri = {SUPABASE_URL}/functions/v1/spotify-oauth-callback`. Spotify rejects any redirect URI that isn't whitelisted in the Spotify developer dashboard — this manifests as a blank/error page after consent.

Fixes:
- Confirm `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` exist (`secrets--fetch_secrets`).
- Pull the live edge logs (`supabase--edge_function_logs` for `spotify-oauth-callback`) to see the exact error (almost always `INVALID_CLIENT: Invalid redirect URI`).
- Action for the user (cannot be done from code): add the exact redirect URI `https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/spotify-oauth-callback` to the Spotify app dashboard → Redirect URIs.
- Improve the callback's error HTML to show the underlying Spotify error message instead of a blank page, and add a "Back to Vybe" link timeout so the user is never stuck.
- Also surface the failure in `ConnectionsSection` when `?spotify=error&reason=...` returns.

## 4. Google login: long "Signing you in…" + 2FA bypass

Two separate issues:

**a) Long loading screen after cancelling Google OAuth**
- `AuthCallback.tsx` has a hard 10s safety timeout before redirecting back to `/`. If the user lands on `/auth/callback` without tokens (because they cancelled), they sit on the spinner for up to 10s.
- Fix: in `AuthCallback`, if `window.location.hash` contains `error=` OR is empty AND there's no `vybe-oauth-pending` flag, redirect to `/` immediately instead of waiting 10s. Also clear `vybe-oauth-pending` on `popstate` / `pagehide` in `Landing.tsx` so back-button cancels reset the spinner.

**b) Google login bypasses email 2FA**
- This is by design in the current code: `auth-2fa-preauth` is only called from the password form. OAuth (Google/Apple) goes straight to a Supabase session via `lovable.auth.signInWithOAuth`, so the email-2FA step is never triggered. This is a real security gap if the user expects 2FA on every sign-in.
- Fix: after `SIGNED_IN` from OAuth (detected in `AuthCallback` or a top-level auth listener), check `user_2fa_settings.email_2fa_enabled`. If true and the current login event isn't already 2FA-verified, call `auth-2fa-request` with the user's email, sign the session **out**, and route to a new `/login/verify?challengeId=…` screen that consumes the existing `auth-2fa-verify` flow. On success, restore the session from the challenge's stored tokens (the edge function already supports this via the `metadata.session` reuse path).
- Same gating applies to Apple OAuth.

## 5. Verification

- `supabase--read_query` on `pg_policies` for `user_2fa_settings`, `user_passkeys` (just to confirm we don't break anything).
- `supabase--edge_function_logs` for `auth-2fa-request` and `spotify-oauth-callback` to confirm root causes before patching.
- After implementation: live-test login as a non-owner to confirm passkey UI is fully gone and that toggling 2FA persists across a reload.

## Technical summary

| Area | Files touched |
|---|---|
| Owner gating | `src/hooks/useIsOwner.ts` (new), `SecuritySection.tsx`, `PasskeysCard.tsx`, `Landing.tsx`, `Enable2FANudge.tsx`, `SettingsNav.tsx` |
| 2FA persistence | Migration adding RLS policies on `user_2fa_settings`; `SecuritySection.updateSetting` hardened |
| 2FA email | Confirm `login-verification` template exists; verify queue infra |
| Spotify | `spotify-oauth-callback/index.ts` (better errors); `ConnectionsSection.tsx` (surface `?spotify=error`); user must whitelist redirect URI in Spotify dashboard |
| Google OAuth UX | `AuthCallback.tsx` (fast-fail on missing tokens), `Landing.tsx` (clear `vybe-oauth-pending` on cancel) |
| OAuth 2FA enforcement | `AuthCallback.tsx` re-routes through `auth-2fa-request` when `email_2fa_enabled = true`; new `/login/verify` route reusing `LoginGateModal` |

No edge functions are deleted; passkey routes stay deployed for owner use.
