# Partner Game SDK: consent and private captures

The partner pilot lets a registered game request player consent, upload a private screenshot or video, and give the player a VYBE review link. Publishing happens only after the player reviews the capture in VYBE. A game cannot publish posts or read the player's account through this SDK.

Implementation: [`sdk/game/http.ts`](../sdk/game/http.ts). This is TypeScript source in this repository, not a published npm package. It uses Fetch, URL, AbortController, and Web Crypto SHA-256, with no Firebase dependency. Modern browsers and Node 22 can run it after compilation; a native engine can implement the same [HTTP protocol](PARTNER_GAME_API.md).

This pilot requires the backend, consent screen, rules, and registered partner configuration to be deployed and validated. Source availability does not mean the production API is enabled. Follow the deployment and registration instructions in the [API guide](PARTNER_GAME_API.md). The existing [first-party SDK](GAME_SDK.md) has a different authentication model; never give a partner game a Firebase user token or service-account credential.

## Link a player

Configure the endpoint and registered client ID in trusted game code. Do not take the endpoint from a player-provided URL, receipt, deep link, or remote upload response. The constructor accepts HTTPS. Local emulator tests can explicitly allow HTTP on `localhost`, `127.0.0.1`, or `[::1]`; other HTTP hosts remain blocked.

```ts
import { VybePartnerClient, VybePartnerError } from './sdk/game/http';

const vybe = new VybePartnerClient({
  clientId: 'your-registered-game',
  // Replace with the fixed endpoint supplied by VYBE for your environment.
  apiBaseUrl: 'https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/gamePartnerApi',
});

const linking = new AbortController();
try {
  await vybe.authorize({
    signal: linking.signal,
    onUserCode(link) {
      // Supply these values to your game's UI. Open the link only when clicked.
      showLinkButton(link.verificationUriComplete);
      showPlayerCode(link.userCode, link.expiresAt);
    },
  });
  showConnectedState();
} catch (error) {
  if (error instanceof VybePartnerError) showLinkError(error.message);
}

// Connect this to the player's Cancel button:
// linking.abort();
```

The UI functions above are integration placeholders. Show the code and official VYBE link, tell the player which game is connecting, and let them explicitly open their browser. The SDK never opens a window. `startDeviceAuthorization()` plus `waitForAuthorization()` are available if the game needs separate UI steps.

Polling starts after five seconds and honors `authorization_pending`, `slow_down`, and rate limits. Denied and expired requests stop. Canceling a request requires starting a new link if the player wants to try again. Starting a new authorization immediately clears the previous local session and prevents its outstanding capture requests from continuing under a replacement account.

Device secrets and access tokens remain in private memory fields. Public authorization results expose only the connection ID, expiration, and capture scopes. Nothing is written to browser storage. Public links contain only the short player code, never the device secret or bearer token. Avoid logging raw network requests or injecting a fetch wrapper that logs credentials.

## Stage a capture for review

Use a unique key for each capture and keep that key, the original media, and its metadata available while retrying. Supported formats are PNG, JPEG, WebP, MP4, and WebM. Captures must be between 12 bytes and 48 MiB; the server also verifies the actual media signature. The SDK sends exact 8 MiB chunks, with a shorter final chunk when needed.

```ts
const upload = new AbortController();
const captureKey = crypto.randomUUID();
const originalMedia: Blob = await getEncodedGameCapture();
let allocatedCaptureId: string | null = null;

const capture = {
  idempotencyKey: captureKey,
  contentType: 'video/mp4' as const,
  media: originalMedia,
  caption: 'That last-second save!',
  tags: ['gameplay'],
};

try {
  const receipt = await vybe.stageCapture({
    ...capture,
    signal: upload.signal,
    onCaptureReserved(id) {
      allocatedCaptureId = id; // Save with the original capture key and bytes.
    },
    onPhase(phase) {
      showCapturePhase(phase); // preparing, uploading, verifying, or ready
    },
    onProgress(fraction) {
      showUploadProgress(Math.round(fraction * 100));
    },
  });
  // Make this a player-clicked link. Nothing has been published yet.
  showReviewButton(receipt.reviewUrl);
} catch (error) {
  if (error instanceof VybePartnerError) showUploadError(error.message);
  // A retry uses the same capture object and a fresh, non-aborted signal.
}
```

The game supplies `getEncodedGameCapture` and the UI callbacks. Encoding or recording media is engine-specific and is not performed by this transport. The SDK snapshots media and metadata before upload so caller mutations cannot change a retry. The snapshot and hashing buffers add memory overhead beyond the original media size; budget for this when capturing on memory-constrained devices.

Every chunk has a SHA-256 checksum. The create request also binds the whole-file SHA-256 to the idempotency key. Server-side immutable chunk handling lets identical retries recover lost acknowledgements; different content with the same key fails with `conflict`. Transient network, service, and rate-limit failures receive at most two automatic retries per capture request. Each network attempt has a 30-second timeout. Retry delays honor the server's bounded retry interval. Backoff longer than sixty seconds returns the error immediately for the game to handle, preserving `retryAfter` up to one day; the SDK does not shorten a daily limit into a rapid retry. Device polling never continues past the code's expiration.

Progress measures uploaded bytes. A progress value of 1 is not confirmation that final verification has succeeded: `onPhase` reports `verifying` during the final check and `ready` only after a confirmed receipt. Wait for `stageCapture()` to resolve before offering the review link. Ready means available for private review; only `receipt.status === 'imported'` means published. A receipt contains capture status and public game metadata, without the owner's Firebase UID or private storage path. The SDK rebuilds review links on `https://vybehub.app` rather than trusting a server-provided URL.

