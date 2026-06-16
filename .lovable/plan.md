# Full migration: Supabase (agtcyx) → Firebase (vybe-daaab)

Realistic scope. This will take multiple sessions and requires work only you can do locally (service-role keys, Firebase Admin credentials, Blaze plan, Cloud Functions deploys). I'll do everything that can be done inside this repo; you run the data + deploy steps.

---

## Phase 0 — Prerequisites (you, before I start Phase 2)

1. **Firebase project on Blaze plan** (`vybe-daaab`). Required for Cloud Functions + outbound network.
2. **Enable in Firebase Console:** Auth (Email/Password, Google, Apple), Firestore, Storage, Cloud Functions, App Check (reCAPTCHA v3), Cloud Messaging.
3. **Service account JSON** from Firebase → Project Settings → Service Accounts → save as `secrets/firebase-admin.json` (gitignored).
4. **`agtcyx` service-role key** from Lovable support (the anon key is not enough for a full export).
5. **Storage bucket size estimate** — if >50 GB, we batch.

When all 5 are ready, say "Phase 0 done" and I move to Phase 2.

---

## Phase 1 — Finish auth cutover (I do now, no prereqs)

- Replace Lovable OAuth in `src/pages/Landing.tsx` with `signInWithPopup(GoogleAuthProvider)` and `OAuthProvider('apple.com')` from Firebase Auth.
- Remove `lovable.auth.*` calls from sign-in/sign-up paths.
- Keep email/password (already Firebase).
- Update `useAuth` / session listeners to use `onAuthStateChanged` exclusively.
- Add Firebase Auth domain `vybehub.app` to authorized domains (you click in console).

Verifiable: sign in with Google on preview → user appears in Firebase Console → Authentication.

---

## Phase 2 — Data export from Supabase (you run, I write the scripts)

I'll write `scripts/export-supabase.mjs`:
- Connects with `AGTCYX_SERVICE_ROLE_KEY`.
- Dumps every public table → `./export/<table>.ndjson` in batches of 1000.
- Dumps `auth.users` + `auth.identities` (preserves UIDs).
- Dumps Storage object metadata + downloads files → `./export/storage/<bucket>/...`.

You run: `AGTCYX_SERVICE_ROLE_KEY=... node scripts/export-supabase.mjs`.

---

## Phase 3 — Import into Firebase (you run, I write the scripts)

