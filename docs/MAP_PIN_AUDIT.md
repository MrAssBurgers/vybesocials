# Map content pins: read-only audit

Audit baseline: `43f80ac5`, 2026-10-05. This document records unfinished existing story, post, clip, and event pin paths. **No pin producer, reader, rule, or interaction was repaired in this audit.** Squad Maps is the current implementation checkpoint. The original Mapbox 3D renderer must remain intact.

## What the repository actually does

| Layer | Current reader | Source and consent evidence | Opening behavior |
| --- | --- | --- | --- |
| Stories | `fetchMapStories` reads up to 80 `map_story_pins` with a caller-supplied `expires_at` later than the client clock. | Normal stories are created through `publishStory` with a private receipt and a 24-hour lifetime. The publish contract has no location/map-consent field. No repository writer creates a story pin. | 3D/Leaflet draw inert dots; drawer cards are non-interactive `div`s. Existing `StoryViewer` can open an exact story using its checked `useVisibleStory` reader, but the map does not connect it. |
| Posts | `fetchMapPosts` reads the newest 60 `map_post_pins`. | Normal posts use protected `_post_publications`. Their publish payload has no map coordinates/consent. A separate Local-feed opt-in stores a rounded area, but does not grant map consent. No repository writer creates a post pin. | 3D draws inert dots. Leaflet does not render the layer. Existing checked detail route is `/p/:id`. |
| Clips | `fetchMapClips` reads the newest 60 `map_clip_pins`. | Clips are `posts` of type `short`, with the same protected post publication boundary. No repository writer creates a clip pin. | 3D draws inert dots; drawer cards do not open content. Leaflet does not render the layer. Existing route is `/clips/:postId`; long videos use `/watch/:id`. |
| Events | `fetchEventPins` reads up to 80 `map_event_pins`. | Event creation stores a free-text `location` or online link, with no coordinates or map opt-in. Event pin writes are restricted to staff, but no repository producer was found. | 3D draws inert dots; Leaflet does not render event pins. `/events/:id` exists, but its current event reader is still raw and is not an adequate private-content boundary. |

The no-producer finding is based on repository source searches, not a production data inspection. It does not establish whether historical imports or an external system populated these collections.

Sources:

- `src/lib/vybemap/firestore.ts`: `fetchMapStories`, `fetchMapPosts`, `fetchMapClips`, `fetchEventPins` and collection names.
- `src/hooks/vybemap/useVybeMap.ts`: `useMapStories`, `useMapPosts`, `useMapClips`, `useMapEventPins`.
- `src/lib/vybemap/types.ts`: copied pin fields; story/post/clip rows use generic `id`, event rows use `event_id`. There is no checked source-incarnation/consent contract.
- `src/components/vybemap/map/VybeMapboxCanvas.tsx`: `pinLayer` serializes only coordinates and empty properties, without a source ID or click callback.
- `src/components/vybemap/map/VybeMapLeafletFallback.tsx`: only story circles among these four content layers, without an opening action.
- `src/components/vybemap/DiscoveryDrawer.tsx`: inert story/clip cards and “nearby” labels despite global queries.
- `src/pages/VybeMap.tsx`: these hooks default to empty arrays and do not provide their read errors or content-opening callbacks to the map.

## Concrete privacy and reliability failures

`firestore.rules` permits every signed-in user to read the four raw pin collections. Story/post/clip rows are created by an owner and updated by the recorded owner or staff, without source existence, publication, audience, moderation, block, location consent, coordinate schema, or immutable-owner checks. An owner can change `user_id` on update. A story pin's expiry is independent of its source story. Old copied coordinates/media can remain readable after source deletion, expiry, audience restriction, or a block. Staff-only event-pin writes still do not prove that the referenced event is currently visible or that its host consented to map publication.

The four hooks have global account-independent keys, no account-epoch guard, no access lease, and no explicit override of inherited previous-data behavior. The map turns failures into an apparently empty layer. Re-enabling a layer or changing accounts can reuse an old result. Earlier persistence exclusions help disk-cache safety but do not authorize these in-memory/raw reads.

Coordinates are neither validated against a current source nor filtered by actual proximity. “Stories nearby” and “Clips nearby” are therefore unverified claims. Dots have no reliable source identity and cannot open the intended content. The fallback also omits three selected layers entirely.

