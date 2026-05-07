## Goal

Build a complete account security suite on the user's existing Settings area, modeled on Discord/Roblox/Instagram patterns. Five capabilities, all working together:

1. Email 2FA (verification code on login)
2. Passkeys / biometric / Face ID / U2F (WebAuthn)
3. QR-code quick sign-in (scan from logged-in phone to sign in another device)
4. In-app login approval (Instagram-style "Was this you?" with IP + location, approve/deny)
5. Login history / trusted devices list with revoke

All five are managed from a new Settings → Security page and gated by the existing auth flow.

---

## What the user will see

### Settings → Security (new page)

```text
┌────────────────────────────────────────┐
│  Two-Factor Authentication             │
│  [ Email codes ]   ●  Enabled          │
│  Backup codes: [ Generate / View ]     │
├────────────────────────────────────────┤
│  Passkeys & Biometrics                 │
│  • iPhone Face ID  · Added May 2       │
│  • YubiKey 5C      · Added Apr 18      │
│  [ + Add a passkey ]                   │
├────────────────────────────────────────┤
│  Quick Sign-In (QR)                    │
│  Scan a QR from a signed-out device    │
│  [ Open scanner ]                      │
├────────────────────────────────────────┤
│  Login Approvals                       │
│  Get a push/in-app prompt before any   │
│  new device can sign in.   [ ON ]      │
├────────────────────────────────────────┤
│  Active sessions & devices             │
│  • iPhone 15 — New York, US — now      │
│  • MacBook — Brooklyn, US — 2h ago     │
│  • Chrome (Windows) — Unknown — Revoke │
│  [ Sign out everywhere ]               │
└────────────────────────────────────────┘
```

### Login flow changes
- After password / Google sign-in, if 2FA is enabled → prompt for emailed 6-digit code.
- If the device is new and Login Approvals is ON → show "Check your other device to approve" screen; the already-signed-in device gets an in-app sheet with IP, city, browser, time, and Approve / Deny buttons.
- Passkey button on the login screen ("Sign in with passkey / Face ID") attempts WebAuthn first — instant entry when present.
- "Sign in with QR" link on the login screen opens a QR display; scanning it from a signed-in mobile device authenticates the new device.

### After every successful sign-in
- Toast: "New sign-in from {city}". 
- Email: "You signed in to VYBE — {device}, {city}, {time}. Wasn't you? Revoke this session."

---

## Architecture

### Database (new tables)

- `user_2fa_settings` — per-user toggle for email 2FA, login approvals, hashed backup codes.
- `auth_challenges` — short-lived rows for pending email 2FA codes, login approvals, and QR sign-in handshakes (`type`, `code_hash`, `expires_at`, `metadata jsonb`, `consumed_at`).
- `user_passkeys` — WebAuthn credentials (`credential_id`, `public_key`, `counter`, `transports`, `device_name`, `last_used_at`).
- `user_sessions` — every active session/device (`session_token_hash`, `ip`, `city`, `country`, `user_agent`, `device_label`, `last_seen_at`, `revoked_at`, `trusted bool`).
- `login_history` — append-only audit (success/fail, method, ip, geo, user-agent).

All tables RLS-protected: user can only SELECT/UPDATE rows where `user_id = auth.uid()`. Inserts go through edge functions running with service role. Backup codes stored as bcrypt hashes only.

### Edge functions

