# Fix Vybe Auth, Passkeys, Email Verification & NFC

This is a large, cross-cutting audit. I want your sign-off before touching ~15+ files and edge functions, because some changes (RP ID, asset-association files, DB schema) have downstream consequences for already-issued passkeys.

## Scope

Five problem areas, fixed at the root — not just the UI:

1. **Email verification** — find why `failed to send verification code` fires and fix the actual send path.
2. **Passkey registration** (web + mobile) — bind credentials to the signed-in user, fix RP ID, fix Despia WebView flow.
3. **Native passkey binding** for Android (`com.despia.vybe`) and iOS via `assetlinks.json` and `apple-app-site-association`.
4. **Native NFC** for Despia Android and iOS, with Web NFC as Android-browser fallback only.
5. **Security screen UI** — verification status, passkey list (name / created / last used / remove), NFC test, clear error states.

## Plan

### 1. Email verification
- Audit `supabase/functions/auth-passkey-*` siblings to find the email OTP / verification function (likely `auth-email-otp-send` or similar).
- Check edge function logs for the real failure (provider key, rate limit, sender domain).
- Replace generic error toasts with structured server logs + clear UI messages (`Email not allowed`, `Rate limited`, `Provider misconfigured`).
- Add a **Resend code** button with 30s cooldown + loading state.
- Verify it works on prod web, Android shell, iOS shell (redirect URLs, callback URLs).

### 2. Passkey registration & login (real fix)
- **Gate registration** behind `supabase.auth.getSession()` — abort with clear error if no user.
- Backend (`auth-passkey-register-options`) already uses `user.id` — verify and add structured logs.
- Backend (`auth-passkey-register-verify`) — confirm credential row is inserted with `user_id` and reject if insert fails.
- Frontend (`src/lib/passkeys.ts`) — wrap `startRegistration` with explicit stage logs:
  `session_check → options_created → credential_created → verify_result → db_insert`.
- Login path: same stage logs + counter update + correct session creation.
- Reject duplicate credential_id with friendly error.

### 3. WebAuthn RP ID & origins
- Add `VITE_PUBLIC_WEBAUTHN_RP_ID=vybehub.app` and `VITE_PUBLIC_WEBAUTHN_RP_NAME=Vybe` (documented in `.env.example` since `.env` is auto-managed).
- Update `supabase/functions/_shared/passkey-rp.ts` to:
  - Always use `vybehub.app` as RP ID in production (no preview/lovableproject domains).
  - Accept origins: `https://vybehub.app`, `https://www.vybehub.app`, `capacitor://localhost`, `https://localhost`, and Despia WebView origin.
  - Keep preview origin isolated (already done) so preview passkeys never leak to prod.

### 4. Native app association files
- **`public/.well-known/assetlinks.json`** — replace current placeholder with array containing:
  - `delegate_permission/common.handle_all_urls` (app links)
  - `delegate_permission/common.get_login_creds` (delegated WebAuthn)
  - `package_name: com.despia.vybe`
  - `sha256_cert_fingerprints: ["ANDROID_SHA256_CERT_FINGERPRINT_HERE"]`
- **`public/.well-known/apple-app-site-association`** — replace TEAMID placeholder:
  - `appIDs: ["APPLE_TEAM_ID_HERE.IOS_BUNDLE_ID_HERE"]`
  - Both `webcredentials` and `applinks` blocks
- **`docs/NATIVE_AUTH_SETUP.md`** (new) — explains where to find each placeholder (Play Console → App signing, Apple Developer → Membership) and how to deploy.

### 5. Despia mobile passkey behavior
- Inside Despia shell: keep existing native Storage Vault biometric path (`despiaVault.ts`) — it's the correct pattern when WebAuthn is blocked by the WebView.
- If neither WebAuthn nor Despia bridge is available, show: *"Passkeys need the latest VYBE app or Chrome/Safari at vybehub.app — open there to add one."*
- Make sure the registration call from inside the app does NOT use Lovable preview URLs — always hit prod domain endpoints.

