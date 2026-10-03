# VYBE Hub mini apps

Open **Create → Hub → Mini Apps**, or `/mini-apps`. Signed-in members can start with a tap game, idea picker, or color tool, edit HTML/CSS/JavaScript, explicitly run a preview, save private drafts, and publish a snapshot. Published apps have a `/mini-apps/:appId` URL. Readers choose **Run app** before any creator code executes.

## Persistence and deployment

- Firebase is the only backend. Deploy the new `mini_app_drafts` and `mini_apps` rules before enabling publishing on a deployed client.
- Drafts use `mini_app_drafts/{id}` and `owner_id` is the Firebase Auth UID, not a profile ID. Only that owner can read or write a draft.
- Published snapshots use `mini_apps/{sameId}`. Creation is bound to the owner's draft. Edits and ordinary saves never modify the public snapshot. Only a confirmed Publish action writes it.
- Unpublish removes the public snapshot while keeping the private draft and its namespace. Existing running copies cannot be remotely recalled; reopening the page checks current publication state.
- Public metadata and code are readable by signed-in members. Do not put API keys, credentials, personal data, or secrets in code.
- Discovery and draft queries each load at most 60 records. This version has no ranked discovery, full-text search, pagination, per-creator publication quota, or server-side code review. Firestore rules constrain document shape and combined source length to 100,000 characters, but do not provide a per-account count or rate limit.
- A separate local recovery copy is scoped by account UID and draft ID, retained for up to 30 days, and removed after successful save or explicit discard. A recovery copy is never published automatically. It protects ordinary route changes when browser storage is available; Save draft is the cloud backup.
- Reports go to the existing moderation queue with the mini-app ID and link. Moderators can remove published apps through the rules; a dedicated mini-app review/removal screen is a follow-up.

## Runtime boundary

Creator code is inside two nested `srcdoc` frames. Both use `sandbox="allow-scripts"` only, opaque origins, no referrer, and a restrictive permissions policy. No credentials, profile, host callbacks, privileged message bridge, or API keys are passed into the frame. It cannot access the parent document, auth cookies, or browser storage. Windows, forms, downloads, navigation of the VYBE page, and device permissions are not granted.

The outer frame is static and enforces `frame-src 'none'`; nested `srcdoc` is supported, while navigation of the inner app to a network URL is blocked. Both documents set CSP before creator content: default/connect/worker/object/frame sources are denied, with inline script/style and data/blob media exceptions. A trusted bootstrap disables WebRTC transport constructors in the initial author frame. User CSS and JavaScript are transferred as JSON with HTML delimiters escaped; bootstrap variables are scoped inside an IIFE.

**Network isolation is incomplete.** Browser QA confirmed that creator code can introduce another `srcdoc` frame with fresh WebRTC constructors and create an `RTCPeerConnection` there. CSP blocks ordinary fetch/resource requests but does not consistently gate WebRTC; the bootstrap is defense in depth, not a security boundary for arbitrary descendants. No actual external WebRTC connection was attempted during QA. The UI therefore warns that apps may contact outside services. Do not describe this runtime as offline-only or use it for secrets. A constrained interpreter/worker API or separately controlled execution service needs design and adversarial verification before claiming hard network or resource isolation.

The runtime is for small, self-contained apps. It is not a container, a general browser, or a hard CPU/memory boundary. An infinite loop or allocation can stall the browser tab, including its Stop control. Large hostile-code deployments need a separately hosted runner, abuse controls, resource isolation, and moderation before expansion. Code may still create distracting or deceptive content inside its own frame; the frame's host controls and Report action remain outside it. Re-test sandbox behavior on native WKWebView/Android WebView before store release.

Reduced-motion preferences from both the device and VYBE are propagated into preview styling. Templates use plain browser JavaScript, accessible labels, keyboard controls, and no external dependencies. Runtime state resets on Stop or Restart.

## Verification

`npm exec vitest -- run src/features/mini-apps src/pages/MiniApps.test.tsx`

Covers schema/size checks, ownership checks, published-only queries, draft/snapshot isolation, unpublish preservation, explicit-run behavior, outer/inner sandbox attributes, hostile delimiter containment, reduced motion, account-switch teardown, stale save completion, confirmation before publishing, and local recovery boundaries. Firestore emulator enforcement tests are maintained separately with the rules.

Browser checks should verify a template's controls, Stop/Restart, a 320px viewport, denied fetch and storage access, denied parent access, disabled WebRTC entry points, and attempted self-navigation being blocked by the outer CSP. Unit tests cannot establish browser sandbox enforcement on their own.
