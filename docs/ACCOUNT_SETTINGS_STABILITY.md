# Account settings stability contracts

This repair verifies existing account controls. It does not certify provider delivery, native push, or server-enforced multi-factor authentication. Production rollout remains coordinated with the restrictions in `DEPLOY.md` and `WORKLOG.md`.

## Notification preferences

`manageNotificationPreferences` reads or changes the authenticated account's canonical `_notification_preferences/{uid}` document. Requests bind both Firebase UID and current profile ID. A change requires the revision returned by a checked read, one boolean preference, and a stable request ID. Concurrent changes reject with `aborted`; clients refresh before another deliberate attempt. Replaying a confirmed request returns the current state and cannot undo a newer choice.

Legacy `notification_preferences` rows are read-only migration input. Matching UID/profile rows are normalized conservatively: any explicit false or malformed boolean suppresses that alert. Conflicting or invalid quiet-hour values fail the read. Missing settings receive defaults only after a successful server read; viewing settings does not initialize them. Canonical state and mutation receipts deny direct client access, including admin clients.

The UI waits for checked saved values, masks failed reads, serializes changes, and offers retry. Account epochs and originating-view guards discard late results. Preference values are excluded from the persisted query cache. Disabling announcements preserves the existing inbox; these controls govern push delivery.

The existing **Mute 1h** action uses `muteSmartPings` and the same canonical authority. It sets a server-timed `brief_muted_until`, requires the current revision, and retains the original revision/request ID after an uncertain response. Replaying it never extends the hour. Notification actions carry the intended recipient UID; old unbound notifications and a different signed-in account cannot trigger a mute. No UID-shaped profile document is created by this action.

Brief dispatch checks current preferences and quiet hours immediately before provider work. A settings read failure prevents delivery. Test-provider acceptance is not proof of device receipt. Legacy quiet hours still use the existing server-time interpretation; no new timezone-setting feature is introduced here.

Stories, friend-activity and local-trending push producers are not implemented, so those existing controls remain disabled with their saved choices retained. Map activity covers the existing map waves/invites. The UI does not claim the stored smart-ping daily maximum is currently enforced. All checked settings reads override the application's previous-query placeholders and mount cache defaults; another account's previous values cannot stand in for a current read.

Private preference receipts use `_notification_preference_requests.expireAt` TTL. Receipt expiry never grants stale write permission: the current revision is still required.

## Sign-in preferences

`manageSignInPreferences` reads the existing canonical `user_2fa_settings/{uid}` document and performs strict, single-field, revision-checked updates. It never replaces both flags from a cached client snapshot. Direct settings writes and the old adapter RPC write paths are closed. Private receipts and quotas are server-only.

`enableEmailConfirmation` and `enableLoginApprovals` remain **false** server capabilities. Existing enabled choices are displayed and can be deliberately disabled. New activation waits for the coordinated authentication migration. These preferences do not protect every authentication method or already-issued credentials. In particular, do not deploy `auth2faRequest` or claim MFA completion as part of this settings repair.

## Account-wide sign-out

Firebase refresh-token revocation affects the entire account. A selected-device request is rejected before any Auth mutation. The supported request is:

```text
{ all: true, confirmation: 'all-devices', expectedOwnerUid,
  expectedAuthTime, requestId }
```

The backend requires recent authentication and exact equality between `expectedAuthTime` and the authenticated token's `auth_time`. A private durable receipt records the remote call phase. Retrying the same request reconciles the current Auth cutoff; it never blindly reissues revocation after a lost acknowledgement. An ambiguous outcome remains an explicit error. At most 200 eligible tracked rows are version-checked before being marked; those rows are activity bookkeeping, not per-device authentication authority.

The client persists the pending request in session storage, bound to UID and the verified sign-in time, before sending it. Reload recovery uses that same request. A new sign-in cannot inherit the old attempt. Corrupt or unwritable recovery storage blocks a new global action; an explicit local-only sign-out escape does not claim to revoke other devices. A checked receipt must match UID, request ID, sign-in time, scope, cutoff, and tracked-row count. The client checks the current sign-in time again before signing out locally.

Already-issued ID tokens may retain access until they expire. The confirmation and completion text disclose that limitation. Settings show tracked devices in bounded pages and the latest 10 login records, with independent loading/error states and invalid timestamps labeled unavailable.

Required named resources: `manageSignInPreferences`, revised `authSessionRevoke`, `manageNotificationPreferences`, `muteSmartPings`, and each affected push producer listed in the deployment checkpoint. Deploy matching rules/indexes and TTL policies for `_sign_in_preference_receipts`, `_sign_in_preference_limits`, `_auth_session_revocations`, and `_auth_session_revoke_limits` (`expireAt`), together with the matching client. Never deploy local emulator fixtures or mail sinks.
