# Post publication stability — 2026-10-04

Existing post creation, editing, deletion and pinning now use a server mutation boundary. Protected evidence binds the current canonical Firebase account, profile, post identity and published fields. This repair prevents old caller-writable author fields from being treated as proof. It does not establish the original authorship of historical content.

## Mutation contract

`managePost` accepts `action`, `expectedOwnerUid`, `expectedProfileId` and `postId`. Mutations also require a stable UUID `requestId`; existing-post changes require the captured 48-character `expectedRevision`. Supported actions are `read`, `create`, `update`, `delete`, `pin` and `recover`. The server rejects unknown fields and malformed text, media, tags, IDs and audience values before writing. New post IDs are UUIDs; game capture posts retain their fixed `game_<captureId>` identity. Historical IDs up to Firestore's 1,500-byte limit remain supported.

The response binds the account, action, request, post ID, resulting revision and status. A checked owner read returns the editable post projection. Read or write failures remain failures; clients must not fabricate a published result. Stable receipts allow a lost reply to be recovered only while the committed revision and status are still current and the publication remains active. A reused key with changed input fails. A retry after a later edit, deletion or moderation restriction never restores old state or returns an outdated published receipt.

The client also checks the saved meaning of a receipt before completing its retry attempt or invalidating views: updated fields must match, a pin must have the requested state, a delete must be deleted, and a create/recovery must contain the submitted content and audience. The only accepted age-rating normalization is the server contract: no check means Unrated; a limited check can raise Safe to 13+. A well-shaped response with the old caption is an unconfirmed change, not success.

Mutation retries retain only a payload hash and request ID in bounded session storage. Prepared creation retries separately retain the exact account-scoped caption, media links and payload in session storage so a reload can retry the same publication without uploading or regenerating different content. Successful completion clears them only after a checked receipt; storage failure prevents first submission. They are pending drafts, not shared feed cache, and remain sensitive local data. Account/epoch and view guards surround lazy imports and asynchronous work; a retired view cannot complete a new account's operation. The hook locks duplicate mutations before its first asynchronous import.

The callable permits 60 owner reads and 30 mutations per account per minute. Mutations run in Firestore transactions. Pinning serializes per owner, maintains the existing maximum of three pins and bounds legacy pin repair at 50 candidates. Staff may read and delete through the checked boundary, including a corrupt publication requiring removal; staff cannot publish or recover another account's post.

## Protected records and reads

- `_post_publications/{postId}` records canonical owner/profile, revision, publication status and a fingerprint of the content and audience fields. Deleted publications retain a tombstone. Neither raw deletion nor a repeated create request can reuse that identity.
- `_post_publication_receipts/{requestHash}` binds the caller, request payload and resulting revision. These receipts are private and retained; there is no TTL policy on publication evidence or receipts.
- `_post_pin_state/{uid}` serializes changes to one owner's bounded pin set.

Raw post creation, modification and deletion are denied to clients, including staff clients. Protected collections deny all client reads and writes. Existing owner/staff raw read access remains for scoped owner tools; public and cross-user views use the checked reader boundary.

Feed, list, detail/known-ID, public share, sitemap and partner feed projections require valid publication proof in addition to current audience, privacy, blocks, deletion and moderation admission. Checked DTOs carry `publicationRevision` and `needsOwnerConfirmation`; the client rejects an owner-confirmation row belonging to another profile. Visible leases, account/view cancellation, bounded groups and persistence exclusions described in [Post reader stability](POST_READER_STABILITY.md) remain in force. Followers-only posts use current protected follow admission and stop appearing after revocation.

## Older posts

An unproven historical row is visible only to its currently claimed canonical owner for review. Reading it does not create evidence. The owner explicitly reviews and saves it again through `recover`, which replaces the published fields under the current account, records a new date, resets counters and pin state, and discards old arbitrary metadata and unverified safety labels. Conflicting historical audience fields are intersected conservatively; unknown restrictions become Only me. A changed legacy row invalidates the captured recovery revision. Firestore reference metadata is fingerprinted by its stable path rather than SDK internals.

An existing inconsistent or deleted protected record cannot downgrade itself to legacy recovery. Moderated, hidden or deleted content cannot be republished through recovery. Owners can deliberately delete unproven content with a current revision. Historical original authorship remains unknowable from those old mutable fields; recovery establishes a new current publication, not a retrospective certification.

## Game captures and dependent actions

