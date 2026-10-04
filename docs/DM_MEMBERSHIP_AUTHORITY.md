# Conversation membership repair

Client repair must prove an existing relationship to the conversation. Knowing a conversation ID, owning a newly submitted `user_id`, or adding oneself to a new `member_ids` array is not proof.

The rules accept these existing authorities:

- The current Auth UID or indexed legacy profile ID appears in the stored conversation's `member_ids`.
- A canonical flat membership at `${conversationId}_${identity}` stores that exact `conversation_id` and `user_id`.
- A nested membership at `conversations/{conversationId}/members/{identity}` stores that `user_id`; if it includes `conversation_id`, that must match too.
- The stored conversation creator can repair membership without changing ownership.

Imported random-ID flat membership rows can repair only their owner's aliases. A new canonical row includes `legacy_membership_id` referencing the existing source. Rules verify the source owner, conversation, and role. Client updates cannot rewrite membership identity, conversation, role, or proof fields. Creating a new unproven random membership is denied.

Conversation updates preserve `created_by`, `id`, `is_group`, `type`, and all existing members. A client cannot reclassify a direct conversation as a group to bypass direct-message block checks, including by adding a previously absent flag. Repair may append only the current account's UID/profile aliases. The client uses an atomic union so a two-person repair does not overwrite a group's participant list or a concurrent update. Invitations, removals, and role changes require trusted server operations.

## Recovery limits

Clients may recreate only their own deterministic two-person conversation. The two identities must be encoded by the existing `identityA_identityB` format and the caller must own one side. Additional members and group metadata are rejected. This format assumes neither identity contains `_`; ambiguous legacy IDs require operator repair.

Random-ID conversations and deleted group parents cannot be recreated by a client, even by a historical member. Otherwise a member could claim a deleted group's creator role and expose orphaned history. Existing validated membership can still authorize that member's reads, but restoring the parent, original creator, and full membership requires a trusted migration. An imported row with missing/wrong identity fields or no trustworthy source also requires migration; there is no blanket self-seed fallback.

Deleting one membership row is not revocation if the identity remains in a parent list, another alias row, or an imported proof. A server removal must reconcile every source of membership authority. New rules cannot determine whether a structurally correct historical membership was forged under older permissive rules. Before deployment, operators should evaluate historical membership integrity using trusted migration records/audit evidence. This change did not inspect production private content or perform any production migration.

## Calls

A call attached to a conversation requires established conversation membership for client creation or update. The conversation, caller, receiver, and participant list are immutable on updates. Legacy standalone calls retain authorized caller/receiver updates. Server room-token checks remain necessary because older call documents may predate these restrictions.

The message, call, and room-token functions now share stored-membership validation. A hinted recipient must already have provable membership in an existing conversation; only an owned deterministic pair can create a new parent. Message/call writes and alias repairs run after validation in the same transaction. Repairs preserve existing roles, mute/pin preferences, and other participants. Direct-pair block checks also apply before issuing a conversation room token. A cached message ID does not bypass current membership validation.

Standalone call rooms use a separate `standalone_` namespace. Community room IDs use a hash of the structured server/channel pair, and the channel must be a voice channel belonging to the verified server. The canonical community token issuer and spaces alias share this behavior. Tuple checks do not solve the separate private-community admission-rule audit.

Coordinate the room-name rollout and have clients reconnect using the returned room. Previously issued standalone/community tokens retain their old room and one-hour JWT lifetime; this source change does not eject connected participants or revoke old tokens. Direct-conversation room names are preserved. Do not deploy room naming independently of the corresponding token issuers and compatible clients.

## Verification

`scripts/test-dm-membership-authority.mjs` runs only against a `demo-` project and a loopback Firestore emulator. It covers takeover attempts, forged composite paths, cross-account/cross-conversation proofs, profile/UID migration, message reads, deleted-parent handling, and call authority. `src/lib/dmMembershipRepair.test.ts` exercises atomic alias merging, safe deterministic restoration, legacy proof propagation, and rejection of malformed readiness records. No live test messages are sent.

`src/lib/conversationAuthority.backend.test.ts` tests the shared server boundary, peer hints, role/preference preservation, membership/block changes, legacy groups, and collision-resistant room admission with mocked Firestore and token creation. These tests are not a two-device live audio/video certification.
