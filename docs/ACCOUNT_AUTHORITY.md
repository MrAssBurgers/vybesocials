# Account authority checkpoint

This source change is not a production permissions migration. Deploy only the reviewed rules and named Functions after staging; never deploy all Functions or replace production `auth2faRequest`.

## Protected paths

- Spotify connection credentials are readable by the existing owner (including an owned migrated profile) and existing app admins. Browser writes, including admin-browser writes, are denied. Token exchange, refresh, and disconnect use trusted Functions.
- Staff grants accept `enabled: true` or a missing legacy flag. False and malformed values do not grant authority. Existing `admin: true` custom claims remain authoritative until token refresh/revocation; changing a role row does not revoke an already-issued claim.
- Profile identity and Stripe references cannot be reassigned by browser writes. The profile subcollection rule requires a child document; a Rules v2 zero-segment recursive match can no longer bypass the parent guards.
- Creator applications can change their application timestamp and initialize a missing approval field to false. Existing approval decisions and payment references are preserved. Only staff approval fields have a browser moderation path; payment fields require the Admin SDK.
- Business owners can edit catalog and public shop details, but cannot transfer ownership or edit payment identifiers, fees, verification, or balances. Archive businesses and Stripe-bound products using `is_active: false`; browser deletion is denied so their identities/classification cannot be reused. Unbound draft products remain removable.

## Payment verification and release conditions

Creator operations now verify the connected account's Stripe `metadata.uid` against the requested owner before creating links, products, tips, or payouts. Missing, mismatched, deleted, malformed, or ambiguous mappings fail closed. Single migrated creator rows are reused during onboarding. Both onboarding entry points share a Stripe idempotency key; this does not replace a durable provisioning/reconciliation ledger beyond Stripe's retention window.

Billing portal creation resolves the unique UID-owned profile and verifies the customer's Stripe `metadata.uid`. Existing customer references without provider-side ownership metadata require an operator review. The current repository does not provision that customer metadata; never backfill it from an untrusted profile reference alone. Validate against trusted payment/account records.

The public seller storefront already shows unavailable. The checkout callables now enforce that boundary for catalog-bound prices too, and lookup errors cannot silently turn a seller purchase into a platform charge. Existing platform-only checkout remains supported. Before seller checkout is enabled, implement an authoritative price classification/provisioning contract, connected-account price scope, correct fee and subscription settlement, and retained classification/tombstones through server cleanup. Do not infer ownership from historically editable product aliases.

Provider response contracts: [Stripe account retrieval](https://docs.stripe.com/api/accounts/retrieve), [customer retrieval](https://docs.stripe.com/api/customers/retrieve). No real payment, payout, or connected-account mutation was used to validate this change.

## Remaining audit scope

The new rules do not prove that previously stored rows were created legitimately. Review historical memberships, orphaned business products, and payment bindings using trusted records before release; no production private-data scan was performed in this checkpoint.

There is a confirmed pre-existing Firestore rule read-budget limit for migrated accounts whose only staff grant is a late `user_roles_auth` admin/moderator alias. The test suite reconstructs the original helper in a separate demo project and demonstrates the same four failures. Normal paired writers and non-migrated layouts pass. A server-maintained canonical role projection is a separate migration; this patch does not broaden role grants to evade the read limit.

Further work remains for private community admission rules, profile premium/verification/coin entitlements, challenge and XP reward authority, additional legacy owner-update rules, and payment webhook ownership/idempotency/retry handling. This checkpoint is not a claim that every permission path has been perfected.

## Verification

The account, commerce, and DM scripts run only against loopback emulators with a `demo-` project. Mocked backend tests exercise account and customer ownership before payment actions, migrated rows, role revocation, Spotify playback failures, message membership repair, and call-room access. Payment fixtures replace the provider factory and forbid Node HTTP/HTTPS requests. The initial mock setup was corrected after dummy-key requests were rejected by Stripe; no valid payment credentials were used.
