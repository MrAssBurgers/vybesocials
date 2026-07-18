# DEPLOY — VYBE (`vybehub.app`)

Production web hosting is **Lovable Cloud** with custom domain **`vybehub.app`**.  
Backend is **Supabase** project **`agtcyxjxgkdyoxwxkjth`** (Lovable production — live users, Bakrix, feed data).
Sandbox ref **`hprmicwhlaaqfgshucec`** is redirected to agtcyx at runtime/build.

| Environment | URL |
|-------------|-----|
| Production | https://vybehub.app |
| Lovable preview | https://416714c8-d013-4aff-984d-522418a9bbc7.lovableproject.com |
| Lovable editor | https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7 |

---

## Who deploys what

| Change type | Where to ship it |
|-------------|------------------|
| React UI / `src/` | **Lovable → Share → Publish** (after git sync) |
| Supabase Edge Functions | `npx supabase functions deploy <name>` **or** Lovable Backend deploy |
| DB schema / RLS | Supabase migrations / `db pull` / manual SQL in `supabase/manual/` |
| Play Store / Despia native shell | See `PLAY_STORE_GUIDE.md` (separate from web publish) |
| Despia local server OTA (native apps) | **Lovable Publish** updates `despia/local.json` on `vybehub.app` — see below |

Cursor agents **cannot** click Lovable Publish for you. They can: build locally, push git, deploy Supabase functions, and verify `vybehub.app` after **you** publish.

---

## Offline strategy (Despia Native default)

VYBE defaults to **Despia local server** (`@despia/local`) so Offline Support → **Native** works. The binary hydrates from `vybehub.app`, then boots from on-device `http://localhost`.

| Mode | Env | What it does |
|------|-----|--------------|
| **Despia local** (default) | `VITE_OFFLINE_MODE=despia-local` | Build emits `dist/despia/local.json` for Native offline |
| PWA | `VITE_OFFLINE_MODE=pwa` | `public/sw.js` only — use if Despia Offline Support is **PWA** / **None** |

### Despia dashboard (Native)

1. App Start URL = **`https://vybehub.app`**
2. Offline Support → **Native**
3. **Lovable Publish** so `https://vybehub.app/despia/local.json` stays fresh
4. **Rebuild** the native binary once after flipping Native (status bar / offline settings are binary-side)

The red Despia warning is expected until the plugin ships in the published build — VYBE already includes `@despia/local`; Publish + rebuild clears the risk.

---

## Despia local server (native iOS / Android OTA) — optional

