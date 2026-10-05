# Post and clip map pins

This checkpoint implements the posts/clips stage of `MAP_PIN_AUDIT.md`. It adds deliberate owner map sharing for already published text, photo, video and short posts, checked discovery/removal and source opening. The original Mapbox 3D renderer remains in use. Story and event pin authority are outside this stage and retain the limitations documented in the audit.

## Consent and current admission

`manageMapPin` is the sole post/clip pin boundary. Sharing requires a current canonical owner UID/profile, active protected account binding and current Auth incarnation. The owner explicitly chooses and labels an approximate area, reviews the current source and confirms. This does not use live GPS, infer a point from media/captions, adopt a Local-feed area, or enable live sharing. The picker loads normal Mapbox map tiles; it does not request device location or geocode the area label. Publishing the reviewed area calls only Firebase.

The server accepts finite latitude/longitude and a trimmed label of 1–120 characters. It stores only the center of a 0.02-degree cell, with `precision: 'approximate'` and `radiusMeters: 2000`. Pole and antimeridian inputs clamp to valid cell centers. Exact input coordinates are used only in the mutation fingerprint; the private receipt stores that hash, not a location-bearing request body. The label is deliberately published as supplied, so the review UI must make its visibility clear.

Every pin read re-admits its current source with the same `authorAdmission` and `projectPost` helpers used by `admitSocialPost`, then intersects the owner's current location visibility policy. This preserves source audience, private-account approved-follow, friendship, protected Close Friends, both block directions, moderation and deletion checks. Author admission is shared within a transaction/page; the server does not cache it across requests. The source owner must also retain a current active account binding and Auth incarnation. Both caller and participating owners are checked again after asynchronous reads. Auth's last check is external to the Firestore commit and cannot be fully atomic with it.

Unproven legacy posts with `needsOwnerConfirmation` cannot be shared or discovered as pins. They first need the existing deliberate post recovery flow. Old raw `map_post_pins`/`map_clip_pins` rows are never treated as consent. They are preserved privately, without auto-import or deletion.

## Source versions, removal and retries

Consent binds the exact Firestore creation versions of both the post and its protected `_post_publications` proof, plus owner UID/profile, Auth incarnation and binding. Copying deleted source/proof documents back to the same paths cannot revive a pin. The pin state itself is bound to its original immutable receipt's Firestore creation time, preventing copied-back state from borrowing old proof.

The reviewed `sourceRevision` hashes both creation versions and the current publication revision. A share must supply that value and the current pin revision. Once shared, ordinary counters, AI metadata and profile-pinning updates do not invalidate map consent; source display fields and admission are always read anew. A source edit may change what the current admitted pin displays, while a source replacement requires fresh explicit area review.

State IDs are deterministic for source kind/ID and owner account incarnation. A separate consent generation changes on sharing after removal or source replacement. Removal writes a durable tombstone and works for the original current owner even if the source is deleted, moderated or reassigned to an unrelated account. It needs no GPS or another owner's Auth availability.

Mutations use exact UUID requests, full-body hashes and captured revisions. Concurrent identical requests commit one transition. Reusing an ID with another body fails. Receipt replay is read-only and reports current state: an old share never reverses removal, and an old remove never removes a newer consent. `applied: false` explicitly marks a superseded or unavailable transition; the client must not celebrate its old requested area as current. A fresh request with an old revision also fails instead of changing new consent.

## API and bounded discovery

Every action sends `expectedOwnerUid`, `expectedProfileId` and `expectedAccountCreatedAt`. Unexpected fields are rejected. Source IDs support valid Firestore document IDs up to 1,500 UTF-8 bytes. Pin IDs are opaque 64-character hex hashes; revisions/cursors are 48-character hex values.

| Action | Additional input | Result |
| --- | --- | --- |
| `state` | `kind`, `sourceId` | Owner state and current review revision. |
| `share` | `kind`, `sourceId`, nullable `expectedRevision`, `expectedSourceRevision`, `area: {latitude, longitude, label}`, `requestId` | A checked current state, with `replayed` and `applied`. |
| `remove` | `kind`, `sourceId`, `expectedRevision`, `requestId` | Durable removal or truthful replay of later state. |
| `list` | `kind`, optional opaque `cursor` | Up to 20 scanned candidates and admitted `items`, with continuation. |
| `read` | `pinId` | A currently admitted pin or null. |

