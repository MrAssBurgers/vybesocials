# Native iOS Auth — Repository Audit (2026-07-17)

## Verdict

**True native AuthenticationServices / Google Sign-In SDKs are not available in the Despia store binary used by VYBE.** Despia exposes `oauth://` (ASWeb/CCT) only. Clerk’s native Apple bridge is unused (Firebase Auth).

Web scaffold lives under `src/lib/nativeAuth/` behind flag `native_ios_auth_v1`. It activates only when the Despia bridge advertises native auth. Until then, existing Despia/Apple JS paths remain.

See [DESPIA_NATIVE_AUTH_SUPPORT_REQUEST.md](./DESPIA_NATIVE_AUTH_SUPPORT_REQUEST.md).

## Current sources

| Area | Path |
|------|------|
| Bridge | `src/lib/despiaBridge.ts` |
| Router | `src/lib/nativeOAuth.ts` |
| Despia OAuth | `src/lib/despiaOAuth.ts` |
| Apple JS | `src/lib/appleSignIn.ts` |
| Native scaffold | `src/lib/nativeAuth/*` |
| Auth state | `src/lib/auth.tsx`, `src/lib/firebase/authService.ts` |
| Callback | `public/native-callback.html` |
| CF | `functions/src/auth.ts` (`authQr`, `oauthDismiss`) |

## Ship channels

| Change | Channel |
|--------|---------|
| React / nativeAuth / flags / callback HTML | Lovable Publish |
| authQr / oauthDismiss | Firebase Functions |
| ASAuthorization / GIDSignIn / plist / schemes | **Despia iOS rebuild** |
