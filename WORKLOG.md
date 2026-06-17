# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`

## Deep scan (2026-06-17 — migration regression)

| Check | Result | Notes |
|-------|--------|-------|
| `npm run debug` | **PASS** | build, lint, CSS, edge refs OK |
| `npm run build` | **PASS** | |
| `npm run lint` | **PASS** | 4 pre-existing warnings only |
| Feed RPC non-array crash | **PASS** | `feedRpc.ts` + `mapFeedRows` guard arrays; empty feed on failure |
| Firebase lazy init | **FIXED** | `authService.ts`, `storageService.ts` — no import-time throw |
| Missing Firebase env | **FIXED** | `FirebaseConfigScreen` in `main.tsx` (clear error, not white screen) |
| Maintenance gate preview bypass | **PASS** | `index.html` Lovable hosts → `data-vybe-maintenance="false"` |
| Production vybehub.app maintenance | **GATED** | `data-vybe-maintenance="true"` until Baron flips + Publish |
| Client `functions.invoke` vs `functions/src` | **PASS** | 66 invoked names, 0 missing exports |
| Supabase edge refs (local) | **PASS** | 70 referenced, all exist in `supabase/functions/` |
| Supabase prod RPCs | **PARTIAL** | `is_username_available`, `create_dm_conversation` MISSING on hprmic — **client-side fallbacks in `dataClient.ts` cover these** |
| `VITE_SUPABASE_URL` without fallback | **PARTIAL** | 8 admin/music/Spotify/debug files still direct; `usePresence`, `Unsubscribe` now use canonical fallback |
| Broken media URLs | **DEGRADED** | `SafeMedia`/`MediaFallback` + `normalizeMediaUrl` — UI won't crash |
| Password reset flow | **PASS** | `authReset.ts` → Firebase `sendPasswordResetEmail` + `ResetPassword.tsx` oobCode |
| Founder UID dual honor | **PASS** | `oXZZXoceCdOaCKekqNrDhCfJ90M2` + legacy `703760a8-…` in `previewSandbox.ts` |

**Fixes this scan:** lazy Firebase auth/storage init, `FirebaseConfigScreen`, canonical Supabase fallbacks in `usePresence.ts` + `Unsubscribe.tsx`.

**Next 3 tasks:** (1) Baron: Lovable env + flip maintenance + Publish, (2) `firebase deploy --only functions`, (3) finish storage migration + port remaining 8 Supabase URL callers.

## Current Focus (2026-06-16 — Firebase go-live on vybehub.app)

- **Goal:** Point production at **Firebase `vybe-daaab`** (Firestore ~14,927 docs, Auth 152 seeded UIDs, partial Storage).
- **Local migration done:** Lovable export imported; auth seeded via `scripts/migrate-firebase/seed-firebase-auth-from-profiles.mjs` (no passwords — Lovable platform limit).
- **Prod blockers (vybehub.app):**
  1. **`index.html`** — `data-vybe-maintenance="true"` shows static “Under reconstruction” on vybehub.app (preview hosts bypass).
  2. **Lovable env** — `VITE_FIREBASE_*` not set in Cloud (see checklist below); `.env.example` is source of truth.
  3. **~10 client files** still call **`VITE_SUPABASE_URL`** (admin debug, music providers, Spotify callback, presence REST, PWA icons, Stripe validate) — core feed/DMs/social/AI captions now Firebase; deploy Cloud Functions for full AI/push.
  4. **Media gap** — only 9 agtcyx storage files in Firebase; most legacy media on `eabvbt` / `szthqtnbepupjqjxaduu` not migrated (avatars/posts may 404 until `migrate:firebase:public-media` + agtcyx service_role).
- **Code fix (this session):** Firebase implementation sweep — `socialRpc.ts` client fallbacks (profile, DMs, view counts, streaks), extended `feedRpc.ts` pattern in `dataClient.ts`, `invokeFunction` body unwrap + `not_yet_ported` fail-soft, `posts.ts` denormalized like/bookmark counts, `edgeFeature.ts` helper; migrated 15+ AI/moderation/social callers off `VITE_SUPABASE_URL` fetch to Firebase `invokeFunction`; `shareLinks.ts` → Firebase `sharePreview`; Cloud Functions: `giphySearch` trending + graceful empty, `detectAiContent` no-op.
- **Prior fix:** Lovable preview `/home` crash — `feedRpc.ts`, PostCard author guard; commit `3976d610`.

### End users — reclaim account + content

