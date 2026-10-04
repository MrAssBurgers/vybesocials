# Premium gift authority

Premium gifts now use `premiumGiftManage`. Staff issue or revoke a gift through the callable; only its authenticated recipient may accept it. The app keeps core features free. An accepted gift enables the existing cosmetic preview and server premium quota checks. Settings shows an optional Review gift card. The global gift popup stays disabled, and the removed upgrade announcement stays removed.

## Authoritative records

`premium_grants/{authUid}` holds one current grant with a unique `grant_id`, schema version, issuer, recipient, status, and timestamps. Acceptance and revocation compare that grant version inside a transaction. Replaced, expired, or revoked grants cannot be accepted. A repeated acceptance does not reset its timestamp. Staff creates use a request receipt in `_premium_gift_requests` and deduplicate an existing pending/accepted grant. Replayed creates cannot revive a revoked or superseded gift.

Browsers, including admin browsers, cannot read or write either new collection. The callable returns bounded recipient/staff views. Direct writes to legacy `gifted_premium` are disabled. All gift status, acceptance, creation and revocation interfaces use the new callable and check the response before reporting success. Query keys and delayed responses are bound to the current account.

The shared premium resolver is used by `checkPremiumSubscription` and AI quota selection. Only an accepted, unrevoked, unexpired new grant or active server-owned subscription grants those benefits. A subscription needs a valid future expiry or explicit null for lifetime access. Missing/malformed expiry is not treated as lifetime. Owner cosmetic preview resolves enabled owner roles; it does not turn an owner badge into a staff role. Mounted active entitlement/capability views refresh every minute and clear locally at the known expiry. Backend checks still enforce the current grant on every privileged operation. A status-check error clears server-derived cosmetic/management access until verification succeeds.

Profile identity and Stripe references remain protected. Profile `is_verified`, `is_premium`, `premium_status`, `premium_expires_at`, and `coins_balance` can no longer be changed by browser writes. Ordinary profile edits preserve these fields.

## Historical integrity and release

Old gift rows were client-writable and used incompatible field names between the UI and server. They are retained for support, but cannot authorize new benefits. Do not bulk-copy them into `premium_grants`. A staff operator must verify the original grant and reissue it through the new service. This checkpoint does not rewrite production gifts, subscriptions, profile flags, or balances. Existing profile badges/coins may still reflect historical data and need a separate audit.

There is no verified RevenueCat-to-`subscriptions` writer in this repository. Existing subscription records and their expiry contract must be checked in staging before release. Client RevenueCat cosmetics and existing subscription management remain available; the inherited subscription-center visibility is still RevenueCat-only, so a separate verified Stripe billing-management capability and UI remain needed; this change does not implement subscription provisioning or payment webhooks.

Staff gift mutation uses the existing `requireAdmin` policy: an admin claim or active `user_roles` admin/owner row for the auth UID. Owner preview can also recognize migrated role aliases. The server returns a separate can_manage_gifts capability using exactly that mutation policy; gift management controls require it. A preview-only legacy role does not expose controls that will always be denied. An operator must reconcile any missing staff authority; the client cannot grant itself callable access.

Deploy the reviewed rules and explicitly selected callables together with compatible clients after synthetic staging verification. Required premium callable targets are `premiumGiftManage` and `checkPremiumSubscription`; quota-consuming functions that bundle the shared helper also need an explicit reviewed rollout. Never deploy all Functions or alter production `auth2faRequest`. The public web/store client updates through Lovable Publish after Git sync. Until the new service is available, Settings reports unavailable gift status and offers Retry.

## Verification

`premiumAuthority.backend.test.ts` covers mocked callable authorization, create/replay conflicts, acceptance/revocation races, expiry, historical forgery rejection and entitlement resolution. `premiumGiftService.test.ts` checks confirmed responses and account changes. `SubscriptionSection.test.tsx` exercises voluntary review, pending acceptance, failure/retry, and switching accounts. `scripts/test-premium-authority-rules.mjs` uses only a loopback demo Firestore emulator to verify protected namespaces and profile fields. `scripts/test-premium-authority-backend.mjs` additionally executes the built callables against real demo Firestore transactions, including create/accept/revoke races, receipt replay and enabled staff roles. Only Firebase Auth recipient lookup is replaced with synthetic fixtures. No real gifts, purchases, or subscription changes are used in these tests.
