# DEPLOY — VYBE (`vybehub.app`)

The backend is **Firebase only**: Firebase Auth, Firestore, Cloud Functions and Cloud Storage in project **`vybe-daaab`**. `.firebaserc`, `firebase.json`, `functions/package.json` and the exports in `functions/src/index.ts` are the deployment sources of truth. Historical Supabase instructions are obsolete; do not use SQL migrations or Supabase deployment commands for this app.

Production web hosting is **Lovable**, with custom domain **`vybehub.app`**. Lovable GitSync follows **`origin/main`**. A GitHub push updates source/preview; production and the Despia web bundle require **Lovable → Share → Publish**.

| Environment | URL / scope |
|-------------|-------------|
| Production web | https://vybehub.app |
| Lovable preview | https://416714c8-d013-4aff-984d-522418a9bbc7.lovableproject.com |
| Lovable editor | https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7 |
| Firebase Hosting staging frontend | https://vybe-daaab.web.app — shares the production Firebase project; not an isolated data environment |
| Isolated local QA | `demo-vybe-preview`; follow [LOCAL_PREVIEW_QA.md](docs/LOCAL_PREVIEW_QA.md). Never deploy its configuration or fixtures. |

## Who deploys what

| Change type | Release path |
|-------------|--------------|
| React UI / `src/` | Tested commit on `origin/main`, then **Lovable → Share → Publish** |
| Cloud Functions | Build `functions/`, review exact exported names, then deploy only those named functions |
| Firestore / Storage rules and indexes | Review the full corresponding files, run relevant isolated emulator tests, then deploy only the required resource targets in the feature's documented order |
| Firebase Hosting staging frontend | Optional `hosting`-only deploy of `dist/`; does not publish `vybehub.app` |
| Play Store / Despia native shell | [PLAY_STORE_GUIDE.md](PLAY_STORE_GUIDE.md); binary changes are separate from web publish |
| Despia local server OTA | Lovable Publish updates `/despia/local.json`; verify native download and cold launch below |

Do not run bare `firebase deploy`, `firebase deploy --only functions`, or `npm --prefix functions run deploy`: that npm script deploys every function. `functions/src/index.ts` still exports pending implementations from `stubs.ts` (Runway, music-provider sync and auth email hook). **Leave `auth2faRequest` undeployed under the current WORKLOG restriction.** Do not change authentication configuration or secrets as a side effect of a release. The new email challenge authority and fail-closed client need the coordinated authentication rollout described in [EMAIL_CONFIRMATION.md](docs/EMAIL_CONFIRMATION.md); do not publish that client against the old incomplete challenge endpoint. First-factor server access remains an explicit MFA blocker.

The current stability checkpoint adds/changes these named resources: `manageSharedTheme`, `readMusicCatalog`, `phoneVerificationState`, `phoneVerifyRequest`, `phoneVerifyConfirm`, `auth2faVerifyPhone`, `authLoginApproval`, and the existing `matchContacts` dependency. Review prior pending Notes/theme resources in WORKLOG too. Deploy the theme reader and matching client with owner-only raw rules and `_shared_theme_cursors.expireAt` TTL; older clients that directly query public themes are incompatible. The TTL does not grant access: expired cursors are rejected immediately even before managed deletion. Phone resources require the existing Twilio secrets and real SMS QA; this release does not change their values or Auth provider settings. Approved preview media must be provisioned deliberately; never deploy local QA records as a music catalog. See [contact/phone contracts](docs/CONTACT_DISCOVERY.md) and [music preview limits](docs/MUSIC_PREVIEWS.md).

Publishing requires access to the appropriate project. Verify current access; do not assume it exists or claim a publish occurred because a build or push passed.

---

