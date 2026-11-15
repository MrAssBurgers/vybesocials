# Existing premium-status recovery - 2026-11-14

`checkPremiumSubscription` existed in production but lacked browser transport invocation, returning a platform403 before Firebase's callable handler could check the account. Its reviewed baseline was ACTIVE, Node20, last updated2026-07-13. The existing client already requires the newer complete status response.

The existing read-only handler now lives in `functions/src/premiumStatus.ts`, re-exported through the original Auth/index entry. Its single callable allows browser/native transport and retains verified Firebase identity plus server-owned entitlement checks. An isolated Node22 source package contains this actual compiled handler and its two shared modules, with exactly one export. Auth/email/provider/mutation implementations were not bundled or deployed.

The client also binds status query keys and responses to the captured account-session epoch. Signing out and back into the same account cannot reuse a stale owner/capability result. Core features retain the existing free-access policy. The service guard also retires delayed gift-action acknowledgements; it cannot cancel a server write already accepted.

## Backend release

- Target: `checkPremiumSubscription` only, now Node22 and ACTIVE.
- Candidate/deployed archive SHA256: `6823755d56c7986b57e81f79bfd4fff9e6257f231c69e83d26f4677acfa0d9b2`. Downloaded deployed source matches the tested archive byte-for-byte.
- Before-source backup SHA256: `e887e1a45fdfe06142b49a495bcf8fcf266dd1f0f795992200d426534db0f376`; backup and private baseline metadata remain in ignored work/premium-status-audit.
- Original service environment, service account, ingress, memory, fractional CPU, timeout, maximum instances and concurrency verified unchanged. No secret values were changed.
- Added browser transport invocation to this one service after validating its deployed source. Other IAM bindings were preserved. Firebase callable authentication still rejects missing/invalid credentials.
- Live OPTIONS204 with `https://vybehub.app`; unauthenticated POST401/UNAUTHENTICATED. See deployment.json for the exact operation and source receipt.
- No Rules deployment: exact live ruleset `dbfd3859-7910-4f74-adf3-5ffe78800fd9`, SHA256 `705f82b84f2795bc29d883cce4b0b84f73621f25cf3719780671cd165ff6957f`, already denies the private grant/subscription namespaces. The isolated SDK checks prove these denials for this release; the broader pending root rules were not deployed.

## Executed checks

- Two account-session regression cases fail against the original service/hook and pass after repair. Focused status/gift authority suite:67 passed.
- Actual callable under Node22.23.5 using its own frozen dependencies, actual Firebase Auth emulator tokens and Firestore:11 cases covering CORS, unauthenticated/invalid-token rejection, complete response, ignored historical gifts/profile flags, pending/accepted grants, cross-account input, revocation and subscription expiry/lifetime.
-36 actual Firebase SDK denial operations against the exact live Rules: recipient, outsider, staff browser and guest cannot read/list/write private grant, subscription or request records.15 reported cases total. All fixture accounts/records were synthetic and removed; no real email, purchase, gift, subscription or balance was modified.
- Actual status hook/service/account-session store in the browser with synthetic transport: after sign-out/reentry, the replacement session stays Standard appearance, management unavailable and core features free even when the old owner reply is delivered. Temporary tab17 closed; screenshot remains in ignored work/premium-status-account-check.jpg.
- Pre-merge full suite:538 files passed/one skipped,5215 tests passed/six skipped;119.65s. Typecheck, zero-warning lint, client build and Functions build passed. Concurrent inbox follow-up a27b363 was preserved in merge1474aee; the final combined client is revalidated separately before publication.

## Remaining work

This repairs one existing status reader, not the entire premium/billing workflow. `premiumGiftManage`, token marketplace/stream availability, existing subscription provisioning/webhooks, legitimate historical restoration and physical-device/provider journeys remain separate readiness work. The isolated dependency audit reports nine moderate findings and no high/critical findings, rooted in the existing Firebase SDK dependency chain; no forced SDK major upgrade was applied. The user's exact phone verification error and physical bundle adoption still need confirmation. The complete public-readiness goal remains active.

## Final combined client checks

Concurrent inbox follow-up a27b363 was reviewed and retained in merge1474aeec3328a92f97ef8792262b73fe8c5fc740. Final suite:540 files passed/one skipped,5231 tests passed/six skipped,120.92s. Typecheck, zero-warning lint, client production/native/boot/entry/budget checks pass. Local entryapp-DSWQlHxz.js858.8KB raw262.0KB gzip. Exact tested source7edc97fdf83ce4d2cfe7dbc213d31d4888ef55654a7744b0ae7b7a24ddf84c2a; no runtime changes after checks. See verification-local.json. Generated public/backend outputs were restored.

A real already-signed-in production browser now displays Owner preview on Settings Subscription and captures no new warning/error. This verifies that this live account's status reader works after the backend recovery; it does not prove a fresh sign-in/code flow or physical-device adoption. Temporary tab18closed. The account's profile, settings, entitlements and conversations were not edited.

## Verified client publication

Lovable deploymentf7887db7-fd40-4993-a8bd-d4d193528da4 published commit62a8f7cfda0ac564264e04ef3e626b29f8e59f74. At2026-11-15T01:22:23.744Z, public source7edc97fdf83ce4d2cfe7dbc213d31d4888ef55654a7744b0ae7b7a24ddf84c2a matches the tested merged source, parts/config/public/runtime identity. The hosted entryapp-B9HEVz38.js digest19f05628c80c9e1a96cda35290864fa3577a1cd21c0ed2f6dbfccddccdbfe70a, ten route shells and all709 native update assets pass. Native deployed_at1794705696458. See verification-public.json.

Fresh signed-in Settings on the published client shows Owner preview and Version62a8f7c with no new captured warning/error. This is real account read evidence; no fresh password/code, gift action, payment, account-setting or conversation mutation was performed. The temporary tab was not retained. Owned local Auth/status/UI helpers were stopped without stopping the pre-existing preview services. Actual physical-native adoption remains open.
