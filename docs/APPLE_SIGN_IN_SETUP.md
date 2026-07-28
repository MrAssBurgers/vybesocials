# Sign in with Apple — Firebase setup

## Status

- Firebase **Services ID** field is now set to **`com.despia.vybe.web`**
- Team ID / Key / `.p8` already configured
- You must create that Services ID in Apple Developer or Apple keeps returning **403**

## Client behavior (Despia)

| Platform | Method | File |
|----------|--------|------|
| iOS Despia | `oauth://` → Apple system auth sheet → `native-callback.html` → `hc=` | `src/lib/despiaOAuth.ts` |
| Android Despia | `oauth://` → Apple secure browser (fragment, no name/email scope) → `native-callback.html` → `hc=` | `src/lib/despiaOAuth.ts` |
| Desktop / Safari | Apple JS or Firebase redirect | `src/lib/nativeOAuth.ts` |

The Apple JS SDK is never loaded inside Despia. It produced an opaque `unknown`
error in the WKWebView, so both store shells use the bounded `oauth://` handoff.
Capacitor builds use the native Firebase Authentication plugin. A future Despia
`nativeauth://` bridge is already supported behind capability detection.

**Android note:** Apple requires `response_mode=form_post` when `name`/`email`
scopes are requested. That needs a Cloud Function POST handler. After
`appleOAuthCallback` hit Cloud Run CPU quota (503 / infinite spinner), Android
uses **fragment + `https://vybehub.app/native-callback.html`** with **no**
name/email scope (same working path as Google).

## Create Services ID (required)

1. https://developer.apple.com/account/resources/identifiers/list/serviceId → **+**
2. Identifier **exactly:** `com.despia.vybe.web`
3. Enable **Sign In with Apple** → Configure:
   - Primary App ID: `com.despia.vybe`
   - Domains: `vybehub.app`, `vybe-daaab.firebaseapp.com`
   - Return URLs:
     - `https://vybe-daaab.firebaseapp.com/__/auth/handler`
     - `https://vybehub.app/native-callback.html` ← Despia iOS + Android oauth://
4. Save / Register
5. Retry Continue with Apple

## Auto-link / existing accounts

- Keep Firebase Auth **one account per email** enabled.
- After success the client calls `claim_profile_by_email` so Firestore profiles
  merge by email (username / bio / avatar are not wiped by empty OAuth fields).
- If Auth returns `auth/account-exists-with-different-credential`, the UI tells
  the user to sign in with the existing method and link in Settings → Connections.

## Publish

**Lovable → Share → Publish** after client changes so store builds pick up the
current fragment authorize URL (not the broken form_post Cloud Function path).

If you already use a different Services ID string, tell Cursor that exact ID so Firebase can be patched to match.
