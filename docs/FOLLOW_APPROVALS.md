# Follow requests and private-account approval

The `manageFollow` callable is the only client follow writer. It supports `state`,
`list`, `request`, `approve`, `decline`, `remove` and `unfollow`. Every request
includes `expectedOwnerUid` and `expectedProfileId` matching the current account.
State/request take a canonical `targetId`; owner decisions and unfollow take the
returned `relationshipId`. Writes include the last observed integer `revision`.
List selects `view: requests | followers` and an optional document-ID cursor.

Public follows become active immediately, with `approved_by_owner: false`.
Private follows remain pending until their owner approves. Changing a public
account to private never upgrades public auto-follows into private approval.
The follower requests approval again. A decline, cancel or removal increments
the revision and clears access; old decisions cannot act on a replacement
request. An uncertain/retried write can return a stale-revision error, so the UI
refreshes state instead of asserting success. Repeated current pending/active
requests are no-ops without duplicate notifications.

Authority lives in the server-only `_follow_authority` collection under a hash
of the directional owner/follower UID pair. Current canonical profile mappings,
two-way UID/profile blocks, exact proof tuples and revisions are checked in a
transaction. Owners may revoke retained records after a follower profile is
deleted. Approving requires both current identities. There is no staff bypass.

The old `follows` collection remains a readable count/list projection, with
client writes denied. The callable removes at most 100 matching legacy aliases
and writes one canonical projection for active follows. More than 100 matching
rows require repair instead of an unbounded transaction. Legacy follows are
not silently adopted as approval: the new button requires a fresh follow action,
which reconciles that pair. Other legacy rows can still affect displayed counts
until reconciliation. Bulk migration and count cleanup remain separate work.

Profile, hover-card and clip follow controls use server receipts. Pending reads
and failures cannot become optimistic success. The request manager is in Privacy
settings with Requests and Followers tabs, pagination, retry and owner actions.
Requests generate a server-written notification linked to Privacy settings;
public follows retain their usual follow notification. Decision actions do not
send separate approval/decline notices in this version. Requests are limited to
10 per hour per actor/target and all follow operations to 90 per minute/account.
Follow authority/list caches are excluded from disk persistence and use account
epochs, current-session guards and fifteen-second refreshes.

The new social feed reader uses approved grants for private-account admission.
It still intersects these with the author's section and post restrictions:
following never grants Close Friends or friendship-only content. Legacy raw
post reads, ranked/recommendation callables, share previews and already-issued
media URLs are not globally secured by this change. Do not claim universal
private-post enforcement until those paths are migrated and media is controlled.

## Rollout

Stage the callable, updated clients, `_follow_authority` list index and rules
together. Older clients attempting direct follows will receive a denial; do not
deploy rules ahead of the replacement clients. Production auth and provider
functions are outside this change. No production deployment is implied by a
source push. Local preview exports include `manageFollow` and `readSocialFeed`.

Validation includes client receipt/account guards, button and manager behavior,
disk-cache exclusion, real Firestore transactions, private feed admission,
simultaneous approve/cancel, stale decisions, blocks, deleted identities,
notification replay and client proof/projection write denial.