## Status, cancel, discard, and revoke

To let players browse VYBE from your game, offer an **Open VYBE** button that opens `https://vybehub.app/home` in the platform's browser when clicked. VYBE handles its own sign-in there. This pilot provides capture transport and browser entry points; it does not provide an embedded feed, messaging API, or native overlay. Never append an access token to the browsing or review URL.

```ts
upload.abort(); // Stop local upload work. This does not delete a private capture.

const current = await vybe.getCapture(captureId);
showCaptureStatus(current.status);

await vybe.discardCapture(captureId); // Explicitly discard this connection's capture.
await vybe.revokeConnection();       // Revoke this connection and clear local access.
```

Only captures created by the active connection are accessible. A published/imported capture cannot be discarded through this API. `onCaptureReserved` delivers the public capture ID before any chunks are sent; save it for status and explicit discard if an upload is interrupted. Abort may happen after a server accepted a request, so check status or retry with the same key when the connection is still valid. If the allocation response itself was interrupted and the callback never ran, repeating `stageCapture()` with the same key and original bytes recovers that receipt. Cancellation does not silently delete media or revoke the connection.

Access lasts at most ten minutes from player approval. There are no refresh tokens. Expired or revoked access produces `invalid_token`; the game must request a new link. A new connection has its own capture namespace and cannot resume or inspect uploads owned by an earlier connection. The player can still review eligible captures in VYBE while they remain available there.

`revokeConnection()` clears local access even if its network response is lost. In that case server revocation is unconfirmed; the player can revoke the game in VYBE's **Settings → Connections → Connected games**. Starting another link only clears local access; it does not revoke an old connection on the server. An aborted linking operation may likewise have been approved just before cancellation; active connections can be managed in VYBE.

## Error handling and transport boundaries

`VybePartnerError` provides `code`, HTTP `status` when available, and optional `retryAfter` seconds. Its message is fixed client text; response bodies, server messages, secret tokens, and request URLs are not included. Handle these common cases in game UI:

| Code | Player action |
| --- | --- |
| `aborted` | Leave the operation stopped; offer a deliberate retry. |
| `access_denied` | Explain that approval was declined or access is not allowed. |
| `expired_token`, `invalid_grant`, `invalid_token` | Offer a new VYBE link. |
| `authorization_changed` | Stop using the previous account's capture; start again for the current player. |
| `network_error`, `unavailable`, `rate_limited` | Retry the same capture key and original media while the session remains valid. |
| `conflict` | Check whether this key was reused for different content or the capture was already imported. |
| `expired_capture`, `not_found` | Explain that this connection cannot use that capture. |
| `invalid_request`, `payload_too_large` | Fix the format, size, key, or metadata before retrying. |
| `invalid_response` | Stop and report a protocol/configuration problem without logging response secrets. |

Bearer requests are sent only to paths under the configured fixed endpoint. Fetch uses `redirect: 'error'`, omits cookies and referrers, and rejects a redirected response or changed response URL. Any custom fetch implementation must honor these settings; response checks cannot undo a credential leak caused by a broken polyfill that already followed a redirect. Do not substitute a general proxy or a fetch wrapper that forwards Authorization across hosts.

## Native engine implementation map

For Unity, Unreal, or a console engine, implement the same [partner HTTP contract](PARTNER_GAME_API.md) using the engine's HTTPS client and SHA-256 library. The existing `sdk/game/unity/VybeGameCapture.cs` is a **trusted first-party Firebase example**; third-party publishers must not copy its authentication model. This repository does not yet ship a compiled native partner plugin.

| Player-facing state | Native integration step | Retain / verify |
|---|---|---|
| Connect VYBE | `POST /v1/device/code`, display the public code and official browser link | Keep `deviceCode` in memory only; never put it in a URL or analytics |
| Waiting for approval | Poll `POST /v1/device/token` at the stated interval | Respect pending/slow-down/expiry; keep the resulting bearer in memory only |
| Preparing capture | Encode the original media; calculate its SHA-256; `POST /v1/captures` | Persist the public capture ID and immutable original key/metadata; no Firebase account token |
| Uploading | `PUT` numbered 8 MiB chunks with each SHA-256 | Verify the returned index, size and checksum; repeat identical bytes after a lost acknowledgement |
| Verifying | `POST /v1/captures/{id}/finish` | Do not show ready merely because all chunks were transferred |
| Ready for review | Show an explicit browser button to the official capture URL | The player signs into VYBE and chooses Publish; the game cannot publish |
| Published / discarded | `GET /v1/captures/{id}` while the original connection is live | Use the server status; a browser opening or an upload completing is not publication |

Marshal progress/UI callbacks onto the engine's main thread. Stop outstanding work when the local player changes. Keep authorization headers out of telemetry, disable redirects before sending credentials, enforce request timeouts, and show a deliberate retry after cancellation. Once the ten-minute connection expires, re-linking creates a different namespace: do not automatically resend an old capture as though it resumed. Offer the previously saved VYBE review link for an already-ready draft, or explain that a new upload creates a separate private capture. Console browser availability, deep-link return behavior, codec playback, memory limits, actual GCS composition, and platform review still require staging/native testing.

Automated mocked-transport tests are in [`src/lib/gameHttpClient.test.ts`](../src/lib/gameHttpClient.test.ts). Run `npm test -- --run src/lib/gameHttpClient.test.ts`. These cover consent timing, cancellation, credential expiry, relinking, six-chunk uploads, checksum binding, retry recovery, redirect defenses, error redaction, and receipt privacy. A real engine integration and staging consent/upload/review walkthrough are still required before a partner release.
