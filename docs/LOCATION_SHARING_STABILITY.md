# Location sharing stability

This checkpoint repairs the existing VybeMap and chat location controls. It is a coordinated Firebase/client compatibility change. No production deployment, real GPS sharing, provider configuration or Auth changes were performed as part of the repair.

## Authority and visible behavior

`manageLocationSharing` is the checked boundary for `read`, `request`, `respond`, `pause`, `stop`, `setSharing` and `publishPosition`. Requests bind the authenticated UID to the current canonical profile. Changes carry a UUID request identity and, where applicable, the expected current revision. Server transactions recheck identity, friendship, blocks, grants and profile location visibility. Raw location snapshots and caller-writable historical sharing rows are not permission evidence.

A request asks a friend to let the requester view that friend's location. Accepting it creates one directional grant: the recipient is the sharer and the requester is the viewer. It does not enable device location or start GPS. The sharer separately enables live updates on VybeMap and grants device permission. Pausing affects only the sharer's outgoing grant; either participant can stop the specific grant. Blocking a requester also disables both directional grants and creates the account block. The UI explicitly confirms that broader Block action.

Chat's existing **Location Sharing** action opens `/messages/<conversationId>?location=1`. It now shows checked incoming requests, sent pending requests, distinct outgoing/incoming permissions, and paused controls. Loading and errors are not presented as sharing being off. Failed or unconfirmed changes remain retryable; draft requests survive a failure. Closing the sheet or changing accounts/peers retires pending UI continuations. The panel never displays latitude/longitude or starts GPS.

Map updates run only while the map is open and the app is visible. Opening it does not prompt an undecided geolocation permission; explicit location actions can request permission, and previously granted permission can resume a watcher. Ghost disables the server sharing state and deletes the latest sample. Temporary Ghost return is an in-memory, revision-bound timer: it cannot override a later setting, and reloading keeps sharing disabled until the user deliberately returns. Already delivered coordinates cannot be recalled from a recipient's device.

## Lifetimes, precision and limits

| Record or projection | Bound |
|---|---|
| Pending request | 24 hours |
| Once grant | 15 minutes |
| Other existing durations | 1 hour; 24 hours; until midnight UTC; custom 5–1,440 minutes; indefinite capped at 365 days |
| While-using grant | At most 4 hours; visible coordinate additionally requires a sample no older than 30 seconds |
| Latest live sample | At most 120 seconds after its actual sample timestamp, also bounded by server receipt time |
| Checked read | 15-second access lease; the client deducts request elapsed time and expires rows locally |
| All-friends read | At most 100 active unexpired grants and 100 pending requests; excess returns an explicit error, never a silently truncated success |
| Pair read | The two directional grants, with that pair's pending requests |
| Callable quotas | 60 reads/minute, 60 position publishes/minute, 30 other changes/minute per authenticated UID |

Approximate results use the center of a 0.02-degree grid cell, report a 2,000-meter approximate radius, and omit speed and heading. Precise results preserve the admitted coordinate. Approximation is a coarse display boundary, not a guarantee against inference. Samples are authenticated client reports with field/time validation; the server does not attest the physical device's location.

Client reads are account/profile/epoch scoped and not persisted. No inherited previous-account placeholder is displayed. Fresh admission is required on mount, and hidden-page or expired data is removed instead of reused on foreground. Revocation is enforced on the next server read and bounded by the short existing read lease on already rendered data. Do not describe it as recalling every prior client copy instantly.

Mutation receipts are stored privately in `_location_receipts`. Replays require the same owner, exact request fingerprint and current dependency revisions; positive access also rechecks the current peer relationship and expiry. They cannot restore an older grant after a stop or newer change. Non-coordinate client retries retain their original request/revision in bounded session storage. Coordinates never enter that retry store. A checked receipt is followed by a fresh read rather than being installed as current state.

## Required coordinated rollout

Follow [DEPLOY.md](../DEPLOY.md), including the separate email-confirmation release restriction. Do not deploy all Functions. Review these exact named exports together:

- `manageLocationSharing` — new checked client boundary.
- `createLocationRequest`, `respondLocationRequest`, `stopLocationShare`, `pauseLocationShare` — existing names now strict action wrappers. Old unbound request shapes are rejected.
- `emergencyGhostMode` — uses the same UID/profile/revision/request-bound `setSharing(false)` authority.
- `syncLocationShareSnapshots` — every five minutes expires up to 200 grants and deletes up to 200 expired numeric live samples. It no longer copies coordinates into grants.
- `aggregateVybeHeatmap` — every fifteen minutes deletes up to 200 old global heatmap rows and creates none. The current map computes coarse cells only from the viewer's checked results.

`functions/src/index.ts` already re-exports the location module. The unchanged map intelligence/search, meetup notifications and access logging are separate features; do not include them merely because they share a module. No AI-provider request is required for this rollout.

Install these four composite indexes from the reviewed `firestore.indexes.json` and wait for readiness:

| Collection | Fields, in order |
|---|---|
| `_location_requests` | `participant_uids ARRAY_CONTAINS`, `status ASC`, `expires_at_ms ASC` |
| `_location_requests` | `pair_id ASC`, `status ASC`, `expires_at_ms ASC` |
| `_location_grants` | `active ASC`, `expires_at_ms ASC` |
| `_location_grants` | `participant_uids ARRAY_CONTAINS`, `active ASC`, `expires_at_ms ASC` |

Deploy the named Functions, reviewed rules and matching Lovable client in a controlled cutover. Rules deny every client read/write of `_location_state`, `_location_grants`, `_location_requests`, `_location_receipts`, `user_live_locations`, `user_locations`, `location_shares`, `location_requests` and `heatmap_tiles`, including direct staff reads. `location_history` remains canonical-owner create/read/delete only, with immutable rows and collision checks. Earlier raw-reader/writer clients are incompatible and must not be kept working by widening rules.

There is **no new TTL policy**. Revision state and mutation receipts are durable; do not expire them as cursor cleanup. Access deadlines are checked immediately, independently of scheduled deletion. Historical grants and snapshots are not automatically adopted: users must make and accept fresh requests, then explicitly enable updates. Legacy live rows lacking numeric expiry and old private grant rows remain stored but inaccessible; any retention cleanup requires a separate reviewed operation. Do not migrate old coordinates into new grants or grant consent from historical booleans.

## Verification and operational limits

The isolated location suite passed **20 backend groups and 189 Firestore rule checks**, including exact receipt/revision replay, changed identities, blocks, grant direction, precision, expiry, legacy denial and scheduled cleanup. Functions build and scoped lint passed. The chat sheet has eight focused UI/route regressions for pending/paused state, failed mutations, request draft retention, duplicate-submit locks, account/close teardown, coordinate masking and the existing deep link. See WORKLOG for final integrated checks and the separate story playback evidence.

Before a production release, use designated test accounts on the deployed rules/endpoints to verify request → accept → explicit enable, approximate/precise projections, pause/resume, stop, block/unfriend, Ghost, lost acknowledgement, expired reads, background/foreground and account changes. Real GPS, native permission behavior, production provider restrictions and device battery behavior still require device QA. Local test positions and preview accounts are never production migration data.
