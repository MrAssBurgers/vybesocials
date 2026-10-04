# VYBE Hub mini apps

Open **Create → Hub → Mini Apps**, or `/mini-apps`. Signed-in members can start with a tap game, idea picker, or color tool, edit HTML/CSS/JavaScript, explicitly run a preview, save private drafts, and publish a snapshot. Published apps have a `/mini-apps/:appId` URL. Readers choose **Run app** before any creator code executes.

## Creator workflow

- **Export code** downloads a versioned UTF-8 JSON file with only title, description, category and HTML/CSS/JavaScript. It preserves unfinished source and whitespace, excluding account IDs, server identity and publishing metadata. Keep exported files private if the code contains private information.
- **Import code** accepts Vybe source files up to 1,000,000 bytes and the existing 100,000-character combined code limit. Unknown versions, extra fields and invalid UTF-8 are rejected before replacement. Confirmation offers exporting current edits or cancelling; accepting opens a fresh private draft identity, replaces unsaved/recovered new-draft work and closes any preview. It does not execute code, save to Firebase or publish until the corresponding explicit action. Saved drafts and public snapshots remain unchanged.
- **Preview** loads a validated code snapshot and brings its controls into view. **Update preview** stops the previous runtime, loads the latest editor content, and waits for another explicit **Run app**. Editing source never silently replaces a running app.
- **Close preview** destroys its frame and returns focus to the code editor without changing or saving source. The scroll respects reduced motion.
- A running preview shows startup progress and up to four local error messages, each limited to 240 characters. The messages are inert, untrusted app output; they do not trigger account actions or get persisted/sent to a server. A missing startup acknowledgement closes the preview after ten seconds while the host event loop is responsive. Restart requires an explicit **Run again**; it clears old feedback and starts fresh.
- **Phone** constrains the preview to 320px (or the available width on smaller screens); **Fit** restores the container width without restarting runtime state. The host's width transition and scroll behavior respect reduced motion. Code wrapping is optional; Ctrl/Command+S saves and Ctrl/Command+Enter prepares a preview while editing.
- Switching tabs, backgrounding VYBE, or leaving the page closes the running iframe. Returning shows why it stopped and requires **Run again**; runtime state starts fresh. Authored source and the Phone/Fit choice remain intact while the studio stays mounted. The teardown is synchronous during `visibilitychange`/`pagehide`, including a page retained in the browser's back/forward cache; it does not rely on creator code cooperating.
- Changing the effective reduced-motion preference stops the current runtime with an explanation. **Run again** starts the unchanged source with the new preference; the code is not silently reloaded. Both system and VYBE preferences are honored on initial launch.
- **Save draft** confirms the private write. **Publish** separately confirms the community snapshot and then provides **Open published app**. If publishing fails after saving, the studio says that the private draft is safe and offers an explicit publishing retry. Failure leaves authored source in the editor.
- Draft saves use the checked `saveMiniAppDraft` callable and a server-side Firestore transaction. The current remote source must match the version opened in the studio, or already match the requested save. A different remote version produces a conflict without replacing either version. **Save as new draft** preserves the editor's source under a new identity; retrying that copy after an uncertain response reuses its identity while the studio remains mounted. Existing published snapshots stay unchanged.
- Ordinary draft retries reuse a pending identity, including recovery after navigation/reload when local storage is available. An equivalent committed save is acknowledged without rewriting source; a different recovered source conflicts rather than being overwritten. Creation time is preserved. Both existing edits and new-create retries reject retired identities after deletion. A confirmed save does not depend on a second read succeeding. Blocked browser storage still preserves source and retry identity while the studio remains mounted, but cannot provide reload recovery.
- With the checked callable and current rules deployed together, raw owner writes and old direct-write clients are denied. Coordinate the client/rules release before claiming this across production. Publishing remains a separate explicit snapshot action.


## Persistence and deployment

