# Verified reports and mini-app moderation

This implementation is a coordinated client, Cloud Functions and Firestore rules migration. It does not deploy itself. Tests use synthetic identities in an isolated `demo-*` emulator project; the interactive `demo-vybe-preview` project is excluded from the destructive backend fixture reset.

## Authority and legacy records

The `reportModeration` callable requires Firebase authentication. Submission derives the reporter's authenticated UID and canonical profile, reads the actual target and derives its owner, and creates the report with a server timestamp and pending status. It rejects caller-supplied identity, ownership, status and other unexpected fields. Supported targets are profiles, posts, comments and published mini apps. Profile UID and legacy profile ID aliases are resolved against verified profile ownership. Conflicting mappings, missing canonical profiles and ambiguous UID/profile aliases fail closed and need operator repair.

Reports are leads, not proof that the reported behavior occurred. New reports receive a separate server-only `_report_authority` record. A report is labeled `verified` only when `isAttestedReport` confirms the exact immutable projection and document identity. The attestation verifies the submission's origin and recorded target ownership, not the truth of the allegation.

Existing browser-authored reports remain visible as `legacy` leads. Old `verified`, `schema_version`, reporter, owner or status fields do not create an attestation. Malformed text, dates and target fields are bounded and normalized for display. A moderator may review a legacy lead and inspect its currently available target. Review does not fabricate an attestation or retroactively certify the old author. Previously forged legacy reports require operator review; this migration cannot identify every historical forgery from the stored row alone.

Staff actions require a current active `owner`, `admin` or `moderator` grant in `user_roles` or `user_roles_auth`, bound to the authenticated UID or its unambiguous canonical legacy profile ID. A missing `enabled` flag retains legacy compatibility; explicit false or malformed flags do not grant access. Each action, including an idempotent replay, checks authority inside its transaction. A stale custom admin claim or preview founder identity alone is insufficient. Claim-only/bootstrap staff accounts need a verified current role grant through the existing authorized operator process; this migration never creates one implicitly.

## Callable contract

Call the exported Firebase callable `reportModeration` (the web compatibility wrapper accepts `report-moderation`). Mutations require a stable `requestId` of 1–128 letters, numbers, underscores or hyphens. Notes/details are capped at 1,000 characters. IDs are bounded, nonempty document IDs without slashes or control characters. Unknown request fields are rejected.

| Action | Request fields after `action` | Result |
| --- | --- | --- |
| `submit` | `requestId`, `targetType`, `targetId`, `reason`, optional `details` | `{success:true,reportId,status:'pending'}` |
| `list` | optional `cursor`, `limit` (1–50, default 25), `status` | `{reports,nextCursor}` |
| `count` | none | `{pendingCount,includesLegacy:true}` |
| `inspect` | `reportId` | `{report,target,hold}` |
| `review` | `requestId`, `reportId`, `status:'reviewed'|'dismissed'`, optional `note` | `{success:true,reportId,status}` |
| `removeMiniApp` | `requestId`, `reportId`, `expectedRevision`, required `note` | `{success:true,reportId,appId,status:'actioned',holdActive:true}` |
| `releaseMiniApp` | `requestId`, `appId`, `expectedHoldRevision`, required `note` | `{success:true,appId,holdActive:false}` |

Reasons are `spam`, `harassment`, `inappropriate`, `hate`, `impersonation`, `other` and `blocked_user`. Read actions have no `success` flag. They require staff authority; normal users cannot read the moderation queue or private audit/hold records. The count includes pending legacy leads and makes no certification claim.

List results are paginated by document ID, not chronological order. Status filters accept pending, reviewed, dismissed or actioned. Cursor pagination is bounded and may reflect changes made between requests. `count` uses a Firestore aggregate after a quota/authority transaction, then rechecks staff authority before returning. It does not download the entire report collection.

`ReportSummary` includes `id`, `verification`, `targetType`, `targetId`, `reporterId`, `reporterUid`, `targetOwnerUid`, `reason`, `details`, `status`, `createdAt`, `reviewedAt`, `reviewedBy` and `adminNotes`. Unverifiable identities/dates are nullable; unknown legacy statuses are `unknown`. Legacy reporter/target owner UIDs are not presented as authoritative. Inspection resolves the actual current owner separately. Legacy profile aliases remain the inspection target ID so clients can match the requested lead.

Inspection returns target type/ID, current owner UID, availability, title/caption and a revision. Only a currently published mini app includes its bounded HTML/CSS/JavaScript source. The moderation screen must show source as text and must never automatically execute it. Unavailable targets remain reviewable leads; a malformed identity or oversized legacy publication can require operator intervention.

## Receipts, quotas and evidence

Each mutation stores an immutable receipt keyed by a SHA-256 digest of actor UID and request ID. The receipt binds a fingerprint of the normalized operation and its original result. Reusing a request ID for a changed operation fails. Concurrent identical retries create one result, audit and quota increment. A replay returns the original acknowledgement: for example a submit replay can still say pending after a later review, and replaying an old removal after release does not reapply the hold. Clients should refetch current inspection/state after acknowledgements.

All mutations read actor authority, receipt, quota and affected documents before scheduling writes. Action changes, evidence, receipt and quota are committed atomically. Current authority is checked before returning any existing staff receipt. Failed validation or stale revision does not consume mutation quota.

Per authenticated UID, submission limits are 5 per minute and 20 per UTC day; moderation limits are 30 per minute and 300 per UTC day; read limits are 120 per minute and 5,000 per UTC day. Same-receipt replays do not consume mutation quota. Quotas are transactional counters, not browser hints. They limit an individual account; this pass does not implement a cross-account abuse detection system.

Server-only collections:

