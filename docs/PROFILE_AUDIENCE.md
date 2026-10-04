# Friend-profile section permissions

`resolveProfileVisibility` now evaluates the current authenticated viewer, canonical target, accepted friendship, two-way blocks, section settings and fresh Close Friends proof in one Firestore transaction. It returns section flags; it does not return profile or post content and does not replace their separate data-access rules.

## Request and response

The request requires `target_id` (the canonical profile ID), `expectedOwnerUid` (captured Firebase Auth UID) and `expectedProfileId` (captured viewer profile ID). Missing or mismatched account binding fails before rate-limit/profile work. The resolver rejects missing, deleted, duplicate, index-rebound or ambiguous UID/profile identities rather than falling back to a guessed UID. The callable permits up to 60 requests per authenticated account per minute.

The response contains `ok: true`, `ownerUid`, `viewerProfileId`, `targetProfileId`, `fields`, `settings`, `isSelf`, `isFriend` and `isBlocked`. `fields` contains booleans for exactly these existing settings:

| Field | Default |
| --- | --- |
| bio | friends |
| followers | public |
| following | public |
| level | friends |
| activity | friends |
| location | friends |
| posts | public |
| clips | public |
| stories | friends |
| mutual_friends | friends |
| vybe_dna | friends |

An absent settings document, or an absent field in a valid map, uses that explicit default. Unknown fields are not added to the response. Unknown values become `unavailable` with a false flag. A malformed fields map or contradictory stored `id`/`user_id` makes every field unavailable. The server does not echo arbitrary malformed values.

`public`/`everyone` preserve existing public section behavior. `friends` requires an accepted relationship whose stored parties match the validated aliases; a deterministic document name alone is insufficient. `close_friends` additionally requires the target's current, enabled `_close_friend_authority` proof bound to both UID/profile tuples. Historical client-writable `close_friends` rows are never authority. `only_me`/`private` permit the owner. Self access remains available for recognized settings; malformed settings deny. A block in either direction denies every nonself section, including public ones. Staff claims do not bypass these checks.

## Shared implementation and client requirements

`functions/src/_shared/profileAudienceAuthority.ts` contains the neutral identity/proof helpers and resolver. It imports neither callable modules nor the application Admin singleton. Story and Close Friends code import this module, so there is no dependency cycle through story publication or Storage.

The client must verify every response identity against its captured account and selected profile, validate all known flags/settings, and suppress late results across account changes including A–B–A. A failed or malformed response must show an unavailable/retry state rather than default private sections to visible. Permission results must not restore from shared disk caches. A response already delivered cannot be recalled; renewed checks provide current decisions.

The existing settings writer uses the canonical profile ID as `profile_visibility/{ownerId}` and as its optional `id`/`user_id` metadata. The coordinated rule change must reject UID/profile collisions, retain existing ownership, validate the bounded known fields/levels, and keep malformed historical rows removable by their actual owner. Do not silently translate old unknown settings into more permissive values. Previous client-writable preferences lack historical attestation; this pass cannot establish who wrote every retained row.

## Scope and release limits

This fixes the section-permission resolver and its coordinated UI contract. It does **not** make all existing profile fields or posts private: their raw reads, independent feeds and shared media URLs remain separate boundaries. It adds no new section names, aliases such as `score`/`friends_list`, or new public access. Mapping inconsistencies among older labels need their own reviewed migration. Existing story admission separately checks its fresh permissions.

Coordinate the reviewed `resolveProfileVisibility` callable, strict settings rules and guarded client. Old unbound callers fail closed. Do not deploy every Function or change authentication configuration. Source/CI completion does not imply production deployment or a global profile-privacy guarantee.

## Verification

`src/lib/profileAudienceAuthority.backend.test.ts` covers default/public/self preservation, ordinary versus verified close friends, forged historical grants, wrong directional proofs, malformed values, blocks, identity collisions, mismatched bindings, deterministic friendship collisions, database failure, and revocation during transaction retry. The existing story backend suite guards the neutral-helper extraction.

`scripts/test-profile-audience-backend.mjs` runs the compiled callable against actual Firestore emulator transactions. It requires an explicit `demo-` project and loopback `FIRESTORE_EMULATOR_HOST`, resets only that disposable demo database, and performs no provider calls. Run it in an isolated working directory with distinct `TEMP`, `TMP` and `TMPDIR`. Local emulator tests do not certify production rules/index rollout or historical data integrity.