| Situation | What to do |
|-----------|------------|
| **Email/password (migrated profile exists)** | Go to [vybehub.app](https://vybehub.app) → **Forgot password** → enter same email as before → open email link → set new password → sign in. **UID is preserved** — posts, DMs, profile in Firestore reattach automatically. Old Supabase password does **not** carry over. |
| **Google / Apple sign-in** | Sign in with same provider + email. Firebase links OAuth to the seeded UID when email matches. |
| **New email, never had VYBE** | Sign up normally after maintenance is lifted. |
| **Founder (Bakrix)** | Email: `barron.bakic@gmail.com` · Firebase UID: `oXZZXoceCdOaCKekqNrDhCfJ90M2` · Legacy Supabase UID: `703760a8-1245-4fc1-b242-32619ecc0ef3` · Username: **Bakrix**. Use Forgot password or Google once Firebase is live. Owner role is honored for both UIDs in `previewSandbox.ts` / `ownerBypass.ts`. |
| **Missing photos/videos** | Content rows exist in Firestore; media files may still point at unmigrated Supabase URLs — expected until storage migration completes. |

### Baron — go live checklist (Lovable Publish)

**A. Firebase Console (`vybe-daaab`)**

- [ ] Authentication → Sign-in method: **Email/Password**, **Google** (Apple if used)
- [ ] Authentication → Settings → Authorized domains: **`vybehub.app`**, **`www.vybehub.app`**
- [ ] Authentication → Templates → Password reset action URL: `https://vybehub.app/reset-password`
- [ ] Firestore + Storage rules: `firebase deploy --only firestore:rules,storage:rules`
- [ ] Cloud Functions (stubs): `firebase deploy --only functions` — required for `invokeFunction` callers
- [ ] App Check reCAPTCHA Enterprise registered (needed before enforcing AI Logic)

**B. Lovable → Project → Environment variables** (values from Firebase Console → Project settings → Your apps → Web app; do not commit)

| Variable | Example / notes |
|----------|-----------------|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `vybe-daaab.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `vybe-daaab` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `vybe-daaab.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `728651793473` |
| `VITE_FIREBASE_APP_ID` | Web app ID (`1:728651793473:web:…`) |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional Analytics |
| `VITE_FIREBASE_FUNCTIONS_REGION` | `us-central1` |
| `VITE_FIREBASE_VAPID_KEY` | Cloud Messaging → Web push key |
| `VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` | App Check site key |
| `VITE_MAINTENANCE_MODE` | `false` |
| `VITE_PUBLIC_WEBAUTHN_RP_ID` | `vybehub.app` |
| `VITE_PUBLIC_WEBAUTHN_RP_NAME` | `VYBE` |
| `VITE_OFFLINE_MODE` | `pwa` |

Optional (legacy edge features until Phase 3): keep `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` pointing at **agtcyx** for AI/moderation/LiveKit calls that still fetch Supabase edge URLs.

**C. Repo (before Publish)**

- [ ] Set `index.html` line 3: `data-vybe-maintenance="false"`
- [ ] Git push → confirm commit in Lovable

**D. Lovable → Share → Publish**

- [ ] Wait for build → confirm [vybehub.app](https://vybehub.app) loads app (not maintenance screen)
- [ ] Hard refresh / clear site data / private window
- [ ] Smoke: Forgot password → reset → login → feed + profile load
- [ ] Optional: `curl -s https://vybehub.app/despia/local.json | head -3`

**E. Post-launch media (optional, local)**

```bash
# agtcyx service_role from Lovable support → then:
npm run migrate:firebase:public-media
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json npm run migrate:firebase:import
```

### Honest gaps

- **Passwords:** Not exportable from Lovable; all email users must **Forgot password** once.
- **Media:** Most storage not in Firebase yet; broken thumbnails until migration.
- **Edge functions:** ~10 direct Supabase URL fetches remain (admin debug, music sync, Spotify OAuth callback, presence REST, PWA icons, Stripe validate). LiveKit/Stripe/Resend need secrets + `firebase deploy --only functions`.
- **DEPLOY.md** still documents Supabase agtcyx — update when cutover is confirmed.

### Next 3 Tasks

1. **Baron:** `firebase deploy --only functions` + Lovable env + flip maintenance + Publish
2. **Baron:** Deploy Firestore composite indexes (friend_requests status, messages conversation_id+created_at)
3. **Phase 3:** Port remaining ~10 `VITE_SUPABASE_URL` callers; finish storage migration

## Prior Focus (2026-06-16 — hprmic → Firebase data migration)
- **Goal:** Gemini via Firebase proxy + App Check; streaming multimodal VYBE AI chat.
- **Done:** `appCheck.ts`, `aiLogic.ts`, `aiSchemas.ts`, `aiChat.ts`; `AIChat.tsx` uses `streamVybeAiChat` (no Supabase `ai-chat` fetch); App Check init in `main.tsx`
- **You:** Firebase Console → register Web App Check (reCAPTCHA Enterprise) → add `VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` to `.env` + Lovable → run `npx firebase-tools init ailogic` if not done → enforce App Check when ready
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## Prior Focus (2026-06-16 — Firebase backend migration)
- **Goal:** Replace Supabase with Firebase (Auth, Firestore, Storage, Cloud Functions, FCM).
- **Project:** `vybe-daaab` — `.env` configured (web API key + app id), `.firebaserc`, `native/android/google-services.json`
- **Done:** `src/lib/firebase/` service layer, `db` client, rules, Cloud Functions stubs, removed `@supabase/supabase-js`
- **You:** Firebase Console → enable Auth (email + Google), Firestore, Storage → `firebase deploy --only firestore:rules,storage:rules,functions` → add same `VITE_FIREBASE_*` in Lovable env → Publish
- **Android (when `npx cap add android`):** copy `native/android/google-services.json` → `android/app/google-services.json`, add Google services Gradle plugin per Firebase docs
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## Prior Focus (2026-06-16 — full agtcyx → hprmic migration prep)
- **Goal:** Import all live data (~31 users, Bakrix, posts, DMs, media) from **agtcyx** into owned **hprmic**, then run app on hprmic only.
- **You:** Add `AGTCYX_SERVICE_ROLE_KEY` to `.env` → run migration commands in `supabase/manual/MIGRATE_agtcyx_to_hprmic.md`
- **Git:** pending push — enhanced migration script + hprmic-primary client + SW v20

## What Changed (2026-06-16 — migration + hprmic primary)
- **`scripts/migrate-agtcyx-to-hprmic.mjs`** — ~130 public tables, auth.users (UUID preserve), storage bucket recursive copy, `--storage-only` / `--tables-only` / `--skip-auth`, before/after row counts, progress logs
- **`MIGRATE_agtcyx_to_hprmic.md`** — foolproof step-by-step + full table coverage list
- **`canonicalSupabase.ts`**, **`vite.config.ts`**, **`index.html`**, **`debug-scan.mjs`** — hprmic canonical; redirect agtcyx/eabvbt → hprmic
- **Removed dual-backend:** `dualSupabase.ts`, `hprmicClient.ts`; reverted `usePosts`, `useStories`, `useInfinitePosts`, `publishStoryMedia`, `signedUrlCache`, `auth.tsx`
- **`supabaseStorageKey.ts`** — purge agtcyx/eabvbt sessions after migration
- **`public/sw.js`** — v20 cache bust
- **hprmic schema (MCP):** key tables + RPCs present; `PENDING_20260530.sql` optional
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## User steps (required)
1. **Get agtcyx service_role** from Lovable support → add to `.env`
2. `npm run migrate:agtcyx -- --verify` → `--dry-run` → `--execute`
3. Forgot password on vybehub.app → confirm Bakrix feed/DMs/media
4. Lovable env → hprmic URL + anon key → **Publish** → clear site data

## Publish required?
**Yes** — hprmic-primary client + SW v20 until Lovable Publish.

## Next 3 Tasks
1. **You:** Run hprmic → Firebase migration locally (`MIGRATE_hprmic_to_firebase.md` Steps 1–6)
2. **You:** Lovable env → all `VITE_FIREBASE_*` → Publish when `VERIFY.json` is green
3. **Phase 3:** Migrate remaining Supabase edge calls + AI Logic (captions, brief, DM assist)

## Current Focus (2026-06-16 — dual Supabase: agtcyx legacy + hprmic new writes)
- **Legacy (read + auth):** `agtcyxjxgkdyoxwxkjth` — existing users, Bakrix, posts, DMs, feed (Lovable live DB).
- **New writes:** `hprmicwhlaaqfgshucec` — owned project for NEW posts/stories going forward.
- **Git:** pending push — dual-client + feed merge + SW v19.
- **Prod now (pre-publish):** bundle `index-DsQgE5tL.js` · preconnect **agtcyx** · SW **v18** (repo **v19**).

## Architecture (dual Supabase)

| Surface | Project | Notes |
|---------|---------|--------|
| Auth / login / passwords | **agtcyx** | `supabase` client + `canonicalSupabase` |
| Profile read, DMs, friends, notifications | **agtcyx** | unchanged |
| Feed read (ranked / following / global) | **agtcyx** | RPCs unchanged |
| **New posts** | **hprmic** | `useCreatePost` → hprmic storage + `posts` |
| **New stories** | **hprmic** | `useCreateStory` + `publishStoryMedia` |
| Own profile feed + For You page 0 | **merged** | agtcyx + user's hprmic posts |
| Own stories ring | **merged** | agtcyx friends + user's hprmic stories |
| DMs / messages | **agtcyx only** | not split (conversations stay legacy) |
| Edge functions / AI | **agtcyx** | `VITE_SUPABASE_URL` still agtcyx |
| hprmic auth | separate localStorage key | synced on email/password sign-in/sign-up |

## What Changed (2026-06-16 — dual Supabase)
- **`canonicalSupabase.ts`** — `NEW_WRITES_*` hprmic constants; `OBSOLETE_AUTH_REFS` (eabvbt only); hprmic no longer purged on boot.
- **`hprmicClient.ts`** — secondary Supabase client (isolated auth storage).
- **`dualSupabase.ts`** — `syncHprmicAuth`, `ensureHprmicWriteReady`, feed merge helpers.
- **`supabaseStorageKey.ts`** — purge/migrate eabvbt only; keep hprmic session for writes.
- **`auth.tsx`** — mirror password login to hprmic; sign out clears hprmic session.
- **`usePosts.ts`**, **`useStories.ts`**, **`publishStoryMedia.ts`** — new content writes to hprmic.
- **`useInfinitePosts.ts`** — merge user's hprmic posts into profile + For You (page 0).
- **`signedUrlCache.ts`**, **`mediaUrl.ts`** — sign/serve hprmic media URLs.
- **`public/sw.js`** — v19 cache bust.
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## Limitations
- **No data migration** — agtcyx keeps all historical data; hprmic starts empty for content.
- **OAuth-only users** (Google/Apple): hprmic write sync needs email/password login once (or future OAuth bridge).
- **DMs** still on agtcyx — new messages not routed to hprmic in this pass.
- **Other users' new hprmic posts** not visible until full cross-project feed merge.
- **hprmic SQL/edge** — paste `supabase/manual/PENDING_20260530.sql` on **hprmic** if `ensure_profile` / RLS missing.

## User steps (required)
1. **Lovable → Share → Publish** (SW v19 + dual-write client).
2. **Clear site data** on vybehub.app (or private window).
3. **Sign in** with **agtcyx password** (barron.bakic@gmail.com / Bakrix) — email/password also mirrors to hprmic.
4. Post a story or feed post → should land on **hprmic** and appear in your feed/profile merge.
5. **Supabase SQL Editor (hprmic):** apply `PENDING_20260530.sql` + deploy edge fns if writes fail.

## Publish required?
**Yes** — dual-write + SW v19 local until Lovable Publish.

## Next 3 Tasks
1. **Lovable Publish** → verify `/sw.js` → `vybe-v19`
2. **barron.bakic@gmail.com:** login (password) → create post → confirm in feed + profile
3. **hprmic:** SQL Editor + smoke test story upload

- **User:** barron.bakic@gmail.com / Bakrix — live data on **agtcyxjxgkdyoxwxkjth** (~31 users).
- **Git:** `main` @ `d8ac21b3` pushed — auth recovery hardening + legacy session purge + SW v18.
- **Prod now (pre-publish):** bundle `index-DsQgE5tL.js` · preconnect **agtcyx** · SW **v17** (repo has **v18**).
- **You:** Lovable → Share → Publish → clear site data → Forgot password OR original agtcyx password.

## Debug scan (2026-06-16 — auth crisis)

| Check | Result |
|-------|--------|
| `npm run build` | PASS |
| `npm run lint` | PASS (3 pre-existing warnings) |
| `npm run validate:css` | PASS |
| Edge fn refs (83 client → 122 local) | PASS |
| Prod RPCs (agtcyx) | PASS — 401 auth-required (deployed, not missing) |
| `ai-chat`, `livekit-token`, `share-preview`, `auth-2fa-preauth` | PASS (deployed) |
| `vybe-agent`, `community-voice-token`, `link-onesignal-user`, `spaces-token` | FAIL — 404 not deployed |
| vybehub.app bundle | **agtcyx** (14 refs) — not hprmic |
| vybehub.app SW | v17 (repo v18 after publish) |
| agtcyx `/auth/v1/recover` (barron.bakic@gmail.com) | PASS `{}` |
| agtcyx `send-reset-email` edge | PASS 200 |
| agtcyx signup (barron.bakic@gmail.com) | `user_already_exists` — account lives on agtcyx |

## Root causes (evidence)

1. **Wrong Supabase project during hprmic migration window** — vybehub.app briefly baked **hprmic**; agtcyx passwords returned `invalid_credentials`. Commit `58e438ce` reverted client to agtcyx; prod bundle now shows agtcyx refs (curl probe 2026-06-16).
2. **Stale hprmic localStorage sessions** — `sb-hprmicwhlaaqfgshucec-auth-token` could linger after revert and confuse cold-start auth. Fixed: `purgeWrongProjectAuthSessions()` + `clearLegacySupabaseAuthStorage()` on boot and on sign-in.
3. **Password reset errors** — client invoked `send-reset-email` after Supabase recover (duplicate email; 500 when Resend missing on sandbox). Fixed: `authReset.ts` uses Supabase `resetPasswordForEmail` only; agtcyx recover probe returns `{}`.
4. **Recovery link hijacked by OAuth** — hash/query recovery tokens on `/auth/callback` consumed as login. Fixed: `AuthCallback` + `passwordRecoveryUrl` redirect to `/reset-password`; PKCE `?code=` on reset path detected.
5. **Debug instrumentation in prod path** — agent `fetch` logs to `127.0.0.1:7261` removed from auth/reset/feed.
6. **Content “lost”** — not deleted; user was on wrong project (hprmic empty) or not signed in to agtcyx. Bakrix profile/posts remain on agtcyx once logged in with correct account.

## What Changed (2026-06-16 — auth crisis fix)
- **`bootstrapAuthStorage.ts`**, **`main.tsx`** — purge wrong-project + legacy hprmic/eabvbt keys before Supabase client init.
- **`supabaseStorageKey.ts`** — `purgeWrongProjectAuthSessions()`; repair calls purge first.
- **`authReset.ts`** — Supabase recover only (no duplicate `send-reset-email` invoke).
- **`passwordRecoveryUrl.ts`** — PKCE `?code=` on `/reset-password`.
- **`AuthCallback.tsx`** — recovery redirect before OAuth handling.
- **`auth.tsx`**, **`Landing.tsx`** — clear legacy storage on sign-in / failed login.
- **`ForgotPasswordDialog.tsx`** — `getUserFriendlyError` for reset toasts.
- **`ResetPassword.tsx`**, **`useInfinitePosts.ts`** — remove debug logs.
- **`public/sw.js`** — v18 cache bust.
- **Verify:** `npm run build` PASS · `npm run lint` PASS
- **Git:** `d8ac21b3` pushed (excludes `.env`)

## User steps (required)

1. **Lovable → Share → Publish** (agents cannot click Publish).
2. **Clear site data** on vybehub.app (or private window): Application → Clear storage — removes old hprmic SW/cache.
3. **Sign in** barron.bakic@gmail.com with **original agtcyx password** OR **Forgot password** → email link → `/reset-password` → set new password.
4. If you used **Google/Apple** for Bakrix, use that provider — password login will not work.
5. Confirm Home feed + Profile **Bakrix** load after login.

## Publish required?
**Yes** — SW v18 + auth purge/recovery fixes are local until Lovable Publish. Prod already on agtcyx bundle but needs v18 bump.

## Next 3 Tasks
1. **Lovable Publish** → verify bundle hash changes + `/sw.js` → `vybe-v18`
2. **barron.bakic@gmail.com:** Forgot password → reset → login → confirm Bakrix feed/profile
3. **Optional SQL (agtcyx):** paste `supabase/manual/PENDING_20260530.sql` for missing RPCs; deploy `vybe-agent` edge fn

## Current Focus (2026-06-16 — revert to Lovable live backend)
- **User:** restore working auth + Bakrix/live data → point client back at **`agtcyxjxgkdyoxwxkjth`** (Lovable production DB, ~31 users).
- **`canonicalSupabase.ts`**, **`vite.config.ts`**, **`index.html`**, **`debug-scan.mjs`**, **`DEPLOY.md`**, **`AGENTS.md`** — agtcyx canonical; redirect hprmic/eabvbt → agtcyx.
- **`loginErrors.ts`**, **`errorUtils.ts`** — remove hprmic migration copy.
- **`public/sw.js`** — v17 cache bust.
- **You:** Lovable → Share → Publish → sign out / clear site data → log in with **original agtcyx password** (Bakrix account).

## Publish prep (2026-06-15 — user requested ship)
- **Git:** `main` @ `94c35fd7` synced with `origin/main` (login UX + hprmic switch + auth fixes)
- **Build:** `npm run build` PASS · local main `index-B5IgHIXw.js` · Landing `Landing-CjCJmolp.js` (has migration login copy)
- **Prod now (pre-publish):** `index-Ct8Z2p_t.js` · Landing `Landing-Avt62Skb.js` · SW **v13** · Supabase preconnect **hprmic** only
- **Gap:** prod Landing chunk missing `No matching account on VYBE…` toast + SW still v13 (repo has v14) → **publish required**
- **Automated publish:** none in repo (`DEPLOY.md` — Lovable Share → Publish only; agents cannot trigger)
- **After publish expect:** new `index-*.js` hash (≠ `Ct8Z2p_t`) · Landing chunk includes migration login copy · `/sw.js` → `vybe-v14` · `despia/local.json` `deployed_at` bumps

## Current Focus
- **You:** Lovable → Share → Publish → hard refresh / private window on vybehub.app

## Next 3 Tasks
1. **Lovable Publish** → verify bundle hash changes + SW v14 + Landing migration toast
2. **barron.bakic@gmail.com:** Forgot password on vybehub.app → set hprmic password → login
3. **Supabase SQL Editor (hprmic):** paste `supabase/manual/PENDING_20260530.sql` + deploy edge functions

## What Changed (login instant invalid creds — hprmic migration — 2026-06-15)
- **Root cause:** `barron.bakic@gmail.com` (and ~31 live accounts) exist on **agtcyx** auth; vybehub.app + local bundle correctly target **hprmic** (`index-Ct8Z2p_t.js` prod · `index-DIjNgQr7.js` local). `signInWithPassword` → `invalid_credentials` is expected when using an agtcyx-only password — not a premature client error or wrong URL/key in the published bundle.
- **Probe (curl):** agtcyx signup → `user_already_exists` · hprmic signup → new account creatable (separate auth DB) · prod JWT ref = `hprmicwhlaaqfgshucec` only.
- **`loginErrors.ts`** — shared `isInvalidLoginCredentialError` + migration-aware message.
- **`Landing.tsx`** — invalid-creds toast with **Forgot password** action; purge legacy agtcyx/eabvbt localStorage on failed login.
- **`supabaseStorageKey.ts`** — `clearLegacySupabaseAuthStorage()`.
- **`errorUtils.ts`**, **`ForgotPasswordDialog.tsx`** — aligned copy + normalized email on reset.
- **`public/sw.js`** — v14 cache bust.
- **Verify:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Git:** commit + push (excludes `.env`)

## Current Focus
- **You:** Lovable → Share → Publish → hard refresh vybehub.app
- **You (barron.bakic@gmail.com):** **Forgot password** on vybehub.app (sets password on hprmic) OR **Sign up** same email on hprmic — agtcyx password does not carry over

## Next 3 Tasks
1. **Lovable Publish** → confirm bundle hash changes from `index-Ct8Z2p_t.js`
2. **barron.bakic@gmail.com:** Forgot password on vybehub.app → set new password on hprmic → login
3. **Supabase SQL Editor (hprmic):** paste `supabase/manual/PENDING_20260530.sql` + deploy edge functions

## What Changed (canonical Supabase → hprmic only — 2026-06-15)
- **User directive:** remove all `agtcyxjxgkdyoxwxkjth` production assumptions; user owns only `hprmicwhlaaqfgshucec`.
- **`canonicalSupabase.ts`** — canonical project = hprmic; legacy redirect from agtcyx/eabvbt baked env → hprmic URL + anon key.
- **`vite.config.ts`** — build define uses hprmic defaults; redirects legacy agtcyx/eabvbt → hprmic (removed agtcyx auth redirect).
- **`index.html`** — preconnect/dns-prefetch → hprmic Supabase.
- **`scripts/debug-scan.mjs`** — production probes target hprmic only.
- **`AGENTS.md`**, **`DEPLOY.md`**, **`docs/ARCHITECTURE_ROADMAP.md`**, **`docs/IOS_SETUP.md`** — hprmic as sole project.
- **`mediaUrl.ts`**, **`signedUrlCache.ts`** — agtcyx kept in legacy media rewrite list only (old stored URLs).
- **Migrations/manual SQL:** unchanged (historical agtcyx URLs in SQL left as-is per scope).
- **Verify:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Git:** commit + push (excludes `.env`, `.tmp-*`, accidental migration edits).

## Current Focus
- **You:** ensure Lovable Cloud `VITE_SUPABASE_*` env vars point at **hprmic** → Lovable Publish
- **You:** apply pending SQL + deploy edge functions on **hprmic** (see Next 3 Tasks)

## Next 3 Tasks
1. **Supabase SQL Editor (hprmic):** paste `supabase/manual/PENDING_20260530.sql` + any missing RPC migrations
2. **Deploy edge functions on hprmic:** `ai-chat`, `vybe-agent`, `auth-2fa-preauth`, etc. — set secrets (`LOVABLE_API_KEY`, `RESEND_API_KEY`)
3. **Lovable → Share → Publish** → hard refresh vybehub.app → smoke login/signup on hprmic

## What Changed (auth login/signup deep scan — 2026-06-15)
- **Root cause (signup):** `is_username_available` RPC **MISSING** on agtcyx → `signUp()` hard-failed with "Unable to verify username"; same RPC blocked onboarding username picker.
- **Root cause (login UX):** Logged-in users with slow/missing profile hydration stayed on auth form (Landing required `authProfile.username` before redirect spinner).
- **`usernameAvailability.ts`** — shared fail-soft check: RPC when deployed; optimistic proceed when PGRST202/404 (DB unique constraint still catches duplicates).
- **`auth.tsx`** — signUp uses fail-soft check; `fetchProfile` tries `ensure_profile` then `claim_profile_by_email` (was claim-only).
- **`Landing.tsx`** — any signed-in user gets redirect spinner; navigate to Home even when profile still loading; generated usernames → onboarding.
- **`UsernameSetup.tsx`** — fail-soft availability check.
- **`public/sw.js`** — v13 cache bust for publish.
- **Scan (agtcyx, 2026-06-15):** build/lint/CSS PASS · bundle local `index-BN9lJxzU.js` · prod `index-DcpMikVv.js` (pre-fix) · auth endpoint OK (400 invalid creds) · RPCs MISSING: `get_public_user_count`, `sync_signup_username`, `is_username_available`, `create_dm_conversation` · RPCs OK: `ensure_profile`, `ensure_user_level` · edge OK: `auth-2fa-preauth`, `ai-chat`, `livekit-token` · edge MISSING: `vybe-agent`, `community-voice-token`, `link-onesignal-user`, `spaces-token`
- **Verify:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Git:** local only (not committed)

## Current Focus
- **You:** Lovable → Share → Publish (required for vybehub.app auth fixes)
- **Optional SQL (agtcyx):** paste `supabase/manual/PENDING_20260530.sql` for `sync_signup_username` + `is_username_available` (client now works without them)

## Next 3 Tasks
1. **Lovable → Share → Publish** → hard refresh vybehub.app (bundle should change from `index-DcpMikVv.js`)
2. Smoke: **login** existing agtcyx account → lands on Home (not stuck on auth form)
3. Smoke: **signup** new email → onboarding (even before SQL applied)

## What Changed (VYBE AI talk + agent — 2026-06-13)
- **`ai-chat` edge fn** — use `LOVABLE_API_KEY` (Lovable gateway) when `GEMINI_API_KEY` missing; fix profile lookup via `user_id`
- **`vybe-agent`** — fix profile lookup via `user_id`
- **`AIChat.tsx`** — always try agent path; local fallback for "open messages" / theme when `vybe-agent` not deployed; canonical edge URLs
- **`localAgentCommands.ts`** — offline navigate/theme commands
- **Verify:** `npm run build` PASS
- **You:** Lovable Backend deploy on **agtcyx**: `ai-chat`, `vybe-agent` → Lovable Publish → sign in → open /VYBE-AI and send a message

## What Changed (login direct auth — 2026-06-13)
- **`Landing.tsx`** — bypass `auth-2fa-preauth` on vybehub.app; direct `signInWithPassword` only (preauth edge still stale on prod)
- **`loginEmail.ts`** + **`auth.tsx`** — trim/lowercase email before auth
- **`public/sw.js`** — bump to v10 so cached old login bundle clears after publish
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → hard refresh vybehub.app → sign in (or Forgot password / Google if OAuth account)

## What Changed (production login fix — 2026-06-13)
- **Root cause:** Client auth targeted `hprmicwhlaaqfgshucec` (~1 auth user) while live accounts are on `agtcyxjxgkdyoxwxkjth` (31+ users). Canonical rewrite `agtcyx→hprmic` made correct passwords return `invalid_credentials`. Secondary: `auth-2fa-preauth` forced email codes on every login (ignored `email_2fa_enabled`); `email_failed` blocked sign-in with no fallback.
- **`canonicalSupabase.ts`** — live auth project is `agtcyx`; redirect baked `hprmic`/`eabvbt` env to agtcyx URL + anon key
- **`vite.config.ts`** — build define mirrors agtcyx auth redirect (stop rewriting agtcyx→hprmic)
- **`client.ts`** — uses `getCanonicalSupabaseUrl()` / `getCanonicalPublishableKey()` (same as runtime-client)
- **`auth-2fa-preauth` + `auth-2fa-request`** — email 2FA only when user opted in (`email_2fa_enabled`)
- **`Landing.tsx`** — `gateOpened` flag fixes stale `gatePending` clear; `email_failed` falls back to `signInWithPassword`
- **`index.html`** — preconnect/dns-prefetch to agtcyx Supabase
- **Verify:** `npm run build` PASS · dist bundle contains only `agtcyxjxgkdyoxwxkjth.supabase.co`
- **You:** Lovable Backend deploy `auth-2fa-preauth` + `auth-2fa-request` on **agtcyx** → Lovable Publish → sign in on vybehub.app with a known agtcyx account

## Current Focus
- **You:** Lovable Backend deploy on **agtcyx** + Lovable Publish (client fixes below are local until publish)

## What Changed (prod triage DMs/stories/AI — 2026-06-14)
- **Debug scan (`scripts/debug-scan.mjs`)** — probes **agtcyx** (not hprmic); adds `ai-chat`, `vybe-agent`, `create_dm_conversation`, bundle hash
- **`resolveSessionProfileId.ts`** — call `ensure_profile` RPC when profile row missing (fixes DMs spinner when signup lag)
- **`useStories.ts`** — retry insert without `poll_data` if column missing; clearer RLS/author_id errors; lint fix
- **`useDMConversations.ts`** — skip auto-create when `create_dm_conversation` RPC missing (PGRST202)
- **`auth.tsx`** — remove empty `SIGNED_OUT` block (lint)
- **Scan (agtcyx, 2026-06-14):** build/lint/CSS PASS · bundle `index-DcpMikVv.js` · RPCs MISSING: `get_public_user_count`, `sync_signup_username`, `is_username_available`, `create_dm_conversation` · edge MISSING: `vybe-agent` (404), `community-voice-token`, `link-onesignal-user`, `spaces-token` · `ai-chat` deployed (401 anon)
- **Verify:** `npm run build` PASS · `npm run lint` PASS
- **Git:** local only (not committed/pushed)

## Next 3 Tasks
1. **Supabase SQL Editor (agtcyx):** paste `supabase/manual/PENDING_20260530.sql` + `20260108184952_*create_dm_conversation*.sql` + `20260613150000_stories_upload_android_fix.sql`
2. **Lovable Backend deploy (agtcyx):** `ai-chat`, `vybe-agent` — set `LOVABLE_API_KEY` secret on agtcyx
3. **Lovable → Share → Publish** → smoke: Messages list, post story, VYBE-AI send "hi"

## What Changed (publish prep — 2026-06-14)
- **`auth.tsx` / `Landing.tsx`** — fail-soft `sync_signup_username`; normalize signup email; terms toast
- **`ChatView.tsx` / `Messages.tsx`** — fix desktop right-pane skeleton on stale `/messages/:id`
- **`public/sw.js`** — v12 cache bust; removed debug instrumentation
- **Git:** pushed `0470b47f` · `npm run build` PASS · production still `index-BW3exuY_.js` until Publish

## Next 3 Tasks
1. **Lovable → Share → Publish** (required for vybehub.app)
2. Hard refresh vybehub.app — bundle hash should change from `index-BW3exuY_.js`
3. Smoke: login → Messages (desktop empty pane) → VYBE-AI

## What Changed (Friend Link sheet polish v2 — 2026-06-13)
- **`AutoFriendDrop.tsx`** — unified handle + title header (no border); tighter padding; close pinned top-right; `reduceMotion` passed to content; maxHeight 68vh for no-scroll QR on iPhone
- **`FriendLinkSheetContent.tsx`** — text-only Phone Tap / QR Scan tabs; smaller tap hero; 144px scanner; white QR tile only; removed neon scanner brackets; muted phase states
- **`FriendLinkTapAnimation.tsx`** — neutral phone/wifi styling (no primary/accent glow)
- **`index.css`** — compact `--sheet` tap sizing; subtle tab active state; softer scanner pulse + scan line
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → Friend Link on Home; QR + camera visible without scroll; tab switch clear

## What Changed (Friend Link sheet redesign — 2026-06-13)
- **`AutoFriendDrop.tsx`** — full-width liquid-glass bottom sheet (slide-up spring) anchored above bottom nav; drag handle + header; z-index 10080/10081 unchanged
- **`FriendLinkSheetContent.tsx`** — Tap/Scan tabs with framer-motion crossfade; QR hero (white tile + full-width scanner); clean phase states
- **`FriendLinkTapAnimation.tsx`** — softer scene styling; `--sheet` size variant
- **`index.css`** — scanner pulse + scan line; `--sheet` tap sizing; tab glass styles
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → Friend Link on Home; confirm bottom sheet, QR scannable, camera visible without scroll

## What Changed (Friend Link sheet UI polish — 2026-06-13)
- **`AutoFriendDrop.tsx`** — centered modal (not bottom sheet); removed redundant in-sheet tips; fixed Phone Tap / QR Scan segmented control (no sliding glow bleed); centered title + decorative handle
- **`FriendLinkTapAnimation.tsx`** — tighter scene sizing and border for tap illustration
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → open Friend Link on Home; confirm centered modal + clean tab switcher

## What Changed (onboarding once-only cache fix — 2026-06-13)
- **Root cause:** Disk-cached profile kept stale `onboarding_completed: false` after DB was `true`; auth hydrated false before fetch, trapping users on `/onboarding` and blocking story publish
- **`profileCache.ts`** — never persist `false` to disk; ignore legacy disk `false` on read; `stripStaleOnboardingFlagFromDisk()` on sign-in/hydrate
- **`auth.tsx`** — only trust cached `onboarding_completed: true`; strip stale disk flag on SIGNED_IN + hydrate
- **`InviteRedeem.tsx`** — stage machine uses `refreshProfile()` (fresh DB) instead of stale auth context
- **`GreetingWidget.tsx`** — align cache read with trust-only-true rule
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → sign in as onboarded user; confirm no `/onboarding` bounce; post story from Home

## What Changed (publish prep — 2026-06-13)
- **Git:** pushed `a7d0eaea` to `main` (onboarding once-only + story publish + profile audit migration)
- **Supabase:** applied `fix_profile_audit_change_type` on `hprmicwhlaaqfgshucec` via MCP
- **Build:** `npm run build` PASS
- **You:** Lovable → Share → Publish (see DEPLOY.md) — agents cannot click Publish

## Current Focus
- **You:** Lovable Publish → smoke test onboarding once-only + story publish on vybehub.app

## Next 3 Tasks
1. Lovable Publish → sign in as completed user; should land on Home, never `/onboarding`
2. New signup → complete onboarding (full + skip paths); should stay on Home after
3. Post story from Home stories bar after publish

- **Root cause:** Share stayed disabled until profile ID loaded; story insert used stale/missing author id; stories bar query did not refetch after publish
- **`StoryCreator.tsx`** — Share enabled when media ready; `resolveStoryAuthorProfileId()` on submit; refetch stories after success
- **`useStories.ts`** — resolve author at insert time; fix cache for first story; use `useAuthProfileId` for query key; force refetch after publish
- **`publishStoryMedia.ts`** — shared storage upload helper
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → post a story from Home stories bar

## What Changed (onboarding loop fix — 2026-06-12)
- **Root cause:** `handleFinish` / `handleDesignerComplete` saved `onboarding_completed: true` to DB but never called `refreshProfile()` — auth context stayed stale (`onboarding_completed: false`) so Home/Landing redirected back to `/onboarding`
- **`Onboarding.tsx`** — `await refreshProfile()` after successful save and before navigating home; profile update now uses `.select().maybeSingle()` and throws if zero rows updated
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → complete onboarding end-to-end; should land on Home without bounce-back

## Current Focus
- **You:** Lovable Publish → smoke test onboarding + VYBE AI

## Next 3 Tasks
1. Lovable Publish → complete onboarding (full path + skip path)
2. Confirm no redirect loop to `/onboarding` after AI designer step
3. Smoke test VYBE AI + auth persistence on vybehub.app

## What Changed (VYBE AI timeout + legacy URL fix — 2026-06-13)
- **Root cause:** prod bundle still baked `eabvbt` Supabase URL → edge calls hit wrong project / 401 JWT mismatch; text chat tried `vybe-agent` first (25–60s) before `ai-chat`, doubling latency; `AbortError` surfaced as generic timeout instead of session/refresh errors
- **`canonicalSupabase.ts`** — runtime + build canonicalize legacy refs → `hprmicwhlaaqfgshucec` URL + anon key
- **`functionAuth.ts`** — canonical edge URLs; auth header cache (30s); `AuthRefreshTimeoutError` + clearer `formatAiChatError`
- **`runtime-client.ts` + `vite.config.ts`** — Supabase client + build define use canonical hprmic even when Lovable injects `eabvbt`
- **`aiChatRouting.ts`** — skip `vybe-agent` for greetings/first short message; skip agent 30m after 401
- **`AIChat.tsx`** — direct `ai-chat` for "yo"/"hi"; stream idle bailout (35s)
- **`useVybeAgent.ts`** — agent fetch timeout 25s; record auth failures
- **Verify:** `npm run build` PASS (legacy env build → only `hprmic` URLs in bundle)
- **You:** Lovable Publish → `/VYBE-AI` send "yo"; sign out/in once if session-expired message

## Current Focus
- **You:** Lovable Publish → smoke test VYBE AI text chat + auth persistence

## Next 3 Tasks
1. Lovable Publish → `/VYBE-AI` send “yo” — should reply via ai-chat in ~2–5s
2. Sign out/in once if you see session-expired message (legacy JWT not portable to hprmic)
3. Smoke test agent actions (navigate, theme) after publish

## What Changed (VYBE AI no-response fix — 2026-06-13)
- **Root cause:** prod edge logs show paired `401 Invalid token` on `vybe-agent` then `ai-chat`; client fell back to ai-chat on agent 401 and called `getFunctionAuthHeaders()` again — `refreshSession()` had no timeout and could hang indefinitely (typing dots forever, no bubble)
- **`functionAuth.ts`** — `refreshAuthSessionWithTimeout()` (8s cap); shared `formatAiChatError()` with AgentRequestError status support
- **`useVybeAgent.ts`** — timed refresh on agent 401 retry; **no ai-chat fallback on 401 / Not authenticated** (same JWT gate)
- **`AIChat.tsx`** — `appendAssistantReply()` on every exit path; auth header failure caught before ai-chat fetch
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → `/VYBE-AI` send text; expired session should show in-chat “Session expired…” not infinite loading

## Current Focus
- **You:** Lovable Publish → smoke test VYBE AI text chat + auth persistence

## Next 3 Tasks
1. Lovable Publish → `/VYBE-AI` send “hi” — should reply or show clear in-chat error
2. Sign out/in once if you see session-expired message (legacy JWT not portable to hprmic)
3. Smoke test agent actions (navigate, theme) after publish

## What Changed (auth session persistence — 2026-06-13)
- **Root cause:** mixed Supabase project refs in localStorage (`eabvbt`/`agtcyx` vs canonical `hprmic`); `hasStoredSupabaseSession` counted wrong-project tokens; `isFatalRefreshError` treated generic "expired"/"jwt expired" as fatal → local sign-out; Supabase `SIGNED_OUT` on transient refresh failure cleared React auth state
- **`supabaseStorageKey.ts`** — JWT project-ref validation, legacy key migration, canonical-only session detection
- **`supabaseAuthStorage.ts`** — migrate on read, ignore wrong-project tokens
- **`bootstrapAuthStorage.ts` + `main.tsx`** — repair/migrate before Supabase client init
- **`auth.tsx`** — narrower fatal refresh errors; recover from unexpected `SIGNED_OUT` when stored token exists
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish + test sign-in → close tab → reopen; Despia cold start if applicable

## Current Focus
- **You:** Lovable Publish → smoke test auth persistence (close/reopen tab, Despia cold start)

## Next 3 Tasks
1. Lovable Publish → sign in, close tab, reopen — should stay logged in
2. Despia WebView: force-quit app, reopen — session should restore (may need slow-network patience)
3. Users on legacy `eabvbt`/`agtcyx` sessions must sign in once on `hprmic` (tokens not portable)

## What Changed (AI chat timeout fix — 2026-06-13)
- **Root cause:** prod bundle still baked `eabvbt` Supabase URL; `vybe-agent` fails → ai-chat fallback hit **404 on hprmic** (fn not deployed) or wrong legacy project
- **Deployed edge on `hprmicwhlaaqfgshucec`:** `ai-chat` (streaming fallback now live)
- **`vite.config.ts`** — build fallback defaults → canonical `hprmicwhlaaqfgshucec` (was `agtcyx`)
- **`functionAuth.ts`** — `getEdgeFunctionUrl()` + `isLegacySupabaseProject()` for consistent fn URLs
- **`AIChat.tsx`** — actionable errors (404/auth/timeout/legacy), 120s fetch + 180s stream budget, no silent fallback when agent error is non-recoverable
- **`useVybeAgent.ts`** — uses `getEdgeFunctionUrl('vybe-agent')`
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish so vybehub.app bundle stops using legacy `eabvbt` URL

## Current Focus
- **You:** Lovable Publish (fixes baked Supabase URL) + smoke test VYBE AI text chat

## Next 3 Tasks
1. Lovable Publish → open VYBE AI, send text — should reply (agent or chat fallback)
2. Confirm prod bundle uses `hprmicwhlaaqfgshucec` in JS (not `eabvbt`)
3. Smoke test agent actions (navigate, theme) after publish

## What Changed (full scan + edge deploy — 2026-06-13)
- **`npm run debug`:** build/lint/CSS PASS; RPCs OK on hprmic; all client edge refs exist locally
- **Deployed edge on `hprmicwhlaaqfgshucec`:** `giphy-search`, `ai-catch-up`, `community-voice-token` (GIF picker, AI brief, community voice)
- **Prior same session:** `livekit-token`, `share-preview` deployed
- **DB verified:** `notification_preferences` Snapchat columns present on prod
- **Debug scan:** expanded edge probe list (push, OneSignal link, spaces-token)
- **Still needs Lovable Publish:** client AI chat URL fix + error handling (see git status)

## Current Focus (prior)
- **You:** Deploy `vybe-agent` edge fn + Lovable Publish (unified AI agent Phase 1)

## What Changed (VYBE AI agent Phase 1 — 2026-06-13)
- **`supabase/functions/vybe-agent`** — merged chat + commander + `navigate` tool
- **`supabase/functions/_shared/agentToolSchema.ts`** — canonical OpenAI tool JSON (`vybe_agent_act`)
- **`src/lib/agent/`** — zod schema, risk tiers, **AgentActionBus** + handler registry
- **`AgentActionBusProvider`** in `App.tsx`; handlers: navigate, theme, widgets
- **`AIChat.tsx`** — text → vybe-agent → bus; images → `ai-chat` stream
- **`VYBECommandBar`** — FAB → `/VYBE-AI`
- **Docs:** `src/lib/agent/README.md`
- **Verify:** `npm run build` PASS

## Current Focus (prior)
- **You:** Lovable → Share → Publish (calls, share links, story bake, UI cleanup)

## Next 3 Tasks
1. Lovable Publish → smoke test 1:1/group call (livekit-token now deployed on hprmic)
2. Share a post → link opens vybehub.app / OG preview works
3. Story camera text + gallery pick end-to-end

## What Changed (prod fixes + UX — 2026-06-13)
- **Deployed edge on `hprmicwhlaaqfgshucec`:** `livekit-token`, `share-preview` (calls + share OG previews unblocked)
- **`src/lib/livekitCallToken.ts`** — centralized call token invoke + clear deploy error
- **`callStore.tsx` / `GlobalCallOverlay.tsx`** — use `invokeLiveKitCallToken`
- **`shareLinks.ts`** — share-preview when project ref set; vybehub.app fallback
- **UI cleanup:** removed fake Lenses button (`Camera.tsx`), Share-to-story stub (`ShareSheet.tsx`), Sounds search tab stub (`Search.tsx`)
- **Ops:** `AGENTS.md`, `scripts/debug-scan.mjs`, `supabase/config.toml`, `.env.example` → canonical prod ref `hprmicwhlaaqfgshucec`
- **Verify:** `npm run build` PASS

## What Changed (story creator fix — 2026-06-13)
- **`src/lib/bakeCameraEdits.ts`** — bakes CameraEditor text, stickers, image overlays, and draw paths onto photos (no filter re-apply); video best-effort via `flattenVideo`
- **`Camera.tsx`** — `onSave` async bakes edits before `onCapture` / share; loading state on Continue; revokes stale blob URLs
- **`CameraEditor.tsx`** — passes editor display size for object-contain coord mapping; disabled Continue while saving
- **`StoryCreator.tsx`** — validating spinner on select screen; file input reset in `finally` (incl. early returns)
- **Verify:** `npm run build` PASS

## What Changed (Snapchat deploy — 2026-06-13 live)
- **Applied on `hprmicwhlaaqfgshucec`:** prefs columns, quiet hours, `should_send_push`, Snapchat DM/social/call triggers, story like/view triggers, push_tokens RLS, stories bucket MIME
- **Deployed edge:** `send-push-notification` @ hprmicwhlaaqfgshucec
- **Optional:** OneSignal dashboard DM/Social Android channel IDs → edge secrets

## What Changed (Snapchat-style notifications — 2026-06-13 code)
- **DB** `20260613160000_snapchat_style_notifications.sql` — prefs (`show_message_preview`, `calls_enabled`, etc.), `is_in_quiet_hours` / `should_send_push`, Snapchat DM/social/call triggers, story like/view notifications, `fire_push_notification` `p_data`
- **Edge** `send-push-notification` — OneSignal thread/grouping, sender avatar, DM/social channel IDs
- **SW** `public/sw.js` — Snapchat-style DM/social/story display + collapse tags
- **Client** — `useAppIconBadge`, `appIconBadge.ts`, settings toggles, `AppIconBadgeMount` in `App.tsx`
- **Verify:** `npm run build` PASS

## Current Focus (prior)
- **You:** Lovable → Share → Publish (login instant-load fix + prior push/story commits)

## Next 3 Tasks
1. Lovable Publish → log in fresh: feed/DMs/notifications should load immediately (no app-switch needed)
2. Android: post story + push toggle test
3. Confirm `push_tokens` row after push re-enable

## What Changed (login instant load — 2026-06-13)
- **`src/lib/auth.tsx`** — `bootstrapSessionData()` on sign-in: resolve profile id → warm home caches → refetch active queries (same repaint path as app resume/focus)
- Clears `resolveSessionProfileId` memo on sign-out / user change
- **Verify:** `npm run build` PASS

## What Changed (publish prep — 2026-06-13 Android)
- **`b2b93cc8`** — story upload: contentType, Android MIME inference, gallery `capture` removed, bucket 3gp/heic, story RLS
- **`af7465d5`** — Android push: linkOneSignalUser import fix, platform settings copy, longer Despia waits
- **`92510eed`** — push linking edge fn + push_tokens RLS
- **Already live on Supabase:** push triggers, story bucket MIME, story RLS migrations
- **Verify:** `npm run build` PASS

## Current Focus (prior)
- **You:** Lovable → Share → Publish (git pushed @ `fcbb04bb`)

## What Changed (push trigger fix — 2026-06-13)
- **DB migration** `20260613130000_fix_push_trigger_supabase_url.sql` — `get_supabase_project_url()`, `get_push_service_role_key()`, fixed `fire_push_notification`, `notify_push_on_notification`, `notify_message_recipients`, `notify_push_on_call` (was `agtcyxjxgkdyoxwxkjth`)
- **Vault** — `service_role_key` updated to `hprmicwhlaaqfgshucec` JWT (was legacy project ref)
- **Edge** — `send-push-notification` accepts service-role JWT by project ref (DB triggers no longer 401)
- **Secrets** — `ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY` set to Despia app `85bcf4b4-…`
- **Verified** — `net._http_response` id 7 → HTTP 200 from edge; delivery blocked until OneSignal user exists (external_id not linked yet)

## Current Focus (prior)
- **Published** @ `34f54756` — prod verified 2026-06-13

## Publish verification (2026-06-13)
- **https://vybehub.app** — HTTP 200, fresh Lovable deployment
- **Supabase in HTML** — preconnect to `hprmicwhlaaqfgshucec.supabase.co` (correct project)
- **Lazy chunks** — `Settings-CU-cdOVG.js` (test push UI), `edgeFunctionResponse-QBY6ra2O.js` (`pushDeliveryErrorMessage`, OTP errors), `usePushNotifications-CHph0EPO.js`
- **SW** — `vybe-v9` / cache buster `vybe-cache-v5`

## What Changed (publish prep — 2026-06-13)
- **OTP paste/autofill** — `LoginGateModal`, `PhoneNumberCard`, `EmailVerification` use `InputOTP` + `one-time-code` autofill (fixes SMS paste filling only first digit)
- **Push test honesty** — `NotificationsSection` parses edge response; `usePushNotifications` waits for Despia OneSignal link; `pushDeliveryErrorMessage()` helper
- **DB migration** — `20260613120000_push_tokens_update_policy.sql` (UPDATE RLS for upsert; apply on `hprmicwhlaaqfgshucec` if not yet)
- **Git:** `main` @ `34f54756` pushed to origin
- **Verify:** `npm run build` PASS · lint PASS (3 pre-existing warnings)

## Current Focus (prior)
- **You:** Lovable Publish — user-reported bug fix batch (below)

## Next 3 Tasks
1. Lovable Publish → smoke test story upload, DMs vibe edit, VYBE AI chat, friend-request dismiss/tap
2. Apply prod SQL: `20260612120000_friend_request_sender_notified.sql` (sender can dismiss accepted-request rows)
3. Apply `PENDING_20260530.sql` on prod; deploy `community-voice-token`

## What Changed (user-reported bug fixes — 2026-06-12)
- **Stories upload stuck** — `StoryCreator` storage uploads use `withTimeout` (120s/60s); `useCreateStory` uses `useAuthProfileId`, clears optimistic `isUploading` on success; `StoriesBar` shows upload state
- **DMs vibe edit** — `DMsHeader` status lookup uses `profiles.id` (not auth uid); `useSetStatus`/`StatusPicker` use cached profile id + error toasts
- **VYBE AI typing bubble** — `AIChat` uses `fetchWithTimeout` (90s), handles non-SSE JSON responses, timeout/empty-reply fallbacks
- **VYBE AI Designer removed** — unmounted `VYBECommandBar` from `App.tsx`; removed AI redesign banners from `HomeGridEditor` + `HomeWidgetCustomizer`
- **Accepted friend dismiss (X)** — RLS migration for sender `notified_at` update; optimistic cache + localStorage fallback in `useDismissAcceptedRequest`; X visible on mobile
- **Friend request tap** — `AcceptedFriendChatRow` opens DM first; `Notifications` friend_request → profile, friend_accepted → chat; requests tab rows tappable
- **Verify:** `npm run build` PASS

## Current Focus
- **You:** Lovable Publish — call instant-connect + Snapchat-style incoming preview

## Next 3 Tasks
1. Lovable Publish → test 1:1 audio/video call (caller connects immediately; callee sees live camera before accept)
2. Smoke test Friend Link QR sync animation + DM open
3. Apply `PENDING_20260530.sql` on prod; deploy `community-voice-token`

## What Changed (Snapchat-style calls — 2026-06-12)
- **`p2pConnection.ts`** — `connectPreview()` (callee receive-only before accept) + `attachLocalMedia()` (upgrade on accept)
- **`GlobalCallOverlay.tsx`** — removed accept-wait blocking; caller connects P2P immediately; incoming preview effect; live caller video on incoming screen; camera/mic toggles work during `joining`; remote video re-binds after accept
- **`callStore.tsx`** — P2P `startCall` uses `connectStage: 'signaling'` (not `ringing`) so WebRTC starts in parallel with ring
- **Verify:** `npm run build` PASS

## Debug scan (2026-06-13 — post stability polish `c999a15b`)
- **Command:** `npm run debug` (build, lint, CSS, edge-fn refs, prod RPC/edge probes)
- **Frontend:** build PASS · lint PASS (3 pre-existing warnings in `queryRefetchPolicy.ts`) · CSS PASS · `tsc --noEmit` PASS
- **Edge fn refs:** 88 client refs → all 120 local functions OK
- **Production RPCs (`agtcyxjxgkdyoxwxkjth`):** `get_public_user_count` MISSING · `sync_signup_username` MISSING · `ensure_user_level` HTTP 400 (auth required — OK)
- **Production edge samples:** `livekit-token`, `generate-advanced-theme`, `ai-catch-up`, `share-preview` deployed; `community-voice-token` **404 NOT DEPLOYED** (fallback: `livekit-token` / `spaces-token`)
- **Code regression review (`dfbdd341` → `c999a15b`):** no TS/lint errors in changed files; no broken imports; `useAuthProfileId` consistent on user-facing hooks; feed hooks use `getEffectiveProfileId` (sync cache — intentional)
- **Git:** `main` @ `c999a15b`, clean vs `origin/main` (untracked `.tmp-recording/` only)
- **In-repo fixes:** none required
- **Unblock (prod backend):**
  1. Paste `supabase/manual/PENDING_20260530.sql` into prod SQL Editor (`agtcyxjxgkdyoxwxkjth`)
  2. Lovable Backend deploy for `community-voice-token` (or `supabase functions deploy community-voice-token`)
  3. Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after crash-prevention hardening (below)

## Next 3 Tasks
1. Lovable Publish (cache buster bumped to `vybe-cache-v5` — clears bad persisted Set/Map)
2. Smoke test major tabs after publish — confirm no blank panels on error
3. Apply `PENDING_20260530.sql` on prod; deploy `community-voice-token`

## What Changed (crash prevention hardening — 2026-06-12)
- **`persistedCollections.ts`** — global Set/Map revival on persist restore; `safeSetHas` / `safeMapGet` helpers; query-key registry for persisted collections
- **`queryPersister.ts`** — custom `deserialize` revives Set/Map before React Query hydrates
- **`App.tsx`** — root `SmartErrorBoundary` always gets `AppErrorFallback`; `reviveQueriesInCache()` on persist restore; cache buster `vybe-cache-v5`
- **`AnimatedRoutes.tsx`** — route-level `ErrorBoundary` + `AppErrorFallback` (Try again / Reload / Go Home)
- **`AppErrorFallback.tsx`** — shared fallback UI for root, routes, and feature boundaries
- **Hooks** — `select: normalizePersistedSet` on `useDismissedProfiles`, `useHiddenConversations`, `useTrashedConversationIds`, `useMyFeatureVotes`, consolidated duplicates in outgoing/trashed hooks
- **Defensive reads** — `DMsHeader` (`safeMapGet`), `MutualFriendsQuickAdd` (`safeSetHas`)
- **Verify:** `npm run build` PASS

## What Changed (blank black DMs fix — 2026-06-12)
- **`SmartErrorBoundary`** — on error, render `fallback` prop (or inline Retry UI) instead of `return null`; reset loop now keeps `hasError` and shows fallback; `handleRetry` clears reset counter
- **Root crash:** `DMsHeader` called `statusMap.get()` on persisted React Query cache that deserializes `Map` → plain object → `TypeError` → boundary returned null → permanent blank panel after 3 crashes
- **`useBatchUserStatuses`** — `select: normalizePersistedMap` via new `src/lib/persistedCollections.ts`
- **`useOutgoingRequestUserIds`** — `select: normalizePersistedSet`
- **`DMsHeader`** — defensive `instanceof Map` before `.get()`
- **`loadDMConversations`** — `hidden_conversations` filter uses auth user id (schema: `auth.users.id`), not profile id
- **`useConversationDetail`** — `enabled` gated on `useAuthProfileId()` instead of sync-only cache id
- **Verify:** `npm run build` PASS

## What Changed (social app polish pass — 2026-06-12)
- **Profile hydration** — migrated user-facing hooks to `useAuthProfileId()` / auth-user fallback: `useSavedPosts`, `useBlockedUsers`, `useBanStatus`, `useCommunities`, `useServers`, `useChallenges`, `useMarketplace`, `useSharedThemes`, `useStreaks` (map helpers), `useSounds`, `useVybePass` unclaimed rewards, `useRankedFeed`, `useInfinitePosts`, `useLocalFeed`
- **networkMode: 'always'** — first-load critical queries: blocked users, saved posts, communities/servers lists, marketplace browse, challenges, feeds (personalized/following/local/ranked), search hooks, public communities
- **Loading UX** — cache-first skeleton gates on Market, Search, Community, Profile; Retry on error for Search, Market, Profile
- **ChatView** — voice upload uses `user?.id` fallback when `profile.user_id` not hydrated yet
- **Build:** `npm run build` pass · **Lint:** pass (3 pre-existing warnings in `queryRefetchPolicy.ts`)

## Publish status (2026-06-12 — social app polish)
- **Git:** pending push to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## Next 3 Tasks
1. Lovable Publish + force-quit app on iPhone to bust cache
2. Smoke test: Home feed first load, Explore/Search, Profile, Market browse
3. Smoke test: Communities tab, Challenges hub, saved posts on profile

## What Changed (app stability audit — 2026-06-12)
- **Auth hydration** — `useAuthProfileId()` on Friends discovery (`useOutgoingRequests`, `useDismissedProfiles`), streaks, announcements, accepted-friend rows, NewMessage search, `useConversations` / `useMessages`
- **networkMode: 'always'** — chat messages (empty-cache hang fix), notifications, friend requests, message requests, discovery hidden-set queries
- **Admin staff gates** — `isStaffQueryEnabled` now uses cached profile id via `useAuthProfileId` in dashboard, moderation hooks, Live Analytics, Appeals, Announcements, Submissions; section loading only when cache empty
- **useModeration.ts** — removed duplicate import; `useUserRole` uses `useAuthProfileId`
- **Build:** `npm run build` pass · **Lint:** pass (3 pre-existing warnings in `queryRefetchPolicy.ts`)

## Publish status (2026-06-12 — stability audit)
- **Git:** pending push to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## Next 3 Tasks
1. Lovable Publish + force-quit app on iPhone to bust cache
2. Smoke test: Messages list + open chat; Notifications tab; Add Friends search
3. Smoke test: Admin panel sections (Live Analytics, Reports, Error Monitor, Submissions)

## What Changed (admin + Messages loading fix — 2026-06-12)
- **`adminAccess.ts`** — `hasStaffIdentity` / `isStaffQueryEnabled` for cached-profile boot (auth ready without live `user`)
- **`AdminDashboard.tsx`** — staff gate uses cached profile id; dashboard queries `networkMode: 'always'`
- **`useModeration.ts` / `useModerationActions.ts`** — reports/flags/warnings/bans enable on cached profile; `networkMode: 'always'`
- **`AdminLiveAnalytics.tsx`** — staff-gated queries with `networkMode: 'always'`
- **`useAuthProfileId.ts`** — async session profile resolve (shared `session-profile-id` query key)
- **`useDMConversations.ts`** — restored `networkMode: 'always'` on DM list (fixes perpetual spinner regression from b2547a24)
- **`useMessages.ts`** — unread badge uses `useAuthProfileId()`
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — admin + Messages loading)
- **Git:** `dfbdd341` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## What Changed (Messages cluster hardening — 2026-06-09)
- **`invalidateConversationCaches.ts`** — central helper to sync `dm-conversations` + `conversations` caches
- **`useMessageRequests.ts` / `useTrashedConversations.ts` / `useHiddenConversations.ts`** — `useAuthProfileId()` during hydration; dual-cache invalidation
- **`DesktopRightSidebar.tsx`** — uses `useDMConversations` (was duplicate `useConversations` fetch)
- **`ChatView.tsx`** — send/read/view guards use cached `profileId` (not live `profile?.id`)
- **`useTabNotificationBadge.ts` / `useQuickAddSuggestions.ts`** — cached profile id for badges + Quick Add
- **`NewMessage.tsx`** — search loading only on first fetch (not background refetch)
- **Invalidation audit** — group chat, share, friends, profile updates, etc. now invalidate both list caches
- **Build:** `npm run build` pass

## Publish status (2026-06-09 — Messages cluster)
- **Git:** `b2547a24` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app
- **After publish:** force-quit app; hard-refresh browser

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## What Changed (Messages stabilization — 2026-06-09)
- **`resolveSessionProfileId.ts`** — single deduped session profile lookup for DMs/messages/chat
- **`loadDMConversations.ts`** — fail-soft loader returns `{ data, error, profileId }`; `syncDmListCaches()` write-through
- **`useDMConversations.ts`** — uses resolver + fail-soft fetch; `offlineFirst`; soft-error banner when stale list shown; simplified `isLoading`
- **`ConversationList.tsx`** — shell always visible; skeleton only on true first load; inline stale-list Retry banner; removed 8s refetch loop
- **`profileCache.ts`** — allow legacy disk cache missing `user_id` (instant boot)
- **`useMessages.ts` / `useConversationDetail`** — `resolveSessionProfileId`; `offlineFirst` for cached threads
- **Build:** `npm run build` pass

## Publish status (2026-06-09 — Messages stabilize)
- **Git:** uncommitted locally — commit + push, then Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## What Changed (ChatView conversation load fix — 2026-06-12)
- **`useConversationDetail`** — new hook reads `dm-conversations` cache or fetches members/profiles for ChatView
- **`ChatView.tsx`** — uses conversation detail hook + `useAuthProfileId()` (was empty "Chat" / offline header)
- **`useMessages.ts`** — resolve viewer profile from session; `networkMode: 'always'`
- **`useDMConversations.ts`** — sync `conversations` cache alongside `dm-conversations`
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — ChatView)
- **Git:** `5cee531e` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs perpetual skeleton fix — 2026-06-12)
- **`ConversationList.tsx`** — skeleton only on first fetch (`!isFetched`), not background refetch; removed mount refetch loop
- **`queryRefetchPolicy.ts`** — empty DM list no longer uses `refetchOnMount: 'always'` (was re-skeletoning forever)
- **`loadDMConversations.ts`** — resolve profile id from auth session; members fetch non-fatal
- **`useDMConversations.ts`** — migrate query cache when session profile id differs from stale key
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs skeleton)
- **Git:** `05ea633a` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs loading spinner fix — 2026-06-12)
- **`useDMConversations.ts`** — bootstrap profile id from auth user when profile state missing; `networkMode: 'always'` (was pausing forever offlineFirst); clearer isLoading gate
- **`ConversationList.tsx`** — removed orphan `!isFetched` spinner; skeleton covers all pending states; profile-missing Retry UI
- **`profileCache.ts`** — reject disk cache entries missing `user_id` when auth user is known
- **`useAcceptedFriendRequests.ts`** — uses `getEffectiveProfileId()` for query enable/key
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs loading)
- **Git:** `e96cae1c` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs blank list P0/P1 fix — 2026-06-12)
- **`ConversationList.tsx`** — `AcceptedFriendChatRow` uses `acceptedBy` (was broken `sender` field); never render blank `: null` empty state; Retry button on fetch error; 8s refetch even after empty success
- **`loadDMConversations.ts`** — throw on membership/conversations/members errors so React Query surfaces Retry (was swallowing errors as `[]`)
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs P0/P1)
- **Git:** `cc379c37` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs + bug reports + Friend Link opacity — 2026-06-12)
- **`ConversationList.tsx`** — skeleton only on first fetch; refetch when profile id ready; removed perpetual loading loop
- **`useDMConversations.ts`** — isLoading gated on `!isFetched` (not every background refetch)
- **`AdminBugReports.tsx` / `AdminErrorsSection.tsx`** — split reporter fetch (no brittle FK join); fixed loading gate with `isLoading`
- **`adminAccess.ts`** — staff gate waits for auth identity
- **`AutoFriendDrop.tsx` + `index.css`** — opaque Friend Link sheet/backdrop (fixes see-through on custom home bg)
- **Build:** `npm run build` pass

