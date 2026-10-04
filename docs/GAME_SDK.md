# VYBE Game Capture SDK v1

Games can upload a screenshot or clip to a **private capture**, then open VYBE so the player can review the media, edit the caption, and choose **Publish to VYBE**. The normal VYBE publishing and safety checks run before a post is created. Games can also open `https://vybehub.app/home` to let players browse VYBE in their platform browser.

The review screen publishes to the normal VYBE feed. This version does not offer an audience picker or a friends-only publishing option.

This implementation is source code ready for integration and testing. The new functions, rules, game registration, and web client must be released before it works against production. Nothing in this change deploys services, registers a game, or publishes a user's content automatically.

## Supported integration scope

- Trusted, first-party game clients signed into **the same Firebase project and VYBE account** as the app. A new anonymous Firebase account will not carry an existing player's VYBE profile.
- TypeScript/JavaScript with the source SDK in `sdk/game/`; a Firebase adapter is included.
- Unity example in `sdk/game/unity/VybeGameCapture.cs`. It uses Firebase Auth, Functions, and Storage. The example has not been compiled or run in Unity in this workspace.
- C++, Unreal, and other engines can implement the same callable protocol and authenticated Firebase Storage upload flow. They are not certified engine plugins in this release.

Firebase user tokens grant the account's normal project permissions. **Do not give untrusted third-party games a user's VYBE Firebase token.** The separate [partner SDK pilot](PARTNER_GAME_SDK.md) uses explicit device-code approval, ten-minute capture-only credentials, and revocation; see its [API contract and deployment prerequisites](PARTNER_GAME_API.md). This first-party adapter keeps its existing Firebase authentication model. Neither path is a certified engine plugin, and public partner onboarding, game identity attestation, and platform reviews remain rollout work. `gameId` is a public identifier, not an API secret or cryptographic proof of which game generated the content.

## JavaScript / TypeScript quick start

Copy `sdk/game/index.ts` and `sdk/game/firebase.ts` into your integration or import them from this checkout. The Firebase adapter uses your game's existing Firebase JS SDK; the core client has no engine dependencies. There is no published npm package yet.

```ts
import { createFirebaseGameClient } from './sdk/game/firebase';

// firebaseApp is already configured for VYBE and the player has signed in.
const vybe = createFirebaseGameClient(firebaseApp);
const controller = new AbortController();

// Generate once for this exact capture and persist for network retries.
const captureKey = crypto.randomUUID();
let allocatedCaptureId: string | null = null;
const capture = await vybe.stageCapture({
  gameId: 'your-registered-game',
  idempotencyKey: captureKey,
  media: screenshotBlob, // Blob or Uint8Array; capture/export inside your game
  contentType: 'image/png',
  caption: 'That last-second finish!',
  tags: ['racing', 'highlights'],
  signal: controller.signal,
  onCaptureReserved: id => { allocatedCaptureId = id; }, // Retain for explicit discard.
  onPhase: phase => updateCaptureStatus(phase), // preparing/uploading/verifying/ready
  onProgress: fraction => updateUploadProgress(fraction),
});

// Show a real link or button. Do not open a popup after an async task without
// a fresh user click; browsers may block it.
reviewLink.href = vybe.getReviewUrl(capture);
reviewLink.textContent = 'Open VYBE to review';

// Optional: poll at a modest interval while your review UI is visible.
const latest = await vybe.getCapture(capture.captureId);
if (latest.status === 'imported') showPublished(latest.postId);
```

`stageCapture` checks for an already uploaded file before attempting another upload. Reuse the same key and exact metadata/bytes after a network failure. Changing metadata under an existing key is rejected; the bytes themselves are not hashed by the SDK, so never reuse a key for another same-sized capture. `onCaptureReserved` exposes the capture ID as soon as allocation returns, before media upload. Retain it with the original key. To cancel an in-flight upload, abort the controller, then explicitly call `discardCapture(allocatedCaptureId)` if the player also wants to discard the private draft. Cancellation alone does not discard it. If no allocation response arrived, retry the same key and original media to recover the ID, or let the draft expire.

Progress measures bytes, while `onPhase` distinguishes preparing, uploading, verifying, and ready. A progress value of 1 can precede a failed verification. Offer review only after `stageCapture` resolves; a `ready` capture is still private. In VYBE, failed acknowledgement syncing has a receipt-only retry. After a publish/discard error, the screen checks for an already committed post; when that lookup is unavailable, the original error remains and a retry uses the same deterministic post identity. The screen prevents updates from a prior account/route visit and shows the capture's actual expiry.

