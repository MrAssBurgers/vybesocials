# Sign in with Apple — Firebase setup

## Status

- Firebase **Services ID** field is now set to **`com.despia.vybe.web`**
- Team ID / Key / `.p8` already configured
- You must create that Services ID in Apple Developer or Apple keeps returning **403**

## Client behavior (Despia)

| Platform | Method | File |
|----------|--------|------|
| iOS Despia | Apple JS SDK native Face ID / Continue sheet (`usePopup: true`) | `src/lib/appleSignIn.ts` |
| Android Despia | `oauth://` → Apple → **form_post** → `/apple-callback` (Cloud Function) → `hc=` deeplink | `src/lib/despiaOAuth.ts` + `functions/src/auth.ts` `appleOAuthCallback` |
| Desktop / Safari | Apple JS or Firebase redirect | `src/lib/nativeOAuth.ts` |

iOS does **not** use full-page Safari for Apple when the JS sheet works.
Landing preloads the Apple script so the first tap feels instant.

**Android note:** Apple requires `response_mode=form_post` whenever `name` or `email`
scopes are requested. A static HTML page cannot read POST bodies, so Android
uses `https://vybe-daaab.firebaseapp.com/apple-callback` (Firebase Hosting →
`appleOAuthCallback`). Do not use `vybehub.app/apple-callback` (Lovable SPA).

## Create Services ID (required)

1. https://developer.apple.com/account/resources/identifiers/list/serviceId → **+**
2. Identifier **exactly:** `com.despia.vybe.web`
3. Enable **Sign In with Apple** → Configure:
   - Primary App ID: `com.despia.vybe`
   - Domains: `vybe-daaab.firebaseapp.com`, `vybehub.app`
   - Return URLs:
     - `https://vybe-daaab.firebaseapp.com/__/auth/handler`
     - `https://vybehub.app/native-callback.html` ← Apple JS (iOS) redirectURI
     - `https://vybe-daaab.firebaseapp.com/apple-callback` ← **required for Android oauth:// form_post**
       (Hosting rewrite → `appleOAuthCallback`; do **not** use `vybehub.app/apple-callback` — Lovable SPA ignores POST)
4. Save / Register
5. Retry Continue with Apple (Android: Custom Tabs sheet → back in app signed in)

## Auto-link / existing accounts

- Keep Firebase Auth **one account per email** enabled.
- After success the client calls `claim_profile_by_email` so Firestore profiles
  merge by email (username / bio / avatar are not wiped by empty OAuth fields).
- If Auth returns `auth/account-exists-with-different-credential`, the UI tells
  the user to sign in with the existing method and link in Settings → Connections.

## Publish + deploy

1. `firebase deploy --only functions:appleOAuthCallback,hosting` (staging Hosting rewrite) — **done**
2. Apple Services ID → add return URL `https://vybe-daaab.firebaseapp.com/apple-callback`
3. **Lovable → Share → Publish** so the Android client builds authorize URL with `form_post` + that callback
4. Retry Apple on Android: Custom Tabs → account → back in app signed in

If you already use a different Services ID string, tell Cursor that exact ID so Firebase can be patched to match.