- Firebase is the only backend. Follow the coordinated callable/client/rules rollout below; draft and publication writes require their checked callables.
- Every accepted publishing request, including unchanged source, has a permanent server-only receipt binding its owner, request ID, source, expected version and acknowledged publication. Replays acknowledge only a still-current publication; they cannot recreate an unpublished snapshot or reuse the request ID for different code. Each owner may admit 200 new publishing requests per anchored 24-hour window, including up to 100 changed publications. Identical request retries consume neither allowance. Unchanged requests preserve publication timestamps and do not consume a change, but do consume one operation. Concurrent admissions share the quota transaction. Legacy counters migrate from their changed-publication count. Deploy the updated `publishMiniApp` callable selectively. Operation records have no TTL; growth is bounded per day, not across the account lifetime. Archival must retain replay protection before any receipt deletion is considered.
- Drafts use `mini_app_drafts/{id}` and `owner_id` is the Firebase Auth UID, not a profile ID. Only that owner can read or delete an existing draft. Creation and editing go through the checked callable; direct writes are denied. Signed-in clients can read an absent identity for safe retry/deletion checks; guests and unfiltered private scans remain denied.
- Published snapshots use `mini_apps/{sameId}`. Creation is bound to the owner's draft. Edits and ordinary saves never modify the public snapshot. Only a confirmed Publish action writes it.
- Unpublish removes the public snapshot while keeping the private draft and its namespace. Existing running copies cannot be remotely recalled; reopening the page checks current publication state.
- Public metadata and code are readable by signed-in members. Do not put API keys, credentials, personal data, or secrets in code.
- Discovery and draft queries use 24-candidate pages plus one lookahead, ordered by stable document ID. Load more continues with a value cursor, including after the boundary document is deleted. There is no sixty-record truncation. Malformed candidates are omitted while preserving continuation. Search filters loaded metadata only; the UI states the loaded count, offers continuation even with no current matches, and supports refreshing the library. This version has no ranked discovery, full-text search, or server-side code review. Checked callables validate document shape and combined source length of 100,000 characters. Draft admission limits are described below; publication is limited to 100 live apps and 100 changed publications per 24-hour window.
- A separate local recovery copy is scoped by account UID and draft ID, retained for up to 30 days, and removed after successful save or explicit discard. Read/write bounds allow worst-case JSON escaping of the full 100,000-character source plus bounded metadata, including blank names and unfinished code. Failed storage writes do not claim success or replace the last working copy. A recovery copy is never published automatically. It protects ordinary route changes when browser storage is available; Save draft is the cloud backup.
- Reports use the verified reporting callable. Moderators inspect inert source, confirm the current publication revision, and remove it with an audited publishing hold; releasing a hold never republishes. The private draft remains available to its creator. Legacy reports remain unverified leads. See [report authority](REPORT_AUTHORITY.md) for the coordinated client/callable/rules rollout and limits.
- A failed report write keeps its dialog open and its reason selected, with an inline retry message. Success is announced only after the write completes.

## Runtime boundary

Creator code is inside two nested `srcdoc` frames. Both use `sandbox="allow-scripts"` only, opaque origins, no referrer, and a restrictive permissions policy. No credentials, profile, host callbacks, privileged message bridge, or API keys are passed into the frame. It cannot access the parent document, auth cookies, or browser storage. Windows, forms, downloads, navigation of the VYBE page, and device permissions are not granted.

The outer frame contains static trusted markup/script and enforces `frame-src 'none'`; nested `srcdoc` is supported, while navigation of the inner app to a network URL is blocked. Both documents set CSP before creator content: default/connect/worker/object/frame sources are denied, with inline script/style and data/blob media exceptions. A trusted bootstrap disables WebRTC transport constructors in the initial author frame. User CSS and JavaScript are transferred as JSON with HTML delimiters escaped; bootstrap variables are scoped inside an IIFE.

The one-way diagnostics relay accepts only the current inner window and current run ID, then forwards one ready signal and at most four clipped errors. The host independently checks its current outer window/run and the same budget; replaced, nested and foreign frames cannot update preview feedback. There are no privileged commands or host-to-app credentials. Creator code can forge its own readiness/error messages, suppress error listeners, or issue arbitrary browser `postMessage` traffic; diagnostics are not proof of safety or full correctness. The relay bounds the messages it forwards and the UI it retains, not all browser allocation/traffic.

**Network isolation is incomplete.** Browser QA confirmed that creator code can introduce another `srcdoc` frame with fresh WebRTC constructors and create an `RTCPeerConnection` there. CSP blocks ordinary fetch/resource requests but does not consistently gate WebRTC; the bootstrap is defense in depth, not a security boundary for arbitrary descendants. No actual external WebRTC connection was attempted during QA. The UI therefore warns that apps may contact outside services. Do not describe this runtime as offline-only or use it for secrets. A constrained interpreter/worker API or separately controlled execution service needs design and adversarial verification before claiming hard network or resource isolation.

The runtime is for small, self-contained apps. It is not a container, a general browser, or a hard CPU/memory boundary. An infinite loop or allocation can stall the browser tab, including its Stop control. Large hostile-code deployments need a separately hosted runner, abuse controls, resource isolation, and moderation before expansion. Code may still create distracting or deceptive content inside its own frame; the frame's host controls and Report action remain outside it. Re-test sandbox behavior on native WKWebView/Android WebView before store release.

Background teardown and the startup deadline are operational controls, not resource limits: they need the host event loop to process browser events/timers. They cannot rescue an already blocked event loop, undo network activity, or guarantee lifecycle events on a force-killed process. Error feedback stays local to the current preview; no server telemetry or automatic restart is added. Close the browser tab if authored code prevents the Stop control from responding.

Reduced-motion preferences from both the device and VYBE are propagated into preview styling. Templates use plain browser JavaScript, accessible labels, keyboard controls, and no external dependencies. Runtime state resets on Stop or Restart.

