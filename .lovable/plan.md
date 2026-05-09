## Goal

Right now `/signup` hides the passkey button — it only renders when `isLogin === true` (Landing.tsx line 566). You want Face ID / Touch ID / passkey to work as a one‑tap sign‑in from the signup screen too, signing the user into whichever account the passkey was registered to (Apple/Discord/GitHub style).

The good news: the backend already supports this. `auth-passkey-login-options` (discoverable‑credential branch when no email is supplied) plus `auth-passkey-login-verify` already resolve the user from the passkey itself and mint a magic link for the matched account. We just aren't surfacing the button.

## Changes (frontend only — no schema/edge function changes)

### 1. `src/pages/Landing.tsx`

- Lift the passkey button out of the `{isLogin && …}` block so it renders on both Login and Signup.
- Rename label to "Sign in with Face ID / passkey" (with a Fingerprint icon from lucide-react) so the affordance reads correctly on the signup screen.
- Always call `signInWithPasskey(undefined)` from the signup screen (don't pass a typed signup email — that would scope the lookup to a non‑existent account). On the login screen, keep the existing behavior of passing `formData.email || undefined` so a typed email still narrows the picker.
- Toast copy when `signInWithPasskey` returns `null` on the signup screen: "No passkey found on this device — create an account first, then add a passkey in Settings." (On the login screen keep "No passkey found for this device.")
- Place the button directly under the primary submit button on both screens; on signup, also render the small helper line above explaining "Already have a passkey on this device?" so it's obvious why it appears on a signup form.

### 2. No changes to:
- `src/lib/passkeys.ts` — `signInWithPasskey()` already supports the no‑email discoverable flow.
- `supabase/functions/auth-passkey-login-options/index.ts` — already returns discoverable options when `email` is omitted.
- `supabase/functions/auth-passkey-login-verify/index.ts` — already resolves `user_id` from the credential and mints the magic link for the matched account.
- `src/pages/AuthCallback.tsx` — already completes the session from the magic link.
- DB / RLS / `user_passkeys` table.

## How the end‑to‑end flow works after the change

```text
Signup screen
   │  user taps "Sign in with Face ID / passkey"
   ▼
signInWithPasskey(undefined)
   │
   ▼
auth-passkey-login-options  (no email → discoverable creds)
   │  returns WebAuthn options + challengeId
   ▼
Browser native passkey picker → Face ID / Touch ID prompt
   │  returns signed assertion
   ▼
auth-passkey-login-verify
   │  looks up credential_id in user_passkeys
   │  resolves user_id from the passkey itself
   │  verifies signature, updates counter
   │  mints a magic link for that user's email
   ▼
window.location.href = actionLink → /auth/callback
   ▼
Supabase session established for the matching account
```

## Out of scope (explicit non‑goals)

- No new server endpoints, no DB migrations, no changes to `BiometricLockCard` or `useBiometricLoginGate` (those are the post‑login app‑lock; this plan is about the pre‑login passkey button).
- No changes to the 2FA / login‑approval flow shipped previously.
- No changes to QR sign‑in.
