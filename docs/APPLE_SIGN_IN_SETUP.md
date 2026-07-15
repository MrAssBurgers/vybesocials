# Sign in with Apple — Firebase setup

## Status

- Firebase **Services ID** field is now set to **`com.despia.vybe.web`**
- Team ID / Key / `.p8` already configured
- You must create that Services ID in Apple Developer or Apple keeps returning **403**

## Client behavior (Despia)

| Platform | Method | File |
|----------|--------|------|
| iOS Despia | Apple JS SDK native Face ID / Continue sheet (`usePopup: true`) | `src/lib/appleSignIn.ts` |
| Android Despia | `oauth://` secure browser → `native-callback.html` → `hc=` handoff | `src/lib/despiaOAuth.ts` |
| Desktop / Safari | Apple JS or Firebase redirect | `src/lib/nativeOAuth.ts` |

iOS does **not** use full-page Safari for Apple when the JS sheet works.
Landing preloads the Apple script so the first tap feels instant.

## Create Services ID (required)

1. https://developer.apple.com/account/resources/identifiers/list/serviceId → **+**
2. Identifier **exactly:** `com.despia.vybe.web`
3. Enable **Sign In with Apple** → Configure:
   - Primary App ID: `com.despia.vybe`
   - Domains: `vybe-daaab.firebaseapp.com`, `vybehub.app`
   - Return URLs:
     - `https://vybe-daaab.firebaseapp.com/__/auth/handler`
     - `https://vybehub.app/native-callback.html` ← required for Apple JS redirectURI + Android oauth://
4. Save / Register
5. Retry Continue with Apple in the iPhone app (native sheet)

## Auto-link / existing accounts

- Keep Firebase Auth **one account per email** enabled.
- After success the client calls `claim_profile_by_email` so Firestore profiles
  merge by email (username / bio / avatar are not wiped by empty OAuth fields).
- If Auth returns `auth/account-exists-with-different-credential`, the UI tells
  the user to sign in with the existing method and link in Settings → Connections.

## Publish

Prod Apple + Google OAuth always hit `https://vybehub.app/native-callback.html`.
**Lovable → Share → Publish** after client changes so iOS/Android store builds
pick up silent `hc=` handoff (not a stuck “Open VYBE” page).

If you already use a different Services ID string, tell Cursor that exact ID so Firebase can be patched to match.
