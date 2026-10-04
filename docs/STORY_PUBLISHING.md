# Trusted story publication and viewing

This is a source implementation with local test coverage. It has not been deployed to production or certified on native devices.

## Publication and retries

`publishStory` requires Firebase authentication, `expectedOwnerUid`, a stable `requestId`, and uploaded image/video details. It derives the current unique author profile, rejects ambiguous UID/profile aliases, checks the configured Firebase bucket and an owned `stories/{uid}/…` or `chat-media/{uid}/…` path, and verifies upload metadata. Images/videos must be nonempty and below 50 MiB. Captions are limited to 2,200 characters; optional duration to 60 seconds; poll/question fields use their existing bounded shapes.

The story and `_story_publish_receipts/{sha256(JSON.stringify([uid, requestId, destination]))}` commit in one Firestore transaction. The destination is `my_story` or `close_friends`; the story ID is `story_` plus that hash. The receipt binds owner, profile, destination and a fingerprint of the normalized content. Creation time, 24-hour expiry and initial view count come from the server. The per-owner quota allows 50 new stories per UTC day, with a separate callable rate limit. Replays do not consume the daily quota.

The same request returns its existing live story. A changed payload is rejected. An expired, deleted or soft-deleted story returns a consumed receipt; replay never extends its lifetime or recreates it. Deletion retains the receipt. **Do not TTL or routinely delete publication receipts.** A retention migration must preserve the consumed identity, otherwise an old request could create content again.

Composer submissions retain the original request ID, owner, audience/content snapshot and successfully uploaded URL until acknowledgement. An ambiguous failure leaves the draft available for retry. A different intended draft needs a new request ID. Account and session-epoch guards suppress late UI/cache effects, including logout/login to the same UID. They cannot recall a request already accepted by the original authenticated account.

Camera queue records created by this version include `storyPublishVersion: 1`. They reuse the same draft request identity per destination, so reconnect can retry an unknown acknowledgement through the receipt. Older queued story records do not possess this guarantee and are not automatically upgraded or sent. Their warning requires the owner to inspect existing stories and start a new draft. DM retry identities and partial delivery receipts remain independent.

## Current audience admission

`listVisibleStories` requires the expected authenticated UID and current profile ID. The feed includes the viewer and currently accepted friends. Both-direction blocks override friendship. The current canonical profile's Stories visibility setting can further restrict admission: Only me denies others, and a close-friends value requires verified permission. Everyone does not expand this feed to strangers. Close-friends content additionally requires a current server-owned `_close_friend_authority` proof bound to both UID/profile tuples. The author can view their own stories. Staff claims do not grant extra access through this feed.

Feed pages examine ten authors and return at most their newest 100 active stories each. This covers the normal overlap of two 50-story UTC quotas across midnight. Author mode returns at most 100 stories; explicit ID mode accepts up to 50 IDs and applies the same audience checks. A cursor advances authors even when an entire page has no visible stories. Each accepted-friend endpoint query is bounded to 1,000 relationships; an oversized list returns an explicit error. More than 100 active legacy stories from one author are capped to the newest 100. Malformed, expired, deleted, unavailable-media and ambiguous-author rows are omitted. These bounds are operational limits, not a promise that arbitrary historical volume is fully paginated.

All direct browser reads of `stories` are denied, including known IDs and staff reads. Browser creation/update is also denied. Receipt-bound owner deletion and existing staff moderation remain supported. Raw highlight records/covers are owner-only until a separate audience-aware highlight reader is implemented; expired stories are not resurrected through highlights. Story feed/detail caches are account/epoch scoped and excluded from disk persistence. The reader refreshes current permission; an already delivered response or copied media URL cannot be recalled.

## Explicit close-friend confirmation

Historical `close_friends` documents were client writable under an unsafe update rule. They are retained as references, **never imported or accepted as viewing authority**. Owners explicitly choose people again in the updated manager.

`manageCloseFriends` accepts `action: list | add | remove`, `expectedOwnerUid`, `expectedProfileId`, and `friendId` for mutations. List returns current verified selections, `legacyReview`, and twenty verified current-friend candidates per page with `candidateNextCursor`; the optional list `cursor` advances candidates. Add validates a unique live target, an accepted friendship and no block in either direction. Proofs use a hash of the two UIDs and immutable ownership; they retain both current profile IDs. Remove records `enabled: false` and cannot create a grant. Owners can remove a retained proof even after the target profile disappears; the manager displays it as an unavailable account. Up to 500 enabled selections are supported. At that cap, adding explains that a selection must first be removed.

The new proof namespace is server-only, including reads. An old legacy-reference notice may remain while those rows exist; it does not mean that the old selections are active. Existing confirmed selections are listed separately. Changing friendship, blocking, deleting a profile or changing its canonical identity prevents that old proof from authorizing a new read. Only explicit add can confirm a new profile tuple.

## Media and remaining limitations

Authenticated Storage path reads/lists for `stories/{uid}` are restricted to the uploader or Storage admin. Authorized story responses return the existing Firebase download URL. Legacy owned `gs:` references are resolved through the configured Admin bucket's metadata and an **existing** download token; this does not mint a token, sign an IAM URL or fetch arbitrary remote media. Missing tokens/uploads are omitted. This deliberately avoids Admin `getDownloadURL`'s separate emulator-host environment variable. The exact `127.0.0.1:8082` URL is accepted only with the configured `demo-vybe-preview` emulator; production accepts the configured Firebase bucket, never an arbitrary HTTP host.

Firebase download URLs are bearer links. Previously copied URLs remain usable until the token/object changes; revoking a close-friend selection does not revoke a copied URL. Owner uploads remain mutable and removable, so the receipt guarantees story-document identity, not immutable media bytes. Metadata checks do not prove content safety or a video’s actual duration. Provider-backed story moderation, screenshot/download prevention, offline revocation, orphan-upload cleanup, durable crash recovery on physical devices, native camera permission and background suspension remain separate work. Story question-answer delivery is not implemented by this publication boundary.

## Coordinated selective rollout

Deploy the reviewed `publishStory`, `listVisibleStories` and `manageCloseFriends` exports and required indexes together with the reviewed client and Firestore/Storage rules. Do not deploy all Functions or change authentication configuration. The new namespace denies, direct story-read/write closure, owner-only raw highlight access and legacy close-friend write closure must travel with the reader/manager migration. Old clients will fail closed rather than fall back to direct publication or private reads. Git push is not a production deployment.

Indexes include story author/expiry descending, accepted-friend endpoint/status and sender/receiver/status lookups, both-direction block tuples, and private close-friend owner/enabled and owner/target lookups. See `firestore.indexes.json` for exact definitions.

## Verification

Focused tests cover transaction races, request replay/conflicts, ownership and alias collisions, quota rollback/midnight overlap, deleted/expired receipts, upload path validation, current friendship/blocks, explicit close-friend confirmation/revocation, forged historical tuples, bounded malformed rows, pagination, account ABA, optimistic-page preservation and receipt-backed camera recovery.

`scripts/test-story-publish-rules.mjs` exercises actual Firestore and Storage rules. `scripts/test-story-publish-backend.mjs` invokes the compiled callables against actual emulator Firestore transactions and Storage metadata, including an existing-token media download. Both require an explicit `demo-` project and loopback emulator hosts. Start their CLI in a separate working directory with separate `TEMP`, `TMP` and `TMPDIR`; concurrent Firebase Storage emulators otherwise share temporary blob files and can disrupt the preview. Local emulator results do not certify production IAM/index deployment, GCS behavior or native-device delivery.