This follow-up also repairs existing sound uploads (`uploadSound`, `readSoundLibrary`), comments (`readPostComments`, `readPostCommentCounts`, `readCommentContext`, `managePostComment`) and DNA Apply/Undo (`dnaAutopilot`, `dnaAutopilotRevert`). Review their shared rules and named indexes together: public sound proof listing indexes, comments by parent/time, the existing DNA history index, `_sound_library_cursors.expireAt` and `_comment_cursors.expires_at` TTL policies. Keep private challenge, receipt, plan and cursor namespaces denied. Historical unproven comments/sounds are not automatically attested. Source-object/orphan retention and actual provider/native behavior need operational validation before production certification. No preview fixture or local mail sink belongs in a release.

## Pending existing-feature stability resources (2026-10-04)

No production deployment was performed for this checkpoint. Review these exact changed exports and their matching client before any rollout:

- Checked post reads: `readSocialPostList`, `readSocialFeed`, `readSocialPostPreviews`, `getRankedFeed`, `getRecommendations`, `calculateFeedRanking`, `sharePreview`, `mcp`, and `sitemapDynamic`. Broad signed-in raw post reads are now denied; only canonical owners and staff retain raw read access. Deploy the checked readers and required indexes before activating the matching rules/client. Older raw-reader clients are incompatible. Current audience/block/deletion checks do not prove historical authorship; the old caller-writable author fields require a separate migration.
- Saved original audio: `manageSavedSounds` plus the changed `readSoundLibrary`/`uploadSound` module. Deploy the `_saved_sound_refs` owner/active/name index and matching private rules; old direct `user_saved_sounds` access is denied. See [sound contracts](docs/SOUND_UPLOADS.md).
- Account controls: `manageSignInPreferences`, `authSessionRevoke`, `manageNotificationPreferences`, and `muteSmartPings`. Matching rules, session/history indexes, and receipt/limit TTLs are required. See [account contracts](docs/ACCOUNT_SETTINGS_STABILITY.md). This does not lift the `auth2faRequest` deployment restriction or establish server-enforced MFA.
- Notification delivery dependencies: `sendPushNotification`, `sendBriefNotification`, `onDmMessageCreated`, `onConversationMessageCreated`, `onCallCreated`, `onSocialNotificationCreated`, `smartBriefPings`, and `smartPingDispatcher`. Each uses the shared checked preference authority; deploy together with the canonical settings endpoint. No real push/provider delivery was exercised during local QA.

Review the named indexes in `firestore.indexes.json`, including profile/sound/filter post ordering, bookmarks, tagged posts, pins, saved sounds, sessions and login history. New TTL fields are `_social_post_list_cursors.expires_at` and `expireAt` on `_notification_preference_requests`, `_sign_in_preference_receipts`, `_sign_in_preference_limits`, `_auth_session_revocations`, and `_auth_session_revoke_limits`. Expiration is checked before managed cleanup. Preserve earlier pending resources and private namespaces. Do not deploy the local wrapper, fixtures, or emulator configuration. Do not use a broad Functions deploy.

## Offline strategy (Despia Native default)

VYBE defaults to **Despia local server** (`@despia/local`) so Offline Support → **Native** works. The binary hydrates from `vybehub.app`, then boots from on-device `http://localhost`.

| Mode | Env | What it does |
|------|-----|--------------|
| **Despia local** (default) | `VITE_OFFLINE_MODE=despia-local` | Build emits `dist/despia/local.json` for Native offline |
| PWA | `VITE_OFFLINE_MODE=pwa` | Selects the client service-worker strategy; the build still emits `dist/despia/local.json` |

### Despia dashboard (Native)

1. App Start URL = **`https://vybehub.app`**
2. Offline Support → **Native**
3. **Lovable Publish** so `https://vybehub.app/despia/local.json` stays fresh
4. **Rebuild** the native binary once after flipping Native (status bar / offline settings are binary-side)

The repo includes `@despia/local`, but that does not prove the published manifest or installed binary is current. Verify the manifest and test a cold launch after publishing/rebuilding.

---

## Despia local server (native iOS / Android OTA)

