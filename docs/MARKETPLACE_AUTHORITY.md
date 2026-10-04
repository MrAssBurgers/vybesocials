# Verified token marketplace

This is a source migration, not a production deployment or a certification of old balances. No live wallet, purchase, payment, boost, or profile was inspected or changed during implementation.

## Authority and historical data

The old browser `earn_vybe_tokens` / `purchase_marketplace_item` implementations were not authoritative transactions. Wallet rules blocked ordinary users' legitimate writes while `marketplace_purchases` and two overlapping `user_active_boosts` rules still permitted forged benefit records. New grants use separate namespaces, all denied to browsers including admin claims:

- `token_wallets/{authUid}`: versioned canonical balance and lifetime totals.
- `_token_purchase_requests/{hash([authUid, requestId])}`: immutable purchase/activation receipts, payload fingerprint, and original result.
- `token_entitlements/{hash([authUid, itemId])}`: permanent ownership or consumable quantity.
- `token_boosts/{hash([authUid, boostType])}`: bounded active multiplier.
- `token_events/{hash(...)}`: credit/debit history, with the newest twenty returned in state.
- `_token_credit_receipts/{hash([authUid, type, sourceId])}` and `_token_credit_day_limits/{authUid}`: once-only credit and daily quotas.
- `_verified_xp_authority/{authUid}`: verified challenge XP, separate from historical displayed XP.
- `_badge_grant_authority/{hash([authUid, badgeId])}`: staff badge proof and revocation tombstone.

Hashes are SHA-256 over JSON-encoded string tuples. Namespace separation and tuple encoding prevent delimiter collisions. Financial/consumption receipts must not be deleted merely to reduce storage: forgetting them would allow replay. Retention, account deletion, archive evidence, request-volume monitoring and billing controls require an operator plan.

Old `vybe_tokens`, `token_transactions`, `marketplace_purchases`, `user_active_boosts`, XP, and profile equip values remain intact. Old records never authorize new spending, boosts or paid equips. `legacy_review` indicates old wallet/purchase/boost records were found for the caller's UID/profile aliases; it is not proof of payment. The verified wallet starts at zero. Do not silently sum imported balances, assume a valid-looking historical row was trusted, or deduct/erase historical amounts. A later operator-reviewed reconciliation must record independent evidence and an idempotent adjustment in the new ledger.

## Callable contract

All requests use the authenticated `tokenMarketplace` callable. Firebase UID comes from `requireAuth`, and a unique owned profile/index mapping is required. Browser amounts, owner fields, multipliers, expiry and timestamps never determine grants. Account ownership is rechecked in each write transaction. Limits: sixty requests and thirty mutations per account per minute, plus credit-specific daily limits.

| Action | Input after `action` | Result |
|---|---|---|
| `state` | none | `{wallet, transactions, inventory, boosts, catalog, legacy_review, verified_total_xp}` |
| `purchase` | `itemId`, `requestId`, `expectedCost` | `{success:true, balance, item_id}` |
| `activate` | `itemId`, `requestId` | `{success:true, item_id, boost}` |
| `equip` | `type`, `value` | `{success:true, type, value}` |
| `earn` | `type`, optional `referenceId` | `{success:true, balance, credited, already_credited}` |

Request IDs are 1–128 ASCII letters/digits/underscore/hyphen. Retain the same request ID and payload until a purchase or activation resolves. Reusing an ID for another action/item/price returns `already-exists`. Retries return the original operation result; refresh state to obtain the current balance and active boost after later operations. Missing permission, malformed authority records, price changes, unavailable items, insufficient balance, expired/overlapping boosts, or unresolved historical proof return an explicit error and no partial purchase.

Wallet fields: `id`, `user_id`, `balance`, `lifetime_earned`, `lifetime_spent`, `updated_at` (plus internal `schema_version:1`). All monetary values are nonnegative safe integers, and earned minus spent must equal balance. Transactions contain `id,user_id,amount,transaction_type,description,reference_id,created_at`. Inventory contains `item_id,quantity,kind,purchased_at`. Boosts contain `id,boost_type,source_item_id,activated_at,expires_at,uses_remaining,consumed`; dates are ISO strings. UID is canonical in public wallet/events. `verified_total_xp` contains only the new protected tally.

## Catalog, purchase and boost behavior

The backend catalog defines prices and availability. `expectedCost` protects the user from a changed price but cannot override it. The catalog contains the existing nine IDs; `streak_shield`, `visibility_boost`, and `roulette_pack` remain unavailable because their promised consumers are not implemented. They cannot be purchased or activated. The two theme products are profile effects, not promises to recolor the entire app.

Paid neon/ocean effects have distinct shared profile gradients and matching shop/locker previews. Their profile layer uses 35% opacity when an uploaded wallpaper is present, preserving its visibility; without a wallpaper the full gradient is shown. Equipping does not replace saved wallpaper settings. Gold/fire frames use their existing profile frame styles and matching locker previews. Rendered profile and locker tests bind all four permanent products to actual equipment values and visible styles.

