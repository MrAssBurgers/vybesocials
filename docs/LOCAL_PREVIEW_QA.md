# Isolated local preview QA

This setup runs VYBE against **`demo-vybe-preview` only**. It uses synthetic accounts and real local Firebase Auth, Firestore, Storage and selected Cloud Functions. It is not staging, does not use the owner's signed-in account, and must never be deployed.

Run the PowerShell blocks below from the repository root, in three separate terminals. Keep existing production preview tabs untouched. Open only `http://127.0.0.1:8082` for these tests, preferably in a fresh browser profile or private window. Do not use `npm run dev` without the explicit mode and environment below: normal development uses the repository's ordinary Firebase configuration.

## Fixed endpoints and prerequisites

| Service | Exact local endpoint |
|---|---|
| Vite app | `http://127.0.0.1:8082` |
| Auth emulator | `127.0.0.1:9199` |
| Firestore emulator | `127.0.0.1:8280` |
| Storage emulator | `127.0.0.1:9399` |
| Functions emulator | `127.0.0.1:5101` |
| Browser callable proxy | `http://127.0.0.1:8082/demo-vybe-preview/us-central1/<callable>` |
| Browser Storage proxy | `http://127.0.0.1:8082/v0/b/demo-vybe-preview.appspot.com/o` |
| Emulator hub / logging | `127.0.0.1:4500` / `127.0.0.1:4600` |
| Firebase project / bucket | `demo-vybe-preview` / `demo-vybe-preview.appspot.com` |

The local emulator run was verified with Firebase CLI **15.28.2**, Java **21.0.8**, and Node **24.20.0** on Windows. Functions still declare Node 20 as their deployment runtime; this local result is not deployment runtime certification. Java must be available on `PATH`. Firebase CLI may download emulator binaries on the first run. No `firebase login`, service account, provider key, production secret, or cloud project creation is needed.

Use fresh PowerShell terminals without inherited provider credentials. Do not supply production credential files or change auth/provider settings to make a missing feature appear to work. If a fixed port is occupied, identify the existing process and reuse only a confirmed instance of this demo environment, or stop the known test process in its terminal. Do not kill unrelated processes or allow the app to silently move to another port.

## Terminal 1: build the selected Functions and start emulators

Install dependencies if not already installed. The app's peer dependency exception matches existing CI:

```powershell
npm ci --legacy-peer-deps
npm ci --prefix functions
npm run build --prefix functions
node scripts/qa/prepare-local-preview.mjs

$env:GCLOUD_PROJECT = 'demo-vybe-preview'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8280'
$env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9399'
$env:FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5101'

Push-Location work/local-preview
try {
  New-Item -ItemType Directory -Force -Path tmp | Out-Null
  $env:TEMP = Join-Path (Get-Location) 'tmp'
  $env:TMP = $env:TEMP
  $env:TMPDIR = $env:TEMP
  npx --yes firebase-tools@15.28.2 emulators:start --project demo-vybe-preview --config firebase.json --only "auth,firestore,storage,functions" --debug
} finally {
  Pop-Location
}
```

Wait for all four emulators to report ready before continuing. Keep this terminal running. The helper generates a narrow Functions entry point, runtime guard, copied rules/indexes, and `firebase.json` under ignored `work/local-preview/`. Its dependency link points to the repository's installed Functions dependencies. It does not copy production credentials, invoke a deployment, or export every Function.

After changing Functions source, rebuild it. After changing rules/indexes or the exported preview list, rerun the preparation script and restart this emulator session so the generated snapshot matches the source. Do not use the root production Firebase config or `npm run deploy`. The separate rules-test environment on other ports/project names is not this preview.

## Terminal 2: seed synthetic users and run the game fixture

The seed and game scripts check these environment values before loading Firebase clients:

```powershell
$env:GCLOUD_PROJECT = 'demo-vybe-preview'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8280'
$env:FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9399'
$env:FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5101'

node scripts/qa/seed-local-preview.mjs
node scripts/qa/test-game-capture-preview.mjs
```