## Verification

`npm exec vitest -- run src/features/mini-apps src/pages/MiniApps.test.tsx`

Covers schema/size checks, ownership/session checks (including switching away and back), published-only queries, draft/snapshot isolation, lost-acknowledgement retries, unpublish preservation, explicit-run and stale-preview behavior, phone width without runtime restart, synchronous hidden/pagehide teardown with no automatic resume, hidden Run refusal, lifecycle cleanup, outer/inner sandbox attributes, hostile delimiter containment, reduced motion, account-switch teardown, stale save completion, partial publishing failure, confirmation before publishing, keyboard shortcuts, and local recovery boundaries. Runtime regressions execute the generated trusted relay/bootstrap in an isolated test context and cover sender/run checks, diagnostic quotas, inert text, readiness deadlines, stale timers/frames, source preservation and return to the editor. Firestore emulator enforcement tests are maintained separately with the rules.

Browser checks should verify a template's controls, Stop/Restart, a 320px viewport, denied fetch and storage access, denied parent access, disabled WebRTC entry points, and attempted self-navigation being blocked by the outer CSP. Unit tests cannot establish browser sandbox enforcement on their own.

### Library session and paging checks

Library queries bind the signed-in account and account epoch. Only the selected
library tab loads new pages. Changed accounts tear down the studio/runtime and
select a different query generation; list responses check the account again after
reading. Mini-app query snapshots are excluded from both disk writes and old disk
restoration. This is separate from the studio's deliberate owner-scoped local
recovery file, which retains unsaved work as described above.

Next-page errors keep previously loaded cards available and offer Retry loading
more. Search does not claim a whole-library result until pages have been loaded;
new entries inserted before an existing cursor require Refresh apps. This is not
chronological ranking or a full-text search service. Firestore still transfers
source documents for each page; metadata-only discovery and large-library cost
and rendering benchmarks remain future work.

Library, public-detail and pre-publication version reads have a 15-second deadline.
A stalled read surfaces a connection/retry message instead of holding the loading
state indefinitely. A late preflight response cannot continue into publishing;
retry performs a fresh version read using the retained publication intent. This
deadline abandons the UI result, not the underlying Firestore transport. It does
not claim to cancel a write or resolve a broken browser connection.


## Draft admission and rollout

`saveMiniAppDraft` accepts `expectedOwnerUid`, a stable `appId`, validated `source`, and `expectedSource` (null for a new draft). Its transaction admits at most 200 stored drafts per owner and 100 new drafts per anchored 24-hour window. Legacy drafts count toward the library limit. The shared owner quota serializes concurrent first saves; deleting a draft frees a library slot but does not refund daily creation allowance. Existing drafts can still be edited at either limit. Identical source retries preserve timestamps and do not consume another admission. Stale edits and foreign ownership are rejected.

The response contains appId, normalized source, and createdAt/updatedAt seconds and nanoseconds. The client validates exact receipt fields, source identity and timestamp ranges, and rejects responses after an account-session change. Every admitted identity has a server-only `_mini_app_draft_identities` record. Existing legacy drafts acquire one on their next save or deletion. An identity whose draft is missing or retired cannot be recreated by a delayed create or edit request, even after the quota window resets.

`deleteMiniAppDraft` accepts `expectedOwnerUid`, `appId` and the reviewed `expectedSource`. A transaction compares current source, removes only the private draft and permanently retires its identity. Published snapshots, moderation holds and daily quota remain unchanged. A matching deletion retry returns `{ appId, deleted: true }`; changed source, unknown identities and foreign owners fail. Retired records retain a source fingerprint rather than source bytes and have **no TTL**: pruning them would allow old creation requests to resurrect drafts. Identity retention is intentionally unbounded; any future archival scheme must preserve permanent uniqueness. Drafts deleted before this rollout without a ledger entry cannot be retroactively protected.

The studio uses these callables and Firestore rules deny direct draft creates, updates and deletes. Owner-only listing and reading remain available; all client access to the identity ledger is denied, including staff clients. The studio preserves local source on quota/network errors and exposes Save as new draft on an aborted source conflict. These protections are verified locally; production remains on its existing deployed versions until coordinated rollout.

Deploy `functions:saveMiniAppDraft,functions:deleteMiniAppDraft` selectively first, publish the compatible client from main through Lovable, then deploy the reviewed Firestore rules and verify first save, existing edit, conflict/copy, delete/retry, publish and quota errors. Direct legacy deletion remains possible until those rules are installed; protection begins with the coordinated rollout. Keep both callables available during rollback; rolling only the client back after the rule change prevents that older client from saving or deleting drafts. Do not deploy all functions or use this migration as authorization to change authentication configuration. The helper backend tests run against an isolated demo emulator; creator rules tests separately prove direct writes, ledger tampering and quota forgery are rejected.
