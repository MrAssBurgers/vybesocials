# Viewer-aware feed read foundation

## Known-ID preview reader and chat bubbles

`readSocialPostPreviews` accepts `{ expectedOwnerUid, expectedProfileId, postIds }`
with 1–20 distinct IDs and no extra fields. It resolves the viewer, requested
posts and author permissions in one Firestore transaction, reusing the feed's
profile/post audience intersection, private-account follow approval, block,
friendship, Close Friends, moderation and owner-alias checks. Missing and
inaccessible posts are both omitted. The receipt echoes the viewer and requested
IDs and includes only the existing presentation projection, without reaction or
bookmark state. It creates no cursors and is limited to 30 batches/minute/account.
Integration tokens cannot call it.

The client transport validates the exact receipt, requested identities, duplicate
or unsolicited results, media URLs and current account before/after transport.
It has no raw-document or copied-message fallback. `SharedPostBubble` now uses
this reader through a conversation-scoped visible-message store. Duplicate IDs
coalesce, batches contain at most 20 IDs, and requests are spaced by at least
2.5 seconds. Account/profile/epoch or conversation changes replace the store.
Offscreen messages, hidden pages and expired 30-second leases lose their
rendered content; late responses cannot restore a hidden or stopped session.
Failed reads show an explicit retry state, never copied captions or media.
Chat idle preloading also skips shared-post message snapshots. Video previews
use checked thumbnails rather than fetching video metadata automatically.
Shared-post hold menus cannot download copied message media, create stickers
from it, or copy/edit the stored post ID as ordinary text. Reply, reactions and
keeping the message reference remain available; keeping a reference grants no
new post access.

Detail pages and other legacy readers still require migration. Browser timer
throttling can delay rechecks, and multiple tabs can hit the account rate limit;
this is not instantaneous revocation or a global raw-read privacy closure.
Deploy this named function before the compatible client; do not deploy all
Functions or claim a production privacy migration from this source checkpoint.
Already delivered media URLs/bytes cannot be recalled.

## Feed reader

`readSocialFeed` is a Firebase callable for a signed-in account. Home's Global
tab uses it through `useSocialFeed` and strict `socialFeedService` parsing.
Shared personalized and Following hooks now use the same reader for Home,
Clips' short/long-video lists and Watch's related-video list. Home keeps its DNA
topic boost/reduce and chronological tie-breaking. Local uses explicit approximate
areas and author-owned per-post opt-in. Other legacy readers remain to be migrated. Integration tokens
still cannot use this endpoint. Do not describe this as a completed embedded feed.

