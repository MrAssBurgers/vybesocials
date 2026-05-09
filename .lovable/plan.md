## Root cause

This app ships as a **Capacitor** native app (see `capacitor.config.ts`), not as a Despia shell. But the entire biometric layer (`src/lib/despiaBiometrics.ts`, `BiometricLockCard`, `useBiometricLoginGate`, `BiometricLoginGate`) is gated by `isDespia()`, which checks for `"despia"` in the user-agent. On iOS/Android Capacitor that check is always **false**, so:

- The Face ID / Touch ID toggle silently shows the "Open VYBE in the mobile app" toast and never actually enables anything.
- The launch-time biometric gate never runs.
- "Test biometric prompt" does nothing.

The passkey flow uses pure WebAuthn (`@simplewebauthn/browser`). Inside the Capacitor WebView the page origin is `capacitor://localhost` (iOS) / `https://localhost` (Android) which does **not** match the RP ID derived from `https://vybehub.app`, so `navigator.credentials.create()` is rejected by the OS — that's why "Add passkey" fails in the app. In a normal mobile browser it works; in the wrapped app it can't.

## Plan

### 1. Add a real Capacitor biometric plugin
Install `@aparajita/capacitor-biometric-auth` (actively maintained, supports Face ID, Touch ID, Android BiometricPrompt, fallback to device passcode).

### 2. Replace `src/lib/despiaBiometrics.ts` with a platform-aware wrapper
New file `src/lib/biometrics.ts` that:
- Detects environment in this order: **Capacitor native** → **Despia** (kept as fallback) → web.
- Exposes the same API the rest of the app already uses: `isBiometricsAvailable()`, `requestBioAuth()`, `confirmWithBiometrics()`, `getBioAuthPref()`, `setBioAuthPref()`.
- On Capacitor: calls `BiometricAuth.checkBiometry()` then `BiometricAuth.authenticate({ reason, allowDeviceCredential: true, iosFallbackTitle: 'Use Passcode', androidTitle: 'Unlock VYBE' })`. Maps `biometryNotAvailable` / `biometryNotEnrolled` → `unavailable`, user cancel → `failed`.
- Keeps the Despia code path for backward compatibility but stops being the only path.

Re-export from `src/lib/despiaBiometrics.ts` so existing imports keep working without churn.

### 3. Update the three consumers to use the unified API
- `BiometricLockCard.tsx`: replace `isDespia()` with `isBiometricsAvailable()` (async, resolved on mount). Update copy from "Open VYBE in the mobile app" → "Not available on this device" only when the platform truly can't do it. Keep the disabled-state UX.
- `useBiometricLoginGate.ts`: drop the `isDespia()` early-return; call the new wrapper; keep the 2-min background threshold and sign-out-on-fail behavior.
- `BiometricLoginGate.tsx`: unchanged (just consumes the hook).

### 4. Fix passkey "Add" failure inside the Capacitor app
WebAuthn cannot run inside the Capacitor WebView with our current RP ID. Two changes:
- **In `PasskeysCard.tsx`**: when running inside Capacitor (`Capacitor.isNativePlatform()`), hide the in-app "Add" button and show: *"Add a passkey from a browser at vybehub.app, then sign in here with Face ID / Touch ID."* This avoids the silent failure.
- **Keep the web flow as-is**; passkeys created in mobile Safari/Chrome at `vybehub.app` will sync via iCloud Keychain / Google Password Manager and become usable for sign-in inside the app via the existing `signInWithPasskey` action-link flow (which works because verification happens server-side, not in the WebView).
- Optional follow-up (not in this change): integrate `@capgo/capacitor-native-biometric` + a custom ASWebAuthenticationSession deep link if true in-app passkey enrollment is needed later.

### 5. Native config required for biometrics
- iOS: add `NSFaceIDUsageDescription` to `ios/App/App/Info.plist` ("VYBE uses Face ID to keep your account secure.").
- Android: the plugin handles permissions; no manifest edit needed.
- Tell the user to run `npx cap sync` after the install.

### Files touched
- new: `src/lib/biometrics.ts`
- edit: `src/lib/despiaBiometrics.ts` (now a thin re-export)
- edit: `src/components/settings/BiometricLockCard.tsx`
- edit: `src/hooks/useBiometricLoginGate.ts`
- edit: `src/components/settings/PasskeysCard.tsx`
- edit: `ios/App/App/Info.plist` (Face ID usage string)
- install: `@aparajita/capacitor-biometric-auth`

### Verification
1. In preview (web): toggle Face ID → shows "Not available on this device" (correct, no biometric in browser).
2. In the iOS app: toggle Face ID → system Face ID prompt appears → success persists pref → next cold start re-prompts before the UI loads.
3. In the iOS app: PasskeysCard shows the "Add from browser" hint instead of failing.
4. In mobile Safari at vybehub.app: Add passkey works → re-open the app → Sign in with Passkey succeeds.