I'll write `scripts/import-firebase.mjs` using `firebase-admin`:
- **Auth:** imports users via `auth.importUsers()` with `passwordHash`/`passwordSalt` preserved (bcrypt/scrypt depending on what Supabase returns — Supabase uses bcrypt, supported by Firebase).
- **Firestore:** maps each Postgres table → Firestore collection. UUIDs become document IDs.
- **Storage:** uploads to Firebase Storage preserving paths.
- **Schema decisions** (I'll document per-table):
  - Flatten foreign keys → reference paths (`profiles/{uid}`).
  - Convert RLS policies → Firestore Security Rules (Phase 4).
  - Denormalize hot reads (e.g. `posts.author` embeds avatar/username for feed) since Firestore has no joins.

You run: `GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json node scripts/import-firebase.mjs`.

---

## Phase 4 — Firestore Security Rules (I write, you deploy)

- Translate each table's RLS policies into `firestore.rules`.
- Hot patterns: owner-only writes, public reads on `profiles`, member-only reads on `conversations/{id}/messages`, role check via `request.auth.token.admin`.
- Custom claims set by a Cloud Function reading `user_roles`.

You run: `firebase deploy --only firestore:rules`.

---

## Phase 5 — Port edge functions to Cloud Functions (largest chunk, multi-session)

50+ Supabase edge functions. I'll port them in batches by domain:

| Batch | Functions | Priority |
|---|---|---|
| Auth/security | `auth-2fa-preauth`, `sync_signup_username`, `ensure_user_level`, `webauthn-*` | P0 |
| AI | `ai-catch-up`, `generate-advanced-theme`, `daily-brief`, `vybe-check`, all Gemini wrappers | P0 |
| Realtime/calls | `livekit-token`, `community-voice-token`, signaling | P1 |
| Commerce | Stripe Connect, tipping, payouts, RevenueCat webhooks | P1 |
| Social | `share-preview`, push notifications (FCM), invites | P1 |
| Admin/ops | analytics, debug RPC, moderation, ad-fraud checks | P2 |

Each ported function uses `onCall` (auth-checked) or `onRequest` (webhooks). I'll keep the same client-side function names so callers don't change much.

You run: `firebase deploy --only functions` after each batch.

---

## Phase 6 — Replace remaining Supabase client calls (~25+ files)

Sweep for `import.meta.env.VITE_SUPABASE_PROJECT_ID`, direct `supabase.functions.invoke`, `supabase.from`, `supabase.channel`. Replace with:
- Reads/writes → `db.from(...)` (already Firestore-backed) or direct Firestore SDK.
- Realtime → Firestore `onSnapshot` listeners.
- Edge invokes → `httpsCallable(functions, '<name>')`.

---

## Phase 7 — Realtime, presence, FCM push

- Presence: Firestore `presence/{uid}` doc with `onDisconnect` via Realtime Database (Firebase pattern).
- Chat typing/reactions: Firestore listeners (or RTDB for high-frequency typing).
- Push: replace OneSignal with FCM web push using `VITE_FIREBASE_VAPID_KEY`. Keep OneSignal as fallback during cutover if you want.

---

## Phase 8 — Cleanup & publish

- Delete `src/integrations/supabase/`, `supabase/` folder, `dualSupabase.ts`, legacy URL rewrites in `mediaUrl.ts`.
- Remove `VITE_SUPABASE_*` from `.env`.
- Update `index.html` preconnect from `agtcyx...supabase.co` → `*.firebaseapp.com` / `firestore.googleapis.com`.
- Update `WORKLOG.md` and `DEPLOY.md`.
- Lovable Publish → `vybehub.app`.

---

## What breaks during migration (be aware)

- **RLS → Security Rules** is not 1:1. Some Postgres-side checks (e.g. `has_role(...)` with joins) become Cloud Function callables.
- **No SQL joins.** Feed ranking, friend-of-friend queries, analytics RPCs become either denormalized reads or Cloud Function aggregations.
- **No `SECURITY DEFINER` RPCs.** Each becomes a callable function with admin SDK.
- **Triggers** (e.g. `update_updated_at_column`, profile auto-create) become Cloud Function triggers (`onDocumentCreated`, etc.).
- **Storage signed URLs** semantics differ — Firebase uses long-lived download tokens or signed URLs from Admin SDK.
- **Costs**: Firestore reads scale with denormalization; Cloud Functions cost per invocation. Expect higher monthly bills than current Supabase usage unless you cache aggressively.

---

## What I'll do this session if you approve

Just **Phase 1** (Google/Apple → Firebase Auth, ~10 file edits) + write the **Phase 2 export script** so you can start the data dump while I queue up Phase 3 for next session.

Reply "approve phase 1+2" to start, or tell me what to change.
---

## Phase 4 — STATUS: ✅ scaffolded (2026-06-16)

**Written:**
- `firestore.rules` — full ruleset translating RLS for ~50 collections (profiles global-read, owner writes via `user_id`/`author_id`, conversation membership via `conversations/{cid}/members/{uid}` subcollection, admin gating via `request.auth.token.admin`, deny-all catch-all).
- `storage.rules` — per-user buckets (`avatars`, `media`, `stories`, `chat-media`, `clips`, `post-media`, `community-assets`) with 50 MB size + content-type guards, public read for `/public/**`, default deny.
- `firestore.indexes.json` — composite indexes for the hot queries (posts by author+date, comments by post, messages by conversation, notifications by user, stories by author+expires, follows both directions, channel_messages).
- `functions/src/index.ts` — added `setAdminClaim` callable to manage `admin` custom claim + write-back to `user_roles`. Bootstrap the FIRST admin manually in Firebase Console → Auth → user → Custom Claims: `{ "admin": true }`.

**You run (after Phase 3 import finishes):**
```
firebase deploy --only firestore:rules,storage,firestore:indexes
firebase deploy --only functions
```

**Caveats to revisit in Phase 5/6:**
- `conversation_members` rule is permissive during cutover; tighten once all reads move to the `conversations/{cid}/members` subcollection.
- Rules assume documents include `author_id` / `user_id` fields matching the Firebase Auth UID. The import script (Phase 3) preserves Supabase auth UIDs, so this holds.
- A few admin-only tables (`error_logs`, `email_send_*`, `gifted_premium` writes) deny client writes — the corresponding Cloud Functions (Phase 5) must use the admin SDK.

Say **"start Phase 5"** to begin porting edge functions in priority batches.
