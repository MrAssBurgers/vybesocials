# Fix Face ID / Touch ID Enable Flow

## Problem
When you toggle **Face ID / Touch ID** on in Settings → Security on your phone, it shows "No Face ID / Touch ID set up on this device" instead of triggering the system biometric prompt to scan your face/fingerprint and save it.

## Root cause
Two issues in the current flow:

1. **`isBiometricsAvailable()` only returns true inside Despia.** In the Capacitor native Android build (what's going on the Play Store), `isDespia()` is false, so the toggle is permanently disabled and shows the "not available" hint — the user can never even tap it.
2. **`requestBioAuth()` only calls the Despia `bioauth://` URL scheme.** It has no Capacitor path, so even if we enabled the toggle, tapping it wouldn't actually open Android's BiometricPrompt.

## Fix

### 1. Add Capacitor biometric support
Use `@aparajita/capacitor-biometric-auth` (already a common Capacitor plugin) for the native Android/iOS path.

- Install plugin, add to `capacitor.config.ts` if needed.
- In `src/lib/biometrics.ts`:
  - `isBiometricsAvailable()` → if `Capacitor.isNativePlatform()`, call `BiometricAuth.checkBiometry()` and return true when `isAvailable` is true OR when `reason === 'biometryNotEnrolled'` (so we can guide the user to enroll). Fall back to existing Despia check, then false on web.
  - `requestBioAuth()` → if native, call `BiometricAuth.authenticate({ reason: 'Unlock VYBE', cancelTitle: 'Cancel', allowDeviceCredential: true })`. Map result to `{ ok: true }` / `{ ok: false, reason: 'unavailable' | 'failed' }`. If error code is `biometryNotEnrolled`, return `reason: 'not-enrolled'` (new variant) so UI can deep-link to system settings.

### 2. Handle "not enrolled" properly in `BiometricLockCard`
Right now we show a dead-end toast. Instead:
- If `requestBioAuth()` returns `reason: 'not-enrolled'`, show a toast **"Set up Face Unlock or Fingerprint in your phone's Settings, then come back."** with an action button that opens Android Settings via `App.openUrl({ url: 'app-settings:' })` or the native intent `android.settings.BIOMETRIC_ENROLL`.
- After they return to the app (visibility change), re-check availability and prompt again automatically.

### 3. Update `BioAuthResult` type
Add `'not-enrolled'` to the `reason` union so callers (login gate, sensitive action confirms) handle it without treating it as a hard failure.

### 4. Login gate behavior
`useBiometricLoginGate` already signs the user out on failure. Update so `not-enrolled` clears the pref (`setBioAuthPref(false)`) and unlocks instead of signing out — otherwise users get locked out by simply removing their fingerprint.

## Files touched
- `src/lib/biometrics.ts` — add Capacitor path, new result reason
- `src/components/settings/BiometricLockCard.tsx` — handle not-enrolled, deep-link to system settings
- `src/hooks/useBiometricLoginGate.ts` — graceful not-enrolled handling
- `package.json` — add `@aparajita/capacitor-biometric-auth`

No DB or backend changes. After merging you'll need `npx cap sync android` locally before the next Android build.

## What you'll see after the fix
Tap the toggle on your phone → Android's native fingerprint/face prompt appears → on success the toggle stays on and biometric lock is enabled. If no biometrics are enrolled on the device, you get a clear message with a button to jump straight into the system enrollment screen.
