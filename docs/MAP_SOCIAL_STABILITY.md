# Map social stability

This checkpoint repairs the existing place, check-in, place-feed and meetup flows. The original Mapbox 3D world map remains the default, with its existing selected modes and explicit flat fallback. It does not add another renderer or certify every map feature. No production deployment, Auth configuration change, real GPS sample or live research-provider request was performed for the isolated backend checks.

## Confirmed failures and repaired behavior

- A check-in at someone else's place previously saved its location row before an owner-only counter update failed. A reply to someone else's place post failed the same way. The checked operation now saves the item, counter and receipt in one transaction; retrying the same request cannot create another item.
- A membership with `status: left` previously made Join return without changing anything, while the UI announced success. Membership is now deterministic per canonical UID and meetup, with revision checks and actual going/left transitions. Host creation and its initial membership are atomic. An old Join receipt after Leave reports the current left state.
- Check-ins marked friends-only were globally readable and downloaded before client filtering. Raw map social documents are now denied. The checked reader queries current accepted friend aliases and canonical profile candidates in bounded chunks, then verifies every item and its parent under current audience rules. Newer strangers' traffic does not bury friends' check-ins.
- Older queries could inherit another selection's placeholder, retain content after a read failed, and show empty-state copy during failure. The matching client uses checked receipts, scoped fresh reads, bounded access leases and explicit loading/error/retry/pagination states. Root integration and browser evidence are recorded in WORKLOG.
- Area research previously merged into an arbitrary caller-selected place ID, invalidating publication or recreating a deleted place. Research no longer writes place documents. Its former global cache also exposed exact researched coordinates and names; the new cache is private and bound to one actor and exact request context.

## Checked API and publication

`manageMapSocial` requires `expectedOwnerUid` and `expectedProfileId`. The server resolves the current canonical identity in each transaction, rejects conflicting identity aliases and retired/malformed existing account bindings, and checks current friendship, two-way blocks and profile visibility. A profile marked private still needs the existing approved-follow authority. This boundary does not replace the broader Auth-incarnation and legacy identity limitations described in [Account profile stability](ACCOUNT_PROFILE_STABILITY.md).

| Existing operation | Action and required selection |
|---|---|
| Browse places, meetups or check-ins | `list`, scope `places`, `meetups` or `checkIns`, optional opaque `cursor` |
| Place feed or replies | `list`, scope `placePosts` or `comments`, required parent `targetId`, optional `cursor` |
| Selected place or meetup | `read`, kind `place` or `meetup`, `targetId` |
| New place | `createPlace`, name, known category, finite latitude/longitude; optional description/photo URL |
| Check-in | `checkIn`, `placeId`; optional message. Coordinates/name come from the admitted place. |
| Place post or reply | `createPlacePost` with place ID/content, or `createComment` with post ID/content |
| New meetup | `createMeetup`, title and finite latitude/longitude; optional description/destination label |
| Join or leave | `joinMeetup`/`leaveMeetup`, meetup ID and current membership `expectedRevision` (`null` before first membership) |
| Deliberate historical review | `publishPlace`/`publishMeetup`, target ID and exact `expectedRevision` from the owned legacy projection |

Every mutation also requires a UUID `requestId`. Its private receipt binds the canonical actor and exact submitted fields. Reusing it with changed fields fails. A replay reads current admission and resource/membership state; it never returns old cached content or republishes a deleted item. A user can remove their own RSVP after admission is revoked without receiving the revoked meetup contents. The host cannot use Leave on their own meetup.

Successful responses include `ok`, actor UID/profile ID, action, numeric server time and a 15-second access deadline. Reads return only validated, bounded DTOs. Mutations also return the request ID, resource ID, current status and current admitted item or `null`. Clients verify the requested fields and status before claiming success, then fetch current state. After a changed phase or unavailable resource, an old acknowledgement must not install stale contents.

`_map_social_publications` binds each resource kind/ID, owner UID/profile ID, revision and exact source fingerprint. Place/check-in publication is friends-only, subject to current location visibility; place posts/comments also respect the author's posts setting and the current admitted parent. Counters change atomically with their publication proof. `_map_social_memberships` stores checked membership separately from old caller-written rows. No legacy membership, claimed author or visible row constitutes proof on its own.

## Historical data and compatibility

Unproven places and meetups can be projected only to their currently claimed canonical owner, with `legacy: true` and an exact source revision. The existing owner must review the displayed location/content and explicitly choose sharing with current friends. Publishing keeps the resource ID, rechecks the source and owner, strips unsupported fields and creates protected evidence. Reading alone does not attest anything. Unverified place counts reset to zero; an explicitly published meetup starts with one fresh host membership. Historical attendees are not consent and are not copied.

Old check-ins, place posts, comments and meetup memberships are not automatically published. Malformed or unsupported historical rows, including resource IDs longer than 128 characters, are omitted from DTOs; they require separate reviewed recovery if needed. Pagination supports the full Firestore cursor-ID domain so an omitted long-ID row cannot block later valid rows. Mixed legacy timestamp/date types do not establish a supported publication date. Do not run a bulk proof migration from mutable source ownership.

Old direct map readers/writers are incompatible with the new rules. Missing Functions/indexes, invalid receipts and changed permissions must remain explicit errors; do not add a raw fallback. The matched client excludes both previous and new map query roots from disk restoration/dehydration and retires account/selection work. Client mutation retry storage contains bounded hashes/request IDs, not location coordinates or draft text; the same draft must be resubmitted to recover the same uncertain request.

