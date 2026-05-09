## Goal

Fix two real, user-blocking 2FA bugs and polish the UX so it behaves like Instagram / X / Discord:

1. The 2FA email never arrives. Edge logs show `auth-2fa-request` succeeded but the inner call to `send-transactional-email` came back non-2xx. `email_send_log` has zero rows for `login-verification` in the last 24h, and the suppression list is empty — so the function is failing before it even logs. Worse, `sendTransactional` swallows that error and `auth-2fa-request` still returns `requires2fa: true`, so the gate opens for a code the user will never receive.
2. Clicking Close on the verify dialog signs the user in anyway. Today `Landing.handleSubmit` calls `supabase.auth.signIn(...)` BEFORE checking 2FA. That creates a real session immediately; the gate is purely cosmetic. When the dialog is dismissed (Close button, Esc, tap-outside, hardware back), the existing session and the auth listener race the `signOut()` call and the user lands on `/home`.

Big-social behaviour: no session exists until the second factor passes. Cancel = nothing happened.

## Plan

### A. Make 2FA actually blocking (no session until verified)

1. New edge function `auth-2fa-preauth`:
   - Input: `{ email, password }`.
   - Server-side: `admin.auth.signInWithPassword({ email, password })` to validate credentials. The session is created on the server but never returned to the client.
   - Look up `user_2fa_settings` and `login_approval_settings`:
     - If email 2FA is on → generate 6-digit code, store its hash + the access/refresh tokens encrypted in `auth_challenges.metadata`, send the email, return `{ stage: 'code', challengeId }`.
     - Else if approval is on → create approval challenge, store tokens in metadata, return `{ stage: 'approval', challengeId }`.
     - Else → return `{ stage: 'none', session: { access_token, refresh_token } }`.
   - On wrong password / disabled user / rate-limit → standard error.
2. `auth-2fa-verify` and `auth-login-approval` ('poll' on approve): on success, atomically read the stored tokens from `auth_challenges.metadata`, null the field (single-use), and return `{ session }`.
3. `Landing.handleSubmit` login branch: stop calling `supabase.auth.signIn()`. Call `auth-2fa-preauth` instead.
   - `stage: 'none'` → `supabase.auth.setSession(session)` then navigate.
   - `stage: 'code' | 'approval'` → open `LoginGateModal`. No session exists, so cancel is naturally safe.
4. `LoginGateModal.onSuccess(session)` calls `supabase.auth.setSession(session)` BEFORE navigation.
5. Cancel path on the modal no longer needs `supabase.auth.signOut()` — there is nothing to sign out of. The pending challenge expires on its own.

### B. Make the email actually send (and fail loudly when it doesn't)

1. Harden `_shared/security.ts → sendTransactional` to return `{ ok, error }` instead of silently logging.
2. Update `auth-2fa-request` (and the new `auth-2fa-preauth`) so that if the send fails, we delete the just-created challenge and return `{ ok: false, error: 'email_failed' }`.
3. `Landing.tsx` surfaces that as a toast ("Couldn't send your code, try again") and does NOT open the gate modal — the user stays on the login screen.
4. Re-deploy `send-transactional-email`, `auth-2fa-request`, `auth-2fa-verify`, `auth-2fa-preauth`, `auth-login-approval`, `auth-login-notify`, and `process-email-queue` to Live so the registry is current.

### C. Premium UX polish on `LoginGateModal`

1. Replace the single text input with a 6-cell OTP input: one digit per box, auto-advance, backspace step-back, paste support.
2. Auto-submit when all 6 digits are entered.
3. Show "Code expires in m:ss" countdown and a separate "Resend in 30s" cooldown.
4. Lock dismissal (Esc / outside-tap / hardware back) while a verify/poll request is in flight, with a subtle progress bar.
5. Approval mode: pulsing phone illustration, requester city / IP / device, and a prominent red **"This wasn't me"** button that calls `auth-login-approval` with `action: 'deny'`.
6. Replace the generic "Cancel" with a clear **"Use a different account"** + **"This wasn't me"** pair, matching Instagram/X copy.

## Files to change

Frontend:
- `src/pages/Landing.tsx` — swap direct `signIn` for `auth-2fa-preauth`; handle the three stages; remove the redirect race.
- `src/components/auth/LoginGateModal.tsx` — OTP input, non-dismissible-while-busy, `setSession` on success, "This wasn't me" button, expiry countdown.

Edge functions (all need Live deploy after edits):
- new `supabase/functions/auth-2fa-preauth/index.ts`
- `supabase/functions/auth-2fa-request/index.ts` — return `ok:false` on email failure; delete challenge.
- `supabase/functions/auth-2fa-verify/index.ts` — return stored session on success.
- `supabase/functions/auth-login-approval/index.ts` — return stored session on approve; keep deny path.
- `supabase/functions/_shared/security.ts` — `sendTransactional` returns success/failure.
- Trigger redeploy of `send-transactional-email` and `process-email-queue` so the latest registry + queue worker run on Live.

## Out of scope
- No database schema changes — `auth_challenges.metadata` already stores arbitrary JSON.
- No design-token edits.
- Biometric / Despia lock flow untouched.
- The Snap / Maps / Camera work from earlier turns is unaffected.

## Technical notes
- Storing access+refresh tokens in `auth_challenges.metadata` is acceptable because that table is service-role-only (no RLS read for users), the row is single-use and TTL-bound (10 min), and the metadata is nulled on consumption. We can also encrypt the payload with `pgp_sym_encrypt(..., vault_secret)` if you want the extra belt — say the word and I'll add it.
- `signInWithPassword` triggered server-side does count against Supabase's per-user sign-in rate limit, same as today's client call — net rate impact is zero.
- `setSession` on the client establishes the session locally without a network round-trip, so the post-2FA hand-off is instant.