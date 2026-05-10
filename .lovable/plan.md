# Auth Reliability + Logout UX + 2FA Nudge

Three fixes, all on the client (plus one tiny edge-function tweak for clearer errors).

## 1. Login that doesn't error out

**Problem:** Login routes through the `auth-2fa-preauth` edge function. Any cold-start, network blip, or non-credential server error currently throws "Sign-in failed" and blocks the user — even though their password is fine.

**Fix in `src/pages/Landing.tsx` `handleSubmit`:**
- Wrap the `supabase.functions.invoke('auth-2fa-preauth', ...)` call in a 12s timeout.
- Distinguish three outcomes:
  1. `invalid_credentials` (401) → show "Invalid email or password" (unchanged).
  2. `email_failed` → show the existing 2FA email message (unchanged).
  3. **Any other error** (network, 5xx, timeout, edge cold-start) → silently fall back to `supabase.auth.signInWithPassword(...)` so users with no 2FA enabled can still get in. Only show a hard error if that fallback also fails.
- Always reset `setGatePending(false)` and `setLoading(false)` in a `finally` block so the form never gets stuck.
- Surface a friendlier toast for known transport errors ("Connection hiccup — trying again…") instead of a generic red error.

**Fix in `supabase/functions/auth-2fa-preauth/index.ts`:**
- Return `stage: 'none'` + session on any unexpected internal error instead of 500, **only** after password is verified — keeps the door open when downstream services (challenge insert, geolocate) hiccup.

## 2. Instant, confirmed logout

**Problem:** `signOut()` in `src/lib/auth.tsx` does ~10 synchronous DOM/localStorage ops then awaits `supabase.auth.signOut()` (network round-trip) before the UI moves. Sidebars also call it with no confirmation.

**Fix in `src/lib/auth.tsx` `signOut`:**
- Flip local state first: `setProfile(null)`, `setUser(null)`, `setSession(null)`.
- Fire `supabase.auth.signOut({ scope: 'local' })` (no network wait — clears local session immediately) and let the global revoke happen in the background via `void` Promise.
- Move the localStorage / CSS-variable / theme cleanup into a microtask so it doesn't block the navigate.
- Net effect: function resolves in < 50 ms; UI navigates instantly.

**Fix at all logout entry points** — wrap each in the same confirmation dialog Settings already uses:
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/DesktopLeftSidebar.tsx`
- `src/components/layout/DesktopRightSidebar.tsx`

Extract the AlertDialog from `Settings.tsx` into a shared `src/components/auth/SignOutConfirmDialog.tsx` and reuse it. Each sidebar's logout button opens the dialog; confirming runs `signOut()` + `navigate('/')`. Includes a "Signing out…" spinner state and disables the button to prevent double-clicks.

## 3. 2FA enrollment nudge so users don't lose their account

**New component `src/components/auth/Enable2FANudge.tsx`:**
- Mounted in `AppLayout` (or `RootGate` post-login) so it shows once per session for signed-in users.
- On mount, reads `user_2fa_settings` (already used by `SecuritySection`). If both `email_2fa_enabled` and `login_approvals_enabled` are false **and** the user dismissed less than 7 days ago is false (tracked in `localStorage` key `vybe-2fa-nudge-dismissed-at`), show a soft bottom-sheet/banner:
  - Title: "Protect your account"
  - Body: "Turn on 2-step verification so you never lose access to your VYBE."
  - Primary CTA → `navigate('/settings?tab=security')`.
  - Secondary "Remind me later" → stamp localStorage with `Date.now()`.
- Never shown to users who already have either factor enabled.
- After a fresh signup completes onboarding, surface the same nudge once with a slightly stronger copy ("Add 2-step verification — recommended").

No DB schema changes (re-uses existing `user_2fa_settings` + `ensure_2fa_settings` RPC).

## Technical summary

- Files edited: `src/lib/auth.tsx`, `src/pages/Landing.tsx`, `src/pages/Settings.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/DesktopLeftSidebar.tsx`, `src/components/layout/DesktopRightSidebar.tsx`, `src/components/layout/AppLayout.tsx`, `supabase/functions/auth-2fa-preauth/index.ts`.
- Files created: `src/components/auth/SignOutConfirmDialog.tsx`, `src/components/auth/Enable2FANudge.tsx`.
- No migrations, no new secrets, no new dependencies.
- Verification: log in (with bad password → still rejected; with good password and gateway down → still gets in via fallback); log out from every entry point (instant + confirmed); fresh account sees 2FA nudge after onboarding.
