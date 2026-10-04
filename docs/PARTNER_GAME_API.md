# VYBE partner game API — limited pilot

This pilot lets a registered game request ten minutes of permission to submit private captures for review in VYBE. It cannot publish a post, read the account/feed/messages, or obtain a Firebase user token. Users approve a clearly named game and verified publisher in VYBE, then review each capture before publishing with the existing moderation flow.

The implementation is source code, not an announcement that a production endpoint is deployed. Registration remains manual. No refresh tokens, embedded client secrets, public media URLs, Unity-specific authentication plugin, background publishing, or automatic account sign-in are provided by this pilot. The HTTP TypeScript client is documented in [PARTNER_GAME_SDK.md](./PARTNER_GAME_SDK.md). The older first-party Firebase SDK is a separate trust model described in [GAME_SDK.md](./GAME_SDK.md).

## Registration and deployment

A trusted operator verifies the publisher outside the game and creates `game_integrations/{clientId}` using Admin credentials or the Firebase Console. The public `clientId` uses `^[a-z0-9][a-z0-9_-]{2,63}$` and is also the game's ID. It is not a secret or proof of publisher identity. Do not put Admin credentials in a game.

Required registry fields:

```json
{
  "enabled": true,
  "partner_enabled": true,
  "publisher_verified": true,
  "display_name": "Example Game",
  "publisher_name": "Verified Publisher",
  "max_upload_bytes": 50331648
}
```

Disable either enabled flag to stop new device requests and all subsequent token operations. The verified publisher name appears on the consent screen. Because installed games are public clients, a client ID alone cannot cryptographically authenticate a game binary; consent-code phishing and copied client IDs remain operational concerns. Users should initiate linking themselves and compare the displayed code, game, and publisher. Publisher approval, abuse response, and distribution verification are required pilot operations.

Build functions, deploy the matching Firestore and Storage rules, and selectively deploy only these new exports and any changed game-capture exports required by the release:

- `gamePartnerApi`
- `getGamePartnerLink`, `approveGamePartnerLink`, `denyGamePartnerLink`
- `listGamePartnerConnections`, `revokeGamePartnerConnection`
- `cleanupGamePartnerData`
- Existing `createGameCapture`, `getGameCapture`, `finishGameCapture`, `completeGameCapture`, `discardGameCapture`, `cleanupGameCaptures` when their code changes.

Do not run a broad functions deployment: this repository's deployment instructions warn about unrelated auth2fa exports. This change does not deploy anything, register a real partner, change production configuration, or create secrets. Obtain the actual `gamePartnerApi` HTTPS function URL from the deployment output. Append paths below to that exact base URL; do not guess a project-specific URL. The web app must serve the protected `/connect/game` and existing `/game-capture/:captureId` routes.

Server-only Firestore collections are `game_partner_devices`, `game_partner_codes`, `game_partner_tokens`, `game_partner_connections`, and `game_partner_uploads`. Client rules must deny direct access even to a signed-in user or an admin-claimed client. Storage staging `game-partner-staging/**` is also server-only. A partner capture's final `game-captures/{uid}/{captureId}` file is assembled and written by Admin code; direct client creation must be denied when its capture has `partner_connection_id`. The owning VYBE account may privately read a ready capture through the existing authenticated review flow. Use the checked-in rules together with this backend.

## HTTP contract

All JSON endpoints use `Content-Type: application/json`. Errors are `{ "error": "code", "message": "safe explanation", "retryAfter": 10 }`, with `retryAfter` present only when relevant. Responses use `Cache-Control: private, no-store`. Never log device codes or bearer tokens. No token belongs in a URL, browser local storage, analytics, crash reports, or screenshots. SDK requests must refuse redirects that could carry the Authorization header to another origin.

| Method and path | Input | Result |
| --- | --- | --- |
| `POST /v1/device/code` | `{clientId, scopes?}` | Device-link request below |
| `POST /v1/device/token` | `{clientId, deviceCode}` | One-time access token exchange below |
| `POST /v1/captures` | Capture request below; bearer required | Partner capture receipt |
| `GET /v1/captures/:captureId` | Bearer required | Partner capture receipt |
| `PUT /v1/captures/:captureId/chunks/:index` | Binary chunk; bearer required | `{index,byteSize,sha256}` |
| `POST /v1/captures/:captureId/finish` | `{}`; bearer required | Verified ready receipt |
| `DELETE /v1/captures/:captureId` | Bearer required | `{ok:true}`; cancelled retries are idempotent |
| `POST /v1/connection/revoke` | `{}`; bearer required | `{ok:true}`; token is unusable afterward |

There is no publish endpoint. `capture:write` covers allocation, chunk upload, finishing, discarding the connection's own unpublished captures, and self-revocation. `capture:status` covers only that connection's captures. Each request checks token expiry, live connection ownership, revocation, scopes, and current verified registration. Capture IDs are bound to account, game, connection, and upload key. Re-linking creates a new connection; it cannot access or resume a previous connection's captures. Existing ready captures remain available to their owner inside VYBE.