The game fixture exercises seven actual client/service checks: mismatched expected-owner reservation denial, upload and server verification, authenticated byte-identical download, same-key replay, mismatched expected-owner lookup denial, another account's lookup denial, and cancellation with the reserved ID followed by idempotent discard. The Firebase SDK binds each operation to the account that started it; switching accounts requires a new explicit operation. These checks do not certify native engines or partner uploads.

| Synthetic sign-in | UID | Profile document |
|---|---|---|
| `alice@vybe.test` | `preview-alice` | `preview-profile-alice` |
| `bob@vybe.test` | `preview-bob` | `preview-profile-bob` |

Both use **`Vybe-local-preview-only-2026!`**, an intentionally public emulator-only password. Never create these credentials in production. The seed creates email-verified demo users, profiles/auth mappings, 1,000 test tokens per new wallet, local 2FA preferences, and the `preview-game` registration. Rerunning it preserves existing demo wallets and authored content; it refreshes the synthetic auth index mapping. It grants no staff roles or premium membership. Existing-user passwords are not reset by the seed.

For a moderation walkthrough, run `node scripts/qa/seed-local-preview.mjs --with-moderator` with the same guarded demo environment. This explicit option adds `moderator@vybe.test` (UID `preview-moderator`, profile `preview-profile-moderator`, same emulator-only password) and its current moderator role. It never changes a pre-existing grant, including a revoked grant. The default seed still creates no staff role. Keep the moderator in its own tab because the preview uses tab-session authentication.

Report a synthetic mini app as Alice or Bob, then inspect it through the moderator's Admin → Reports screen. Inspection shows the source without running it. Removal requires a note and confirmation, archives the actual publication and prevents that same app ID from being published while its hold is active. The creator's private draft remains available. A moderator can explicitly release the inspected hold; this does not publish the draft. The creator must choose Publish again. Never use an ordinary production tab for these test actions.

For the message-report walkthrough, run `node scripts/qa/test-message-preview.mjs` with the same five guarded demo variables. It signs in synthetic Bob and Alice, rejects an expected sender UID that differs from the authenticated caller, sends one permanent text message through the actual `sendDmMessage` callable, verifies retry deduplication and recipient access, and checks that reporting one's own message is rejected (five checks). It prints the local conversation URL and stores it in ignored `work/local-preview/message-fixture/latest-message.json`. Reruns reuse the same client message identity. No report is created by the fixture: sign in as Alice, open its local URL, use the message menu → Report message, choose Other and submit. In the moderator tab, inspect its captured text through Admin → Reports. No provider notification is enabled. This checks reporting, not live two-device delivery or native push.

Feed mute is a separate private account preference. Open a synthetic peer's profile safety menu → Mute in feeds, then verify it in Settings → Privacy → Muted in feeds. Reloading retains the preference; unmuting removes it. Explicitly opened profiles and conversations remain accessible. This preview does not supply a successful provider-backed post publication to manufacture feed content.

The game fixture compiles the actual source Firebase adapter into ignored `work/local-preview/game-sdk/`, signs in through the real Auth emulator, and checks:

1. Private PNG staging through authenticated callables and Storage, including server verification.
2. Owner-authenticated download with identical bytes.
3. Same-key retry returns the original ready capture.
4. Bob cannot read Alice's capture receipt.
5. The early draft-ID callback permits cancellation followed by idempotent explicit discard.

It leaves one ready synthetic capture for browser review and prints its **local** URL. The latest URL is also saved in `work/local-preview/game-sdk/latest-capture.json`. This file contains no access token or password. Each fixture run creates fresh test captures and counts against the real local capture quotas; the seed does not reset those quotas. The fixture does not publish a post, fake moderation success, or exercise partner GCS composition.

## Terminal 3: start the isolated browser app

