# Durable feed mutes

Feed mute is a private, account-bound preference that hides an author's posts, clips and long videos from discovery feeds. It does not block an account, send a report, mute notifications or prevent messages. An explicitly visited profile and an explicitly opened clip remain available. Stories, search-result people and community-specific discussions are outside this control's current scope.

## Storage and identity

The browser uses authenticated Firestore transactions at `feed_mutes/{authUid}/authors/{targetProfileId}`. A new record has exactly `schema_version: 1`, `owner_uid`, `target_profile_id`, `target_uid` and a server `created_at` timestamp. Rules check the target profile's current Auth UID, reject self-mutes and grant access only to the path owner. Staff receive no private-list bypass. Creates are immutable; an owner can delete a record, including a malformed historical record or a mute whose target profile was deleted. A missing deletion is a safe retry.

The service resolves migrated profile IDs and Auth UID references to one canonical profile before saving, then rechecks its UID in the transaction. Filtering recognizes both aliases. No local-only success is used: the menu, Undo and Settings acknowledge completion only after the server transaction returns. Query cache updates also require the initiating Auth UID, session epoch and relevant component/target lifetime to remain current. Same-account logout/login invalidates old operations. Undo may outlive its menu, but never its account epoch.

Reads page through the full private collection in batches of 200. Settings displays 25 entries at a time and can remove malformed records without granting their unverified UID filtering authority. The feed waits for a complete valid mute list; a failed list read shows retry instead of quietly showing muted authors. The account observer is reactive so restoration of Firebase Auth resumes an initially disabled read. All `feed-mutes` queries, including display-name lookups, are excluded from persisted query snapshots and stripped from old snapshots during hydration.

## Feed behavior

Filtering is applied to query observers rather than destructively editing cached posts. Home For You/following/global/local, Explore's post results, Watch, Clips/long videos and appended clip-viewer recommendations use the same alias set. Unmute restores already cached posts immediately. Pagination decisions still use raw pages. When a page contains no visible items but has a next cursor, Home/Clips/Watch offer **Load more** explicitly; they do not automatically scan unlimited hidden pages. Automatic video pagination also stops after a later page adds no visible posts, repeats existing posts, or fails. Home retains a manual footer while a raw next cursor exists and only claims “caught up” on exhaustion. The already-opened clip remains visible if recommendations or mute preferences fail, alongside retry and a Settings route.

The menu uses **Feed mute settings** while its saved state is loading, avoiding a false “Mute” label for an already-muted account. Settings → Privacy → Muted in feeds offers unmute and malformed-record removal. Other tabs/devices refresh preferences on focus, reconnect and periodic reads; this is not a realtime cross-device listener.

## Coordinated source rollout

This is a source change, not a production deployment. Deploy the reviewed `feed_mutes` rules and compatible client together. The old placeholder menu never saved mutes and has no state to import. Shipping the client against rules that still deny the namespace will leave personalized feeds at a truthful unavailable/retry state until the rules are updated; an empty-list fallback would disclose content the account intended to hide and is deliberately absent. No function deployment, auth configuration or migration of unrelated block/report records is required.

Unit/component checks cover acknowledged writes, safe retries, account/target changes and logout/login, migrated aliases, deleted targets, full pagination, malformed-row recovery, private cache exclusion and empty-page continuation. The separate demo-only `scripts/test-feed-mute-rules.mjs` exercises actual access rules and a real timestamped transaction. Browser checks must use synthetic accounts and the isolated preview described in `LOCAL_PREVIEW_QA.md`; they are not production or native-device certification.