The optional `capture:preview` permission and connection-owned gallery endpoints are documented in [PARTNER_CAPTURE_GALLERY.md](PARTNER_CAPTURE_GALLERY.md). The default two-scope client remains unchanged. Preview permission requires an explicit updated consent acknowledgement.

### Device link and consent

`POST /v1/device/code` returns:

```json
{
  "deviceCode": "vyd_<43 base64url characters>",
  "userCode": "ABCD-EFGH",
  "verificationUri": "https://vybehub.app/connect/game",
  "verificationUriComplete": "https://vybehub.app/connect/game?code=ABCD-EFGH",
  "expiresIn": 600,
  "interval": 5
}
```

The human code uses eight Crockford base32 characters, with a display hyphen. It is not an access token. The VYBE page may prefill it from `?code=` but never approves automatically. A signed-in user must review the registered publisher, compare the code, and explicitly approve or deny. Credentials are 32 random bytes; server records contain SHA-256 hashes, not plaintext device codes or access tokens. Human-code indexes also use hashes.

Poll after at least five seconds. `POST /v1/device/token` returns HTTP 400 with `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, or `invalid_grant` while waiting, declined, expired, or replayed. Respect `retryAfter` and the `Retry-After` header. Polling too quickly adds five seconds to the interval, up to sixty. A successful exchange is atomic and one-time; concurrent polls cannot mint two tokens. If the success response is lost, begin a new link instead of replaying a consumed code.

Successful exchange:

```json
{
  "accessToken": "vyp_<43 base64url characters>",
  "tokenType": "Bearer",
  "expiresIn": 595,
  "expiresAt": 1791029400000,
  "connectionId": "<32 lowercase hexadecimal characters>",
  "scopes": ["capture:write", "capture:status"]
}
```

Expiry is an absolute Unix timestamp in milliseconds and is ten minutes from approval, not from the first upload. There is no refresh token. Keep access tokens in memory, stop after expiry or revocation, and ask the user to link again when needed. Never ask an external game to receive a Firebase ID/custom/refresh token.

### Capture allocation and immutable chunks

Send `Authorization: Bearer <accessToken>` on private endpoints. A capture request is:

```json
{
  "idempotencyKey": "stable-unique-key-123",
  "contentType": "image/png",
  "byteSize": 12345,
  "contentSha256": "<64 lowercase hexadecimal SHA-256 characters of the whole file>",
  "caption": "Optional caption",
  "tags": ["optional_tag"]
}
```

The game ID comes from the token. If provided, `gameId` must match that registered client. Keys contain 8–128 ASCII letters, digits, underscores, or hyphens. Captures accept PNG, JPEG, WebP, MP4, and WebM, from 12 bytes to 48 MiB. Caption maximum is 2,200 characters. At most ten tags of 1–40 letters/numbers/underscores/hyphens are accepted. Per-game configuration may lower the size ceiling.

The same account shares the existing quota of twenty captures and 200 MiB reserved bytes per rolling daily quota window across both game SDKs. Cancelled or failed uploads do not refund the reservation. Repeating the same key and identical metadata/hash returns the same capture without another reservation. Changed content or metadata for that key returns 409. Whole-file checksums bind same-size retry requests as well as individual chunks.

Upload zero-based chunks of exactly 8 MiB, except the last chunk which must equal the exact remaining bytes. Six chunks cover the maximum capture. Each request has `Content-Type: application/octet-stream` and `X-Chunk-SHA256: <lowercase sha256 of these exact bytes>`. Chunks may arrive out of order. The API validates length and hash, then writes with a create-only storage generation precondition. An identical retry returns the original acknowledgement; different bytes at the same index return 409. Object metadata lets a retry recover if storage succeeded but its Firestore acknowledgement did not.

Finishing requires every chunk, verifies chunk hashes and the ordered whole-file checksum, checks file-container signature against MIME type, and assembles generation-pinned source bytes with a create-only destination write. Magic-byte checks detect container mismatch; they are not a malware scan or proof that every frame is decodable. Existing VYBE media handling/moderation still applies during explicit publishing. Ready captures expire after 24 hours and never become posts automatically.

Partner receipts contain `captureId`, `status`, `gameId`, `gameName`, `contentType`, `byteSize`, `caption`, `tags`, `expiresAt`, `reviewUrl`, and nullable `postId`. Status is `uploading`, `ready`, or `imported` for usable receipts; expired/cancelled operations fail with 410. Unlike the authenticated VYBE review callable, HTTP receipts do not contain `storagePath`, Firebase account UID, a downloadable media URL, or profile data. Status and discard recover a committed canonical post if the VYBE publish acknowledgement was lost. Discarding a published capture returns 409 and does not delete the post.

General errors: 400 `invalid_request`, 401 `invalid_token`, 403 `access_denied`/`insufficient_scope`, 404 `not_found`, 409 `conflict`, 410 `expired_capture`, 413 `payload_too_large`, 429 `rate_limited`, and 503 `unavailable`. Account and global daily capture quota failures return the remaining reset delay (rounded up, bounded to 1–86,400 seconds) in both `retryAfter` and `Retry-After`. Preserve that delay; long quota waits should stop automatic upload retries and be shown to the player. Retry transient failures using the same capture key and chunk bytes. Do not retry permission failures as a fresh unauthenticated upload.

## VYBE-only callable contract

These callables use the VYBE browser's existing Firebase authentication. They never return a partner bearer token or device credential:

- `getGamePartnerLink({userCode})` → `{clientId,gameName,publisherName,scopes,expiresAt,status}`; statuses `pending`, `approved`, `denied`, `expired`, `used`.
- `approveGamePartnerLink({userCode})` → connection receipt below. Approval atomically binds a pending request to the current account. Another account cannot inspect or approve it afterward.
- `denyGamePartnerLink({userCode})` → `{ok:true}`.
- `listGamePartnerConnections({})` → `{connections:[...]}`, only current-account records.
- `revokeGamePartnerConnection({connectionId})` → `{ok:true}`, only current-account records.

A connection receipt has `connectionId`, `clientId`, `gameName`, `publisherName`, `scopes`, `createdAt`, `expiresAt`, and `status` (`active`, `expired`, `revoked`). Times are milliseconds. Errors follow Firebase callable codes: `unauthenticated`, `invalid-argument`, `not-found`, `resource-exhausted`, and `failed-precondition`.

Revocation is checked before and after chunk storage writes, and before and after the final write. A request already accepted by storage may leave a private temporary object after revocation; it cannot receive a successful upload acknowledgement or transition to ready after the revocation transaction wins. Already ready captures and published posts remain available to their owner. Revocation is not content deletion.

## Pilot operating limits and verification

The HTTP function has 512 MiB memory, concurrency one per instance, a sixty-second timeout, and at most twenty instances. Normal chunk work buffers at most an 8 MiB request and verification data. Compose retry verification can download one bounded 48 MiB destination; concurrency one avoids multiplying that memory cost inside an instance. These limits are pilot defaults, not a measured production capacity promise.

Device issuance is bounded to 1,000/day globally, 600/minute globally, 20/minute per source IP, and 300/minute per registered client. New partner capture reservations have a separate global 1,000/day cap, atomically checked with the account quota; idempotent retries consume neither again. These conservative caps deliberately limit this pilot to cleanup capacity. Consent operations allow 30/minute/account and approvals 20/day/account; access operations allow 120/minute/account. Polling allows 120/minute/source IP in addition to its per-device interval. Daily counters use rolling quota windows. IP counters are abuse friction, not authentication. Firestore rate counters, invalid bearer lookups, public function traffic, and repeated valid hashing/assembly still cost resources. Large-scale anti-abuse controls, upstream DDoS protection, request budgets, rate-limit-record retention, queue/backlog monitoring, media scanning, operational alerting, and performance tuning remain deployment responsibilities.

A randomly generated but correctly formatted unknown bearer triggers a Firestore token lookup before the authenticated access limiter can identify an account. Partner cleanup does not delete generic `_rate_limits` records for dynamic IP/account keys. Upstream anonymous request budgets and a separate rate-counter retention policy are therefore required operational controls before exposing this pilot to broad traffic.

Cleanup runs every thirty minutes, handles at most fifty upload records plus one hundred records from each auth collection per run, and deletes six deterministic staging keys per upload. Chunk cleanup starts two minutes after access expiry; a retained tombstone schedules one more sweep at its one-day purge time to catch lost acknowledgements and late writes. At 1,000 admitted captures/day, two sweeps require at most 2,000 upload records/day against scheduled capacity of 2,400/day. Each auth collection admits at most 1,000/day against cleanup capacity of 4,800/day. Auth credentials/connections have one-day retention, while access enforcement always uses their ten-minute expiry even if physical cleanup is delayed. Existing game-capture cleanup handles private final media after capture expiry. Bursts, failed cleanup runs, and storage errors can still create a backlog, so monitor oldest eligible record and storage use; expiration is not a guarantee of immediate physical deletion. No TTL policy or bucket lifecycle configuration is installed by this change. Increase admission only alongside measured cleanup capacity and upstream abuse protection.

Local automated tests exercise explicit consent, wrong owner/client/scope, one-time exchange and replay, approval/exchange transaction races, expiry/revocation, shared quotas, immutable chunk races, missing/changed chunks, signature/whole-file verification, lost acknowledgements, publish recovery, idempotent discard, bounded cleanup, and private HTTP responses. Storage behavior is tested with generation-aware local fixtures and access rules in emulators; an actual deployed Cloud Storage upload/preview smoke test and load test remain required before admitting real pilot traffic. No production captures are published by these tests.