Existing post Local sharing must not be repurposed silently. `PostLocalAreaDialog` promises rounded-area nearby discovery, approximately 25 miles from that area, with exact GPS kept on-device. `_post_local_areas` is separate protected consent for that purpose. Likewise, live-location grants, location history, profile fields, media EXIF, and remembered device GPS are not map-pin consent.

Events have an additional source boundary gap: `events` and `event_rsvps` are readable by every signed-in account, regardless of `is_public`; raw owner updates do not keep `host_id` immutable. `useEvents` filters the public list, but `useEvent` loads a selected raw event. Linking pins into that detail page does not repair source privacy. Event source authority, host ownership, and RSVP admission need an explicit coordinated plan.

## Proposed complete repair, pending implementation

1. Lock a checked map-pin contract with actions equivalent to `state`, `share`, `remove`, `list`, and `read`. Require canonical UID/profile and current account binding, strict kind/source ID, stable mutation request ID, and captured pin revision. Use protected consent state, durable receipts, and private cursors; old copied pin documents never authorize publication. Deny direct raw pin reads/writes only when the replacement producer, reader, and UI are ready together.
2. Restore a deliberate owner publishing path. The owner explicitly selects and reviews an approximate area or chosen venue, then confirms map sharing for that source. Keep this separate from GPS/live-location consent and Local-feed sharing. Do not automatically geocode a private event address or infer a point from a caption. Removing a pin must work without location permission. A failed pin save must not erase a successfully published post/story/event or report map success; retain the exact pending pin operation for retry.
3. Bind consent to the current source owner and source incarnation. Recheck canonical identity, current source publication, deletion/moderation, audience/private-profile/follow/friend/close-friend/block rules, profile location privacy, and source expiry on every mutation and read. A deleted/recreated ID, owner reassignment, stale request, or malformed proof cannot revive old consent. Posts/clips can reuse their checked publication/admission helpers. Stories need a map-specific check of their protected publish receipt and current audience; do not treat a media URL or mutable row as proof. Historical events need a deliberate source-publication/recovery decision before exposing pins.
4. Return a minimal checked DTO carrying source kind/ID, current pin revision, stated precision, and a short access lease. Use bounded candidate pagination with continuation even when a scan page has no admitted items. Do not describe global results as nearby; either validate/filter a requested area or label the results accurately. Match existing three-page window controls and fresh account/selection/visibility behavior, without silently discarding a user's current scroll position or growing unbounded polling.
5. Wire source-owner controls and reader interactions. Replace the four raw functions/hooks with the checked service; update pin types; add source IDs and callbacks to the existing 3D layers without changing camera/render behavior; implement equivalent fallback pins. Make drawer items accessible buttons. Open post/clip/video routes only by checked source ID. Open stories through the existing viewer's exact-ID admission, never by trusting the pin's old media copy. Event navigation must use a repaired source reader or a checked event detail surface.
6. Retire selected content, map coordinates, navigation, and delayed results on account change, hidden/closed view, expiry, source revision change, or explicit denial. Preserve failed drafts and expose loading/retry/unavailable states. Exclude all pin coordinates and source snapshots from persisted query data.

Expected client integration files are the Firestore readers, `useVybeMap.ts`, map pin types, `VybeMap.tsx`, both renderer components, `DiscoveryDrawer.tsx`, and existing owner-facing post/story/event controls. Backend exports, protected namespaces, indexes, TTL policy, and compatibility behavior must be agreed from the actual implementation contract before rules are narrowed. No exact deploy list is asserted for code that does not exist yet.

## Required evidence before calling pins repaired

- Real isolated backend/rules tests for forged/copied/legacy pins, source type/ID mismatch, current privacy and both block directions, story/event expiry, deleted/recreated source IDs, consent removal, current owner binding, and stale/lost-response mutation retries. Direct raw API access must not bypass the checked boundary.
- Checked client receipt and lifecycle tests under production QueryClient defaults: account A→B→A, selection changes, delayed reads/mutations, hidden/foreground, expired or denied refresh, failed draft retention, and bounded page continuation.
- Interaction tests for pointer and keyboard opening in 3D, fallback, and the drawer; source details must independently admit the selected ID. A map point must not fabricate a GPS observation or live occupancy.
- Manual synthetic-fixture walkthrough covering deliberate share, reload, open, privacy change, remove, and exact retry, while retaining the original 3D globe. No real user GPS, provider, notification, or production mutation is needed for this first verification.

Until those changes and checks land, pin layers remain an explicitly unfinished existing feature. This audit does not certify pin privacy, production compatibility, or all-map readiness.