- `auth-2fa-request` — generate 6-digit code, store hash in `auth_challenges`, send via existing transactional email infra (new template `login-verification.tsx`).
- `auth-2fa-verify` — verify code, mark challenge consumed, return short-lived "2fa-passed" token client uses to complete the Supabase sign-in.
- `auth-passkey-register-options` / `auth-passkey-register-verify` — WebAuthn registration ceremony.
- `auth-passkey-login-options` / `auth-passkey-login-verify` — WebAuthn assertion → returns Supabase session via admin API.
- `auth-qr-create` — signed-out device requests a QR token (random nonce + short TTL), returns it; UI renders QR.
- `auth-qr-claim` — signed-in device scans, posts `{nonce, intent: 'approve' | 'deny'}` after user confirms.
- `auth-qr-poll` — signed-out device polls; once approved, function uses admin API to mint session for the new device.
- `auth-login-approval-request` — when password/OAuth login from new device, create challenge + push it to all trusted sessions via realtime.
- `auth-login-approval-respond` — trusted device approves/denies; pending login resolves.
- `auth-session-revoke` / `auth-session-revoke-all` — invalidates `user_sessions` rows + signs out via Supabase admin.
- `auth-login-notify` — sends "new sign-in" email and inserts `login_history` row.

All edge functions: input validation with Zod, JWT validation in code, rate-limited (per-user + per-IP).

### Client integration

- New routes: `/settings/security`, `/login/verify`, `/login/approve` (in-app sheet, not a route), `/login/qr`.
- `src/lib/webauthn.ts` — wraps `@simplewebauthn/browser` for register/authenticate.
- `src/lib/auth2fa.ts` — orchestrates the 2-step sign-in (password → code).
- `src/hooks/useLoginApprovals.ts` — Realtime subscription on `auth_challenges` for the current user; pops a `<LoginApprovalSheet />` when a new approval challenge arrives, showing IP, city, device, Approve / Deny.
- `src/hooks/useSessionTracking.ts` — on every sign-in, calls `auth-login-notify` to register the session row + email.
- Updated `Auth.tsx` (or whatever the login page is — confirm before building) to:
  - Try passkey first if available (`navigator.credentials`).
  - After password/Google success, route to `/login/verify` if 2FA on, or wait on `/login/approve` if approval-required.
  - Add "Sign in with QR" link that opens the QR scanner camera (already have camera infra).

### IP geolocation
Edge function calls free `ipapi.co/{ip}/json/` (no key, project pattern already used elsewhere — verify before building, fall back to `ip-api.com` if rate-limited). Cached per session.

### Email
Reuse existing transactional email infrastructure. Two new templates: `login-verification.tsx` (6-digit code) and `new-signin.tsx` (device + city + revoke link). Both follow the existing brand styling rules.

---

## Build order (sequenced so each step is independently shippable)

1. DB migration: all five tables + RLS + helper SECURITY DEFINER functions (`set search_path = public`).
2. Email templates + `auth-2fa-request` / `auth-2fa-verify` + `Settings → Security` toggle for email 2FA + `/login/verify` page.
3. `user_sessions` + `login_history` + `auth-login-notify` + Active Sessions list with revoke + new-sign-in email.
4. Login Approvals: edge functions + Realtime subscription + `<LoginApprovalSheet />` + new-device detection in login flow.
5. Passkeys: install `@simplewebauthn/server` (edge) and `@simplewebauthn/browser` (client) + register/login flows + Settings list.
6. QR quick sign-in: `/login/qr` display + scanner wired to existing camera + `auth-qr-*` functions + polling.
7. Backup codes generator + recovery path.

---

## Things to confirm before building

- Current login page filename (`Auth.tsx` vs `pages/auth/*`) and whether it already has a 2FA hook stub.
- Whether the project already wraps Supabase auth in `src/lib/auth.tsx` enough to inject a "post-password gate" without breaking existing OAuth callback at `/~oauth`.
- Whether transactional email infra is already scaffolded (will check `supabase/functions/send-transactional-email`); if not, scaffold it as part of step 2.

---

## Open question (one)

For the **QR quick sign-in** — should the signed-out device show the QR (and the signed-in phone scans it), or the reverse (signed-in phone shows a QR, signed-out device scans)? Discord uses the first; Roblox uses the second. The plan above assumes the Discord pattern (signed-out shows, signed-in scans) because most desktops can display a QR but few have cameras. Confirm or I'll go with Discord-style.