## Publish status (2026-06-12)
- **Git:** `936396ae` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs load + poster stories resize — 2026-06-12)
- **`ConversationList.tsx`** — no full-page skeleton; header/AI row always visible; inline list loading; `useAuthProfileId()` throughout
- **`useDMConversations.ts`** — clearer loading state; `useMarkConversationRead` uses cached profile id
- **`useMessages.ts` / `useGlobalRealtimeMessages.ts`** — conversation cache keys aligned on `getEffectiveProfileId()`
- **`selfHealingMonitor.ts` / `GlobalErrorHandler.tsx`** — removed "VYBE AI is fixing this…" toast spam; silent heuristics only
- **`StoriesBar.tsx` / `StoryPoster.tsx` / `storyUtils.ts`** — bigger default posters (84×112); scale with home grid colSpan/rowSpan + ResizeObserver
- **`HomeWidgetRenderer.tsx`** — passes widget size into StoriesBar for resize-in-edit-mode
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs + poster stories)
- **Git:** `3a5032de` pushed to `origin/main`
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **After publish:** force-quit iPhone app; hard-refresh browser

## Current Focus
- **You:** Lovable Publish (one click — agent cannot trigger this)

## What Changed (Friend Link add-friend fix — 2026-06-09)
- **`useFriends.ts`** — `useSendFriendRequest` / respond / cancel / unfriend use `getEffectiveProfileId()` during auth hydration
- **`useFriendDropSync.ts`** — create/scan/realtime use cached profile id
- **`FriendDropLink.tsx`** — `useAuthProfileId()`; no infinite "Connecting…" spinner; scan uses profile id
- **`AddFriend.tsx`** — profile-id self-check + Quick Add exclude id fix
- **`AutoFriendDrop.tsx`** — create drop + QR/NFC self-checks use cached profile id
- **Build:** `npm run build` pass

