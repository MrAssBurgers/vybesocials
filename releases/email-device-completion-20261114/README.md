# Email device-completion latency

The existing `authLoginNotify` email-confirmed path updated device trust in one checked transaction, then repeated the same identity, proof and account checks in a read-only transaction before returning. It now writes trust and returns its owned completion receipt in the same checked transaction. The response is released only after commit. Firebase documents the underlying [transaction commit and retry behavior](https://firebase.google.com/docs/firestore/manage-data/transactions).

Actual baseline/candidate HTTP callables with Node22.23.5, demo Firebase Auth/Firestore, a real demo email-proof/custom-token exchange, synthetic mail/location and120ms injected per transaction:

- Baseline: three transactions/seven account lookups; final sample788ms.
- Candidate: two transactions/five account lookups; final sample511ms.
- Ten cases passed: guest rejection, baseline/candidate persisted trust and exact owned receipt, same-device repeat without duplicate session, wrong token claim, retired binding, disabled account, invalidated proof, revoked device and failed transaction commit. The latter five return no success and leave the device untrusted.

These timings describe the controlled local fixture, not a production/physical-phone benchmark. No real account, email, notification, location-sharing or social action occurred. The fixture initially omitted `_account_profile_receipts` from cleanup;18 owned setup receipts were identified by their generated owner prefix and removed. The corrected final run left zero accounts/documents in the exclusive demo project, verified independently before stopping the owned helpers.

The source package is based on exact deployed archive `b0148c4a4963d5f68567d32958c4a4177e70ca2f715330990e2eaaf982bfa135`. Only the email-confirmed branch in `lib/auth.js` changes; all other bytes, shared authority/proof modules, dependency lockfile, Node22 runtime and single-export entry are preserved. The changed branch matches compiled repository TypeScript. Frozen27-file archive SHA256: `eafde96c443bb726b17ddcea9c0c6e288f24c8401c9b6680b52c0f5c604ee98e`. No Rules, Auth/provider configuration, IAM, secret bindings or other service is part of this update.

Reviewable fixture: `scripts/qa/email-login-completion-server.mjs` and `scripts/qa/test-email-login-completion.mjs`. They require the audited baseline/candidate packages under ignored `work/login-email-completion-release/functions`, Node22, `GCLOUD_PROJECT=demo-vybe-login-completion`, and exclusive loopback Auth9200/Firestore8387. The server listens only on8358/127.0.0.1. Never run these injection helpers against production.

Final combined suite:5,308passed/six skipped,547files passed/one skipped,153.66seconds. Functions compilation, typecheck, lint and production build passed. Generated files were restored; final source2b2bc98647fea3280eeec809a0ad2bbc17e295e50a5d66010094e9bce3ac2df2 independently matches the checked build. Source commitdebc134 preserves the concurrent Community repair. No frontend runtime changed in this backend optimization and no client republish was submitted.

The single operation operation-1794715031887-66048a7f2dd40-c9d3d1ab-3b6b1cca completed. At2026-11-15T03:58:02.850Z, authLoginNotify is ACTIVE Node22, and the downloaded deployed archive exactly matches the frozen tested candidate. Existing service configuration and IAM bindings match the pre-release snapshot. Browser preflight204/correct origin and guestPOST401/UNAUTHENTICATED passed. See deployment.json, validation.json, source-proof.json and verification-sdk.json. Physical installed-app adoption, real production login latency and the user's exact reported code failure remain unverified.
