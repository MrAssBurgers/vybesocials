# Viewer-aware feed read foundation

`readSocialFeed` is a Firebase callable for a signed-in account. This source
checkpoint does not switch Home to the reader or expose it to integration tokens.
Those transitions require the matching UI, partner consent, age authority and
media delivery work below. Do not describe this as a completed embedded feed.

Input: `{ expectedOwnerUid, expectedProfileId, cursor? }`. Extra fields are rejected.
Output: `{ ownerUid, viewerProfileId, posts, nextCursor }`. Each post has only its
ID, type, caption, creation time, media URLs, thumbnail, age label, tags, and a
minimal author presentation. Raw documents, auth UIDs of authors, emails, roles,
moderation internals, arbitrary fields and unverified counters are not projected.

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
both viewer UID and canonical profile. They reveal no excluded post identifiers
or times, survive deletion of the boundary post, and expire after ten minutes.
Replaying a cursor rechecks all current audience decisions. It never reuses an
old permission grant. The reader is limited to 30 calls per minute per account.
The checked-in TTL policy removes expired cursor records after deployment; access
expiry is checked synchronously and never depends on TTL deletion timing. See
[Firebase's index configuration reference](https://firebase.google.com/docs/reference/firestore/indexes/)
and [TTL behavior](https://firebase.google.com/docs/firestore/ttl).

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
- Wire the app and partner SDK to this contract with account-epoch checks,
  strict response parsing, clear-on-hide/disconnect behavior, and pagination UI.
  Keep default partner capture permissions unchanged until reviewed consent is
  implemented. Then test real integration, browser and native hosts.
- Stage `readSocialFeed`, the cursor rules and TTL policy selectively. Check
  deployed indexes and latency at real account sizes before production rollout.
  Never deploy every Function or change production auth2faRequest for this work.