Purchase atomically validates/debits the wallet, increments inventory, appends a debit event, and creates a replay receipt. Permanent items can be acquired once; consumables may be purchased repeatedly up to one hundred units per item. Concurrent purchases cannot overspend. A failed commit cannot debit without granting inventory.

Only `xp_boost_2x` and `token_boost_2x` activate. Activation atomically consumes one owned unit, writes a one-hour `xp_2x` or `tokens_2x` grant, and records the operation. A second activation while that type is active is rejected without consuming another unit; grants do not stack. After expiry another owned unit may be activated. Retrying an old activation cannot extend or replace the current grant.

The XP multiplier applies once when verified challenge XP is consumed. The claimed proof records its awarded amount/multiplier. The token multiplier applies once when eligible activity is credited. Historical boosts and caller-selected multiplier values are ignored. Expiry/ownership are checked within the granting transaction. All other advertised boost effects remain unavailable.

## Verified earning

| Source | Base tokens | UTC daily cap | Proof |
|---|---:|---:|---|
| `daily_login` | 3 | 1 | Authenticated request; server day is receipt reference |
| `comment_added` | 2 | 10 | Owned current-day live comment; valid existing different author's post |
| `post_created` | 10 | 3 | Owned current-day published post with content/media |
| `challenge_completed` | 25 | 5 | Protected newly verified claimed challenge proof; claim time today |

Maximum base credit is 178 tokens/day, or 356 with the trusted 2× multiplier. Post/comment creation uses Firestore metadata, not editable client timestamps. Source receipts prevent repeat credit across retries, concurrent tabs and later days. Deleted, foreign, empty/draft, malformed or unprovable sources cannot mint tokens. No caller-provided amount, DNA multiplier, balance, claimed flag, localStorage cap or browser ad callback is trusted.

Rewarded advertising, invitation, quiz, streak and like credits are unavailable until each has verified evidence and an explicit server contract. The current Despia callback has no provider-signed server verification and cannot authorize credits. Existing Stripe checkout/webhooks and RevenueCat client entitlements do not constitute token purchase receipts. This pass adds no real-money token sale, provider fulfilment, cash-out or seller settlement.

## Equip policy

Allowed types are `title`, `effect`, `frame`, `name_color`, `profile_theme`, and `badge`. Null unequips. A non-null selection always requires current proof, including when it is already equipped; after successful verification, an unchanged selection skips the write. Expired, revoked or unverified legacy selections cannot return a successful equip acknowledgement. Historical visible values are not automatically cleared, and the owner may always unequip them. Browser profile writes cannot change these six authority-controlled fields.

New token-shop frames/effects require matching permanent entitlements. Other values must match a trusted `battle_pass_tiers` definition by name or reward ID and the requested type (`frame` maps to `cosmetic`). A nonpremium level-one tier stays free. Higher nonpremium tiers require sufficient `_verified_xp_authority` XP. This new tally starts at zero, increments only on new verified challenge consumption, and never imports historical `total_xp`, `current_level`, arbitrary public verification flags, or already-consumed older claims. Displayed old XP remains unchanged; reconciling legitimately earned older tiers requires separate evidence.

Premium tiers require a current protected gift, server subscription, or active owner role, using the same premium predicates as the premium-status service and transaction-scoped reads. Native-only RevenueCat entitlements without backend fulfilment cannot certify equip access. Reserved owner/moderator colors additionally require active stored staff roles; disabled/malformed flags, profile names, and cosmetic badges do not grant those roles.

Badges require an existing live owner grant plus either current bound staff authority proof or a consumed nonlegacy protected challenge proof. Any staff authority record that revokes or fails validation takes precedence over challenge fallback. Old `user_badges` markers alone never certify a new equip. Existing badge presentation preferences continue independently.

## Rollout and validation

Coordinate the callable, migrated UI, rule removals, all private namespaces, badge proof and verified-XP writers. Add `token_events(user_id ASC, created_at DESC)` and `_challenge_reward_authority(auth_uid ASC, badge_id ASC)` indexes before enabling their queries. Do not deploy all Functions; do not change auth configuration or production `auth2faRequest`.

Focused unit suites cover tuple collisions, canonical owner bindings, old-record quarantine, malformed wallets, request replays/payload mismatch, concurrent overspend, permanent duplicates, repeated consumables, rollback, activation overlap/expiry, premium revocation during equip, private-XP tiers, staff color gating and negative badge proof. Callable tests cover authentication, rate limits, routing and exclusion of caller earning amounts. Demo Firestore transaction fixtures must cover integrated credits/debits/activation/equip using the real SDK. Emulator success does not verify deployed composite indexes or production historical integrity.

Before release, use isolated test accounts to verify wallet refresh, failed purchases, lost acknowledgement retries, activation, exact expiry, inventory quantities, migrated identity, account-switch/unmount suppression, and truthful unavailable/reconciliation UI. This source migration does not claim provider certification or production readiness.
