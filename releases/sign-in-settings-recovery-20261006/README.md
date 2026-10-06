# Existing account settings recovery

Released only `manageSignInPreferences` and the read-only `phoneVerificationState` to Firebase project `vybe-daaab`. Both require authenticated, checked canonical ownership; public callable ingress does not grant unauthenticated data access. No SMS request/confirmation service, secret, Auth configuration, preference toggle or credential revocation was changed.

The existing active Firestore ruleset was independently checked before deployment: `00d7a6c4-2633-4da1-8045-daea63d99d89`, SHA256 `6217f4c3bcd40a9e43e5af69980844a1945e3dab7fe099c9986d5921388aa924`. Its source is `../notes-recovery-20261006/firestore.rules`. Rules were not republished. Own sign-in settings reads remain allowed, browser writes and private service receipts remain denied.

Added only the resources in `resources.json`; both indexes are READY and both receipt/quota TTL policies are ACTIVE. Existing indexes and data were retained. The exact indexes are `user_sessions/CICAgLiK-J0K` and `login_history/CICAgJilmo4K`.

Validation: Functions build; 13 isolated security backend/Rules groups; 17 phone backend groups with an injected provider (no SMS); 18 security client tests; 34 phone client tests. Destructive emulator fixtures reject retained preview port 8280. Security Rules tests accept the exact released baseline.

Live signed-in account verification: saved email/login confirmation preferences load, tracked device records and ten login-history entries load after index readiness, and phone status loads without the previous internal error. A legacy saved phone is correctly shown as needing verification; it is not promoted into verified Firebase Auth ownership. No preference, phone, address book or session was modified during this walkthrough.

Outstanding: contact discovery still returns the older `hashes required` contract error. User reports phone reopening preserves sign-in, initially reports a profile-loading failure, then recovers itself. That transient startup defect remains open. Provider delivery and native cold-start performance are not certified. Production client remains the separately published `84614d15715849490ec246a07e96e4afbb89fe15`; this backend-only release does not require a new frontend publication.