The Firebase SDK handles token refresh, callable serialization, and resumable media transfer. Initialize App Check in the game when the project's Storage policy requires it. Never embed service-account files, admin tokens, or another person's Firebase token. See the official [callable SDK documentation](https://firebase.google.com/docs/functions/callable) and [Unity Storage upload documentation](https://firebase.google.com/docs/storage/unity/upload-files).

## API contract

All game callables run in `us-central1`. Authentication is mandatory. For an engine without a compatible Firebase Functions SDK, follow the [Firebase callable wire protocol](https://firebase.google.com/docs/functions/callable-reference): `POST` JSON containing one `data` field, `Content-Type: application/json`, and `Authorization: Bearer <player Firebase ID token>`. Read the callable `result` on success and its structured `error` on failure. Do not send credentials to a game publisher's backend as a substitute for scoped authorization.

Endpoint pattern: `https://us-central1-<project-id>.cloudfunctions.net/<functionName>`.

| Function | Input in `data` | Result / behavior |
| --- | --- | --- |
| `createGameCapture` | `gameId`, `idempotencyKey`, `contentType`, `byteSize`, optional `caption` and `tags` | Allocates an owner-bound draft and returns the receipt below. Retrying the same request returns the same capture. |
| `finishGameCapture` | `captureId` | Validates uploaded size, MIME, and container signature; marks the capture `ready`. Missing media returns `failed-precondition` with `details.reason = "upload-required"`. |
| `getGameCapture` | `captureId` | Returns only the calling owner's receipt. Reconciles a committed post if the final acknowledgement was lost. |
| `discardGameCapture` | `captureId` | Cancels an unpublished capture; hourly cleanup removes media. |
| `completeGameCapture` | `captureId`, deterministic `postId` | Used by the VYBE review screen after the normal moderated composer succeeds. Verifies post ownership and its capture reference. It does not create a post. |

Receipt fields: `captureId`, `status`, `gameId`, `gameName`, `contentType`, `byteSize`, `caption`, `tags`, `storagePath`, `expiresAt` (Unix milliseconds), `reviewUrl`, and nullable `postId`.

Upload the raw file using your platform's Firebase Storage client to the **exact** returned `storagePath`, setting the declared `contentType`. Storage checks owner, expiry, expected size, MIME, and the server-created session. Files are create-only; clients cannot overwrite or delete them. There is no public preview URL in the API. The review screen downloads with authenticated `getBlob` and uses a local object URL.

## Limits and lifecycle

- PNG, JPEG, WebP, MP4, and WebM; 12 bytes through 48 MiB per capture.
- Up to 2,200 caption characters and 10 tags of 1–40 letters, numbers, underscores, or hyphens.
- Each account: 20 new captures and 200 MiB reserved per rolling 24-hour window, plus 60 game API calls per minute. Idempotent retries do not allocate another media reservation. Discarding does not refund quota.
- Draft access ends after 24 hours. Imported/discarded drafts are queued for cleanup immediately. The hourly job processes up to 200 records per run; monitor backlog and increase capacity if needed.
- Receipt tombstones remain until seven days after draft expiry to prevent ordinary upload retries from recreating media. Do not reuse keys after that retention period.
- First successful import wins: posts use `game_<captureId>` and a Firestore transaction. Firestore reserves those IDs for the owner of a server-created, ready, unexpired capture; another account cannot preallocate them. Concurrent tabs reuse that post without replacing its caption/media. A lost acknowledgement is recovered by `getGameCapture`.
- Games stage content; they cannot bypass the in-app confirmation through a dedicated publish endpoint. Existing generic account/post permissions are unchanged. The normal client-side moderation flow still applies, so this release is not a server-wide redesign of all post moderation enforcement.
- Signature sniffing checks the file container, not every codec/frame or malicious content. Native capture/export, supported codecs, capture permissions, video duration policy, transcoding, and platform console certification remain integration responsibilities.

## Deployment prerequisites

1. Build and test the source. Deploy the updated Firestore and Storage rules before enabling integrations. Firestore reserves imported post IDs for the capture owner, and the `game-captures` Storage rules read server-owned `game_captures` records in Firestore. Grant the Firebase Storage rules service permission to access Firestore when prompted by Firebase. Keep both `game_captures` and `game_integrations` client-write-denied (the repository's default-deny rules already do this). See [cross-service Storage rules](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_firestore).
2. Verify bucket CORS allows authenticated SDK reads from the deployed VYBE origin, Lovable preview origin when testing, and local development origin as appropriate. Merge necessary origins into the existing bucket policy instead of replacing it blindly. `getBlob` requires CORS for browser downloads. See [Firebase web downloads](https://firebase.google.com/docs/storage/web/download-files#download_data_directly_from_the_sdk).
3. Deploy **only** the new functions plus their cleanup schedule after reviewing changes:

   ```sh
   npm --prefix functions run build
   firebase deploy --project vybe-daaab --only firestore:rules,storage,functions:createGameCapture,functions:getGameCapture,functions:finishGameCapture,functions:completeGameCapture,functions:discardGameCapture,functions:cleanupGameCaptures
   ```

   Do not deploy all functions. Existing WORKLOG restrictions on `auth2faRequest` remain in force. Scheduled cleanup requires Cloud Scheduler/billing support; monitor its logs and pending capture count.

4. In Firebase Console or a trusted Admin SDK maintenance tool, create `game_integrations/<gameId>` with `enabled: true`, `display_name: "Your game"`, and optionally `max_upload_bytes` at or below 50,331,648. This collection is not writable by game clients. Register only integrations approved for this first-party auth model. Set `enabled: false` to stop new sessions and finalization. It does not revoke already-issued Firebase user sessions.
5. Publish the web client containing `/game-capture/:captureId` through Lovable after the GitHub commit syncs. Verify existing VYBE safety checks are deployed and operational; the review composer refuses publishing when its safety check is unavailable.
6. In a test account, upload a PNG and MP4, review, publish, retry the same key, open two review tabs, and discard another capture. Confirm a second account cannot read the draft, MIME/size mismatches fail, and expired drafts disappear. Run Firebase emulators for cross-service rules before rollout. No production upload or Unity-device test was performed as part of source implementation.

## Local verification

```sh
npx vitest run src/lib/gameIntegration.test.ts src/lib/gameIntegration.backend.test.ts src/lib/gameCapturePost.test.ts src/pages/GameCapture.test.tsx
npm run typecheck
npm --prefix functions run build
```

Tests cover input limits, container signatures, auth and ownership, registered games, quotas, expiry, upload retries, concurrent import transactions, lost completion acknowledgements, explicit publish/discard UI, and failure states. Backend unit tests use mocked Firestore/Storage; they do not substitute for deployed/emulator rules tests or physical-engine capture tests.