Game publication atomically verifies the current capture owner, ready state, expiry and fixed post identity, then records imported status with the protected publication. Existing SDK/partner recovery accepts only a proven committed post. A forged historical row with either a foreign author or the same claimed owner cannot consume a capture. Deleted publications cannot be recreated by replaying upload completion.

Post/clip token and challenge rewards now require protected publication evidence. Comment/reaction reward checks also require a proven parent post. This does not certify every historical comment, reaction or relationship used by the wider reward system.

AI analysis captures exact post and proof versions around provider work and uses update-only semantics. The local checks inject provider behavior; no real provider request is part of this verification.

The analysis result writes canonical `ai_confidence` and the retained `ai_detection_confidence` compatibility field together, preserving the owner's `ai_override`. Malformed provider output is an error. A concurrent edit, pin, counter write, identity change, deletion or replacement can conservatively abort the result; the endpoint never recreates a missing post. The client checks account ownership again after media/frame preparation before dispatch.

## Observed playback

`recordPostView` requires `expectedOwnerUid`, `expectedProfileId` and `postId`, resolves the current canonical identity, and rechecks post admission even on a duplicate. Unproven legacy posts cannot gain views through this endpoint. Its checked receipt binds that account/post and returns `viewCount` and `counted`; an unavailable or malformed receipt never becomes a confirmed increment.

The transaction updates an existing post and uses `_post_view_receipts` to count at most once per authenticated UID/post/UTC hour bucket. `_post_view_limits` bounds all attempts, including denials and duplicates, to 60 per account per minute. Both collections deny direct client access. TTL on their `expireAt` fields bounds cleanup: a receipt expires at the second hour boundary following its bucket start, and a minute-limit record expires two hours after its bucket ends. This is not a sliding-hour unique-person metric or proof of playback duration. The UI's read lease and current admission remain separate from these bookkeeping TTLs.

## Remaining limits

Publication evidence records account intent and the published fields. Media URLs are validated strings, not proof of immutable Storage bytes, media copyright or ownership. Safe external HTTPS covers remain supported. HTTP media is restricted to the configured loopback Storage emulator in a demo project, with the preview client limited to its exact local bucket and port.

Optional sounds require current admitted sound evidence. Filters require a current approved published filter, canonical creator and block admission; historical filter authorship is a separate boundary. A legacy post whose optional association is no longer available needs an explicit supported repair before recovery; the current caption/tag review dialog does not edit those associations. Malformed older post shapes can likewise require explicit repair or deletion rather than automatic conversion.

A Vybe Check reference must belong to the publishing account and have an accepted current status. That older check does not bind an exact caption/media digest; this is not a new moderation certification system. Broader media validation, historical moderation migration, native publishing and real provider delivery remain separate work.

## Verification and rollout

The isolated demo-project publication suite passed 16 grouped checks: canonical identity, strict input, cross-user proof admission, stale edits, stable retries/tombstones, forged historical authors, long IDs, Firestore metadata, audience intersections, follower revocation, tampering, concurrent pin caps, game consumption, optional references, local media isolation, raw-rule denial and reward denial/recovery.

Surrounding emulator regressions passed: feed 25 groups, list 8, comments 14, rewards 8, token marketplace 24, partner public feed 7, partner gallery 8 and direct game-post rules 13. Legitimate fixtures deliberately seed protected proof; forgery fixtures remain unproven. Focused client/backend-mock tests cover game acknowledgement races, same-owner forgery, reward proof failures and strict reader DTOs. Parent integration owns the final full suite/build and manual publishing walkthrough.

Independent final service/hook verification passed 25 focused tests, including four tests using the real mutation service through the hook. Coverage includes unsaved fields in otherwise bound receipts, duplicate submission, lost-reply retry identity, and late account/view A→B→A results. The isolated AI suite passed 10 grouped checks with injected provider responses, including deletion/replacement and concurrent mutation; it did not call a paid provider.

Deploy matching named publication/read/comment/AI/reward/game functions, `recordPostView`, private rules and required query indexes before publishing the compatible client. Do not run a bulk historical attestation. The old client cannot write against the new rules, and the new client must not run against readers missing the publication DTO fields. Retain publication tombstones and receipts; their retention is separate from view/cursor TTLs. [DEPLOY.md](../DEPLOY.md#post-publication-and-playback-checkpoint-2026-10-04) contains the exact named dependency table, cutover order and other pending prerequisites. Leave `auth2faRequest` undeployed, preserve the separate authentication release gate, and never use a broad Functions deployment to release this change. No deployment is implied by these local checks.
