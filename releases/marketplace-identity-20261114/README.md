# Marketplace identity and Rules preparation

This is a verified preparation phase of the existing shop restoration, not a live endpoint or Rules release. Production tokenMarketplace remains404. No real wallet, reward, purchase, entitlement, account, boost or profile content was inspected or modified.

The former token actor lookup checked only the unique user_id query and index. It could miss a conflicting direct profile/Auth alias, and ignored a protected retired binding. Marketplace reads/mutations and shared reward actor checks now use the existing full canonical identity resolver and reject an existing version/status/owner/profile binding mismatch. Both the outer actor capture and each financial/equipment transaction recheck the identity. A retirement introduced during transaction contention rejects the retry without debit, inventory or replay receipt. Unbound unambiguous legacy identity compatibility remains; no balance or identity is inferred from names/email.

Three new cases fail against the original actor resolver. Final focused marketplace/credit/challenge/badge/callable suites pass255cases. Seven added unit cases cover both alias collisions, retirement, retirement during contention and denied reward writes. The full suite passes5278tests/six skipped,544files/one skipped,120.46seconds; Functions build and client typecheck/lint/build/boot/native entry/bundle budget pass. The new scoped Rules fixture was executed separately after that full suite; the final app build and lint include it. Exact final metadata is recorded in verification.json.

Actual Node22/Firestore SDK transaction run passes27cases: the three new identity scenarios deny actor capture, state, purchase, equip and credit while preserving the synthetic wallet and creating no token event. Existing concurrency, idempotency, price, entitlement, boost, provenance, quota, badge and challenge flows still pass. Auth contexts are synthetic `.run` requests/direct helper calls; this is not real JWT admission or a phone/provider test. Only the two named owned demo projects were cleared, and the owned8387/hub4505/log4605 emulator stopped. Existing services were not stopped.

Read-only production metadata rechecked tokenMarketplace404 and active Firestore Rules86ff97a3-2fb3-4b3c-b582-f4e92cda6542/SHA2565e089eb26cc72314e1eff017a70166aa5040fb1f172e01125164b5050945e4e3. A candidate from that exact complete baseline preserves unrelated Rules and historical owner reads, closes both overlapping user_active_boosts write grants and legacy wallet/transaction/purchase writes, protects the six equipped profile fields, and explicitly denies ten private token/reward namespaces to all browser roles.

The old baseline fails the staff raw-wallet-create denial. Candidate2ee0d9fa8175c6cf572f311d1430a98514b7b67817e26ba8d1092a9cb55d39f8 passes267actual Rules SDK checks:200private operations,40historical read/write cases,24equipment mutations, ordinary profile/free appearance edits and replacement denial. These deliberately scoped checks do not replace the broader existing post/comment publication Rules suites. Cloud compile passes with12warnings/no errors; no Ruleset was created or activated. See compile.json and availability.json.

## Required before enabling the existing service

- Verify current Auth account/credential lifetime, account binding and UID-only ledger/receipt incarnation behavior; this phase closes alias/retirement gaps but does not claim those broader invariants.
- Review actual deployed challenge/badge/XP writers and their matched consumers, history/reconciliation policy, required token_events and badge-proof indexes, isolated real Auth/HTTP/UI behavior, and a minimal frozen one-export Node22 package.
- Recheck the live Rules baseline, retain historical records and release the matched named backend/client/Rules set. Do not deploy the repository's whole Rules or Functions tree, or activate this Rules candidate alone to hide the missing service.

The whole app readiness goal, history/provider validation and physical Play Store lifecycle/performance remain open. No new feature or live money/cosmetic action is included in this preparation commit.
