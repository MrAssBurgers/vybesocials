# Map content pins: baseline audit and staged repair

Initial audit baseline: `43f80ac5`; follow-up source audit: `fa4c06fc`, 2026-10-05. The findings below describe those historical baselines. **The posts/clips stage is now implemented and verified in [MAP_PIN_STABILITY.md](MAP_PIN_STABILITY.md); it supersedes the old post/clip readers, rules, producer and interaction findings here.** Story and event source/pin repairs remain pending. Neither audit itself changed implementation. The original Mapbox 3D renderer remains intact.

## What the repository did at the audit baseline

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

## Complete implementation stages

The smallest complete first stage is **post and clip pins together**. Stories and events have separate source-authority gaps; wiring their dots to the current source readers would not close those gaps. Each stage must deliver its publishing controls, checked reads, opening behavior, raw-access cutover and verification together. Narrow only the collections whose consumers have migrated. Do not remove the other layers and call the overall pin work complete.

### 1. Posts and clips: consent through opening

Proposed callable contract, not an implemented export:

```ts
manageMapPin({
  action: 'state' | 'share' | 'remove' | 'list' | 'read',
  expectedOwnerUid, expectedProfileId, expectedAccountCreatedAt,
  kind, sourceId,
  requestId?, expectedPinRevision?, expectedSourceRevision?,
  location?, cursor?
})
```

Action-specific validation must reject irrelevant fields. `share` accepts either an explicitly reviewed approximate area or an admitted venue ID plus its reviewed revision. An online event, caption, private address, media metadata, Local-feed opt-in or live-location grant does not supply map consent. Do not request device GPS merely to open/remove a pin. A source owner can deliberately choose a place without claiming to be physically there. Preserve the precision label in the DTO and UI.

The server owns the pin ID, author, content summary and source type. Require a canonical active account binding and current Auth incarnation for the actor and source owner. Store protected consent state, source incarnation, exact-request receipts, a removal generation/tombstone and private bounded cursors. Retrying an older share after removal must report the current removed state, not restore the point. Retain a failed pin draft separately from an already successful post publication; never republish the post merely because pin saving failed.

Reuse `admitSocialPost` (`functions/src/_shared/socialFeedAuthority.ts:156`), `authorAdmission` (`:51`), `projectPost` (`:77`) and `validPostPublication` (`functions/src/_shared/postPublicationProof.ts:36`). Explicitly reject `needsOwnerConfirmation` before map sharing or map discovery: the ordinary owner reader intentionally permits recovery of older unproven posts. Intersect current source audience/block/moderation checks with the owner's current `profile_visibility.location` setting. Do not broaden the audience for a map viewer.

The publication helper validates a protected revision and content fingerprint, **not the Firestore source creation version**. Bind pin consent to the post document's `createTime`, publication-proof creation version and canonical owner/incarnation, then recheck them on every read and mutation. This prevents a deleted source copied back to the same ID from inheriting location consent. Protected `managePost` creation already refuses retained IDs/proofs (`postPublicationAuthority.ts:117`); this additional pin check covers source replacement outside that normal path. Do not invalidate consent solely because an ordinary counter or profile-pinning revision changed. Re-admit the current publication and audience; distinguish source incarnation from mutable revision.

Return only admitted source IDs/kinds, current display fields, pin/source revisions, stated area/venue precision, server time and a lease of at most 15 seconds. Read source display fields from the current admitted source rather than old copied pin text/media. Use bounded candidate pages with continuation after filtered-out candidates, three-page visible groups, explicit next/first controls, fresh mount/foreground reads, RTT-adjusted leases and current-denial precedence across retained pages. No location-bearing query or retry body belongs in persistent browser storage.

Owner entry points can be a shared map-sharing dialog from the existing post/clip action surfaces, usable for any already-published source; this avoids editing every publisher just to attach location. The dialog must clearly distinguish map sharing from `PostLocalAreaDialog`, and preserve the current Local feature. Wire post/video/clip opening by checked type and ID into `/p/:id`, `/watch/:id` or `/clips/:postId`; each destination independently admits access. Add source properties and click callbacks to the existing 3D layers without changing the renderer/camera, equivalent fallback pins, and accessible drawer buttons.

### 2. Stories: repair source admission, then pins

`storyReadAuthority.ts:56` checks current relationships in a transaction, but its row loop (`:104`) never reads `_story_publish_receipts`. Media resolution occurs afterward (`:128`–`:140`) without a final admission check. A legacy row is therefore not proven publication, and a block/deletion/privacy change during delayed media resolution is not observed before return. `storyPublishAuthority.ts:131`–`:140` checks replay identity/request fingerprint but does not compare the stored story content to that fingerprint or bind replay to a source creation version. These are source prerequisites, not evidence that current raw client story writes are open: Rules already deny raw story reads/create/update.

