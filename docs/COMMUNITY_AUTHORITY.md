# Community admission and permissions

Community creation, joining, role changes, and messages now pass through authenticated Firebase callables. Browser writes to servers, channels, memberships, permissions, and channel messages are denied. Both community hook families use the same service. Public discovery does not grant chat or voice access.

## Authority and migration

- The current server `owner_id` is the owner anchor. It may identify the verified profile or its Firebase UID. New server creation binds it to the caller's verified profile; only the ownership-transfer transaction changes it.
- Membership comes from server-written `community_admissions/{authUid}/grants/{serverId}`. The stored UID, server ID, active flag, and role must match. `community_rosters/{serverId}/members/{authUid}` is the member-list projection.
- Historical `server_members` rows are quarantined. Their browser-editable roles and admission claims are never promoted automatically. Existing private communities therefore require owner recovery and fresh invitations; public members can rejoin from Discover. Trusted owners reassign administrator and moderator roles after rejoining.
- The owner's community list shows a **Restore community access** flow when the owner grant is absent. Recovery preserves existing rooms and messages, creates default rooms only if none exist, resets the invitation, and starts counting verified admissions. It does not import historical membership counts or roles.
- Recovery assumes the stored owner anchor is legitimate. It cannot reconstruct historical ownership from potentially edited records. A missing, compromised, or incorrectly migrated owner/profile mapping requires an operator investigation; no bulk production repair has been performed.
- Archiving retains server and channel identities and history. It prevents new ordinary member reads, messages, invitations, and voice tokens. There is no namespace recycling or archive-restoration interface in this release.

## Callable contracts

All requests require Firebase Auth and a verified caller-owned profile. The front end passes no authoritative sender or role fields. Function exports use camelCase; the client adapter accepts the kebab-case names below.

| Function | Request and response |
| --- | --- |
| `community-create` | `{name, description?, isPublic?, requestId}` → `{server}`. `requestId` is 16–80 letters, digits, `_`, or `-`. Identical retries return the same receipt; changed creation details conflict. |
| `community-join` | Exactly `{serverId}` for public discovery, or `{inviteCode}` for an invitation → `{server, alreadyMember}`. |
| `community-invite` | `{serverId, action: "regenerate"}` → `{inviteCode, expiresAt}`. Owner or administrator only. |
| `community-manage` | `{action, ...}` with the actions below. |
| `community-send-message` | `{channelId, content?, mediaUrl?, mediaType?, replyToId?, clientMessageId?}` → `{message}`. |

`community-manage` supports `discover`, `listMine`, `listChannels`, `listMembers`, `permissions`, `listPermissions`, `recoverOwner`, `leave`, `removeMember`, `setRole`, `transferOwnership`, `updateServer`, `deleteServer`, `createChannel`, `deleteChannel`, `setPermission`, `editMessage`, `deleteMessage`, and `pinMessage`. IDs are explicit in each request; channel operations verify that the channel belongs to the authorized server. Message actions bind the stored message to that channel.

Creation is atomic across the server, five default rooms, owner admission, roster, invitation, quota, and immutable request receipt. Message creation is atomic across its server-bound payload and immutable retry receipt. Reusing an ID with changed content, a forged historical message, a different sender, or a different room conflicts instead of acknowledging an unrelated message. Browser compose retries retain the ID until successful acknowledgment or a changed draft. Same-channel replies are validated before creation.

## Invitations, roles, and private rooms

Invitations contain 192 random bits, have a seven-day expiry and 1,000-redemption limit, and resolve through a server-only SHA-256 lookup. Only a currently matching, unexpired invitation admits a new member. Rejoining an existing trusted admission does not consume another use. Rotation revokes the old lookup; switching a public community to private rotates automatically. Expiry is visible in the settings UI. Current members can share their community invitation, preserving the product's invite-only model.

Owners and administrators manage rooms, settings, and invitations. Only the owner promotes or demotes trusted members or transfers ownership. An administrator cannot remove another administrator or the owner. The owner must transfer ownership to a current trusted member before leaving. Removing a member is a kick, not a persistent ban: a public community or valid invitation can admit them again.

Channel visibility defaults to all admitted members for ordinary rooms and to owners/administrators for private rooms. Scoped moderator/member overrides may grant or deny visibility. An explicitly malformed visibility value fails closed. Owner/administrator management permissions are fixed and are not presented as editable switches. Announcement rooms allow moderators, administrators, and the owner to post; an ordinary member cannot enable posting through a permission override. Message authors may edit or remove their verified messages; moderators may remove other messages. Unverified historical author fields do not qualify for self-editing.

Voice and legacy `room_type: "live"` channels use the same current admission and visibility policy. Receive-only permission produces a token without media/data publication. Tokens use the existing disjoint, hashed room names. Membership removal or permission changes prevent new tokens, but **existing one-hour tokens and already connected LiveKit participants are not revoked by Firestore changes**. Immediate disconnection requires a provider-side revocation workflow that is outside this change.

## Limits and operations

- Five new communities per account per rolling 24-hour window; replayed creation receipts do not consume another creation allowance. Request-level limits also apply.
- A community supports 100 lifetime channel identities, including archived channels. Deleting a channel does not free its identity slot. The creation dialog states this limit.
- Current list responses are bounded: up to 100 admissions plus 100 owned communities, public discovery scans 100 and returns up to 50, channel lists allow 100, and member lists allow 200. Larger member lists return an explicit capacity error; pagination is future work. Joining itself does not cap community size at 200.
- Creation and message receipts are retained for stable retries. The generic rate-limit collection and these receipt collections have no automatic retention cleanup introduced by this change; operators must size and manage retention deliberately.
- Message and icon media URLs must reference this Firebase project's `media/{authUid}/...` or `community-assets/{authUid}/...` namespace. Arbitrary external URLs and another account's namespace are rejected. This validates the ownership path, not object existence or media content. Existing Storage access and download-token behavior are unchanged: channel privacy alone does not make shared download URLs private. A separate Storage authorization migration is required before promising private media delivery.
- The client checks Firebase UID and an authentication epoch before and after service calls and before follow-up writes. Account changes, including A→B→A, reject stale results. Mutation success callbacks are also bound to the original mounted view. This prevents a delayed join, creation, send, or permission lookup from applying its result to another account.
- Existing unrelated presence/activity and notification features are not migrated by this change. They do not confer admission or role authority.

Deploy the five callables, shared realtime policy, matching rules, and client together as a coordinated release. The strict rules intentionally reject old browser-write clients. Confirm the owner-recovery path and communicate rejoining before switching production rules. This work changes source and local demo fixtures only; it does not deploy or alter production data.

## Verification

The focused backend tests cover atomic creation failure, invitation expiry/rotation/replay and parallel joins, forged legacy membership, owner recovery and transfer, moderation, scoped permissions, sender binding, message receipts, same-room replies, and loss of access during a transaction. The existing call-authority suite includes migrated community voice and receive-only permission regressions.

`scripts/test-community-authority-rules.mjs` runs only against a loopback emulator with a `demo-` project and contains 84 positive/negative rule checks, including private metadata/messages, forged admissions and tuples, browser-write denial, explicit malformed visibility values, and real public-discovery fixtures. Frontend tests cover both hook families, failed permission loading, request retries, original-account follow-up writes, stale completion suppression, and storage URL rendering.
