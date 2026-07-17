# Despia Native Auth Support Request

**Product:** VYBE (`com.despia.vybe`)  
**Domain:** https://vybehub.app  
**Firebase project:** `vybe-daaab`  
**Date:** 2026-07-17

## Why we need this

VYBE’s store builds run inside Despia’s WKWebView. Today social login uses:

| Provider | iOS today | Problem |
|----------|-----------|---------|
| Google | `oauth://` → ASWebAuthenticationSession → `native-callback.html` → `oauthDismiss` → `com.despia.vybe://oauth/auth?hc=` | Safari “address is invalid”, sheet often requires manual **Done**, blank pages |
| Apple | Apple JS SDK (`usePopup`) in WebView | Blank browser sheet, “Sign in failed”, callback races |

We need **true native** AuthenticationServices (Apple) and Google Sign-In SDK, returning tokens to the WebView over a secure bridge — **no** ASWeb callback page, **no** `oauthDismiss`, **no** custom-scheme navigation for the happy path.

Despia’s documented auth surface for Firebase apps is only `oauth://`. Clerk’s native Apple path (`clerk://manual?method=apple`) is unavailable to us (we use Firebase Auth, not Clerk).

## Requested bridge methods

### Launch (WebView → native)

```text
nativeauth://apple?requestId=<uuid>&nonceHash=<sha256_hex_of_raw_nonce>
nativeauth://google?requestId=<uuid>
```

### Result (native → WebView)

Deliver via the same channel Despia already uses for `oauth://` returns (`despia` / `webkit.messageHandlers.despia` / watched keys). Prefer a single watched object key, e.g. `nativeAuthResult`.

**Success payload (JSON):**

```json
{
  "ok": true,
  "provider": "apple",
  "requestId": "…",
  "idToken": "…",
  "accessToken": "…",
  "authorizationCode": "…",
  "rawNonce": "…",
  "email": "…",
  "givenName": "…",
  "familyName": "…"
}
```

**Failure payload:**

```json
{
  "ok": false,
  "provider": "apple",
  "requestId": "…",
  "code": "cancelled",
  "message": "optional safe string"
}
```

`code` must be one of: `cancelled` | `network_error` | `configuration_error` | `missing_token` | `provider_error` | `bridge_error` | `unknown`.

**Security:** Never put tokens in URL query strings, Universal Links, or analytics. Return only through the bridge payload.

## Apple (AuthenticationServices) — required Swift behavior

1. Generate nothing on the native side for the nonce — WebView sends `nonceHash` (SHA-256 hex of a raw nonce it keeps in memory).
2. Set `ASAuthorizationAppleIDRequest.nonce` to that hash.
3. Present `ASAuthorizationController` with scopes **fullName** + **email**.
4. On success, convert `identityToken` Data → UTF-8 string; include `authorizationCode` when present; include email / givenName / familyName **only when Apple supplies them** (first authorize).
5. Return `rawNonce` **only if** native also generated it — preferred: WebView keeps raw nonce and matches `requestId`; if native must own nonce, return both `rawNonce` and hashed request consistency documented.
6. Map `ASAuthorizationError.canceled` → `code: cancelled` (no error UI).
7. Optional: `getCredentialState` support for later (authorized / revoked / transferred / notFound).

## Google Sign-In iOS SDK — required behavior

1. Configure with the Firebase **iOS** client ID from the correct `GoogleService-Info.plist` for bundle `com.despia.vybe`.
2. Ensure reversed client ID URL scheme is in the final Info.plist.
3. Present Google Sign-In from the visible root `UIViewController`.
4. Return `idToken` + `accessToken` to the WebView with the same `requestId`.
5. Map user cancel → `code: cancelled`.

## WebView consumption (VYBE side — already scaffolded)

When bridge is available and feature flag `native_ios_auth_v1` is on:

1. `signInWithCredential` with Apple (`OAuthProvider('apple.com')` + `rawNonce`) or Google (`GoogleAuthProvider.credential(idToken, accessToken)`).
2. Existing profile claim / UID preserved.
3. **Must never** open `https://vybehub.app/native-callback.html` or call `oauthDismiss` on this path.

## Entitlements / console checklist

- [ ] Sign in with Apple capability on the Despia iOS App ID
- [ ] Services ID / app ID alignment with Firebase Apple provider (we can keep `com.despia.vybe.web` for browser-only)
- [ ] GoogleService-Info.plist for `com.despia.vybe` + reversed client ID scheme
- [ ] Firebase Auth Google + Apple providers enabled for project `vybe-daaab`

## Acceptance tests (TestFlight)

**Apple**

1. Tap Continue with Apple → only Apple system sheet (Face ID / password).
2. No Safari, blank page, `native-callback`, or “invalid address”.
3. Sheet auto-dismisses; VYBE shows signed-in home.
4. Cancel → return to login, no “Sign in failed” toast.
5. Restart app → session restored.

**Google**

1. Tap Continue with Google → native account chooser (not ASWeb Google page as the primary UX).
2. Same no-callback / no-invalid-address / auto-dismiss requirements.
3. Cancel silent; restart restores Firebase session.

## What we will keep until you ship this

- Current `oauth://` + `native-callback.html` + `oauthDismiss` for Google (and Android Apple).
- Apple JS SDK on iOS as interim.
- Web `signInWithPopup` / redirect for Safari / desktop only.

## Contact

Reply with: whether `nativeauth://` (or your preferred scheme names) can be enabled on `com.despia.vybe`, ETA for a TestFlight binary, and the exact watched key name for the result payload.