Extract a transaction-local `admitStory` helper for both the ordinary viewer and pin service. Check protected publish evidence, stored content fingerprint, source/receipt creation versions, canonical owner/account binding, deletion/moderation, current expiry, accepted friendship, Close Friends and profile story visibility. Perform external Storage metadata work before a final transaction rechecks current admission and the exact source version; a delayed resolved URL cannot preserve revoked access. Keep the existing owned-storage URL restrictions.

Preserve existing story semantics: even `stories: public/everyone` currently admits only accepted friends (`storyReadAuthority.ts:77`–`:103`); Close Friends narrows that set. Do not inherit post-style public discovery or assume the post helper's private-account follow policy is identical. Add a short explicit lease to the existing story transport/viewer, rather than treating its 15-second polling interval as a lease. `useVisibleStory.ts:17`–`:28` currently has polling and account guards but no access-deadline/visibility generation. Bound ordinary story pagination/polling too; `useStories.ts:60`–`:80` presently refetches all accumulated pages.

Unproven legacy rows must not become map publications automatically. Preserve owner review/recovery, with deliberate new publication and its actual expiry; do not fabricate historical authorship or silently copy private media into a new audience. Only then implement explicit story map sharing, with pin lifetime capped by source expiry and opening through the exact-ID `StoryViewer` admission. A source replay, expired story or copied old pin must not extend its lifetime.

### 3. Events and RSVPs: source cutover before event pins

Introduce a checked event boundary with list/read/attendees/create/update/delete/recover/RSVP operations, strict canonical actors, protected publication/incarnation evidence, exact retry receipts and durable deletion state. Preserve ordinary event filters, host views, the global banner, How U Doin events, staff management and attendee surfaces during cutover. Use separate owner fields and staff-only promotion fields; ordinary publication must not manufacture featured/global placement or a sponsor relationship.

`is_public` is the only current access-intent flag. The Create Event switch promises that public events allow anyone to see and RSVP (`CreateEvent.tsx:308`), but there is no protected private invitation/member model. The smallest proposed safe private semantics is host/staff-only, stated explicitly in the UI before publication; lock that compatibility decision before implementation. Existing RSVP rows cannot grant private-event access because their identity/event fields were caller-writable. The `global/community/creator/public` values in `useGlobalEvents.ts:18` are discovery classifications today, not community memberships or friend audiences. Do not invent an audience from those labels.

RSVP identity must be a deterministic protected key bound to actor incarnation and event generation, with a current revision. Going/interested/not-going/removal and exact retries must commit with capacity and count changes in one transaction. Verify current source admission, both block directions, deletion/time policy and capacity on every transition. Do not count duplicate forged historical rows as trusted attendance or import them as invitation evidence. Preserve historical rows for bounded owner review; a user can deliberately confirm their own current RSVP against the new event source. Expose registered counts separately from the currently visible attendee roster, which must filter current identity/block restrictions. Old retries cannot rejoin after leave or attach to a recreated event.

Only after source cutover may an event pin accept explicit host map consent and current in-person venue/area selection. Never geocode the event's free-text address automatically. Recheck event publication, host, audience and source incarnation on every pin read. A changed event venue needs location review rather than silently keeping an inaccurate old point. Pin expiry must be explicit and bounded by a known event end when present; the policy for legacy events with no end time must be decided, not inferred as permanent map publication. Event detail and RSVP reads must remain independently checked after navigation.

## Consumer and file partition for implementation

