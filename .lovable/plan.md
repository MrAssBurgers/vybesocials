## What I’ll fix

The current issue is two separate things getting mixed together:

1. **Passkeys should work like Discord**: tap sign in, the phone shows the native passkey/Face ID/fingerprint picker, then VYBE signs in with the saved credential.
2. **Samsung WebView crash prompt**: Android WebView instability can crash the app before passkey UI appears, especially in a wrapped Despia/WebView app.

## Key problems found

- The app has a real WebAuthn/passkey flow, but the Android credential association file still contains a placeholder SHA-256 fingerprint, so Android cannot fully trust the app/site relationship for app-style passkeys.
- Android resource IDs are inconsistent: `capacitor.config.ts` uses `app.lovable.416714c8d0134aff984d522418a9bbc7`, but `android-resources/values/strings.xml` and `manifest.webmanifest` still reference an older `app.lovable.762a...` ID.
- The Face ID / Touch ID toggle is an app-lock preference, not true account passkey registration. I’ll make the UI separate those clearly and route users to add a real passkey for Discord-style login.
- The WebView crash cannot be fully fixed from React code if Samsung’s Android System WebView is broken, but I can reduce passkey crashes by detecting risky WebView/native runtimes and giving a safer path/message instead of failing silently.

## Implementation plan

1. **Unify app identity for Android/passkeys**
   - Update Android-facing resource values and web manifest IDs to the current app ID.
   - Keep passkeys bound to `vybehub.app` so web + app can share credentials.

2. **Make passkey registration more Discord-like**
   - Update the Settings passkey card copy/actions so “Add” clearly triggers the system Face ID/fingerprint/passkey sheet.
   - Improve `registerPasskey()` error handling so Android/WebView origin/RP/Digital Asset Link failures show the real fix instead of a generic failure.
   - Keep discoverable credential login enabled so users can sign in without typing an email when supported.

3. **Fix mobile passkey association blockers**
   - Update `assetlinks.json` structure to support credential sharing correctly.
   - Keep the signing fingerprint placeholder visible if the real Play/App signing SHA-256 is not known; passkeys will require replacing that with the real Despia/Play signing fingerprint before app-native credential sharing can work on Android.

4. **Separate biometric app lock from passkeys**
   - Adjust the Face ID / Touch ID lock card so it does not look like account passkey setup.
   - If biometrics are unavailable/not enrolled, keep the Settings guidance, but do not claim a passkey was created.

5. **Add Samsung/WebView guardrails**
   - Detect Samsung Android WebView/native WebView when passkey APIs are missing or unstable.
   - Show a short actionable message: update Android System WebView/Chrome or open VYBE in Chrome to add/sign in with passkey.
   - Avoid telling the user to uninstall updates as the app’s own fix.

## Important note

If the installed Despia APK is signed with a package/certificate that does not match `assetlinks.json`, Android passkeys will still fail. I can prepare the app-side files, but the final APK signing SHA-256 must be added to `public/.well-known/assetlinks.json` for Android to trust VYBE like Discord.