# Post reader stability — 2026-10-04

This pass moves existing cross-user post views behind current server admission. It does not establish historical publication ownership, and does not certify every feature of the app.

## Current read boundary

`readSocialPostList` handles profile posts, saved posts, sound/filter results, search, tagged posts, and recent-post summaries. Existing `readSocialFeed` and known-ID preview readers remain the feed and detail boundaries. Each request binds the signed-in Firebase UID to its canonical profile, then checks current bilateral blocks, account privacy, section audience, post audience, deletion, draft, and moderation state. Responses contain a bounded projection; private raw document fields are excluded. Saved references do not grant content access. An unavailable saved post remains removable using a neutral reference without its old content.

Legacy ranked-feed and recommendation callables now use this same admission. The MCP recent-post tool uses the checked owner list. Anonymous share previews and sitemap entries require an explicitly public post, a public section, and an explicitly public author account. They do not reuse a signed-in viewer's friendship or self access.

Direct Firestore post reads are restricted to the canonical owner or staff. Source rules also reject UID/profile identity collisions. Raw owner reads needed by publishing, pinning, creator analytics, weekly recap, and owner post nudges remain; staff analytics remain staff-only. The legacy generic `firebase/posts.ts` and `feedRpc.ts` helpers still exist, but mounted cross-user views no longer rely on them or fall back to them after callable failure. Map post pins are a separate collection and are outside this migration.

## Visible views and paging

Feed, list, and summary payloads have a 30-second read lease that starts before transport. Views refresh every 20 seconds; a failed refresh or expired lease hides their old payload. Closing a surface, hiding the document, changing selection, or changing account/epoch retires the old view. Cached posts are excluded from persistent query storage. These readers explicitly disable the application's inherited keep-previous placeholder behavior and request a fresh read on mount.

Infinite readers retain at most four pages in the current group. Loading a fifth page requires the labeled **Continue to older posts** action, which replaces the group. **Newer posts** reads the preceding group again, and **Back to newest posts** recovers from an expired cursor. Loading more within a group never automatically evicts rows above the reader. Opaque boundaries, rather than post payloads, are kept for group navigation. Each four-page reader therefore refreshes at most 12 page requests per minute at the regular 20-second interval; two Home feed readers remain at most 24 before manual/focus requests against the 30-per-minute feed quota. Rate-limit errors remain visible and retryable. List readers use a separate 120-per-minute quota.

Visible profile and activity summaries scan at most three pages per refresh. A remaining cursor makes the displayed count a lower bound (`60+`), never an exact total. Failed or expired counts display unavailable rather than zero. Hover summaries remain disabled while their hover card is closed. These bounds prevent scrolling from creating an ever-growing refresh workload; unusually many simultaneous active views or manual refreshes can still reach rate limits.

List post cards refresh comment counts through the existing batched comment authority. A newer parent denial from that authority suppresses the post immediately. Summary reads do not fetch comment counts. Historical post IDs longer than 128 characters remain pageable, but the older comment API still accepts only IDs up to 128 characters; those unusual IDs retain their presentation count and need a separate comment-contract migration. Like counters and existing feed counters remain presentation snapshots, not independently certified totals.

## Remaining publication gap

Historical posts were writable under older rules that permitted author reassignment. Current audience checks evaluate the current claimed author; they do not prove who originally published a legacy document. This pass deliberately does not auto-attest historical rows. A protected publication proof, migration of every publishing entry point, and deliberate owner recovery/replacement for old rows remain necessary before claiming historical authorship protection.

Owner AI-detection metadata writes also retain an older asynchronous merge-after-read path; deletion during that operation needs a separate mutation audit. No AI provider was called in this pass.

## Rollout requirements

The client requires the `readSocialPostList` export, its compiled authority helper, and the checked legacy/public-return handlers. The `_social_post_list_cursors` collection is server-only, with TTL on `expires_at`. Deploy the new callable and required post/bookmark/tag query indexes before switching traffic to the matching client and narrowed post-read rules. Verify indexes are ready; a missing index must remain a retryable read failure, not a raw fallback. An old client still using broad raw post queries will fail against the new rules.

All verification in this pass used local source, isolated demo-project emulators, and the retained local preview. No production Firebase deployment or provider operation is implied.

## Verification

- New post-list emulator suite: 7 grouped checks covering every list scope, current revocation, saved recovery, aliases/collisions, protected cursors, legacy public-return handlers, strict raw owner rules, and long document IDs.
- Existing feed emulator regression: 25 grouped checks, including current privacy, friendships, blocks, deletion, pagination, Local consent, external access, and known-ID previews.
- Client contract/lifecycle coverage includes malformed receipts, delayed account/view results, visibility expiry, saved-page rejection winning over older payload, explicit four-page groups, production keep-previous cache defaults, and unavailable saved removal.
- Parent integration owns the final app build, full test/lint suite, and manual route verification.