## Bounds and retention

| Boundary | Bound |
|---|---|
| Map social read lease | 15 seconds; client deducts elapsed request time and hides expired/failed/hidden-view content |
| List page | 20 candidates, with explicit continuation even when candidates are denied |
| Client list window | At most three pages per refresh window; explicit continuation advances to the next window |
| Check-in candidates | Current accepted friends plus self; 30-ID query chunks, at most 500 unique friend aliases and 500 accepted rows in each direction; excess fails explicitly |
| Check-in time window | Last 24 hours, bounded by the first page's time |
| Opaque cursor | Bound to actor, selection and current check-in candidate friend set; expires after 10 minutes |
| Callable quotas | 120 social reads/minute and 30 social changes/minute per UID |
| Meetup notices | Existing maximum 40 candidate recipients; current admission checked per recipient; deterministic one-time receipt |

Place/post/comment parent dependencies are read in the same transaction. Publication evidence, membership state, mutation receipts and notification receipts have **no TTL**. Do not expire them as cursor cleanup or rollback. Their storage retention needs a separate reviewed operational policy. Expired cursors fail immediately; Firestore TTL deletion is eventual cleanup and never grants access.

`onMapMeetupCreated` now requires protected publication and current friend/block/privacy admission. A retried event does not duplicate its in-app notification. Explicit review of an existing legacy meetup updates its document and does not invoke this on-create trigger. Notification push delivery remains governed by the separate deployed push/preference pipeline; no live delivery was exercised here.

## Area research and private cache

`researchMapLocation` requires the same expected UID/profile binding. With `placeId`, the server requires a currently admitted published place and derives the coordinate/name itself. Caller-provided replacements cannot change that target. Without a place ID, only the caller's validated explicit draft coordinates/name are used. Identity/admission and the same source revision are checked again after research and before returning a cached result. A late block, retirement, deletion or changed source rejects the result.

The receipt is `{ok, ownerUid, profileId, placeId, serverTime, validUntil, intel}` with a 15-second access deadline. The 64-hex cache key hashes version 2, canonical viewer UID/profile ID, exact coordinates/name and optional place ID. The private cache envelope retains owner/context checks and validated DTO fields; old global cache entries are never adopted. Read quota is 120/minute; **only a cache miss or explicit forced research consumes the separate 12/hour research quota**. Lease renewal does not force another provider request.

`map_location_intel.expireAt` expires new private cached research after seven days. This is separate from the 15-second permission lease and the 10-minute map cursor TTL. Old global cache records without `expireAt` remain stored but client-inaccessible; their cleanup needs a separate reviewed operation. Do not mistake a cached safety score for verified local conditions. Existing Gemini/search and reverse-geocoding services, credentials, availability and actual provider behavior still need operational review; tests used injected responses only. No secret was provisioned or changed.

## Coordinated rollout and verification

Follow [DEPLOY.md](../DEPLOY.md), preserving every earlier pending checkpoint and the `auth2faRequest` exclusion. Exact changed Functions are **`manageMapSocial`**, **`onMapMeetupCreated`** and **`researchMapLocation`**. Do not deploy every export from their source modules.

Add/wait for `map_meetups(status ASC, created_at DESC)` and `map_check_ins(user_id ASC, created_at DESC)`. Keep the existing place-post/comment parent/time indexes. New TTLs are `_map_social_cursors.expireAt` and `map_location_intel.expireAt`. Review the complete shared rules/index files before installing them.

Rules deny direct client get/list/create/update/delete of `map_places`, `map_check_ins`, `map_place_posts`, `map_place_post_comments`, `map_meetups`, `map_meetup_members`, and `map_location_intel`. They also deny `_map_social_publications`, `_map_social_memberships`, `_map_social_receipts`, `_map_social_cursors` and `_map_social_notifications`. Coordinate the named Functions, these rules and the matching Lovable client in a controlled cutover; protect users from an interval with incompatible old clients. Never copy the local wrapper, demo records, synthetic provider responses or emulator configuration to production.

The isolated suite passed **20 backend groups and 244 Firestore rule checks**; Functions build, scoped lint and diff checks passed. It covers cross-owner counters, exact retry, concurrent RSVP/counter changes, rejoin, revoked own leave, current blocks/privacy, explicit legacy review, unproven data denial, friend-only chunked loading, cursor misuse/expiry/long IDs, checked notices, private cache isolation and delayed/malformed injected research. See WORKLOG for the final client suite and live preview evidence.

Before production release, verify the deployed create-place → friend check-in → post/reply path, meetup join → leave → rejoin, intentionally lost replies, legacy review, invalid indexes/endpoints, account changes, background/foreground and route retirement. Verify original globe loading and native camera/GPS/file-permission behavior separately. Coordinates are validated user reports, not physical-location attestations. Place photos use existing media storage and bearer download URLs; map admission cannot recall already delivered media or coordinates.

Story/post/clip map pins still need their separate content-authority integration; this repair does not attest them or add missing content-opening behavior. Squad maps retain their separate legacy membership paths. Live location consent is governed by [Location sharing stability](LOCATION_SHARING_STABILITY.md), not by a check-in or meetup RSVP. These limits remain open rather than being treated as launch-readiness certification.