## Publish status (2026-06-09 — Friend Link fix)
- **Git:** `8e5e15ea` pushed to `origin/main` (Friend Link add-friend hydration fix)
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **After publish:** force-quit iPhone app; hard-refresh browser
- **Verify:** `curl -s https://vybehub.app/despia/local.json | head -3` — `deployed_at` should change

## Current Focus
- **You:** Lovable Publish (one click — agent cannot trigger this)

## What Changed (loading audit + bug reports fix — 2026-06-09)
- **`AdminBugReports.tsx`** — fixed infinite loading (use `isPending` + role gate); retry on error; correct `resolved_by` profile id
- **`AdminErrorsSection.tsx`** — admin-gated fetch, proper loading/error/retry states
- **`AdminDashboard.tsx`** — shared staff gate via `isStaffGateLoading`
- **`useUserRole`** — uses cached profile id during auth hydration
- **`useAuthProfileId`** — new hook for tab queries during boot
- **`useNotifications` / `useFriends` / `useUnreadMessagesCount`** — queries enable from cached profile id
- **`adminAccess.ts`** — shared admin/mod role helpers
- **Build:** `npm run build` pass

## Current Focus
- **Publish** — push loading audit + Lovable Publish

## What Changed (DMs not loading fix — 2026-06-09)
- **`profileCache.ts`** — validate disk cache with `getStoredAuthUserId()` when live auth user id isn't set yet (fixes infinite skeleton on Messages tab)
- **`auth.tsx`** — hydrate cached profile + set auth user id on all getSession/refresh success paths
- **`ConversationList.tsx`** — skeleton only while auth loading or first fetch, not forever when profile id missing
- **Build:** `npm run build` pass