Input: `{ expectedOwnerUid, expectedProfileId, cursor?, contentType?, feed?, area? }` where the
optional type is `post`, `short` or `video`. Extra fields are rejected.
Feed is `discover` (default), `personalized`, `following` or `local`, echoed in the receipt
and bound into the opaque cursor. A cursor cannot be transferred between feeds.
Output: `{ ownerUid, viewerProfileId, contentType, feed, posts, nextCursor }`. Each post has its
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
viewer UID, canonical profile, feed and content-type selection. They reveal no excluded post identifiers
or times, survive deletion of the boundary post, and expire after ten minutes.
Replaying a cursor rechecks all current audience decisions. It never reuses an
old permission grant. The reader is limited to 30 calls per minute per account.
The checked-in TTL policy removes expired cursor records after deployment; access
expiry is checked synchronously and never depends on TTL deletion timing. See
[Firebase's index configuration reference](https://firebase.google.com/docs/reference/firestore/indexes/)
and [TTL behavior](https://firebase.google.com/docs/firestore/ttl).

## Local selection and sharing

Local requires `area: { lat, lng }` rounded to one decimal degree before transport.
Latitude is -90 through 90; longitude is -180 inclusive through 180 exclusive.
The app normalizes +180 to -180. Precise, nonfinite, extra-field and out-of-range
values are rejected; other feed modes reject an area. Local receipts echo only
the viewer's search area, never an author's area. Opaque cursors bind the exact
coarse selection and cannot be reused for another area or feed.

`managePostLocalArea` supports `state`, `share` and `remove`, bound to the current
canonical owner/profile and post. Writes require the latest revision; sharing
also requires a coarse area. No staff override exists. Server-owned
`_post_local_areas/{postId}` stores the current author tuple, enabled flag,
revision and coarse area. Clients cannot read, write or list this collection.
Removing sharing replaces the area with null. An enabled, valid proof for the
current author is required after all ordinary audience checks. Haversine distance
between coarse area centers must be at most 40.2336 km (25 miles), including
correct dateline/polar behavior. This is approximate proximity, not verified
residence, anti-spoofing or an exact distance guarantee.

Home Local never prompts for GPS on mount or falls back to generic posts. A user
explicitly chooses an area for this view. The hook rounds GPS immediately, keeps
only the coarse value in memory, purges the former precise localStorage key, and
discards callbacks after account changes, tab exit, document hiding, clearing,
retry or unmount. Search areas are cleared from the screen on exit/hide. Server
cursor records can retain the coarse search area until TTL cleanup after their
10-minute access expiry; expiry is not a promise of immediate physical deletion.
Post areas remain until removed. Old `local-feed` disk snapshots are excluded
from serialization and restoration along with `social-feed`.

Own post options expose a rounded Local sharing dialog. Reading status must
succeed before a write is offered. Choosing an area and sharing are separate
explicit actions; no GPS is needed to remove sharing. Mutation receipts bind
owner/profile/post/action/revision and writes invalidate the authoritative feed.
The legacy `get_local_posts` RPC now throws instead of returning unrelated posts.

Local still uses bounded chronological candidate scanning. Sparse areas may need
several empty-page continuations; production needs a scalable geographic candidate
index and read-cost/latency validation. Real-device GPS prompts and native location
permissions are not certified by the synthetic-coordinate tests. Deploy
`managePostLocalArea`, `readSocialFeed`, matching rules and client together in
selective staging. Do not enable a mismatched client/backend combination.

## Personalized and Following selection

Following includes current accepted friends and canonical active follows, excluding
self. Private accounts still require explicit owner approval; friendship or a
previous automatic public follow cannot bypass that gate. Blocks, deleted or
replaced identities and every post/profile audience restriction still apply.
Cancelling a follow or removing a friendship is rechecked on the next read.
An account with no accepted friendship or active follow gets a terminal empty
page immediately, without scanning unrelated posts. Existing connections are
still checked per author; finding a connection row never grants access by itself.

Personalization sorts only admitted candidates. It retains engagement weighting
(likes 2, comments 3, views 0.1) and reaction-mood matching. Learning uses at most
100 recent reactions per canonical viewer alias, deduplicated by post. Signals
are read only for admitted post IDs (140-row bound), unknown/negative/nonfinite
signals are ignored and each strength is capped at one million. These are
ranking hints, not verified rewards or moderation. Home additionally keeps DNA
topic preferences; Clips retains its separate recent/trending display options.

All modes scan 20 chronological candidates, not every matching connection at
once. Following can have empty pages before an older friend's post; continuation
remains available instead of silently exhausting the feed. This removes the old
40-friend/per-author truncation but still needs candidate indexing and load tests
for sparse connections at large scale. Ranking is within each candidate page,
not a global score-sorted cursor. Access is always checked before ranking.

## Feed client behavior

- Reads bind to the live account epoch and canonical profile, with no raw-post,
  legacy RPC or disk-cache fallback. Strict parsing rejects wrong accounts,
  wrong types, duplicate IDs, unsafe media, unknown fields and repeated cursors.
- Pages retain opaque continuation even when every candidate is excluded.
  Existing Home retry and Load more controls handle error and filtered-page states.
- Leaving the selected feed, hiding the document or changing accounts clears its rendered
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
- Legacy personalized/Following boot warming and speculative raw-media prefetch
  have been removed. Their historical disk-cache roots are discarded on restore.
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