| Collection | Purpose |
| --- | --- |
| `_report_authority/{reportId}` | Immutable submission attestation |
| `_report_requests/{actorRequestHash}` | Immutable request fingerprint and original acknowledgement |
| `_report_audit/{actorRequestHash}` | Actor, operation, note and evidence |
| `_report_quotas/{actorKindHash}` | Transactional minute/day counters |
| `_mini_app_moderation/{appId}` | Current bound publication hold |

Canonical report rows have `schema_version:2` and stored `id`. Attestations have `version:1` and `report_id`. Both share the exact immutable fields `reporter_uid`, `reporter_id`, `target_type`, `target_id`, `target_owner_uid`, `target_owner_profile_id`, `reason`, `details`, `created_at` and `target_revision`. `created_at` is a server ISO timestamp. `target_revision` is the mini-app revision or null. Review status/notes are intentionally excluded from the immutable projection.

## Mini-app removal and release

A report's claimed owner is never used to remove an app. The removal action resolves the current published app and actual owner, then compares `expectedRevision` against a hash of its document ID, native Firestore update time and stored data. Changed data or delete/recreation requires fresh inspection, including recreation with identical source. A true no-op rewrite may retain the same timestamp/revision because the inspected content has not changed; the real emulator fixture verifies this behavior. Firestore also documents that [unchanged writes do not emit update events](https://firebase.google.com/docs/functions/firestore-events). The same transaction saves the actual publication in the immutable audit, records the moderator/note, creates an active hold, marks the report actioned and deletes the public snapshot. The private creator draft remains intact. An actioned report cannot subsequently be downgraded to reviewed or dismissed.

The hold is bound to `version:1`, exact `app_id` and authenticated creator `owner_uid`. Firestore publication create/update rules permit an absent hold, or a valid correctly bound hold with `active` exactly false. Malformed/rebound holds fail closed. Ordinary owner unpublishing remains allowed and cannot remove the hold; direct staff deletion is removed so staff removal goes through the audited callable.

Release requires current staff authority, an explicit note and `expectedHoldRevision` from the inspected hold's `revision`. This opaque token is the exact removal audit ID, so an old confirmation cannot clear a newer hold on the same app. It preserves the owner/app binding and removal evidence, sets active false, and records release details. It never republishes source. The creator must deliberately publish a later snapshot. A hold applies to that app ID; it is not an account suspension or content-fingerprint ban on newly created copies.

The hold namespace remains private. Creator publish failures therefore describe a possible moderation hold or permission restriction without exposing confidential notes or falsely asserting which condition caused a rules denial. Saving/previewing the creator's private draft remains available when permitted by existing draft rules.

The browser scopes moderation queries and form completion to the current account session. Reports, inspection source, pending counts and deletion history are excluded from disk query persistence, including removal from older snapshots when restored. This avoids showing saved staff material before a fresh server authorization check after restart.

## Coordinated rollout and verification

Publish the tested callable and supporting indexes, migrate all report writers and moderator reads/counts, and close direct report writes/reads with the reviewed Firestore rules as one coordinated release. Do not reopen browser authority as a fallback for old clients. Until the callable is deployed, clients must show unavailable/error states and retain retryable input. No deployment has been performed by the implementation or its tests.

`scripts/test-report-authority-backend.mjs` invokes the real callable and Firestore transactions in an isolated demo project. It covers forged fields, duplicate requests, UID/profile ownership, invalid mappings, disabled/revoked roles, legacy proof poisoning, pagination/counts, stale revisions, exact publication evidence, atomic hold/removal, release/replay behavior, quotas and collision rollback. The dedicated rules fixture covers client access denial and publication hold enforcement. Use separate emulator working directories and process temporary directories as described in [LOCAL_PREVIEW_QA.md](LOCAL_PREVIEW_QA.md); separate ports and project IDs alone do not isolate the CLI's Storage files.

## Safety email retry handling

`onReportCreated` rereads the report and its immutable attestation before creating an alert or contacting the existing safety inbox. Legacy/mismatched records remain in the moderator queue but do not generate automatically trusted notifications. This trigger never changes report status, review notes or reviewer identity.

Each attested report has one deterministic `admin_alerts/report-{hash}` record and one private `report_notification_deliveries/{hash}` receipt. Both namespaces remain inaccessible to browser clients. Creating the alert does not overwrite its existing read state. The moderation UI reads the verified callable queue, not these notification receipts.

A transaction claims a 90-second delivery lease and freezes the exact email payload and provider key before contacting Resend. The sender has a 20-second timeout. Retries reuse the same payload/key even if inbox configuration changes. HTML escapes all report text, the subject contains a report hash rather than caller text, and provider errors do not log response bodies. An acknowledgement records provider acceptance; it is not proof of inbox delivery.

Resend documents a [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Uncertain deliveries stop automatically after 23 hours from the first attempt and become `needs_review`. The trigger enables retries, but the platform's event retention/retry lifetime can still end before an operator fixes configuration. A missing provider key leaves an unconfigured receipt and does not stamp the report as sent. Reports remain visible regardless of email availability.

Operators should monitor unconfigured/retryable/needs_review receipts and trigger failures using existing authorized server access. Investigate provider acceptance before any manual resend, especially after the provider's deduplication window; do not delete receipts or change frozen keys merely to retry. No new operator console, delivery-status dashboard, scheduler, email provider certification or retention job is included in this pass. Audit/publication snapshots contain user content and need an explicit retention policy before production rollout.

`scripts/test-report-notification-backend.mjs` uses real isolated Firestore transactions with an explicitly stubbed email transport. It tests retries, leases, exact payload reuse, existing review/read preservation, missing configuration, malformed acknowledgements and expired retry windows. The unit transport checks use a stubbed fetch and verify the provider header and timeout. They send no real email. The browser preview deliberately excludes `onReportCreated`.