## Current Focus
- **Publish** — push DMs fix + Lovable Publish

## What Changed (Snapchat poster stories + smooth clip progress — 2026-06-09)
- **`StoryPoster.tsx`** — rounded poster tiles (Snapchat-style) replace circular `StoryRing`
- **`StoriesBar.tsx`** — shows story cover thumbnails with yellow unviewed border; avatar only on empty “add story” tile
- **`StoryCreator.tsx`** — auto-generates cover on pick/capture; manual cover via frame scrub or upload
- **`storyUtils.ts`** — `generateStoryThumbnail`, `getStoryPosterUrl`, thumbnail upload helpers
- **`useStories.ts`** — `thumbnail_url` on create + optimistic UI
- **`ClipVideoProgress.tsx`** — rAF + GPU `scaleX` progress (no janky width transitions); subtle 8-bar audio waveform when unmuted
- **`MobileShortCard.tsx`** — passes `isMuted` to progress component
- **Migration:** `20260609120000_story_thumbnail_url.sql` — `stories.thumbnail_url`
- **Build:** `npm run build` pass

## Publish status (2026-06-09)
- **Git:** `eb2d7d1c` pushed to `origin/main` (poster stories, clip progress, profile cache fix)
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **DB:** Run on prod Supabase (`agtcyxjxgkdyoxwxkjth`) before/after publish:
  ```sql
  ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
  ```