| Work package | Files and integration surface |
| --- | --- |
| Shared pin backend | New narrowly scoped pin wrapper/helper/tests; reuse `socialFeedAuthority.ts`, `postPublicationProof.ts`, `profileAudienceAuthority.ts`; extract admitted venue reading from `mapSocialAuthority.ts` only if venue selection is supported. Do not modify Wave code. |
| Pin client/owner controls | New checked service/hooks and shared owner dialog; `src/components/posts/PostCard.tsx` (existing Local dialog mounted at `:1056`), `src/pages/PostDetail.tsx`, `src/components/posts/ShortCard.tsx` and `src/pages/Watch.tsx` as their actual owner action menus require. Check all reachable owned source types, including text posts and long videos. `src/lib/postMutationService.ts` remains the content-publication boundary; attaching a pin must not bypass it. |
| Map rendering/read cutover | `src/lib/vybemap/firestore.ts:72`, `src/hooks/vybemap/useVybeMap.ts:114`, `src/lib/vybemap/types.ts:217`, `src/pages/VybeMap.tsx:131`, `src/components/vybemap/map/VybeMapboxCanvas.tsx:708`, `src/components/vybemap/map/VybeMapLeafletFallback.tsx:93`, `src/components/vybemap/DiscoveryDrawer.tsx:246`. Add explicit source opening and read error states; preserve the original 3D map. |
| Story source + pins | `functions/src/_shared/storyPublishAuthority.ts`, `storyReadAuthority.ts`, `functions/src/storyPublish.ts`; `src/lib/storyPublishService.ts`, `storyReadService.ts`, `src/hooks/useStories.ts`, `useVisibleStory.ts`, `useStoryComposer.ts`, `src/components/stories/StoryViewer.tsx`, `StoriesBar.tsx`, `src/lib/camera/createStoryRecord.ts` and its `snapSendService.ts` caller. Shared compose/publish paths must carry any new actor/receipt contract consistently. |
| Event source + pins | New event authority/service/hooks; migrate both `src/hooks/useEvents.ts` and `useGlobalEvents.ts` (each defines its own RSVP mutation), `src/pages/Events.tsx`, `CreateEvent.tsx`, `EventDetail.tsx`, `HowUDoinHub.tsx:323`, `src/components/events/EventCard.tsx`, `GlobalEventBanner.tsx`, `src/components/admin/AdminEventsManager.tsx`, and `src/hooks/useFriendsOfFriends.ts:154` (`useFriendsAtEvent`). Staff reads/writes require checked staff authority rather than a broad raw exemption. |
| Shared integration | Coordinate narrowly scoped `firestore.rules`, exact new indexes/TTLs, `functions/src/index.ts`, generated Functions output, `src/lib/queryPersister.ts` and rollout docs with one owner. Pin persistence keys are already excluded; all event/attendee/admin/global roots also need migration/exclusion. Keep durable consent/publication/receipt evidence separate from expiring cursors. |

Before implementation, verify the actual owner menu entry files rather than assuming every reader has one. No exact deployed resource list is asserted by this plan.

## Additional observed failures and limits

- `firestore.rules:1707`–`:1715` permits signed-in raw event/RSVP reads and mutable owner/event references. This exposes private event addresses/online links and attendance; a caller can create its own RSVP and reassign it to a victim or another event. Event ownership and privileged display fields have no publication proof. These remain unfixed.
- Event-specific caches (`useEvents.ts:75`, `:181`, `:357`; `useGlobalEvents.ts:54`, `:142`; admin roots) are account-independent or lack epoch/current-access guards. `queryPersister.ts` does not currently exclude these event roots, so event payloads and viewer RSVP state can survive account changes on disk. Event repair must strip existing persisted snapshots as well as prevent new ones.
- RSVP count/status subquery errors are swallowed into `0`/`null` (`useEvents.ts:145`–`:167`, `:199`–`:221`). The two RSVP hooks invalidate different roots, and ordinary RSVP success omits `event-attendees`; an acknowledged attendance change can leave the displayed roster stale (`useEvents.ts:348`). Event list errors become “No events found” (`Events.tsx:210`, `:279` onward). Use checked counts/status and distinct failure/retry states.
- Event capacity is presented as available places (`EventCard.tsx:302`) but current raw upserts do not enforce it. The event and RSVP delete sequence in `AdminEventsManager.tsx:193` is not atomic and ignores the first deletion's error. A source tombstone plus checked dependent reads avoids partial-delete disclosure without an unbounded transaction deleting every attendee.
- `useMyEvents`/`useUpdateEvent` exist but have no ordinary-page callers found in this audit. `CreateEvent.tsx:96` returns to the public-only list, so a newly created private event disappears from its creator's reachable list. The event stage must provide a real own-event entry and preserve reviewed legacy owner recovery, not merely lock raw reads.
- `EventReminderButton` is mounted in event detail/cards, but `useEventReminders.ts:14`, `:34`, `:59` accesses a collection without an explicit Rules allow, and no delivery implementation was found. This is a separate existing-flow gap; an event authority/pin cutover must not claim that reminders work. Do not silently remove its UI or invent provider delivery as part of pin admission.
- Post and story Firebase download URLs are capability URLs. Denying new API reads does not recall a URL already obtained by a viewer. This plan governs admission and cache retirement; stronger media-token revocation/storage delivery is separate work and must not be implied by a pin repair.

Verification must include true schema-compatible historical fixtures, forged rows, source create/delete/recreate, private/global event distinctions, source and location revocation during delayed work, exact retry acknowledgement after hidden/closed views, pagination after empty admitted pages, staff/owner recovery, current counts/capacity and account A→B→A. Source-only review is the evidence for this document; no production probe or data mutation was performed.