`kind: 'post'` covers source types `post` and `video`; `kind: 'clip'` covers only `short`. All responses bind `ok`, `action`, `ownerUid`, `profileId`, `accountCreatedAt`, `serverTime` and `validUntil`. A lease is at most 15 seconds. The owner response includes `status` (`unshared`, `shared`, `removed`, `unavailable`), `revision`, `sourceRevision`, `canShare` and a nullable pin. Mutation receipts echo the request ID. Missing/inaccessible reads return null after validating the actor; infrastructure failures remain errors.

Each pin DTO includes its source ID/type, current pin/publication revisions, canonical author, current admitted caption/media/thumbnail, rounded coordinates, area label and sharing time. It contains no cached legacy media snapshot. The reader must independently admit the source again when opening `/p/:id`, `/watch/:id` or `/clips/:postId`; the pin itself is not an access token.

Discovery is a global sharing list, not a promise that a post is nearby. Candidates sort by sharing time and document ID descending. The private opaque cursor binds account/profile/incarnation/binding and kind, preserves the candidate boundary, and expires after 10 minutes. Filtered pages can be empty while still having continuation; clients must keep that continuation reachable. New shares require refreshing the first page. Read quota is 120 calls/minute per UID; mutation quota is 30/minute. No unbounded scans or automatic traversal of the entire list are used.

## Client and renderer obligations

Owner controls retain failed area drafts separately from the already published post. Sharing failure must never republish or erase the source. Account, selection and visibility changes retire delayed work, and success requires a current validated receipt. Retry storage must contain only an opaque body hash and UUID, never coordinates, label or post text.

Pin lists and selected-pin reads need fresh mount/foreground admission, elapsed-time-adjusted leases, explicit loading/error/retry states, and current-denial precedence. Retained pages must not survive account or current permission changes. Existing persistence exclusions must remove stored raw post/clip pin snapshots as well as block future dehydration. Bounded page windows keep continuation accessible without silently truncating later results.

Both the original 3D map and optional fallback must use checked source identity for pointer opening. Drawer entries provide keyboard-operable opening. Expired/denied selection cannot navigate using an old pin. No camera-mode, live-location or story/event publication behavior is changed by this stage.

## Coordinated rollout

The checked account-profile and post-publication releases are prerequisites. After all client producer/read/rendering paths are integrated and verified, coordinate these resources:

1. Provision the `_map_pins` collection index `(kind ASC, status ASC, shared_at DESC, __name__ DESC)` from `firestore.indexes.json`.
2. Provision `expireAt` TTL for `_map_pin_cursors`. Access expires after 10 minutes regardless of managed cleanup timing. Keep `_map_pins` state/tombstones and `_map_pin_receipts` durable with no TTL.
3. Deploy only the exact new callable `manageMapPin` and the matching Firestore rules. Deny all direct client reads/writes, including raw staff access, to `map_post_pins`, `map_clip_pins`, `_map_pins`, `_map_pin_receipts` and `_map_pin_cursors`. Story/event rules are unchanged.
4. Publish the matching tested client through Lovable Share → Publish. Old raw pin clients are incompatible. A GitHub push alone does not update the website or native web bundle.

This is pending rollout guidance, not a deployment. No new secret, Auth setting, provider request or Storage rule is required. Do not broadly deploy Functions or deploy demo wrappers/fixtures. `auth2faRequest` remains excluded.

## Verification and remaining limits

The isolated Auth/Firestore suite covers real canonical account setup and checked post publication, concurrent receipts, reviewed source/state revisions, source/proof/pin deletion/recreation, removal after foreign reassignment, current audience/location policies, protected follow/Close Friends, blocks, normal counters/profile pinning, current and delayed Auth changes, boundary coordinates, bounded pagination and direct raw Rules denial. Final counts and browser evidence belong to the current integration entry in `WORKLOG.md`.

This does not repair story/event sources or their pins, event RSVP/reminder authority, media-download token revocation, device registration, native/background location, or SDK/provider behavior. A previously obtained Firebase media capability URL cannot be recalled merely by denying a later map read. Exact user GPS is neither collected nor published by this flow. Historical ownership/incarnation limits from the account-profile and post-publication migrations still apply; a map pin cannot establish trustworthy authorship for an unproven source.