- **After publish:** force-quit iPhone app; hard-refresh browser
- **Build:** `npm run build` pass

## Current Focus
- **You:** Lovable Publish + apply `thumbnail_url` migration in Supabase SQL editor

## What Changed (Friend Link QR + iPhone perf — 2026-06-09)
- **`FriendDropLink.tsx`** — scan deep link uses `profile.id` (not auth `user.id`); fixed self-check vs owner profile
- **`AddFriend.tsx`** — self-check compares profile id to URL id
- **`AutoFriendDrop.tsx`** — QR only after drop session created; profile id in NFC/scan paths; lighter jsQR loop + downscaled decode on native; skip backdrop-blur / infinite tap animations / `position:fixed` body lock on native
- **`FriendDrop.tsx`** — same profile-id URL fixes for legacy component
- **Build:** `npm run build` pass

## What Changed (phone verify, theme safety, VYBE AI — 2026-06-09)
- **`PhoneVerifyGate.tsx`** — centered modal; X dismisses for current session (`sessionStorage`); returns on next login session
- **`useCustomTheme.ts`** — `sanitizeThemeTokens()` clamps AI palettes for contrast, visible borders, safe native perf
- **`AIVybeDesigner.tsx`** — applies sanitized tokens before preview
- **`VYBECommandBar`** — remounted in `App.tsx`; generate-theme commands now apply the returned theme
- **Build:** `npm run build` pass

## What Changed (Friend Link tap animation — 2026-06-09)
- **`FriendLinkTapAnimation.tsx`** + **`index.css`** — CSS-only phone tap loop (smooth on iPhone)
- **`AutoFriendDrop.tsx`** — new animation; emerald LIVE badge when tap session active

## Publish status (2026-06-09)
- **Git:** `277614ca` pushed to `origin/main` (includes Friend Link, phone verify, themes, VYBE AI, DMs, tap animation)
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **After publish:** force-quit iPhone app; hard-refresh browser
- **Build:** `npm run build` pass

## What Changed (stale profile cache fix — 2026-06-09)
- **`profileCache.ts`** — `setActiveAuthUserId()` rejects disk cache from a different auth user; `getEffectiveProfileId()` no longer returns wrong-user ids
- **`auth.tsx`** — clears mismatched profile on account switch; hydrates cache only after auth user id is known
- **`supabaseStorageKey.ts`** — `getStoredAuthUserId()` for sync boot validation
- **`AppLayout.tsx`** — resets stuck `inDesigner` / theme preview lock / scroll-hide on route change
- **Build:** `npm run build` pass

## Current Focus
- **Publish** — push stale-profile fix + Lovable Publish
- **Despia** — confirm Native Advanced unit `5403238592` in dashboard; rebuild native shell

## Next 3 Tasks
1. Lovable Publish + force-quit app on iPhone to bust cache
2. Smoke test: Admin panel sections load (Live Analytics, Reports, Error Monitor)
3. Smoke test: Messages tab loads conversation list on tap

## What Changed (ads, DMs, FAB — 2026-06-11)
- **`despiaRewardedAds.ts`** — 45s timeout, dismiss recovery via visibility/focus, broader status parsing
- **`nativeFeedAds.ts` + `FeedAdCard.tsx`** — in-feed Native Advanced (`5403238592`); removed interstitial-on-scroll
- **`scrollHideSync.ts`** — shared scroll hide for BottomNav + floating FABs (fixes Designer FAB stuck)
- **`useMessages` / `ChatView`** — slimmer fetch (50 msgs), offline-first, cache-first skeleton
- **`useChatPrefetch` + `ConversationList`** — prefetch messages on touch before navigate
- **`VYBECommandBar`** — CSS translate hide (no conflicting Framer `y` animation)
- **Build:** `npm run build` pass

## What Changed (cache-first home Phase 0+1 — 2026-06-11)
- **`warmHomeCaches.ts`** — single boot warm path: feeds, DMs, stories, notifications, user meta, avatar signing
- **`cacheFirstLoading.ts`** — skeleton only when zero posts + pending; `FeedRefreshingBanner` when cache visible
- **`Home.tsx` / `HomeWidgetRenderer`** — `isPending`-based loading; no skeleton when cached posts exist
- **`GreetingWidget`** — pre-sign cached avatar on mount
- **`auth.tsx`** — `warmHomeCachesForProfile` when profile persists
- **`useAppPreloader`** — delegates to `warmHomeCaches` (removed duplicate warm helpers)
- **`App.tsx`** — cache buster `vybe-cache-v4`
- **Build:** `npm run build` pass

## What Changed (posts/DMs not loading — 2026-06-09)
- **`queryRefetchPolicy.ts`** — empty feed/DM caches return `refetchOnMount: 'always'` (boolean `true` was blocked by staleTime)
- **`profileCache.ts`** — `getEffectiveProfileId()` so feeds/DMs run during auth hydration
- **`useInfinitePosts` / `Home`** — use cached profile id; show skeleton while auth + no profile id
- **`useDMConversations` / `loadDMConversations`** — cached profile id; fail-soft on errors; loading while refetching empty list
- **`App.tsx`** — cache buster `vybe-cache-v3`
- **Build:** `npm run build` pass

## What Changed (instant load — DMs, level, feed — 2026-06-10)
- **`userLevelCache.ts`** — disk cache so home never flashes fake Lv.1
- **`useVybePass`** — fixed `ensure_user_level()` call (no invalid param); offline-first placeholder
- **`GreetingWidget` / `XPStreakWidget`** — hide level badge until real data; skeleton instead of Lv.1
- **`loadDMConversations`** — two-phase load (list shell → previews); per-conv last message (not 200-row scan)
- **`useAppPreloader`** — warm `personalized-feed-v2` + proper user_levels fetch on boot
- **`auth`** — prefetch DMs when profile hydrates; clear level cache on sign-out
- **Debug scan:** build PASS; prod still missing `get_public_user_count` / `sync_signup_username` RPCs
- **Build:** `npm run build` pass

## What Changed (splash / onboarding loading glitch — 2026-06-10)
- **`SplashScreen`** — removed scale exit (fragmented V logo); faster fade; hides app shell during splash
- **`splashSession.ts`** — sessionStorage flag so refresh on `/onboarding` skips replaying boot splash
- **`useAppPreloader`** — instant ready on setup routes (`/onboarding`, `/auth`, etc.)
- **`Onboarding`** — blocking "Saving…" overlay on Skip/Finish (no mystery reload)
- **`UsernameSetup`** — removed duplicate subtitle line
- **Build:** `npm run build` pass

- **`despiaRewardedAds.ts`** — central `displayrewardedad://` bridge + `updateRewardedStatus` handler; documents Android AdMob IDs
- **`main.tsx`** — registers rewarded callback at boot (before React)
- **`useRewardedAd`** — uses Despia bridge only; `canUseDespiaRewardedAds` (no RC/age spinner block)
- **`useAdEligibility`** — exports `canUseDespiaRewardedAds` for Wallet Watch & Earn
- **`ADMOB_SETUP.md`** — rewritten for Despia dashboard (not Capacitor)
- **Build:** `npm run build` pass

## What Changed (debug scan — 2026-06-10)
- **`npm run debug`** — full scan script (build/lint/CSS, edge fn refs, production probes)
- **`AGENTS.md`** — "do a debug" protocol for future sessions
- **Scan results:** frontend PASS; production missing RPCs `get_public_user_count`, `sync_signup_username`; `ensure_user_level` OK (auth required); `community-voice-token` edge fn not deployed (livekit-token fallback OK)
- **Blocker:** apply `supabase/manual/PENDING_20260530.sql` on prod `agtcyxjxgkdyoxwxkjth`; Lovable Backend deploy for new edge functions
- **Git:** `0d66fdd5` pushed — awaiting Lovable Publish

## What Changed (location + welcome/marketing preview — 2026-06-10)
- **Location** — no GPS prompt on app boot; only watches position on `/map`; Local feed asks when that tab is opened; onboarding permissions unchanged
- **`AppWelcome`** — phone screenshots use `object-cover` + eager load
- **`VybeHome`** — marketing device PNGs via `publicAsset()`; hero phones animate on mount (fixes Lovable preview `whileInView` miss)
- **`AIVybeDesigner`** — live preview cards no longer stuck invisible when animation gate fails
- **`useActivityStats`** — fail-soft on preview DB (home “Live” ticker always renders)
- **Build:** `npm run build` pass

## What Changed (home boot — missing nav + skeleton hang — 2026-06-10)
- **`BottomNav`** — show nav while profile loads; only hide when `onboarding_completed === false` (was hiding on undefined)
- **`profileCache` / `auth`** — persist `user_id` + `onboarding_completed`; hydrate cached profile on boot; backfill auth user id
- **`useUserLevel`** — query with `user.id` fallback so XP/level load without waiting on full profile
- **Splash CSS** — stop forcing nav `opacity: 0` during splash (was leaving nav invisible after fast dismiss)
- **Build:** `npm run build` pass

## What Changed (boot speed — 2026-06-10)
- **`useAppPreloader`** — instant ready for any returning user (stored session or cached profile); shorter persist gate; no blocking level/prefs wait; skip progress animation on exit
- **`App.tsx`** — shorter auth/splash caps (2s web max); optimistic session when token in storage
- **`BottomNav`** — boot grace 2.8s → 600ms
- **`auth.tsx`** — faster getSession safety timeout
- **Build:** `npm run build` pass

## What Changed (boot nav + profile hydration — 2026-06-10)
- **Bottom nav** — sync mobile detection on first paint; boot grace period; force-show after splash; main-tab recovery
- **Splash CSS** — removed `#app-shell visibility:hidden` (fixed black screen / missing nav)
- **Auth** — profile from disk cache on boot; rejects `user_xxxx` placeholders; greeting/XP skeletons while loading
- **Build:** `npm run build` pass

## What Changed (instant feed + Friend Link gate — 2026-06-10)
- **`authReady.ts`** — `isFullyLoggedIn()` helper (auth settled + real profile)
- **Friend Link** — pill, spotlight, shake, and sheet only for logged-in users
- **Home feed** — skeleton only when zero posts + loading; warm Following + For You on boot
- **`usePrefetchPosts`** — caches `personalized-feed-v2` + `infinite-following-posts`
- **Build:** `npm run build` pass
- **Git:** `0a291286` pushed — awaiting Lovable Publish

## Next 3 Tasks
1. User: Lovable → Share → Publish (loading fix — cache v3)
2. Force-quit app once after publish; verify home posts + Messages list load
3. Manual test cold start as `@mrassburgers` — For You, Global, DMs
2. User: paste `PENDING_20260530.sql` into prod SQL Editor (`agtcyxjxgkdyoxwxkjth`)
3. Device test — feed instant, no Friend Link for guests, DMs + level on cold start

## What Changed (instant DMs + onboarding — 2026-06-09)
- **`loadDMConversations.ts`** — shared fetch + nav/app prefetch for conversation list cache
- **`Messages.tsx`** — removed artificial mount skeleton delay
- **`useDMConversations`** — show cached list immediately; don't block on friends load
- **`ConversationList`** — skeleton only when no cached conversations
- **`useAppPreloader` / `routePreloader`** — prefetch DMs right after profile + on Messages tab hover
- **`Onboarding.tsx`** — Skip/Finish use `ensure_profile` + update (RLS-safe on production)
- **Build:** `npm run build` pass

## What Changed (incoming calls — 2026-06-09)
- **`GlobalCallOverlay`** — Snapchat-style full-screen incoming UI (portal → `document.body`, blurred caller wallpaper, slide-to-answer + Accept/Decline, locks scroll)
- **`nativeIncomingCall.ts`** + **`NativeIncomingCallBridge`** — Capacitor `@capgo/capacitor-incoming-call-kit` for iOS CallKit + Android full-screen intent; Despia `scanningmode://auto` during ring
- **`callStore`** — presents/dismisses native UI on ring/accept/decline; `vybe:incoming-call` event for push deep links
- **`NotificationActionRouter`** — tapping call notification surfaces full overlay before poll catches it
- **`send-push-notification`** — `ios_interruption_level: time_sensitive` for calls; optional `ONESIGNAL_CALL_CHANNEL_ID`
- **`DespiaOneSignalSync`** — requests incoming-call permissions on login
- **`index.css`** — `body.vybe-incoming-call-active` hides app chrome under overlay
- **Build:** `npm run build` pass

## What Changed (stability + UX pass — 2026-06-09)
- **DM refresh loop** — `ChatView` mark-read patches React Query cache instead of invalidating; `useMessages`/`useConversations` `refetchOnMount: false`
- **DM list density** — removed edge mask gradient; compact `.dm-convo-row`; smaller avatars; removed composer bottom shadow/fade
- **Bottom nav stuck** — `navVisibility.forceShow()` + scroll-hide reset on main tab routes
- **Splash preload** — warms user level, preferences, DNA settings before dismiss
- **Login approval** — `LoginGateModal` uses `activeChallengeId`; session retry on approve; push uses `profiles.id`
- **OneSignal push** — `send-push-notification` resolves auth uid → profile id for OneSignal lookup
- **Clips scroll** — removed `contentVisibility: auto`; explicit `touchAction: pan-y`; `vybe-clips-page` on ClipsViewer
- **Vybe DNA** — instant cache from preloader + localStorage actions cache

