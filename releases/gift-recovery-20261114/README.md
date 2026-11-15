# Existing gift workflow recovery - 2026-11-14

Settings displayed “Gift status is temporarily unavailable” because its existing `premiumGiftManage` callable was absent. This release supplies that existing service and repairs account-session state in the pending/review/staff UI. It adds no new premium feature or automatic popup. Core features retain their existing free-access policy.

## Repair

- Only staff accepted by the existing checked `requireAdmin` policy can create/list/revoke grants. Only the authenticated recipient can read their pending gift or accept its current version. Existing replay, expiry, revocation and replacement checks remain enforced.
- Grant acknowledgements/listing now whitelist public fields rather than returning internal record fields. A profile-ID/Auth-UID collision cannot misidentify the gifter.
- Pending/staff queries and review components include the account-session epoch. Guarded multi-step reads and acknowledgements cannot affect a replacement session, including sign-out/reentry to the same UID.
- Historical `gifted_premium` browser writes are denied. All other live Rules and historical read access/records are preserved byte-for-byte. Existing private grant/request/subscription namespaces remain denied by the baseline rules. No historical grants were bulk-adopted or reissued.

## Exact backend and Rules release

- `premiumGiftManage` only; Node22; source archive/deployed source SHA256 `273dd525c7c3e29d6238e4781f96cc91ad58c9db573d11f0e58108eeaf205325`. The package contains the actual compiled handler and two shared modules, with exactly one export.
- ACTIVE at2026-11-15T01:43:55.717Z. Budget:256Mi memory, fractional CPU0.083, maximum3instances, concurrency1,60-second timeout. Uses the existing project's runtime service account; no provider secrets are attached.
- Verified browser transport invocation and Firebase authentication: OPTIONS204/correct origin, unauthenticated POST401/UNAUTHENTICATED. No real gift mutation was made.
- Ruleset `86ff97a3-2fb3-4b3c-b582-f4e92cda6542`, SHA256 `5e089eb26cc72314e1eff017a70166aa5040fb1f172e01125164b5050945e4e3`, replaces exact baseline705f82b8. Cloud compilation passed with12 inherited warnings. Activation/readback is recorded in rules-deployment.json; no duplicate activation or function creation was submitted.
- Other Functions, Storage rules, indexes, Firebase Auth/provider settings and native binaries were not changed. The previously restored premium-status reader is retained.

## Executed evidence

- Five selected cache/privacy/collision/review regressions fail against the original code. The old live Rules also fail the new legacy-write denial check; the candidate passes.
- Actual staged callables under Node22.23.5, actual demo Firebase Auth tokens and Firestore:22 reported cases, including60 actual SDK denial operations for private grants and historical writes. Covers staff/recipient restrictions, request replay/retargeting, concurrent creates/accepts, revocation, replacement, expiry, disabled/retired staff, and ordinary profile/child-setting compatibility. No provider or live-account writes are used.
- Actual Settings components, status/pending hooks, service/account-session guards and actual demo Firebase HTTP services at390px: Review → Accept → Gift accepted → Done. The pending card disappears, Gifted preview appears, and captured warnings/errors are empty. An administrative demo read confirms the stored grant was accepted. All owned UI fixture accounts/records were then removed; temporary tab20closed and viewport reset. Screenshots stay in ignored work/gift-review-accepted-mobile.jpg and work/gift-review-complete-mobile.jpg.
- Pre-merge suite:542 files passed/one skipped;5238 tests passed/six skipped;117.91s. Typecheck, zero-warning lint, Functions build and production/native/boot/budget checks passed. Concurrent preference recovery3e41b20 was reviewed and preserved in merge8fd2a66; final combined results/publication are recorded separately.

## Remaining readiness work

This restores the existing gift workflow; it is not a full billing or public-launch certification. Marketplace/stream availability, payment/subscription-provider provisioning, remaining authority/history reconciliation and physical-device behavior remain open. The broader profile/financial-field hardening in root Rules requires its matched consumer review and was not silently included here. Historical mutable gift rows cannot grant new benefits. Missing staff authority requires independent reconciliation; owner cosmetic preview alone cannot grant gift-management permission. The inherited SDK dependency audit findings remain separate work.

## Final combined client checks

Preserved concurrent preference repair3e41b20 in merge8fd2a66632a38debace40fd8feb3cf2f8cf79683. Final suite:542 files pass/one skipped,5242 tests pass/six skipped,117.85s. Typecheck, zero-warning lint, production/native/boot/entry/budget checks pass. Local entryapp-DBu2XfIZ.js858.8KB raw262.0KB gzip. Exact tested source8f96b76b4ba6333ee6016d07925803826c7f7009050a70973ed35f093ac79c98/2665files. Generated artifacts restored; no runtime changes after these checks. See verification-local.json. Client publication is recorded separately after public verification.
