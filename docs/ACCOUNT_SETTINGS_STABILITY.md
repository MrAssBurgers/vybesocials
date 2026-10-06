# Account settings stability contracts

## Personal data export candidate (2026-10-06; not deployed)

The previous `manageAccount` export branch returned only a profile while the UI promised all data. Its replacement is a read-only, paginated protocol for 23 explicitly registered sections: canonical/private profile projections, authored posts/comments/messages/stories and their supported legacy forms, bookmarks, likes/reactions/views, interactions/mood signals, follows, blocks, owned hubs, notes and saved sounds. Fields are allowlisted. Media links are included; media bytes, other people's authored messages, private moderation evidence, credentials and every unregistered Firebase collection are excluded. This is not a comprehensive account archive or a globally consistent snapshot. Legacy sections remain separate without silently merging duplicate identities.

Each page rechecks current Firebase Auth creation/revocation/disabled status and the canonical private profile binding through the existing authority resolver. Another active Auth account at a profile-ID alias, contradictory authorship, changed incarnation metadata or unsupported UID-only historical ownership rejects the export. A cursor specifies a position, not an owner or collection. Pages contain at most 50 records and 2 MiB of projected record data; records are not truncated. Existing `is_deleted`, `deleted_at` and string `expires_at` markers suppress content/media fields. Additional historical deletion aliases and unregistered content sources still require the broader restoration audit.

The client validates every page acknowledgment and manifest, reads three sections concurrently, applies a 15-second deadline per page and only creates a download after all sections succeed. Collection is memory-only, bounded to 16 MiB of record data/100,000 records; larger accounts need a supported larger-export path. Account/profile/Auth incarnation changes, offline/hidden/native pause or view retirement prevent a stale download. A failed page creates no partial download and requires deliberate retry. The download URL is revoked after 1.5 seconds or immediately on account retirement/unmount. That grace period is not physical Android download verification.

Verification: 53 focused checks; full exact-source suite 508 files passed/1 skipped, 5,005 checks passed/6 skipped; actual app typecheck, Functions compilation, lint (zero errors/five existing warnings), production/native build and bundle budget passed (1,095.2 KiB raw/332.2 KiB gzip). The dedicated demo Firebase Auth/Firestore emulator runs the actual compiled `manageAccount.run` handler: eight groups cover the prior profile-only stub, 50+7 pagination, all registered sections, read-only snapshots, forged authority, content expiry, byte bounds, changed binding and disabled/recreated Auth. This is handler execution, not production HTTP/JWT/IAM or durable-session proof.

The actual rendered control and collector completed a desktop Chrome walkthrough with synthetic transport: saved JSON contained 57 posts, one authored message and all 23 sections; injected page failure left the control available and showed its error; explicit retry completed another download. Evidence is ignored under `work/account-export-ui-qa`. The fixture first needed a stable mocked account snapshot; after a successful download, copying evidence into its watched folder caused a Vite file-watch EBUSY shutdown. The already loaded page still completed the failure/retry actions. The test tab is closed and its port has no listener. No live user data, permissions, provider credentials or production services changed.

Release is pending a narrow coordinated client/`manageAccount` rollout. Existing production service access restrictions were not widened. Request/cancel deletion remain the existing incomplete stubs: there is no verified 30-day purge worker or deadline/status persistence, despite the inherited UI text. Account tools and the entire app are not certified ready by this export repair. Durable session/HTTP admission, downstream restrictions, content restoration, actual Play Store adoption/profile/posts/location/Clips and the remaining service audit stay open.

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