## What Changed (notifications — 2026-06-09)
- **`NotificationActionRouter`** — unified handler for Despia taps, OneSignal web clicks, service worker actions, and deep links (`?call=`, `?login-approval=`)
- **Call push** — Answer/Decline buttons on OneSignal Android; accept joins call instantly; decline updates DB
- **`send-push-notification`** — VAPID optional when OneSignal delivers to native; always sends `path` + `url` for Despia routing; profile-id resolution
- **Login approval push** — deep link `/?login-approval={id}` opens approval sheet on trusted device
- **Service worker** — call accept uses `?call=&action=accept`; posts `NOTIFICATION_CLICK` to app for decline

## What Changed (realtime hardening — app-wide)
- **`subscribePostgresChannel`** — migrated every remaining raw `.channel().on('postgres_changes')` across hooks, `callStore`, admin/auth components (~30 files)
- **`useServers`** — replaced anti-pattern `useQuery` subscription for channel messages with proper `useEffect`
- **`useFriendDropSync`** — stable channel name (removed `Date.now()` suffix that leaked channels)
- Broadcast/signaling channels (`useInstantSend`, `p2pConnection`, `LoginGateModal`, DM broadcast) intentionally unchanged

## What Changed (stability audit)
- **`spaces-token` community voice** — membership + LiveKit identity use `profiles.id` (was auth uid → 403 / missing avatars)
- **`RoomChat`** — removed nav cleanup that re-showed bottom nav when switching text → voice
- **`CommunityChannelSidebar`** — fixed nested `<button>` invalid HTML
- **`RootBottomNavMount`** — hide nav on all `/messages/*` sub-routes