VYBE uses [@despia/local](https://www.npmjs.com/package/@despia/local) so Despia can cache the web build on-device and serve it from `http://localhost` (cached shell startup). Network-backed features still need connectivity.

**Docs:** [Introduction](https://setup.despia.com/local-server/introduction.md) · [Reference](https://setup.despia.com/local-server/reference.md) · [Index](https://setup.despia.com/llms.txt)

### Already wired in this repo

| Piece | Location |
|-------|----------|
| Vite plugin | `vite.config.ts` → `despiaLocalPlugin({ outDir: 'dist', entryHtml: 'index.html' })` |
| Dependency | `package.json` → `@despia/local` |
| Build output | `dist/despia/local.json` (generated on every `npm run build`) |
| Production URL | https://vybehub.app/despia/local.json |

The manifest includes `entry`, `deployed_at`, and a sorted `assets` list. Despia compares `deployed_at` with the cached value to decide whether to download a new build.

### How updates reach native users

1. **First launch** — Despia hydrates from `vybehub.app` (HTML, CSS, JS, images, fonts only — no native binaries).
2. **Subsequent launches** — App boots from on-device localhost cache (fast, works offline).
3. **After Lovable Publish** — `deployed_at` changes → native app downloads the new build in the background → applies on a later cold launch after the download completes. Verify the installed build rather than assuming an exact number of launches.

**Web-bundle updates:** UI, routing and compatible use of existing native APIs can reach an installed Despia shell through its web update path. Verify the change on each affected native shell; this is not a guarantee of store-review exemption.

**Native-binary updates:** new native permissions, binary-side Despia settings and native plugin/code changes require rebuilding the affected shell and following its store release process.

### Despia dashboard checklist

Confirm in the Despia project (one-time, or when enabling local server):

- [ ] **Local server** enabled for VYBE
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
# Also inspect /version.json and fetch its exact entry path; URLs do not expand wildcards.
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
| **Despia** TestFlight / store (`com.despia.vybe`) | OTA from `vybehub.app` → on-device localhost | **Yes** (after download and a later cold launch; verify on-device) |
| **Capacitor Simulator** default | Bundled `dist/` from last `npx cap sync` | **No** — run `npm run build && npx cap sync ios` |
| **Capacitor** with `CAP_DEV=1` | Live `https://vybehub.app` | **Yes** (same as web; still force-quit / pull-to-refresh) |

Never assume Cap Simulator == TestFlight Despia.

### Play Console notes

- **APK size warnings** are mostly **native shell** code (Despia, WebRTC, RevenueCat, etc.), not the web bundle in the AAB.
- **Web publish** does not change the store binary size; it updates cached web assets via OTA.
- **Debug symbols** — upload native symbol zip from the Android release build (Despia automatic build or local `android/` gradle); see [Google Android deployment](https://setup.despia.com/deployment/google-android/automatic.md).

---

## Standard release

### 1. Review and verify the exact release

Read `WORKLOG.md`, inspect the current branch/diff and identify the client, callable, rules, indexes and native changes included. New feature work is currently deferred until the existing-functionality stability audit passes. Passing unit tests alone does not certify production parity or provider behavior.

Install as CI does (React 18 / `react-leaflet` peer resolution needs the flag):

```sh
npm ci --legacy-peer-deps
npm ci --prefix functions
```

Run the applicable checks from the repo root, including the full app checks after substantive changes:

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm run validate:boot
npm --prefix functions run build
```

CI uses Node 22; `functions/package.json` declares a Node 20 deployed runtime. Do not change the runtime as an incidental release step. Run feature-specific SDK/backend/rules checks when those paths change; [.github/workflows/ci.yml](.github/workflows/ci.yml) and the feature documents list additional checks. Manually test the affected flow in the isolated preview, including failure/retry and account boundaries. Do not point fixture-reset scripts at production or the retained interactive preview.

`npm run build` invokes `postbuild` and emits `dist/version.json`, the hashed app entry and `dist/despia/local.json`. Functions deploy from `functions/lib/index.js`; **`firebase.json` has no functions predeploy build hook**, so rebuild after every backend source change and review generated `functions/lib` changes before deployment.

Use ignored `.env.local` for local client configuration and the project's existing Lovable build environment for production `VITE_*` values. Confirm the production build targets `vybe-daaab` and is not in local-QA/emulator mode. `VITE_*` values are included in the browser bundle: never put Admin credentials or private provider secrets there. Server secrets belong in the existing Google Secret Manager/Firebase Functions configuration and must match the selected function's declared secret bindings. Missing secrets or provider configuration are release blockers for that flow, not permission to copy credentials into source.

### 2. Commit and sync to `main`

Update `WORKLOG.md` with changes, checks, known gaps and next actions. Commit only reviewed files. Lovable follows `main`, so pushing an arbitrary feature branch is insufficient:

```sh
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

Continue only if the ancestor check succeeds. If it fails, integrate current `origin/main`, resolve conflicts without dropping concurrent work, and repeat relevant checks. Then:

```sh
git push origin HEAD:main
git rev-parse HEAD
```

Never force-push. Confirm Lovable GitSync has the intended commit before publishing. If edits originated in Lovable, still identify and verify the resulting `main` commit.

### 3. Roll out named Firebase resources when required

Client-only changes need no Firebase deployment. For a backend change, record the exact target list and compatibility order before executing it. CLI access and deployed inventory can be checked without changing services:

```sh
npx firebase-tools login:list
npx firebase-tools projects:list
npx firebase-tools functions:list --project vybe-daaab
```

If no authorized account/project access is available, the unblock step is `npx firebase-tools login` with an account permitted to deploy `vybe-daaab`. Do not change Firebase Auth providers or app user accounts to fix CLI access.

Use the actual camelCase export names, including re-exports from domain modules; a client invocation or a file's existence does not prove an implementation is exported or deployed. Review the implementation, required indexes, secret bindings and current deployment before choosing it. The following are **separate examples of selective scope, not a batch to run**:

```sh
# Reporting release: requires the complete rollout review linked below.
npx firebase-tools deploy --project vybe-daaab --only functions:reportModeration

# Checked social reader release: deploy only if included in the reviewed release.
npx firebase-tools deploy --project vybe-daaab --only functions:readSocialFeed,functions:readSocialPostPreviews

# Draft admission release: compatible client/rules ordering is documented below.
npx firebase-tools deploy --project vybe-daaab --only functions:saveMiniAppDraft,functions:deleteMiniAppDraft
```

Named `--only` targets avoid replacing unrelated exports; see [Firebase's function deployment guidance](https://firebase.google.com/docs/functions/manage-functions#deploy_functions). Do not deploy the pending exports to make a scanner green. Missing implementations and unavailable providers remain explicit gaps.

Rules and index targets are also separate release operations:

```sh
npx firebase-tools deploy --project vybe-daaab --only firestore:indexes
npx firebase-tools deploy --project vybe-daaab --only firestore:rules
npx firebase-tools deploy --project vybe-daaab --only storage
```

Each command applies the corresponding complete checked-in configuration, not just the lines changed for one feature. Review unrelated pending changes too. Wait for required indexes to become ready before relying on queries. Rules deployments overwrite the corresponding remote rules; follow the [Firebase CLI partial-deploy guidance](https://firebase.google.com/docs/cli#partial_deploys).

The release order is feature-specific; do not apply one blanket ordering:

- [Mini-app drafts and publication](docs/MINI_APPS.md): deploy tested draft callables, publish the compatible client, then install reviewed Firestore restrictions. Include `publishMiniApp` only when that implementation is part of the reviewed release; verify source conflicts, deletion/retry, publication receipts and quotas.
- [Reporting and moderation](docs/REPORT_AUTHORITY.md): coordinate callable, indexes, client and rules. Resolve evidence/audit retention requirements before production rollout. Historical `content_flags` records are not the verified report queue; unavailable or rejected callable submissions must remain visibly unconfirmed.
- [First-party game SDK](docs/GAME_SDK.md) and [partner API](docs/PARTNER_GAME_API.md): include matching Firestore/Storage authority and cleanup functions before enabling integrations. Registration, CORS, scoped consent, expiry/revocation, cleanup capacity and actual upload/download tests remain separate prerequisites. A built SDK is not a deployed integration.

Record actual CLI results, project, targets, date/time and the tested commit. A local source change, emulator pass or unauthenticated HTTP response does not prove the deployed function version matches that commit.

Optional Firebase Hosting staging release (still uses the production backend unless the build explicitly targets an isolated environment):

```sh
npx firebase-tools deploy --project vybe-daaab --only hosting
```

This publishes `dist/` and the `firebase.json` hosting configuration. Inspect its function rewrites and verify their targets already exist. It does **not** publish `vybehub.app` or update the production Despia hydration URL.

### 4. Publish the web client through Lovable

After any prerequisite backend steps and GitSync verification:

1. Open the [VYBE project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7).
2. Use **Share → Publish**.
3. Wait for the build/publish result and confirm `vybehub.app` still belongs to that project.
4. Inspect [version.json](https://vybehub.app/version.json) and [despia/local.json](https://vybehub.app/despia/local.json). Compare the reported commit, entry path and build/manifest timestamps with the intended release; fetch the exact entry asset to verify it exists.

If `version.json` has an unknown/stale commit, do not infer parity from a fresh timestamp alone: compare build assets and record the uncertainty. Recheck the app after clearing browser cache or using a fresh test window, and follow the native cold-launch steps above for installed Despia apps.

### 5. Verify production behavior and record limits

Use designated test accounts and content for the affected release:

- Landing/login, sign-in/sign-out and account changes; verify password reset through the existing Firebase flow when auth-related paths changed.
- Home, Following and Local feeds with expected visibility/locality; confirm errors are distinguishable from empty results.
- Relevant create/upload/comment/DM flows, including retry, private-data boundaries and media playback.
- Mini apps, games/mod capture consent and provider-backed features if included; test the real deployed path rather than a mocked transport.
- Native app cold launch and the same affected flow on each changed OS; a web-only pass does not certify native permissions, return links or codecs.

For a debug scan, `npm run debug` includes configured Firebase probes. A read-only public health check is available at `https://us-central1-vybe-daaab.cloudfunctions.net/sharePreview?health=1`. A health response proves endpoint availability only. Likewise, callable `UNAUTHENTICATED` proves an auth gate responded; it does not prove signed-in success, rules correctness, provider configuration or current code. Test Firestore/Storage permissions with isolated synthetic fixtures and reviewed account-scoped flows, not by loosening production rules.

Record the publish date/time, commit, exact deployed targets, manual observations and any failures in `WORKLOG.md`. State client publication, backend deployment and native verification separately.

---

## Rollback

**Web:** revert the faulty change in Git, verify the revert with current `main`, push without force, and publish through Lovable. A previously published build may also be restored if Lovable offers that option. Verify the restored assets and native refresh; cached native bundles do not change instantly.

**Functions:** rebuild the compatible known-good implementation and redeploy only its reviewed named targets. Preserve required newer callables while clients transition. Do not delete functions or replace unrelated auth exports as an incidental rollback.

**Rules/data:** prefer a forward fix that preserves access controls. Review the entire rule file before redeploying. Do not reset production Firestore, delete receipt/identity ledgers or run historical migration scripts as a generic rollback. Older clients may be incompatible with newer restrictive rules; for example, rolling back the mini-app client alone after draft rules change prevents legacy saves/deletes.

**Mobile:** a web rollback does not undo native permissions, plugins or binary settings. Rebuild/release the affected native shell when its binary changed.

---

## Before saying “deployed”

1. The tested commit and exact resource scope are recorded in `WORKLOG.md`.
2. Local checks and affected-flow verification passed, with remaining gaps stated.
3. Actual Firebase deployment results are recorded for changed backend resources, or explicitly marked not deployed.
4. Lovable Publish succeeded and production assets match the intended client release, or explicitly marked not published.
5. Production smoke tests and affected native checks are recorded separately; source availability is not runtime certification.

If access is missing, report the concrete next step: **Lovable → Share → Publish** for the web client, or **`npx firebase-tools login` with authorized project access** for named Firebase resources. Do not report either step as completed until verified.