```powershell
$env:VITE_FIREBASE_EMULATORS = 'true'
$env:VITE_FIREBASE_PROJECT_ID = 'demo-vybe-preview'

npm run dev -- --mode local-qa --host 127.0.0.1 --port 8082 --strictPort
```

Open `http://127.0.0.1:8082`, sign in with a synthetic account, and use the fixture's local capture URL. Do not follow the SDK's public `vybehub.app` review URL for a demo capture: that origin is production and cannot read this emulator data. Use the printed loopback URL instead.

The application accepts emulator mode only in a development build on loopback **port 8082**, with the exact demo project and flag. It configures Firestore, Storage and Functions before returning the shared Firebase app, then connects Auth before use. Browser SDK callables and raw Function URLs use the app's own origin on port 8082. The existing Vite server forwards only exact demo project/us-central1 callable paths and POST/OPTIONS methods to the fixed Functions emulator on 5101; it does not rewrite authentication, request bodies or responses, follow redirects, or proxy arbitrary URLs. Other routes and ordinary production routing are unchanged. The standalone game SDK fixture still calls 5101 directly. Reusing an already-initialized real project is rejected. A stored real auth backup or ordinary Firebase/Supabase auth key in local storage is rejected without deleting it; use a separate fresh origin/profile rather than clearing someone's login.

Browser Storage SDK requests also use port 8082. A separate fixed proxy forwards only the Firebase `/v0/b/demo-vybe-preview.appspot.com/o` object protocol to Storage on 9399, including encoded object names and query strings. It accepts only GET/POST/PUT/PATCH/DELETE/OPTIONS and preserves the QA Host so the emulator's resumable upload-session URLs stay on port 8082. Firebase authentication, Range headers, Rules and media bytes remain intact; there is no public-token conversion or Admin access. Direct SDK fixtures still use Storage on 9399. Auth and Firestore retain their original direct ports.

After Vite is running and the game fixture has created a fresh ready capture, Terminal 2 can also run `node scripts/qa/test-storage-proxy-preview.mjs` with its same five guarded demo environment variables. This uses actual Firebase clients to compare direct/proxy private downloads, check owner/other-account/guest permissions, round-trip temporary multipart and resumable uploads through both ports, and check that resumable session URLs retain their original loopback origin. It deletes its temporary synthetic avatar-path objects through the authenticated client; it does not change the profile avatar or publish anything. The check covers protocol and bytes, not real-device codecs. An emulator restart that loses Storage contents requires a fresh game fixture before this test, even if Firestore retained an old receipt.

Demo authentication uses tab-session persistence and skips the normal auth recovery mirror. App Check and push messaging initialization are disabled for this local mode. These branches do not change production auth settings, production 2FA, or production permissions.

## What is available, and what a passing result means

The generated entry point runs 23 actual source-built marketplace, reporting/moderation, direct-message sending, premium gift/status, first-party game capture, game consent management, challenge progress/claims, and community create/join/invite/manage/message callables. Client Firestore and Storage operations still run through the copied rules. Synthetic Admin seeding supplies initial fixtures; mutations made through the UI or game script use the real SDK/service paths.

The preview intentionally excludes billing, email, push delivery, provider-backed AI/moderation, live audio/video token issuance, broad auth exports and scheduled cleanup jobs. `gamePartnerApi` is not currently exported in this preview, and the seed is a first-party registration, not a verified partner registration. Consent UI alone does not demonstrate a partner device/token/upload round trip. A missing callable or denied provider request is a truthful unavailable result, not permission to add a fake successful response.

Game staging/review can be checked here. Normal post publishing requires Vybe Check; the preview does not supply its provider-backed pipeline. An unavailable scan must remain a failed publication. Owner bypass, direct Admin post insertion, or mocked success would not prove the normal publish path and must not be counted as such. Lost-acknowledgement/replay behavior also has dedicated unit and Firestore transaction tests, distinct from this browser walkthrough.

