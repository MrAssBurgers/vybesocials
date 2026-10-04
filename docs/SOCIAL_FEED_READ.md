# Viewer-aware feed read foundation

`readSocialFeed` is a Firebase callable for a signed-in account. Home's Global
tab now uses it through `useSocialFeed` and strict `socialFeedService` parsing.
For You, Local and other legacy readers remain to be migrated. Integration tokens
still cannot use this endpoint. Do not describe this as a completed embedded feed.

Input: `{ expectedOwnerUid, expectedProfileId, cursor?, contentType? }` where the
optional type is `post`, `short` or `video`. Extra fields are rejected.
Output: `{ ownerUid, viewerProfileId, contentType, posts, nextCursor }`. Each post has its
ID, type, caption, creation time, media URLs, thumbnail, age label, tags, and a
minimal author presentation. It also includes sanitized nonnegative safe-integer
counter snapshots, pinned state, and the current viewer's reaction/bookmark state.
Counter snapshots retain existing UI behavior; they are not verified engagement,
moderation or reward authority. Interaction queries run only for admitted post IDs
and canonical viewer aliases, capped at 100 rows per alias/collection. Excess rows
fail with a repair error, never a partial or invented reaction state.
Raw documents, auth UIDs of authors, emails, roles, moderation internals and
arbitrary fields are not projected.

Every call resolves the canonical viewer and authors inside one Firestore
transaction. It checks profile section settings, current accepted friendships,
directional server-owned Close Friends proof, and UID/profile blocks in both
directions. Explicit post `visibility`, `audience` and `is_private` restrictions
are intersected with the profile setting. Unknown levels and conflicting owner
aliases deny. Deleted, hidden, removed, draft and unapproved rows are omitted.
Staff claims do not bypass these checks.

Pages scan at most 20 posts plus one lookahead, ordered by `created_at` descending
then document ID descending. Excluded content can produce an empty page with a
non-null next cursor; callers must offer continuation, not report an empty feed.
Firestore's native ordering applies to historical mixed timestamp types.
New content is obtained by refreshing the first page. No cross-page snapshot or
ranking guarantee is made. Missing `created_at` rows are absent from the query.

Cursors are random 24-byte references to server-owned boundary records, bound to
viewer UID, canonical profile and content-type selection. They reveal no excluded post identifiers
or times, survive deletion of the boundary post, and expire after ten minutes.
Replaying a cursor rechecks all current audience decisions. It never reuses an
old permission grant. The reader is limited to 30 calls per minute per account.
The checked-in TTL policy removes expired cursor records after deployment; access
expiry is checked synchronously and never depends on TTL deletion timing. See
[Firebase's index configuration reference](https://firebase.google.com/docs/reference/firestore/indexes/)
and [TTL behavior](https://firebase.google.com/docs/firestore/ttl).

## Global feed client behavior

- Reads bind to the live account epoch and canonical profile, with no raw-post,
  legacy RPC or disk-cache fallback. Strict parsing rejects wrong accounts,
  wrong types, duplicate IDs, unsafe media, unknown fields and repeated cursors.
- Pages retain opaque continuation even when every candidate is excluded.
  Existing Home retry and Load more controls handle error and filtered-page states.
- Leaving Global, hiding the document or changing accounts clears its rendered
  data. Returning uses a new query generation; aborted or late reads cannot
  populate that generation. Permission-read errors hide the old page instead of
  displaying stale data. Account-bound feed pages are excluded from disk writes
  and restoration, including old snapshots.
- Current visible pages refresh every 30 seconds, on focus/reconnect and relevant
  follow/post changes. Already delivered bytes cannot be recalled. This polling
  is not instantaneous revocation, and browser scheduling can delay it. Long
  sessions with many pages can hit the existing 30-call/minute limit; the client
  shows a retry state rather than falling back to unfiltered data. Production
  read cost, latency and long-scroll behavior still need staging measurement.
- Reactions and saved-post state are preserved without fetching raw posts on this
  path. Missing legacy reaction cleanup records are checked on the server before
  deletion; concurrent absence is distinguished from genuine permission errors.

## Remaining release gates

- Private accounts admit their owner or a current canonical, owner-approved
  `_follow_authority` grant from `manageFollow`. Existing legacy `follows` rows
  never prove approval, even if they claim an approved status. Both-direction
  blocks and profile/post audience restrictions still apply after approval.
  See [follow approval lifecycle](FOLLOW_APPROVALS.md).
- This is content-access admission, not a trusted moderation or age attestation.
  Existing post age labels are returned explicitly, including `unrated`, and
  must not become permission to show restricted media to a minor. The partner
  feed needs an authoritative age/content policy before enabling its scope.
- Media and avatar HTTPS links are existing legacy URLs, not revocable proxy
  grants. No remote URL is fetched or newly signed by this reader. Delivered
  URLs/bytes cannot be recalled; integration media needs controlled delivery.
- Raw posts/profile rules still permit other access paths. The callable does
  not retroactively make legacy content private or change those rules.
- Migrate the remaining app readers and wire the partner SDK with account-epoch checks,
  strict response parsing, clear-on-hide/disconnect behavior, and pagination UI.
  Keep default partner capture permissions unchanged until reviewed consent is
  implemented. Then test real integration, browser and native hosts.
- Stage the updated `readSocialFeed`, matching client, interaction indexes,
  cursor rules and TTL policy together. Check
  deployed indexes and latency at real account sizes before production rollout.
  Never deploy every Function or change production auth2faRequest for this work.