## Publish log
- **2026-06-10** — Pushed `9e2b3ef8` to `main`: onboarding skip RLS fix, instant DM prefetch/cache. Build pass. **Lovable Publish pending** — production still serving `index-BfmVdKUH.js` (pre-9e2b3ef8).
- **2026-06-09** — Pushed `7f32cabf` to `main`: app-wide `subscribePostgresChannel` hardening, community voice ID fix, Vybe Map + friends polish, bottom nav immersion. Build + lint pass. **Lovable Publish pending** (user action).
- **2026-06-09** — Pushed `4d295871` to `main`: Discord-style communities shell, LiveKit voice (`community-voice-token`, `useCommunityVoice`), theme equip persistence, home/DM polish. Build + lint pass. Edge fn deploy blocked (Supabase CLI 403 — needs login or Lovable deploy). **Lovable Publish pending.**
- **2026-06-10** — Home iconic redesign: aurora hero card (spinning avatar ring, gradient greeting), spring feed tabs, quick-access cards, customize pill. DM convo: removed header/composer backdrop-blur seam — solid gradient fade header + opaque composer. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — Settings visual system pass: new `SettingsUI.tsx` (`SettingsSectionCard`, `SettingsPanel`, `SettingsToggleRow`, `SettingsActionRow`, `SettingsStatusCard`); Security/Privacy migrated; Notifications/Appearance/Help fully refactored; glass inset panels (`.settings-panel`), action rows, segment pickers, FAQ items; Themes CTA + MyCurrentVybeCard liquid glass; SubscriptionSection glass; ARCHITECTURE_ROADMAP Supabase ref fix. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — Scan pass 2: mobile settings detail gets a sticky horizontal category strip (switch sections without going home); theme preview lock on Gallery/Marketplace apply; useLearningSignals profile lookup fixed (`user_id` not `id`); PostCarousel lazy-load ready; sidebar scrollbar hidden. **Lovable Publish pending.**
- **2026-06-09** — Deep scan fixes: settings sidebar now pinned while scrolling (self-scrolling sticky + breakpoint aligned with AppLayout); theme preview lock kills the old-theme flicker after generating a vybe (AIVybeDesigner/ThemeCustomizer/DesignYourVybe vs useApplyUserTheme race); DM avatar story tap opens StoryViewer inline (was navigating to nonexistent /stories → 404); "Create Post" CTA → /upload, welcome "Shape what we build" → /roadmap (both 404'd); feed images lazy-load except first 2 (all were eager+high priority); invite stats polling 1s→15s with batched profile fetch (~13 req/s → ~0.2). **Lovable Publish pending.**
- **2026-06-09** — Settings total redesign: removed ugly spinning-square header icon; mobile is now an iOS-style grouped home list (profile hero card, grouped categories with colored tiles, red Log Out row, slide home↔detail navigation with back bar); desktop is a sticky grouped sidebar + content layout with sign-out under the nav. `?tab=` deep links still work. **Lovable Publish pending.**
- **2026-06-09** — Settings revamp: iOS-style colored icon tiles in nav (mobile dropdown + desktop pills with animated sliding active pill), aurora header with conic-gradient settings icon, theme-tinted card hairlines + hover glow on every settings card (scoped `.settings-shell` CSS so all 35 section components are lifted at once), gradient section-header icon tiles in 8 sections, redesigned Profile Settings card (aurora glows + gradient-ring avatar), polished footer. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — CRITICAL: reverted `.env` + `config.toml` to production Supabase `agtcyxjxgkdyoxwxkjth`. They had been switched to `hprmicwhlaaqfgshucec` ("VYBE-Social"), an almost-empty project (8 tables, 5 migrations) — onboarding "Design your VYBE" failed because `profiles.bio` etc. don't exist there. NOTE: today's `spaces-token`/`generate-advanced-theme` deploys + recent migrations went to that wrong project; they're all in the repo, so Lovable Publish will deploy/apply them to production. **Lovable Publish pending.**
- **2026-06-09** — AI Vybe Designer: fixed "try again later" (function `generate-advanced-theme` was never deployed to `hprmicwhlaaqfgshucec` — deployed now with curated no-AI-key fallback + client-side local themes per vibe so it never dead-ends). Full UI redesign: aurora backdrop that morphs to selected vibe, animated headlines, springy vibe cards, gradient CTAs, clean preview. NOTE: set `GEMINI_API_KEY` or `LOVABLE_API_KEY` secret to enable true AI generation. **Lovable Publish pending.**
- **2026-06-09** — Mobile header polish: background now fades into the page theme (28px gradient mask, no hard black edge); streak badge on Challenges icon is now a flame (orange→red gradient + count). **Lovable Publish pending.**
- **2026-06-09** — App-wide safe-area pass: global `pt-safe`/`safe-area-*` utilities + all inline `env(safe-area-inset-top)` now use measured `--sat` var (env() = 0 in WebViews); added missing top safe areas to SpaceRoom, Community, Sounds, SoundDetail, Watch, camera editors, video preview, offline banner, toasts (sonner offset), pull-to-refresh, About/Contact, AdminDashboard. Headers keep themed bg so notch strip matches user theme. **Lovable Publish pending.**
- **2026-06-09** — Clips header safe area: `ClipsFeedHeader`/`ClipsViewer` now use measured `--app-header-safe` var (raw `env()` reported 0 in WebViews, header sat under the notch). **Lovable Publish pending.**
- **2026-06-02** — Spaces live audio (LiveKit) + raise-hand/mute persistence; `spaces-token` edge function deployed. **Lovable Publish pending.**
- **2026-06-02** — Phase 2 content unification (/shorts redirect, ranked Watch browse, ClipsViewer v2). **Lovable Publish pending.**
- **2026-06-02** — Messaging Polish Phase 1 (snap drag parity, outbox/call resume, voice scrub). **Lovable Publish pending.**
- **2026-06-09** — Vybe Snap text drag 1:1 finger tracking fix (local, publish pending)
- **2026-06-09** — production perfection pass pushed. **Lovable Publish pending.**

## What Changed (Spaces live audio — Phase 5 early)
- **`spaces-token` edge function** — role-aware LiveKit tokens for `space-{id}` rooms (speakers publish, listeners subscribe-only); deployed to `hprmicwhlaaqfgshucec`
- **`useSpaceAudio`** — LiveKit room connect, remote audio playback, active-speaker tracking, app-resume recovery; reconnects on listener→speaker promotion
- **`SpaceRoom`** — real mic mute (LiveKit + DB), raise-hand persists (`role: requested` so host sees it), audio status pill + retry, speaking ring from live audio
- **`useSpaces` fix** — host/participant profiles joined by `profiles.user_id` (was wrongly `profiles.id`, broke avatars/usernames)

## What Changed (Phase 2 — Content unification)
- **`/shorts` → `/clips` redirect** — one canonical clips route; `/shorts/:postId` deep links redirect too
- **Watch browse (`VideoBrowse`)** — now uses `get_ranked_feed_v2` ("For You" default) with load-more pagination; Trending/Recent re-sort loaded pages
- **`ClipsViewer`** — upgraded from legacy `get_ranked_feed` (v1) to `get_ranked_feed_v2`
- **Bottom nav** — Clips tab highlights on `/watch` + `/watch/:id` (Videos lives inside Clips)
- **Locales** — removed unused `allowDuet` ("Allow Duet/Remix") promise from all 20 locale files (feature not implemented)

## What Changed (Messaging Polish — Phase 1)
- **`SnapOverlayDraggable`** — shared 1:1 drag component for `VybeSnapEditor` + legacy `SnapCamera`
- **DM outbox** — flush on `visibilitychange` + `app-resumed` (background resume)
- **Send UX** — toast when message queued offline; vybe upload already marks `_failed` for retry
- **Calls** — `GlobalCallOverlay` listens for `app-resumed`; P2P waits out post-camera acquire
- **Voice notes** — waveform scrubbing on `AudioMessage`
- **Roadmap doc** — `docs/ARCHITECTURE_ROADMAP.md` (Phases 2–6 sequenced)

## What Changed (Vybe Snap text drag fix)
- **Text overlay drag** — removed Framer `drag="y"` + delta state double-move; new `SnapOverlayBar` uses start+delta touch math (1:1 finger tracking)
- **Trash zone** — still works during drag; position commits to state only on pointer/touch end

## What Changed (native black screen fix)
- **Native aurora restored** — static mesh gradient on Home/Explore/DMs (was flat `#0B0B10`)
- **Removed `vybe-stable-background`** from native boot — aurora mount no longer hidden
- **Clips/Watch** — aurora suppressed on immersive routes (intentional black player)
- **Splash dismiss** — `ensureAppShellVisible()` clears stuck `#root` visibility
- **Clips loading** — 10s timeout shows retry UI instead of infinite black skeleton

## What Changed (production perfection pass)
- **After publish** — clips → `/clips`, long videos → Videos tab; feeds invalidate instantly
- **No duplicate** “Post created” toast on upload
- **Email verify** — auth state + app resume detection (faster onboarding)
- **Watch** — mobile autoplay (muted), immersive layout, bottom nav hidden
- **Clip deep links** — `/clips/:id` redirects long videos to `/watch/:id`
- **Header/nav** — hidden on clips, watch, and clip viewer routes

## What Changed (clips perfection pass)
- **Videos tab header** — readable on light background (was invisible white-on-white)
- **Clips scroll** — stable intersection observer, no reconnect jank per swipe
- **Watch page** — mobile controls, view counts, related videos feed, short→clips redirect
- **Bottom nav** — Clips tab highlights on `/clips/*`; safe nav order fallback
- **Double-tap like** — fixed stale handler on clip cards

## What Changed (long-form Videos tab)
- **Clips → Videos tab** — YouTube-style grid browse inside Clips; tap opens `/watch/:id`
- **Sort chips** — For You, Following, Trending, Recent (type `video` posts)
- **Upload** — Mobile videos **>60s** auto-publish as `video` (long), shorter as `short` (clip)

## What Changed (VYBE-branded clips flow)
- **Same TikTok flow** — Clips tab, Following | For You, full-screen swipe, progress bar, sound pill
- **VYBE skin** — gradient tabs, VybeMiniIcon, aurora hearts, story-ring avatars, primary progress bar
- **Home feed** — rounded VYBE cards restored (removed flat Instagram-style overrides on native)

## What Changed (TikTok-style clips)
- **Bottom nav** — Clips is a primary tab (Film icon); Explore still available via search on clips header
- **Clips page** — Full-screen `100dvh` feed with bottom nav overlay (TikTok-style)
- **Following | For You** tabs at top; Following uses `get_following_posts_with_counts`
- **MobileShortCard** — Progress bar, spinning sound pill, expandable caption, TikTok layout offsets
- **ClipsFeedHeader** — Search shortcut to Explore

## What Changed (Instagram-ready polish)
- **`instagram-ready` document class** on native shell alongside perf mode
- **Clips** — no pre-roll on native; mid-feed ads after 4 clips; instant snap scroll; swipe hint once
- **Feed** — double-tap to like on touch; flat card separators on native
- **PWA banner** — hidden in Despia/native shell
- **Post publish** — faster return to feed on native (~900ms)

## What Changed (Instagram-ready foundation)
- **Auth keepalive** — periodic + resume refresh; `wasLoggedIn` flag synced on restore/sign-out
- **AppLayout** — don’t blank screen while auth loads if stored token exists; native scroll shell
- **Feed perf** — native `content-visibility`, no backdrop-blur on native, swipe transform off
- **Signup email** — auto-detect verification + spam-folder copy on auth screen

## What Changed (auth hardening)
- **getSession errors** — refresh stored token instead of clearing session on native cold start
- **App resume** — refresh on `visibilitychange`, `app-resumed`, iOS `pageshow` bfcache
- **AuthCallback** — detect `token_hash` / `refresh_token`; don’t bounce valid email links
- **Password reset** — always uses `https://vybehub.app/reset-password` on native shells

## What Changed (PWA default)
- **`VITE_OFFLINE_MODE=pwa`** — service worker caches shell; skip `despia/local.json` unless `despia-local`
- **`registerVybeServiceWorker`** — works on vybehub.app in browser + Despia URL mode
- **`manifest.webmanifest`** — local PNG icons + `id` for installability
- **`DEPLOY.md`** — Despia dashboard: disable local server, use URL mode

## Publish log (prior)
- **2026-06-09** — pushed `b4330cbb`. **Lovable Publish pending.**

## What Changed (`b4330cbb`)
- **Signup → onboarding** — `waitForAuthSession`, email verification screen, `ProtectedRoute` race fix
- **Mobile header** — cleaner full-width bar redesign
- **Despia local OTA** — `@despia/local` in dependencies, `postbuild`, `DEPLOY.md` troubleshooting

## Despia local server (handoff)
- **`@despia/local`** in `dependencies` + Vite plugin + `postbuild: despia-local dist index.html`
- **Production manifest:** https://vybehub.app/despia/local.json (`deployed_at` drives OTA)
- **Despia URL must be `vybehub.app`** — preview `*.lovableproject.com` redirects to auth; offline validator fails
- **OTA path:** Lovable Publish → manifest updates → native app background download → next launch
- **Store build only when:** new Despia native features / permissions / plugins (not for web UI fixes)

## Publish log
- **2026-06-02** — pushed `cc046265` (header gap + safe-area fallbacks, floating pill bar). **Lovable Publish pending.**
- **2026-06-08** — pushed `e7c8d285` (status bar clearance, header polish). **Lovable Publish pending.**

## What Changed (header below camera — `cc046265`)
- **`safeAreaInsets.ts`** — `--app-header-top` / `--app-header-gap`; higher iOS/Android Despia fallbacks; visualViewport offset
- **`index.css`** — header height = safe top + gap + toolbar + tail; CSS fallbacks before JS
- **`MobileHeader`** — dead zone under notch; floating rounded pill bar; compact streak badge
- **`HeaderSearch`** — full-width pill in header; overlay positioned below header

## What Changed (brief settings + header polish — `318e40e8`)
- **`AIBriefCustomizePanel`** — inline in brief sheet (no nested dialog); load/save `finally` fixes infinite spinner
- **`MobileHeader`** — lower compact bar via `--app-header-*` CSS vars; streak hides on narrow screens

## Publish log
- **2026-06-08** — pushed brief settings + header polish. **Lovable Publish pending.**
- **2026-06-08** — pushed `d1ebdbd9` (DM scroll fix + header redesign)
- **2026-06-08** — pushed `edbf9205` / `28cdf141` (Realtime crash fix)
- **2026-06-08** — pushed `5fa238d3` (mobile safe area, brief, AI keyboard, Friend Link, nav liquid, ads gating). Supabase auth/SMS/email/push functions deployed (user CLI). Redeploy `auth-2fa-request` after resend fix.
- **2026-06-02** — pushed `e489cfa2` (native perf mode). Web publish: pending Lovable.

## What Changed (realtime crash fix — `edbf9205`)
- **`realtimeChannel.ts`** — remove stale channels by topic before `.on()` / `.subscribe()` (fixes `postgres_changes after subscribe()` crashes)
- **`auth.tsx`** — single ban-status subscription via safe helper
- **`useBanStatus.ts`** — removed duplicate ban realtime (auth owns it)
- **`useGridLayout` / `useHomeLayout`** — removed no-op autopilot-grid/layout subscriptions (were duplicated per widget mount)
- **`useGlobalRealtimeMessages.ts`** — stable channel names, generation guard for async setup, safe teardown
- **`AppBackground.tsx`** — fail soft on `user_backgrounds` query errors (57014 timeout)

## What Changed (console error cleanup — `29b17a08`)
- **`mediaUrl.ts`** — rewrite legacy Supabase hosts, block Pexels 403 URLs, resolve bare filenames safely
- **Preload hooks** — skip dead URLs; removed `<link rel=preload>` spam
- **`get_public_user_count`** — fail soft when RPC missing (Lovable preview DB)
- **YouTube embed** — pass `origin` to fix postMessage mismatch
- **`index.html`** — removed unused GPT Engineer font preload

## What Changed (mobile polish batch — `5fa238d3`)
- **Safe area** — `--app-header-height` CSS var; AppLayout/Messages/ChatView respect notch; removed body safe-area padding that broke fixed headers
- **MobileHeader** — removed blur blobs that rendered as grey circles on WebKit
- **Verification email** — `auth-2fa-request` resend now matches preauth (no silent skip); LoginGateModal surfaces resend failures
- **Daily brief** — unified cache slots (`morning/lunch/dinner`); refresh keeps content visible; settings load via `.maybeSingle()` + error toast
- **Friend Link** — removed `animate-ping` grey ring; simplified phone-tap ripples (no conic-gradient mask)
- **VYBE AI chat** — composer uses `--kb-h` keyboard offset + scroll-on-focus
- **Bottom nav Create** — uses login-style `vybeLiquid` button
- **Ads** — no longer blocked while age RPC loads; Despia AdMob init on shell startup

## What Changed (native perf mode — prior)
- **`nativePerfMode.ts`** — Despia/Capacitor store shell gets static colorful aurora (mesh only), no touch ripples, reduced Framer motion, no contrast DOM scans
- **`VybeLiquidBackground`** — skips animated blobs, bloom, grain, device tilt, and pointer FX on native
- **`AnimatedRoutes`** — plain route shell on native (no `AnimatePresence popLayout`)
- **`main.tsx`** — `native-perf-mode` + `reduce-motion` classes before first paint; skip animation warmup on native
- **`index.css`** — native overrides beat immersive aurora/touch CSS

## What Changed (launch polish — prior local)
- Safari vs WebView detection — iPad Safari no longer mis-detected as native app
- Auth `getSession` — late responses no longer ignored after timeout
- `RootGate` — orientation/resize-aware mobile routing
- `PublicOnlyRoute` — waits for auth before redirect (no flash to sign-in)
- Friend Link pill visible on iPad (`useIsMobileOrTablet`)
- Shared `detectIsIPad` in `deviceDetection.ts` + `use-mobile.tsx`

## What Changed (iPad launch fix — pushed `94b22cad`)
- **`deviceDetection.ts`** — iPad/Macintosh UA + embedded WebView heuristics
- **`RootGate`** — iPad always gets mobile intro/Landing (not desktop `VybeHome`)
- **`despiaBridge`** — native shell detection for iPadOS desktop-class UA
- **`auth.tsx`** — 6s auth safety timeout + 5s `getSession` race
- **`App.tsx`** — clear stuck `#root` visibility after splash dismiss
- **`PublicOnlyRoute`** — iPad redirects to `/auth` instead of marketing pages

## What Changed (colorful background restore — prior local)
- **`STABLE_APP_BACKGROUND = false`** — liquid aurora + touch ripples back app-wide (Home, Clips, Explore, auth Landing)
- App shell transparent again; `VybeLiquidTouchShell` remounted in `App.tsx`
- Custom wallpaper still overrides aurora when set

## What Changed (App Store rejection fixes — prior local)
- **2.1(a) ATT:** splash absolute max 6.5s (was 3.5s early dismiss); post-ATT poll until auth+preload ready; staggered WebView recovery; consent poll after resume
- **2.1(a) routes:** loaders instead of blank null; stale token → `/auth`; local signOut on refresh timeout
- **2.1 NFC:** `docs/APP_STORE_RESUBMIT.md` — demo video script + App Review notes to paste (video still required manually)
- **AR filters:** lite CPU on all phones, overlay/zoom alignment, color filters without face lock
- **Stability:** Friend Link perf, cold start hardening (prior batch)

## What Changed (AR filters — prior local)
- **AR on all phones:** lite CPU profile no longer blocked by missing WebGL
- **Overlay alignment:** selfie roll corrected when mirrored; video + AR share pinch-zoom wrapper
- **Color AR filters:** golden hour / midnight / noir work without a detected face (fallback + no scan reticle)
- **Tracking lifecycle:** survives camera flip/restart; session AR retry when opening AR tab
- **AR tab default:** first free face filter (Neon Eyes), not premium Holographic

## What Changed (smoothness + bug pass — prior)
- ATT resume only after real backgrounding (no cold-load splash skip)
- IndexedDB restore 600ms cap so cold start never hangs
- PublicOnlyRoute loader instead of blank null during auth
- Friend Link: lighter QR scan (every 2nd frame), native NFC stop on close, duplicate-add guard

## What Changed (App Store ATT fix — prior)
- No duplicate tracking dialog on Despia native — uses `despia.trackingDisabled` only
- `attResumeRecovery.ts` clears stuck splash/body lock after system permission sheets
- Landing/RootGate never render blank during auth redirect (iPad review device)

## What Changed (Friend Link + Create camera — prior)
- **Friend Link:** single shake listener; iOS motion on pill tap + coach “Got it”; instant X close; activation hints (pill coach, sheet tips, feed spotlight); `AutoFriendDrop` mounted app-wide (pill only on `/home`); NFC/tap auto-add now calls `runAutoFriendAdd`
- **Create camera:** Snapchat-style bottom stack (lenses → shutter → modes), glass top controls, viewfinder grid, one-time `CreateCameraCoach`

## What Changed (AR — prior)
- Mobile AR enabled: `arEngine.ts` lite profile (CPU, 320px, smoothed landmarks)
- AR composited into photos (`arCapture.ts`); scan reticle while finding face
- Friend Link QR scanner: orbital sweep + target pulse animation
- `SnapARProvider` mounted in App (needs Snap token for full lens library)

## What Changed (platform polish)
- Lazy i18n: English only in main bundle; 19 locales on demand (`i18nLoadLocale.ts`)
- Offline feed: empty-state when no cache; “saved feed” banner when offline with cache
- Friend Link spotlight on Home + `openFriendLink()` → AutoFriendDrop sheet
- Mobile intro: Friend Link slide (`VYBE_INTRO_VERSION` 3)

## What Changed (perf + offline)
- Preloader waits for IndexedDB persist restore; skips heavy work when warm cache exists
- Home: tab-gated feeds; Global/Local only after first visit
- No full cache wipe on sign-in; deferred realtime/presence + animation warmup
- `offlineCacheProbe.ts`, `persistRestoreGate.ts`

## What Changed (aurora/touch — prior)
- `#vybe-aurora-mount` behind `#root`; portaled aurora + transparent app shells
- `VybeLiquidTouchOverlay` / `VybeLiquidTouchShell` — global tap ripples (Landing z-25, app z-5010)
- `vybeLiquid` buttons trigger same touch animation; blob pull via bridge
- Custom wallpaper gate: `hasUserWallpaper` + `isBackgroundResolved` hide aurora/touch; `stripLiquidShellDocumentState()` on upload

## Current Status
- Done: Snapchat-style full-screen incoming call overlay; native CallKit bridge wired; build pass
- **Your turn:** Despia native rebuild (Capacitor plugin) + Lovable Backend deploy `send-push-notification` → test locked-phone incoming call

## Next 3 tasks
1. Despia rebuild with `@capgo/capacitor-incoming-call-kit` (`npx cap sync` + native build); create OneSignal Android channel → set `ONESIGNAL_CALL_CHANNEL_ID`
2. Lovable Backend deploy `send-push-notification` → Publish → smoke test: locked phone incoming call (Answer/Decline from notification + full-screen UI)
3. Lovable Backend deploy `livekit-token` with LIVEKIT secrets → test community voice

## Publish log
- **2026-06-02** — pushed `edbf9205` (Realtime crash fix on Home). **Lovable Publish pending.**
- **2026-06-05** — smoothness/ATT resume + Friend Link perf — **Publish in Lovable + Despia now**
- **2026-06-02** — commit `ee375394` — ATT blank-screen fix
- **2026-06-02** — commit `934af286` — Friend Link polish + Create camera revamp
- **2026-06-02** — commit `686f01c0` — mobile AR + Friend Link QR scanner
- **2026-06-01** — commit `601ebb39` — perf, offline UX, lazy i18n, Friend Link spotlight
- **2026-06-01** — commit `821c373d` — liquid FAB + auth liquid UI
- **2026-06-01** — commit `6f265956` — auth liquid UI, Welcome heading

## Verification Checklist
- [x] `npm run build` passes
- [ ] Friend Link pill + shake on Home; X closes instantly
- [ ] Friend Link spotlight → opens tap sheet
- [ ] Offline: no cache → helpful empty state; with cache → banner + posts
- [ ] Lovable Publish completed
- [ ] `vybehub.app` Home aurora + tap verified
- [ ] `vybehub.app` Login tap + Log In button verified
- [ ] Custom wallpaper hides aurora (Settings → Background)

---

## 2026-06-16 — Supabase → Firebase migration complete (Phases 1-8)

All eight migration phases complete. See `.lovable/plan.md` for per-phase detail.

**What shipped:**
- Phase 1: Google/Apple sign-in moved to Firebase Auth.
- Phase 2-3: Data export script + Firestore importer (`scripts/import-firebase.mjs`).
- Phase 4: `firestore.rules`, `storage.rules`, `firestore.indexes.json` translated from Supabase RLS.
- Phase 5: P0 Cloud Functions (`ai.ts`, `auth.ts`, `push.ts`, `realtime.ts`, `social.ts`) live.
- Phase 6: client `supabase.functions.invoke(...)` calls auto-routed to camelCase Firebase callables via `functionsService.ts`.
- Phase 7: long-tail port — `email.ts` (Resend), `stripe.ts` (Connect V2 + webhooks), `spotify.ts`, `passkeys.ts`, `briefs.ts` (scheduled), `aiExtras.ts`. FCM web push wired (`public/firebase-messaging-sw.js` + `src/lib/firebase/messaging.ts`).
- Phase 8: `index.html` preconnects switched to Firebase endpoints. Shim layer `src/integrations/supabase/` retained as deprecation seam.

**Verification:**
- `cd functions && npx tsc --noEmit` → 0 errors.
- `npm run build` runs clean.

**Blockers / next 3 tasks:**
1. Configure Cloud Function secrets in Firebase Console (full list in `.lovable/plan.md` Phase 8).
2. `firebase deploy --only firestore:rules,storage,firestore:indexes,functions,hosting`.
3. Bootstrap first admin via Firebase Console → Auth → Custom Claims `{ "admin": true }`, then publish web app via Lovable → Share → Publish.

**Residual work (non-blocking):**
- Swap presence/typing hooks from legacy realtime shim to direct Firestore `onSnapshot` (small perf win).
- Delete `supabase/` folder + `src/integrations/supabase/` shim once Firebase impl is battle-tested in production.
