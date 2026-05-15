## Two fixes

### 1) Passkeys / biometric on mobile

**Why it doesn't work today**

- `PasskeysCard` hides the "Add" button on native (Capacitor) and just tells users to go to Safari.
- Even if the button were shown, registration would fail because the edge functions derive the WebAuthn `rpID` from the request `Origin` header. In a Capacitor iOS WebView the origin is `capacitor://localhost`, so the server registers a credential bound to `localhost` instead of `vybehub.app` — the next sign-in fails with `NotAllowedError`.
- iOS WKWebView only allows passkeys for a domain when the app declares an **Associated Domain** (`webcredentials:vybehub.app`) and that domain serves an **`apple-app-site-association`** file declaring this app's bundle ID. Neither exists.
- Android WebView needs the equivalent **Digital Asset Links** (`/.well-known/assetlinks.json`).

**Fix (one pass)**

Edge functions (`auth-passkey-register-options`, `auth-passkey-register-verify`, `auth-passkey-login-options`, `auth-passkey-login-verify`):
- Always use `rpID = 'vybehub.app'` (production domain). Accept `localhost` only when the request origin is a Lovable preview URL (for the editor sandbox).
- Pass `expectedOrigin` as an array including `https://vybehub.app`, `https://www.vybehub.app`, the Lovable preview origin, and `capacitor://localhost` / `https://localhost` (Capacitor iOS/Android shells), so verification succeeds in every shell while credentials remain bound to `vybehub.app`.

Client (`src/components/settings/PasskeysCard.tsx`):
- Drop the `inNativeApp` gate around the **Add** button — show it everywhere `passkeysSupported()` returns true.
- On native, surface a single, friendly error toast if registration fails because Associated Domains aren't configured (instead of the silent fallback message).
- Already-good login path (`signInWithPasskey`) stays unchanged.

Domain verification files (served by the deployed app at `vybehub.app`):
- `public/.well-known/apple-app-site-association` — JSON declaring the iOS bundle ID for both `webcredentials` (passkeys) and `applinks` (Universal Links → deep link routing the iOS plan added).
- `public/.well-known/assetlinks.json` — Android equivalent for Chrome WebView passkeys.

iOS setup docs (`docs/IOS_SETUP.md`):
- Add an **Associated Domains** capability step listing both `webcredentials:vybehub.app` and `applinks:vybehub.app`.
- Note that the AASA must be reachable at `https://vybehub.app/.well-known/apple-app-site-association` with `Content-Type: application/json` and **no redirect** — Lovable serves `public/` correctly.

Result: Add Passkey works in the iOS app, Android app, and any browser. First registration uses Face ID / Touch ID (or the system passkey sheet). Subsequent logins use the same biometric.

---

### 2) Mod "Delete Post" — instant, one tap

**Why it's slow today**

Clicking *Delete Post (Mod)* opens a dialog requiring a typed reason before the actual `delete()` call fires. The user wants the post gone the instant they tap.

**Fix**

`src/components/moderation/ModeratorActionsMenu.tsx` — change the menu item to delete inline:

- On click, immediately call `supabase.from('posts'|'comments').delete().eq('id', id)` with no dialog.
- Optimistically remove the row from React Query caches (`posts`, `comments`, feed lists) before the round-trip so the post vanishes from the UI in the same frame; rollback + toast if the server rejects.
- Send the `content_removed` notification with a default reason (`"Removed by moderator"`) in the background so the author still gets pinged without blocking the click.
- Show a small undo toast for ~5s ("Post deleted — Undo") that re-inserts the row if tapped (best-effort; if RLS blocks re-insert, keep it deleted and show a quiet error).

`useModerationActions.ts` already has the right query-invalidation pattern — extend it with a new `useModDeletePost` mutation so the menu item is a one-liner and other surfaces (Watch, PostDetail, ShortCard, MobileShortCard) can reuse it.

The existing reason-required dialog is removed from the moderator flow. (The full audit dialog remains accessible from the Admin dashboard for cases that genuinely need a reason.)

Result: tap delete → post is gone from the feed instantly, server confirms in the background, author gets the standard removal notice.

---

### Files I'll touch

- `supabase/functions/auth-passkey-register-options/index.ts`
- `supabase/functions/auth-passkey-register-verify/index.ts`
- `supabase/functions/auth-passkey-login-options/index.ts`
- `supabase/functions/auth-passkey-login-verify/index.ts`
- `public/.well-known/apple-app-site-association` (new)
- `public/.well-known/assetlinks.json` (new)
- `src/components/settings/PasskeysCard.tsx`
- `src/components/moderation/ModeratorActionsMenu.tsx`
- `src/hooks/useModerationActions.ts`
- `docs/IOS_SETUP.md` (add Associated Domains step)

No DB migrations needed.