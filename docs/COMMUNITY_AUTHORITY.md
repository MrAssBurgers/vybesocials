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
| `community-send-message` | `{channelId, content?, replyToId?, clientMessageId?}` → `{message}`. Raw media URLs are refused; use the private attachment service below. |

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
- Icon media URLs must reference this Firebase project's `media/{authUid}/...` or `community-assets/{authUid}/...` namespace. This validates the ownership path, not object existence or content. Those shared icon paths and copied bearer links retain their existing access behavior. New message attachments use the separate authenticated, token-free [private attachment service](COMMUNITY_ATTACHMENTS.md); raw URLs are no longer accepted by the message sender.
- The client checks Firebase UID and an authentication epoch before and after service calls and before follow-up writes. Account changes, including A→B→A, reject stale results. Mutation success callbacks are also bound to the original mounted view. This prevents a delayed join, creation, send, or permission lookup from applying its result to another account.
- Existing unrelated presence/activity and notification features are not migrated by this change. They do not confer admission or role authority.

Deploy the five callables, shared realtime policy, matching rules, and client together as a coordinated release. The strict rules intentionally reject old browser-write clients. Confirm the owner-recovery path and communicate rejoining before switching production rules. This work changes source and local demo fixtures only; it does not deploy or alter production data.

## Verification

The focused backend tests cover atomic creation failure, invitation expiry/rotation/replay and parallel joins, forged legacy membership, owner recovery and transfer, moderation, scoped permissions, sender binding, message receipts, same-room replies, and loss of access during a transaction. The existing call-authority suite includes migrated community voice and receive-only permission regressions.

`scripts/test-community-authority-rules.mjs` runs only against a loopback emulator with a `demo-` project and contains 84 positive/negative rule checks, including private metadata/messages, forged admissions and tuples, browser-write denial, explicit malformed visibility values, and real public-discovery fixtures. Frontend tests cover both hook families, failed permission loading, request retries, original-account follow-up writes, stale completion suppression, and storage URL rendering.

## Client revocation and local session boundaries

Private community list/detail/member/room/permission queries are keyed to a reactive Firebase UID and authentication epoch. Each read checks that epoch before and after asynchronous work. A previous account's snapshot or an Alice-to-Bob-to-Alice session cannot provide placeholder data. Private queries are not kept after their final observer unmounts, and a failed authority/read refresh hides previous data instead of presenting it as current. Mounted private queries recheck every 15 seconds and on focus; browser scheduling and network delivery can delay these checks. Successful Leave or Archive invalidates the local community session immediately, including in-flight reads and voice attempts.

Channel history uses a bounded server-only Firestore read instead of falling back to offline message history. Its native listener surfaces permission errors, so displayed text, attachment elements, and composer controls are removed while a fresh check runs. Recovery requires a successful current read. Private community roots are excluded during query-cache dehydration, serialization, and restore, including old shared-origin snapshots. Public discovery remains cacheable. The page remounts its editor state for account epochs, and switching text rooms creates a separate composer lifetime.

Voice connects capture both the account epoch and an attempt identity before requesting a token. Disconnect, replacement joins, unmount, and account changes invalidate pending token/room connections, detach audio, remove room listeners, and disconnect the owned room. Late callbacks cannot attach old audio or change the new connection. The client checks current channel permission after joining, every 15 seconds, on resume/reconnect, and before enabling the microphone. A failed or ten-second stalled check disconnects this client; loss of send permission disables its microphone. A newer mute/deafen action also cancels a pending unmute. These are cooperative client controls, **not provider-side token revocation**. Copied one-hour LiveKit JWTs and participants using another client remain a provider-integration follow-up.

New attachments render a placeholder until explicit Open, then use authenticated byte delivery and current channel admission; see [private attachment limits and lifecycle](COMMUNITY_ATTACHMENTS.md). Historical media URLs are not loaded and ask the sender to re-share. No scan claim is shown without a scan result. Removing a displayed element does not erase downloaded bytes, screenshots, or copied historical bearer URLs. Existing shared `media` and `community-assets` paths retain their previous access behavior; migrating those objects remains separate work. No production migration or provider call occurs in this change.

Focused client regressions cover denied refreshes, native listener denial while a read remains pending, reactive Auth readiness, ABA and late results, successful Leave invalidation, old disk snapshot removal, actual text/media/composer removal, protected Reveal behavior, pending voice token/room cancellation, old-room events, sign-out/unmount, resume/reconnect, permission loss, timeout, and competing microphone controls. These tests mock provider transport and do not claim a live LiveKit integration test.