The Vite Content Security Policy blocks ordinary browser fetch, resource, WebSocket, frame and form requests to non-loopback providers. This helps contain the preview; it is **not an operating-system network sandbox**. Top-level navigation, browser extensions, native bridges, arbitrary local services and server processes are outside that promise. Do not run untrusted mini-app code or click real external integration links while treating this as a fully isolated hostile-code environment.

Emulators do not certify deployed indexes, IAM, App Check enforcement, GCS generation/composition behavior, cleanup throughput, provider billing, OAuth/native return links, console browser support, real-device codecs, native SDK compilation, or production historical data. No test here enables public partner onboarding or deploys the app.

## Stop and troubleshoot

- Stop Vite and emulators with `Ctrl+C` in their own terminals, then close the dedicated QA terminals so their environment variables cannot affect a later build. Keep the ordinary production tab and its storage intact.
- Keep concurrent Firebase CLI sessions in separate working directories, **separate process temporary directories**, and separate projects/ports. CLI 15.28.2 uses `os.tmpdir()/firebase/storage/blobs` for Storage bytes, without a project namespace, and removes that directory when Storage stops. A parallel test run sharing that directory can erase preview uploads and crash the preview with `ENOENT`. Set `TEMP`, `TMP` and `TMPDIR` to each session's own existing directory **before** starting its CLI process, as above; never reuse another running session's temporary directory. A later CLI export of that preview needs the same temporary directory because the emulator hub locator also lives there. The CLI can also reuse/remove a same-working-directory `firebase-debug.log`. Use `--debug` and capture output to a dedicated log. An orphaned Firestore process is not proof that Auth, Storage and Functions still run; verify all four before continuing.
- This startup does not import/export emulator state. A stopped emulator session may lose its demo data. Restart all services, reseed, and create a new capture link; an old browser session or saved receipt is not proof that the new instance still has that record.
- A project/port/origin guard failure is intentional. Correct the exact launch settings; do not remove the guard or point it at a real Firebase project.
- If Functions fail to load, confirm the Functions build succeeded and rerun preparation. The generated entry point imports source-built `functions/lib`; source edits alone do not rebuild it.
- The local browser previously left cross-port Functions fetches pending until the SDK's 70-second deadline while direct authenticated Node SDK calls succeeded. The same-origin Vite route is a narrow transport workaround against those real services, not a mocked response or authentication bypass. The browser then received HTTP 200 from capture metadata, marketplace state, challenge sync and premium status; capture metadata loaded in the review UI. Media download and publication are separate checks. After changing this configuration, wait for Vite to restart and hard reload the QA tab. Optional debug-level console tracing requires `VITE_LOCAL_PREVIEW_DIAGNOSTICS=true` in Terminal 3 before starting Vite, plus the existing development/demo guards. It is off by default and never runs in production. It shows only callable name, endpoint, normalized failure code and fetch entry/response status; never tokens, headers, request data or response bodies. A configured endpoint/start log alone does not prove a successful response. Restart without that optional variable and hard reload when finished tracing.
- Storage media subsequently remained loading while the emulator parent process crashed; that does not prove a browser cross-port defect for Storage. A retained stack in the following pass identified shared temporary Storage bytes being removed when another emulator stopped, as described above. The exact-bucket proxy keeps QA transport consistent but is not independently established as a browser Storage fix. After recovery, the real Storage fixture passed ten direct/proxy checks including private-access denials, byte-identical uploads, session origin preservation and cleanup. Separately, bounded Firebase `getBlob` clears the Blob MIME during slicing; capture review accepts that empty MIME using the server-verified ready receipt, while retaining exact byte-size and conflicting MIME rejection.
- A normal application action may invoke a Function outside the narrow preview list. Preserve the unavailable state, record the missing integration, and expand the local export list only after reviewing its external effects.
- Do not run the broad `npm run debug`/production probes as part of this guide. Do not deploy `work/local-preview/firebase.json`, alter production `auth2faRequest`, or publish a `local-qa` build.
