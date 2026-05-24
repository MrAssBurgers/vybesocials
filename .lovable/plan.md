
# Despia Native Bridges + Clerk Auth Migration

Four workstreams. The first three are isolated, low-risk feature adds. The fourth (Clerk) is a multi-week, breaking, multi-phase migration that touches every authenticated surface in VYBE — I've broken it into safe phases so you can ship in stages and roll back.

---

## 1. NFC v2 — friend link (read + write)

Migrate off the legacy `nfcread://` + polling pattern to Despia's new `nfc://read` / `nfc://write` + `window.onNFCEvent` contract, then add a "Write to my NFC tag" mode so users can program physical tags/rings with their friend-link URL.

**Files**
- `src/lib/despiaBridge.ts` — replace `despiaScanNFC()` polling helper with a thin promise wrapper that installs a single shared `window.onNFCEvent` dispatcher (queue listeners by session token so concurrent calls don't fight). Add `despiaWriteNFC(value: string)` that triggers `nfc://write?value=...` and resolves on the `write` event, rejects on `error`, distinguishes `dismissed`.
- `src/hooks/useWebNFC.ts` — keep current read flow but route through new helper. Add a `write(value)` action. Update `isAvailable` so iOS now reports `true` when in Despia (new API supports iOS once NFC Tag Reading capability is enabled).
- New `src/components/social/NFCWriteSheet.tsx` — modal: "Tap your tag to program it", calls `useWebNFC().write(friendLinkUrl)`, shows success / dismissed / error states.
- Friend-link screen (find the page that already hosts QR + "Tap an NFC tag" — `useNativeFriendDrop` flow) — add a secondary "Program a tag" button that opens `NFCWriteSheet`.

**Setup user must do once**
- Enable **NFC Tag Reading** capability on the Apple App ID in Apple Developer.
- Toggle **NFC** addon ON in the Despia Editor.
- Rebuild native binary (without rebuild, calls resolve silently — I'll add a doc note).

---

## 2. PK Pass (`wallet://pkpass`)

Lets a user add a `.pkpass` to Apple Wallet / Google Wallet directly from VYBE — e.g. event tickets, creator membership cards, VYBE Pro pass.

**Files**
- New `src/lib/despiaWallet.ts` — installs `window.onWalletEvent` shared dispatcher, exports `addPassToWallet(url: string)` that triggers `wallet://pkpass?url=...` and resolves to `{status, error?}`. URL validated as `https://` only (rejects `data:`/`blob:`).
- New `src/hooks/useWalletPass.ts` — thin React wrapper returning `{ addPass, isPresenting, lastResult }` with toast feedback for each `dismissed` / `failed.*` case (mapped to friendly copy, not raw `download_failed: ...`).
- One demo entry point so it's testable: surface "Add to Wallet" button on the existing premium-success or event-ticket flow (whichever has a real pass URL today — I'll confirm during build; if neither, add behind a feature flag in Owner Command Center).
- New edge function `supabase/functions/generate-pkpass/index.ts` is **out of scope** for this round (signing `.pkpass` files requires Apple WWDR cert + your Pass Type ID `.p12`). For now, accept a server-provided HTTPS URL.

---

## 3. Native WebSocket bridge → Supabase Realtime

Replace the WebView WebSocket Supabase Realtime uses with Despia's durable native socket, so DMs/notifications keep flowing while the app is backgrounded or the WebView reloads. Falls back to standard browser WebSocket outside Despia.

**Files**
- New `src/lib/despiaWebSocket.ts` — installs single `window.onWebSocketEvent` dispatcher, multiplexes by connection `id`. Exports a `DespiaWebSocket` class that mimics the `WebSocket` interface (`send`, `close`, `addEventListener('message'|'open'|'close'|'error')`) so it's drop-in.
  - Acknowledgement strategy: in-memory `Set<message_id>` per connection (sufficient per Despia docs for single-page session), returns `true` from handler after successful dispatch, `false` on throw → Despia replays.
  - Subscribe-frame registration on each Realtime channel join, encodes Supabase's `phx_join` payload with `since` cursor (last `phx_reply` ref).
- New `src/integrations/supabase/runtime-client.ts` patch — if `isDespiaRuntime()`, override Supabase's `transport` option with our `DespiaWebSocket` shim pointed at `wss://<project>.supabase.co/realtime/v1/websocket?apikey=...&vsn=1.0.0`. Pass the user's JWT in the `headers` connect param.
- Handle `dropped` event by emitting a custom `vybe:realtime-resync` event so existing hooks (`useRealtimeMessages`, `useNotifications`) can refetch.
- Handle `send_failed` by surfacing a one-time toast.

**Out of scope**: ripping out Supabase Realtime entirely. We're only swapping the transport underneath.

---

## 4. Clerk auth — FULL MIGRATION (phased)

This replaces Supabase Auth as the source of truth across the entire app. I'm going to be blunt: this is a **2–4 week effort** that touches >100 files and **requires a one-way user migration**. I'm sequencing it in phases so you can pause / publish between each.

### Phase 4A — Foundation (1–2 days, no user impact)
- Create Clerk app + matching Clerk dev/prod instances. (You'll add `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` as secrets — I'll prompt.)
- In Clerk dashboard: configure a **JWT template named `supabase`** that signs with Supabase's JWT secret (so Supabase RLS keeps working unchanged — `auth.uid()` reads Clerk's `sub`). Add `CLERK_JWT_SIGNING_KEY` derived from current Supabase JWT secret.
- New `src/lib/clerkBridge.ts` — wraps `clerk://authview` / `clerk://manual` calls, installs `window.onClerkEvent` dispatcher, exposes `signInWithSheet()`, `signInWithPassword()`, `signInWithOAuth(provider)`, `signInWithApple()`, `startEmailCode()`, `verifyEmailCode()`, `startPhoneCode()`, `verifyPhoneCode()`, `registerPasskey()`, `signInWithPasskey()`, `startMFA()`, `verifyMFA()`, `startReset()`, `verifyReset()`, `setNewPassword()`, `consumeTicket()`, `signOut()`. Each returns a typed result with the Despia event payload.
- Polling helper for `window.clerkJWT` so any caller can `await getClerkJWT()` after sign-in completes.
- **Web fallback**: when `!isDespiaRuntime()`, dynamic-import `@clerk/clerk-react` and use the JS SDK so browser/PWA still works.

