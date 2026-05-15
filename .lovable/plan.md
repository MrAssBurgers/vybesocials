# Fix VYBE Passkeys + Mobile Biometrics

## Goal
Stop the mobile crash, delete the fake "Face ID / Touch ID" toggle, and ship one real account-bound passkey system that uses the device's native passkey sheet on every platform. Match Discord's UX.

## What's wrong today
1. `BiometricLockCard` calls a Despia `bioauth://` bridge and a Capacitor biometric plugin that crash inside the Despia Android shell — this is the toggle the user is tapping.
2. That toggle is labeled like account passkey setup but only stores a localStorage flag (`vybe.bioauth.enabled`) — it never registers a passkey.
3. The real WebAuthn flow (`PasskeysCard`, `src/lib/passkeys.ts`, `auth-passkey-*` edge functions) is correct but lives in a separate card, so users hit the broken one first.
4. Inside the Despia Android WebView, `navigator.credentials.create` throws cryptic `rpId`/origin errors instead of opening the system sheet, because the shell isn't wired to Android Credential Manager and `assetlinks.json` isn't trusted by the installed APK.

## Plan

### 1. Delete the broken biometric toggle
- Remove `BiometricLockCard` from Settings and from any Security/Account screen that imports it.
- Delete `src/hooks/useBiometricLoginGate.ts` usage from the app shell (the launch gate that sometimes signs the user out on Despia).
- Delete `src/lib/biometrics.ts` and `src/lib/despiaBiometrics.ts` (no fake biometric API surface left in the app).
- Drop `@aparajita/capacitor-biometric-auth` and the Despia biometric bridge from `package.json`.
- Clear the `vybe.bioauth.enabled` localStorage key on next launch so old installs don't stay "locked".

Result: no code path in the app pretends to scan a face or fingerprint. The only biometric prompt that ever appears is the OS-owned passkey sheet.

### 2. Make `PasskeysCard` the single source of truth
Keep the existing card but tighten it to the Discord pattern:
- Settings → "Passkeys" row, with subtitle "Sign in with Face ID, Touch ID, fingerprint, Windows Hello, or a security key."
- "Add a passkey" button → states: idle → prompting (spinner + "Use your device passkey to continue…") → success ("Added") → error (inline message, returns to idle).
- List of saved passkeys with device name, created date, last used, rename (pencil), delete (trash).
- "Sign in with passkey" button on `/auth` already exists — keep it, fix copy: "No passkey found for this account" / "…on this device" / "Create an account first, then add a passkey in Settings."
- All errors go through `classifyPasskeyError`:
  - `NotAllowedError` / `AbortError` / "Cancelled" → silent return to idle.
  - Unsupported → "Passkeys are not supported on this device yet."
  - Verification failure → "Passkey setup failed. Try again."

### 3. Native bridges for the app shells
Web + Capacitor iOS WKWebView + Capacitor Android already work via WebAuthn once Associated Domains and `assetlinks.json` are correct. The Despia Android shell is the one that can't open the system sheet.

- **iOS (Capacitor)**: ship `apple-app-site-association` with the real Team ID + bundle ID (`TEAMID.app.lovable.416714c8d0134aff984d522418a9bbc7`) and add `webcredentials:vybehub.app` to the iOS app's Associated Domains entitlement (documented in `docs/IOS_SETUP.md`). After this, WKWebView opens the iOS passkey sheet automatically — no custom UI.
- **Android (Capacitor)**: keep `public/.well-known/assetlinks.json` with the production Play signing SHA-256 + the debug SHA-256, plus the `delegate_permission/common.get_login_creds` entry so Credential Manager trusts `vybehub.app ↔ app.lovable.416714c8d0134aff984d522418a9bbc7`. Once trusted, Android's Credential Manager handles WebAuthn calls inside the WebView automatically.
- **Despia Android shell**: WebAuthn inside Despia's WebView is unreliable. Detect it (`isAndroidWebViewShell()`), and instead of throwing, show: "To add a passkey, open VYBE in Chrome once — your passkey will then work in the app." Add a one-tap "Open in Chrome" deep link. This is the same fallback Discord uses for unsupported shells.
- **Real Despia bridge (optional, only if Despia exposes one)**: if Despia ships a `passkey://` URL scheme, wire it through `src/lib/passkeys.ts` so registration/login flow through the same backend routes. If they don't, the Chrome fallback above is the production answer.

### 4. Backend (already deployed — verify only)
The four edge functions exist and bind credentials to the Supabase user:
- `auth-passkey-register-options` (authenticated)
- `auth-passkey-register-verify` (authenticated, verifies + stores `credential_id`, `public_key`, `counter`, `transports`, `device_name`, `created_at`)
- `auth-passkey-login-options` (discoverable + email modes)
- `auth-passkey-login-verify` (verifies, bumps counter, mints magic link → session)

Add two missing endpoints to round out the spec:
- `GET` list (already covered client-side by direct `user_passkeys` select with RLS — leave as-is).
- `DELETE` one passkey (already covered by RLS-protected delete — leave as-is).

Confirm RLS on `user_passkeys`: select/insert/update/delete only where `user_id = auth.uid()`.

### 5. Crash hardening
- Every `startRegistration` / `startAuthentication` call wrapped in try/catch with `classifyPasskeyError`.
- No `await` on a missing native plugin — feature-detect before calling.
- Remove the visibility-change biometric gate so resuming the app never triggers a sign-out.

## Technical details

Files removed:
- `src/components/settings/BiometricLockCard.tsx`
- `src/hooks/useBiometricLoginGate.ts`
- `src/lib/biometrics.ts`
- `src/lib/despiaBiometrics.ts`
- usages in `App.tsx` / settings page

Files kept and tightened:
- `src/components/settings/PasskeysCard.tsx` — single Passkeys row, Discord states.
- `src/lib/passkeys.ts` — keep `classifyPasskeyError`, `isAndroidWebViewShell`, add `openInChromeFallback()`.
- `src/pages/Landing.tsx` — passkey sign-in button copy.
- `public/.well-known/assetlinks.json` — needs **real** Play signing SHA-256 from the user (placeholder won't work on installed APK).
- `public/.well-known/apple-app-site-association` — needs **real** Apple Team ID from the user.
- `capacitor.config.ts` / iOS entitlements — Associated Domains: `webcredentials:vybehub.app applinks:vybehub.app`.

Backend: no schema changes. `user_passkeys` table already stores `credential_id, public_key, user_id, counter, transports, device_name, created_at, last_used_at`.

## What I need from you before this fully works on installed apps
1. **Android Play signing SHA-256 fingerprint** (from Play Console → App signing) so `assetlinks.json` trusts the installed APK. Without this, Android passkeys inside the app fall back to "open in Chrome".
2. **Apple Team ID** (10-char) so `apple-app-site-association` is valid. Without this, iOS passkeys inside the app fall back to Safari.

Everything else (web, Lovable preview, Capacitor dev builds with the dev SHA) will work as soon as I ship the code changes.