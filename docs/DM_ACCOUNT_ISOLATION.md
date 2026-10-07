# Private chats across account changes

The isolated browser walkthrough exposed a client cache leak: the inbox selected the largest cached conversation list across all accounts, then reused it for an account with an empty inbox. Firestore access control did not prevent already-cached text from appearing. This checkpoint removes that fallback and treats private display data, drafts and pending sends as belonging to a specific authenticated account.

## Cache and UI boundaries

- Message, conversation-list and conversation-detail keys include the Firebase UID and a monotonic account epoch. Signing out and back into the same UID starts a new epoch. Profile aliases must have a verified UID owner.
- List/detail warmers, subscriptions, notifications, pagination and message actions capture that session. Old callbacks cannot fill the new account's cache or show confirmations after a switch.
- Shared query persistence excludes private DM roots both when saving and before restoring older snapshots. Legacy unscoped caches are never used as private-data fallbacks. This is not a forensic erasure of historical browser storage.
- Thread local state remounts for the account/epoch/conversation. Unsent drafts use account-specific sessionStorage and never import ownerless localStorage drafts.
- Cached messages may cover a transient network failure for their own session. An access denial cannot be overwritten by a later failed retry. A subsequent successful server read may establish access again. Confirmed conversation denial hides sending and capture controls.

## Sending and offline work

### Existing pin and mute controls (2026-10-06 release)

The inbox and its actions use the same viewer-membership selector: require this conversation's membership tuple, prefer the owned profile ID, and otherwise accept the live Firebase UID. Pin/mute verify the selected existing document with a server read and await the Firestore update acknowledgment. A missing, denied or mismatched membership fails; this path never creates or repairs a membership.

Immediate feedback updates only populated inbox keys for the captured UID/epoch and owned profile/sign-in aliases. Legacy keys and other sessions are untouched. Rollback restores only the failed preference, tracks React Query's structurally shared member objects, and retains a separately delivered member update or concurrent other preference. Duplicate pending writes for the same chat/session/preference are rejected across hook instances sharing the query client.

Account guards run before dispatch and after each await. Retained controls cannot start work in a later session, including A→B→A. An explicit action survives its row moving between pinned/ordinary sections; its acknowledgment or failure remains visible for the original current account. A submitted request cannot be retracted from Firebase by these client guards. Server reads and write acknowledgment still depend on connectivity; this candidate does not implement durable preference receipts, a write timeout, historical membership reconciliation, or proof of physical-device behavior. Other archive/lock/read-state actions still need their separate scoped cache/mutation audit.

Thirteen actual action-hook regressions plus the existing list/gesture/cache suite cover these boundaries. Development full suite: 5,072 tests passed/six skipped, 513 files passed/one skipped. The exact compatible release separately passes 4,901 tests/six skipped, 503 files/one skipped. Browser QA renders actual inbox/action hooks and caches with synthetic account/server boundaries; it checks row replacement, rejected-write rollback and accepted retry. Production pin/mute writes and full ConversationList rendering were not exercised. Published compatible source 95c5a75b is live on vybehub.app; see releases/inbox-readiness-20261006/verification.json for exact delivery evidence. No backend or Rules deployment accompanies it; actual signed-in and physical phone behavior remain unverified.

Ordinary sends require the rendered user/profile to agree with the live Firebase session before optimistic insertion, broadcast or dispatch. The callable receives `expectedSenderUid`; when present, it must match the request's authenticated UID before rate limiting or database work. Existing callers that omit the field remain compatible. The server still derives the actual sender and verifies conversation access.

The ordinary outbox uses per-UID v2 records, validates the original sender, awaits durable storage and retains the original retry identity after an uncertain response. Ownerless v1 records are not automatically imported or sent. Failure to store a queued message must not claim successful queuing. Snap jobs and their separate offline queue capture original account ownership; see [Snap account isolation](SNAP_ACCOUNT_ISOLATION.md).

Guards stop subsequent work after a switch; they cannot retract a request already accepted by a server. Firestore rules and callable membership checks remain the authority. This change does not certify end-to-end encryption, native push, all ancillary chat features, or every historical client. Messages metadata no longer makes an encryption claim.

## Validation and rollout

Regression tests cover foreign and ownerless caches, account changes including A→B→A, delayed fetches and callbacks, denied reads followed by transient failures, account-bound drafts/outboxes and stale send identities. The actual demo Auth/Functions/Firestore fixture checks mismatched sender rejection, canonical sending, retry deduplication, recipient access and self-report rejection. Browser QA uses only synthetic accounts at port 8082; production accounts are not used for mutation tests.

Deploy the reviewed `sendDmMessage` change before or with the client to enforce the token-race check on the server. Message reporting and saved feed mutes additionally require their coordinated callable/rules rollout described in their own documents. This checkpoint only commits source. Never deploy all Functions or change production `auth2faRequest` as part of it.