### 6. Database — `user_passkeys` table
Existing table has: `credential_id`, `public_key`, `counter`, `transports`, `device_name`. Need to add:
- `device_type` (text, `singleDevice` | `multiDevice`)
- `backed_up` (boolean)
- `last_used_at` (already exists per verify code — confirm)
- RLS: users read/delete own credentials only; INSERT only via service role (edge function).

Migration via `supabase--migration` — will request your approval first.

### 7. NFC
- **Android (`android-resources/`)** — add to a new `AndroidManifest.partial.xml` snippet doc:
  - `<uses-permission android:name="android.permission.NFC" />`
  - `<uses-feature android:name="android.hardware.nfc" android:required="false" />`
- Update `src/hooks/useNFC.ts` (already routes to Despia bridge `nfcread://`) — confirm fallbacks: Despia native → Web NFC (Android Chrome) → unsupported message.
- iOS — document `NFCReaderUsageDescription` + Core NFC entitlement in `docs/IOS_SETUP.md`.
- Add **NFC Test** button in Security screen with status: scanning / success(payload) / unsupported / disabled / error.

### 8. Security screen UI
Add or update `src/pages/Security.tsx` (or extend existing settings page):
- Email verification status badge + Resend button (cooldown)
- Passkey list: device name, created, last used, remove
- Add Passkey button (gated on session)
- NFC: status + Start Scan button + result panel
- Clear error states throughout

### 9. Logs & errors
Add structured `console.log('[passkey:stage]', { ... })` and edge function logs at every stage listed in your spec. Replace generic toasts with mapped messages.

## Technical Notes

- The current `passkey-rp.ts` already has the right shape — needs RP ID hardcoded to `vybehub.app` for prod, plus Despia origin allowlisted.
- Existing Despia Storage Vault path (`despiaVault.ts`) is preserved — it's the correct workaround for WebAuthn-blocked WebViews. We're not replacing it, just making sure web WebAuthn works in parallel.
- I will NOT modify `src/integrations/supabase/{client,types}.ts` or `.env`.
- DB migration will be a separate approval step.

## Final Checklist (values you'll need to provide after I ship)

1. **Production domain** — confirming `vybehub.app` (already in code).
2. **Android SHA-256 fingerprint** — from Play Console → Setup → App signing → "App signing key certificate" → SHA-256.
3. **Apple Team ID** — from developer.apple.com → Membership.
4. **iOS bundle ID** — from App Store Connect / Xcode (probably `com.despia.vybe` to match Android, or your assigned iOS one).
5. **Email provider status** — confirm Lovable Cloud auth emails are enabled and which template (signup/magiclink/recovery) the OTP path uses, OR if a custom SMTP is configured.
6. **Despia native bridge support** — confirm with Despia support that `biometric://`, `nfcread://`, and `revenuecat://purchase` schemes are enabled for `com.despia.vybe`.

---

**Scope of files I'll touch (~15):**
- `supabase/functions/_shared/passkey-rp.ts`
- `supabase/functions/auth-passkey-register-options/index.ts`
- `supabase/functions/auth-passkey-register-verify/index.ts`
- `supabase/functions/auth-passkey-login-verify/index.ts`
- The email OTP edge function (TBD after audit)
- `src/lib/passkeys.ts`
- `src/lib/despiaVault.ts` (minor)
- `src/hooks/useNFC.ts` (verify only)
- `src/pages/Security.tsx` (new or updated)
- `public/.well-known/assetlinks.json`
- `public/.well-known/apple-app-site-association`
- `docs/NATIVE_AUTH_SETUP.md` (new)
- `docs/IOS_SETUP.md` (NFC additions)
- `.env.example` (new)
- One DB migration

Approve and I'll start with the email-verification audit (logs + edge function) so we fix the most user-blocking bug first, then move through passkeys, association files, NFC, and the Security UI.