VYBE uses [@despia/local](https://www.npmjs.com/package/@despia/local) so Despia can cache the web build on-device and serve it from `http://localhost` (instant boot, real offline, store-compliant OTA).

**Docs:** [Introduction](https://setup.despia.com/local-server/introduction.md) · [Reference](https://setup.despia.com/local-server/reference.md) · [Index](https://setup.despia.com/llms.txt)

### Already wired in this repo

| Piece | Location |
|-------|----------|
| Vite plugin | `vite.config.ts` → `despiaLocalPlugin({ outDir: 'dist', entryHtml: 'index.html' })` |
| Dev dependency | `package.json` → `@despia/local` |
| Build output | `dist/despia/local.json` (generated on every `npm run build`) |
| Production URL | https://vybehub.app/despia/local.json |

The manifest includes `entry`, `deployed_at`, and a sorted `assets` list. Despia compares `deployed_at` with the cached value to decide whether to download a new build.

### How updates reach native users

1. **First launch** — Despia hydrates from `vybehub.app` (HTML, CSS, JS, images, fonts only — no native binaries).
2. **Subsequent launches** — App boots from on-device localhost cache (fast, works offline).
3. **After Lovable Publish** — `deployed_at` changes → native app downloads the new build in the background → applies on **next** cold launch.

**OTA without store review:** UI, routing, business logic, and how existing native APIs are used (push, NFC, RevenueCat, etc.).

**Requires new store submission:** new native permissions, new Despia editor features, Capacitor plugin changes, or anything that adds native code to the binary.

### Despia dashboard checklist

Confirm in the Despia project (one-time, or when enabling local server):

- [ ] **Local server** enabled for VYBE (public beta)
- [ ] Hydration / start URL points at **`https://vybehub.app`**
- [ ] Submit **one new store build** after enabling so the binary includes the on-device HTTP server

If local server is off in Despia, the app still runs in URL mode even though `despia/local.json` is published.

### Despia warning: “Native offline support requires…”

Despia shows this when it **cannot fetch a valid** `despia/local.json` from the URL configured in your Despia project, or when the web app is not a client-side SPA build.

**VYBE requirements (all met in repo):**

| Requirement | VYBE |
|-------------|------|
| Client-side SPA (not SSR-only) | Vite + React + `BrowserRouter` |
| `@despia/local` in build | `dependencies` + Vite plugin + `postbuild` script |
| Manifest at `/despia/local.json` | Generated on every `npm run build` |

**Most common fix — wrong URL in Despia:**

Set the Despia app / hydration URL to **`https://vybehub.app`** (production), **not** the Lovable preview URL (`*.lovableproject.com`). Preview URLs may redirect behind auth, so Despia’s validator never sees the manifest.

**Verify Despia can reach the manifest:**

```bash
curl -s https://vybehub.app/despia/local.json | head -3
```

Must return JSON with `entry`, `deployed_at`, and `assets` (HTTP 200, no login redirect).

After changing Despia URL or pushing plugin fixes: **Lovable Publish** once, re-check the curl command, then re-save / rebuild in Despia.

### Verify after Lovable Publish

```bash
curl -s https://vybehub.app/despia/local.json | head -5
# Expect fresh deployed_at. Optional: prove a feature chunk is live, e.g.
# curl -s https://vybehub.app/assets/MobileIntro-*.js  → look for VYBE_INTRO_VERSION / const K="N"
```

Expect HTTP 200 and a fresh `deployed_at` timestamp.

### Force iOS to show a new web build (Despia TestFlight / store)

Despia Offline → **Native** boots from on-device `http://localhost` after hydrating from `vybehub.app`. Publish updates the remote manifest; the binary applies it on a **later cold launch**.

1. Confirm Publish landed: `curl -s https://vybehub.app/despia/local.json | head -3` → new `deployed_at`.
2. On the iPhone: **swipe up → force-quit VYBE** (not just background).
3. Reopen once (may still be old while OTA downloads in background).
4. **Force-quit again**, reopen — second cold launch usually applies the new pack.
5. Optional sanity: Safari → `https://vybehub.app` (not the app) to confirm the web change exists at all.

**MobileIntro / intro UX specifically:** once `vybe_intro_seen` is set, RootGate skips the intro. To re-test:

- Settings → Help → **Replay walkthrough**, or
- Bump `VYBE_INTRO_VERSION` in `src/lib/mobileIntroVersion.ts` (RootGate re-shows for logged-out users when the stored version mismatches), or
- Clear site data / reinstall.

**Logged-in users never see RootGate intro** (they go `/home`) — use Replay walkthrough.

### Cap Simulator vs Despia (different pipelines)

| Shell | What it loads | Does Lovable Publish update it? |
|-------|----------------|----------------------------------|
| **Despia** TestFlight / store (`com.despia.vybe`) | OTA from `vybehub.app` → on-device localhost | **Yes** (after force-quit ×2) |
| **Capacitor Simulator** default | Bundled `dist/` from last `npx cap sync` | **No** — run `npm run build && npx cap sync ios` |
| **Capacitor** with `CAP_DEV=1` | Live `https://vybehub.app` | **Yes** (same as web; still force-quit / pull-to-refresh) |

Never assume Cap Simulator == TestFlight Despia.

### Play Console notes

- **APK size warnings** are mostly **native shell** code (Despia, WebRTC, RevenueCat, etc.), not the web bundle in the AAB.
- **Web publish** does not change the store binary size; it updates cached web assets via OTA.
- **Debug symbols** — upload native symbol zip from the Android release build (Despia automatic build or local `android/` gradle); see [Google Android deployment](https://setup.despia.com/deployment/google-android/automatic.md).

---

## Standard release (Cursor → production web)

### 1. Handoff & local check

- Update `WORKLOG.md` (goal, files, blockers, next 3 tasks).
- From repo root:

```bash
npm install
npm run build
# optional: npm run lint
```

- For local dev env, use `.env.local` (gitignored). Production `VITE_*` keys are managed in **Lovable Cloud** — do not paste service-role keys into the frontend.

### 2. Sync code to Lovable

Lovable tracks this git repo. Typical flow:

```bash
git add <files>
git commit -m "describe the change"
git push origin <branch>
```

- Confirm the commit appears in Lovable (project linked to same repo).
- If you only edited in Lovable, skip push — Lovable already has those commits.

### 3. Publish web app (required for `vybehub.app`)

In Lovable:

1. Open the [VYBE project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7).
2. **Share → Publish** (production).
3. Wait for build to finish.
4. Confirm custom domain still points at this project: **Project → Settings → Domains** → `vybehub.app`.

Record in `WORKLOG.md`:

- publish date/time
- commit SHA (if known)
- anything you manually verified

### 4. Supabase (only if you changed backend)

**Link once per machine:**

```bash
npx supabase login
npx supabase link --project-ref hprmicwhlaaqfgshucec
```

**Pull remote schema into migrations:**

```bash
npx supabase db pull
```

**Deploy a single edge function** (example):

```bash
npx supabase functions deploy send-reset-email
```

**Secrets** (password reset email, AI, Stripe, etc.): set in **Lovable Cloud → Backend → Secrets**, not in git. Required examples:

- `RESEND_API_KEY` — password reset / transactional email
- `SUPABASE_SERVICE_ROLE_KEY` — edge functions (auto in Lovable)
- `LOVABLE_API_KEY` — AI gateway (auto in Lovable)

After function deploy, smoke-test the flow (e.g. forgot password, upload, AI scan).

### 5. Post-deploy smoke test (`vybehub.app`)

Hard-refresh or use a private window:

- [ ] Landing / login loads
- [ ] Sign in / sign out
- [ ] Forgot password → email or Supabase fallback
- [ ] Create → Post or Camera → capture → publish
- [ ] Feed loads without console errors
- [ ] `/reset-password` link from email (if testing auth)

Optional: test on **Play Store / Despia** app — with local server enabled, web publish updates OTA via `despia/local.json` (no store release) **unless** native/Despia editor config changed. Verify manifest: https://vybehub.app/despia/local.json

---

## Fast path (Lovable-only edits)

If all work happened in Lovable prompts:

1. **Share → Publish** in Lovable.
2. Run the post-deploy checklist above.
3. Update `WORKLOG.md`.

No local `npm run build` required unless you also pulled the repo in Cursor.

---

## Rollback

**Web (vybehub.app):**

- Lovable: redeploy a previous known-good version from publish/history (if available), **or**
- Revert git commit → push → Publish again.

**Supabase:**

- Prefer a **forward-fix** migration; do not reset production DB.
- Revert a bad edge function: deploy the previous function code from git history.

**Mobile store:**

- Web rollback does not change the store binary; only submit a new store build if native code or `capacitor.config.ts` changed.

---

## Agent checklist (Cursor)

Before saying “deployed”:

1. `WORKLOG.md` updated.
2. `npm run build` passed (if code changed locally).
3. User published via Lovable **or** confirmed publish already happened.
4. Post-deploy smoke items checked (or user confirmed).
5. If functions/SQL changed: deploy/migration steps documented with exact commands run.

If publish credentials are missing, stop and give the user the exact unblock step (usually: **Publish in Lovable** or **Supabase login**).