### Phase 4B — Identity bridge (2–3 days)
- New edge function `supabase/functions/clerk-webhook/index.ts` — receives Clerk `user.created` / `user.updated` / `user.deleted` webhooks (signature-verified via `svix`), upserts into `public.profiles` keyed by Clerk `user_id` written into a new `profiles.clerk_user_id` column.
- Migration: add `clerk_user_id text unique` to `profiles` (nullable initially), add index, add `SECURITY DEFINER` function `current_clerk_user_id()` reading from JWT claim.
- New `src/contexts/ClerkAuthProvider.tsx` — exposes `{ user, profile, isLoading, signOut }`, listens for `clerkJWT` updates, calls `supabase.auth.setSession({access_token: jwt, refresh_token: ''})` so the existing `supabase` client transparently sends the Clerk-signed JWT.
- Update `src/integrations/supabase/client.ts` consumer pattern (NOT the auto-generated file) via a wrapper that injects the Clerk JWT on each request.

### Phase 4C — One-time user import (1 day, irreversible)
- Edge function `supabase/functions/migrate-users-to-clerk/index.ts` — owner-only, paginates `auth.users`, for each emits a Clerk `users.createUser` API call with `external_id = supabase auth.users.id`, sends Clerk a password-reset email so every user can set a new password (Clerk can't import password hashes from Supabase's bcrypt format directly).
- Backfill `profiles.clerk_user_id` from `external_id` mapping.
- Communication: drop-in `<MigrationNoticeBanner />` shown for 14 days.

### Phase 4D — UI swap (3–5 days)
- Rewrite `src/pages/Auth.tsx` (and signup/reset/MFA pages) to use `clerkBridge` instead of `supabase.auth.signIn*`. Primary CTA in Despia: "Continue" → `clerk://authview`. Web: Clerk-hosted components.
- Delete `useRequireAuth`'s Supabase session checks, replace with Clerk session check. Keep the hook signature identical to minimize ripple.
- Update Google OAuth flow to use Clerk's `oauth?provider=google` (no more `window.location.origin` hack — Clerk handles it).
- Replace Apple sign-in with `clerk://manual?method=apple` (App Store-compliant native sheet).
- Wire passkeys to `clerk://manual?method=passkey` and **delete** the custom `passkeys.ts` + edge function (`PROD_RP_ID`/`PROD_ORIGINS` becomes Clerk's problem).
- Wire MFA setup screen in Settings to Clerk's `second_factor` flows.

### Phase 4E — Cleanup (1 day, after 14-day grace period)
- Disable Supabase email/google providers via `configure_social_auth`.
- Drop `clerk_user_id` from nullable to NOT NULL on `profiles`.
- Delete `useGoogleSignIn`, custom passkey hooks, custom reset-password page (Clerk replaces them).
- Update `mem://technical/auth/...` memories.

### Risks called out
- **Password hashes don't transfer.** Every existing user must reset their password (or sign in via the same Google/Apple OAuth account, which Clerk links automatically by email).
- **RLS still works** because we use Clerk's `supabase` JWT template signed with the same Supabase JWT secret — `auth.uid()` continues to return the right ID, *but only after we backfill `profiles.clerk_user_id`* and switch RLS to read it instead of the old `auth.uid()`. I'll handle this with a `current_user_uuid()` SQL helper that returns the old Supabase UUID for any given Clerk `sub` during the transition.
- **All your edge functions** that call `supabase.auth.getClaims(token)` must accept Clerk-signed JWTs. Since the template uses the same Supabase JWT secret, `getClaims` keeps working — no edge function changes required.
- **Web (non-Despia) users** still need Clerk's React SDK; we'll add `@clerk/clerk-react` as a dependency.

---

## Recommended ship order

1. **Today's session**: Workstreams 1 (NFC v2) + 2 (PK Pass) + 3 (WebSocket bridge). Self-contained, no schema changes, fully reversible.
2. **Next session**: Phase 4A + 4B (Clerk foundation + identity bridge) — staging only, no user impact.
3. **After you test**: Phase 4C (user import) + 4D (UI swap) — coordinated release.
4. **2 weeks later**: Phase 4E (cleanup).

If you approve, I'll ship #1 (workstreams 1–3) in build mode this round and stop before Clerk so you can review. Reply with which slice you want first.
