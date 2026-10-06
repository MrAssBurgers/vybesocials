# Private community attachments

New channel attachments use authenticated HTTP upload and delivery. They do not use Firebase download URLs, signed URLs, or the shared URL cache. Deployment status and exact production boundaries are recorded in [the attachment recovery checkpoint](../releases/community-attachments-recovery-20261006/README.md). Historical migration remains separate.

## User flow

In either channel chat, choose **Attach file**, select a PNG, JPEG, WebP, MP4 or WebM file up to **20 MiB**, optionally add text, then choose **Send attachment**. Sending requires current channel visibility, send permission, and media attachment permission. The composer retains the original file, caption, and request ID after a failure. Retry recovers that request; **Start new upload** explicitly starts a separate attachment. Closing the page does not persist the file or its pending receipt, so users should check the channel before sending again after a reload.

Recipients choose **Open private attachment**. The app requests bytes with their Firebase ID token in an Authorization header, creates an in-memory Blob URL only after validating the response, and checks access again every 15 seconds while open and on resume. Close, page hiding, navigation, sign-out, account epoch changes, failed access checks, and unmount abort pending work and revoke the Blob URL. Hidden content is never automatically reopened. Network checks have deadlines. Browser scheduling may delay checks, and already delivered bytes or screenshots cannot be recalled.

Historical attachments show an unavailable/re-share explanation instead of loading their old URLs. This does **not** revoke an old copied bearer link or delete an old object. Shared community icons and the existing `media`/`community-assets` paths retain their previous access behavior. No historical object is silently promoted to the new protected namespace.

## Authority and records

`communityAttachment` requires Firebase Auth and `expectedOwnerUid` matching the caller. All actions resolve a unique canonical UID/profile mapping, including collision and mapping-index checks. Identity, current community admission, and channel permissions participate in transaction read sets.

`reserve` accepts `{requestId, channelId, byteSize, contentType, content?}`. Request IDs contain 16–128 letters, digits, underscores or hyphens; text is bounded at 8,000 characters. `_community_attachments/{assetId}` is server-only, where `assetId` is the SHA-256 of the caller UID and request ID. The record binds owner UID/profile, server/channel, message ID, declared MIME/size, caption fingerprint, and a 15-minute upload deadline. Reusing a request with changed details conflicts. `_community_attachment_limits/{uid}` permits 30 new reservations and 200 MiB of declared bytes per UTC day. Replayed reservations do not consume the allowance again; request rate limits also apply.

Acknowledgements contain `{success, assetId, ownerUid, channelId, messageId, objectPath, byteSize, contentType, status, expiresAt}`. `messageId` is `attachment_{assetId}`. Status advances from `uploading` to `uploaded` to `ready`. `finalize` returns `uploadRequired: true` without creating a message until bytes are selected. The initial `.../original` path is only a placeholder and is never uploaded by the browser.

## Upload and finalization

`communityAttachmentBytes` accepts `PUT /uploads/{assetId}` with the exact allowed Content-Type, raw bytes, `Authorization: Bearer ...`, and `X-Vybe-Owner`. Credentials in query parameters are rejected. The server validates the actual raw buffer length against the 20 MiB limit and reservation, checks current permission, and computes SHA-256.

Each upload contender creates a fresh server-only object at `community-private/{uid}/{assetId}/sealed_{random128bits}` with a create-only generation precondition. The object has no Firebase download token. A transaction rechecks authority and selects exactly one path, generation, and content hash. An identical retry returns the same selected object; changed bytes fail. Known losing candidates are removed. An unknown transaction outcome conservatively leaves a possible winning object intact. Abandoned and uncertain candidates need an operator-designed cleanup job; this release does not introduce automatic cleanup or receipt TTL.

`finalize` verifies the selected generation, size, MIME, and absence of download tokens, then atomically creates a channel message and marks the proof ready. The message contains an attachment ID and **no media URL**. A ready receipt can acknowledge the same live message, but soft/hard deletion never permits replay to recreate it. Receipts must be retained to preserve that property.

All browser reads, writes, updates, deletes, and lists in `community-private/**` are denied, including uploader and staff claims. Proofs and quotas are also inaccessible to browser clients. Uploads use the HTTP service; there is no fallback to direct Storage.

## Viewing bytes

`GET /{messageId}` and `HEAD /{messageId}` accept only header authentication. Every request derives the asset from the actual stored message, validates the exact message/proof/owner/channel/server tuple, checks current channel visibility, and pins the selected object generation. GET validates authority again after reading bytes, before responding. The handler permits only one strict byte range and returns private `no-store`, `nosniff`, and explicit length/type headers. It never redirects to a Storage URL. Response memory is bounded by 20 MiB; the function uses one CPU, 512 MiB, concurrency four, and a 60-second timeout.

The MIME and byte checks are transport constraints, not file decoding, malware scanning, content moderation, encryption, or DRM. Authorized users can retain bytes they received. Removal blocks future service requests; it cannot retract prior downloads. Existing LiveKit token revocation limitations are unchanged.

## Rollout and verification

Deploy both functions, the protected Firestore namespaces, deny-all private Storage block, and client together. Old raw-media message submission fails explicitly. Keep shared icon paths unchanged. Confirm the actual production HTTP endpoint accepts raw PUT bodies and response headers before enabling this UI broadly; no production request is part of the demo fixtures.

`scripts/test-community-attachments-rules.mjs` checks private namespace denial for owner, outsider, staff claims and guests, including token acquisition and replacement. `scripts/test-community-attachments-backend.mjs` uses actual demo Firestore transactions and Storage objects to test strict identity, reservations/quotas, competing uploads, token-free metadata, generation binding, finalization replay, deletion, permission revocation, byte ranges, and HTTP header contracts. Client tests cover explicit send/open, retained retries, upload cancellation, account ABA, bounded bodies, lifecycle cleanup and legacy URL non-loading. Root's preview fixture separately exercises real emulator Auth and the HTTP function boundary.
