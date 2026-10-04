# Challenge rewards and badge authority

This is a source-only security migration. No production balances, rewards, badges, roles, or activity were inspected or changed. Existing XP is not reset or assumed trustworthy.

## New boundary

Browsers can read their challenge progress and receipts, create only their canonical level-one/zero-XP bootstrap, and edit their earned badges' presentation preferences. They cannot write progress, reward amounts, claim status, XP, levels, badge ownership, expiry, or grants. Admin browser clients also use the trusted grant endpoints instead of bypassing these restrictions.

`incrementChallengeProgress` and `syncMyChallengeProgress` derive progress from retained owned activity. Caller-provided increments, user IDs, counters, and previous progress cannot issue rewards. Both endpoints share a six-request/minute/account limit; force sync does not bypass it. Claim requests have a thirty-request/minute/account limit.

The server verifies the challenge definition, requirement type/count, XP, badge ID, and daily/weekly window. The maximum supported requirement is 200 activities and the maximum configured reward is 100,000 XP. Unknown or malformed definitions require reconciliation. Existing retained definitions can verify historical periods; an authenticated request only proves login in its current period. Lifetime achievements use retained lifetime activity.

Activity queries are bounded to 200 rows per challenge. Eligibility uses Firestore document `createTime` inside the challenge window, not editable `created_at`, view counts, login streak counters, or previous completion flags. Stories are read from `stories`; clips and posts from `posts`; comments, reactions, follows, and messages from their respective collections. Reactions and follows are deduplicated by target. Deleted/draft sources do not count. Follows require an existing different account; reactions/comments require an existing nondeleted post with an existing different author. Target reads are cached and included in the issuance transaction. This does not certify content quality, defeat Sybil farming, or provide a general anti-spam/moderation system.

Issuance atomically creates `_challenge_reward_authority/{sha256(JSON.stringify([authUid, challengeId]))}` and updates the public progress/receipt mirrors. Only this new protected namespace authorizes consumption. Historical client-written `challenge_rewards` rows do not become authority merely because their schema looks correct. Public legacy concatenated IDs retain tuple ownership checks and fail closed on a collision. The new protected namespace uses hashed tuples to avoid delimiter collisions.

Consumption verifies the owner and protected proof, then atomically marks it consumed, credits XP, advances level, and grants the challenge badge. Concurrent/replayed claims credit once. Existing balance, higher level, creation time, and unclaimed tier rewards are preserved. Existing badge display preferences are preserved. Alternate owned legacy receipt IDs settle as claimed when the shared proof was already consumed, without another credit. Issued proof remains usable if the underlying source or rotated challenge definition is later removed.

The existing Vybe Score completion hook runs best-effort only for the winning claim. It is not part of the XP transaction; a hook failure after a committed claim can leave the separate score unreconciled. This change does not implement new battle-pass cosmetic fulfilment or repair historical score events.

BattlePass reads and subscribes to both Firebase UID and migrated profile owner aliases. Its reward list groups receipts by challenge and treats any consumed alias as settled, so migrated duplicates do not offer repeated claims. Cache keys include the account identity, level invalidation uses the UID key, and stale account completions do not trigger reward notifications. An existing migrated XP row is read before provisioning a zero bootstrap.

## Staff badge actions

`awardBadge({p_user_id, p_badge_id, p_expires_at?})` and `revokeBadge({p_user_id, p_badge_id})` require the existing active-admin/custom-claim authority check and share a sixty-mutation/minute/staff limit. A target may be a Firebase UID or unique migrated profile ID. Target profile, auth index, badge definition, and existing grant ownership are verified in the write transaction; ambiguous identities or occupied canonical IDs require review.

Awards select an existing server-managed badge definition, create a canonical grant, and preserve a unique existing migrated grant on retry. Optional expiry must be a valid future timestamp. Awarding an already-earned badge does not extend or replace its existing expiry. Revocation removes up to twenty matching legacy aliases and is idempotent; more requires operator review. Revocation can clean up an old grant even if its definition was deleted. Neither endpoint writes staff-role records or auth claims, and caller-supplied badge names or role fields are ignored. An owner/admin/moderator-looking badge is presentation, never staff authority; `useModeration` no longer uses it as a fallback.

Badge display updates continue through Firestore, with owner-only boolean presentation flags and bounded pin order. The frontend updates both UID and migrated profile owner aliases.

## Legacy reconciliation

- Prior claimed receipt aliases suppress reissue. They do not certify how the historical XP was earned, and do not cause an automatic balance correction.
- Unclaimed legacy rows need a retained valid challenge definition and eligible activity. Deleted definitions, expired/deleted source records, migrated timestamps, or activity outside the bounded query may make historical eligibility impossible to prove. These cases remain pending operator reconciliation, not automatically eligible.
- Existing malformed/ambiguous level rows, multiple balances, squatted canonical documents, inconsistent mappings, and excessive duplicate receipts fail closed. The new backend does not choose an arbitrary balance, merge sums, overwrite another owner, or reset earned XP.
- Previously client-writable badge rows can still look valid. The new rules prevent future browser grants but do not certify or purge old grants. Any badge audit/revocation requires a separate operator-reviewed process. Cosmetic badges no longer confer staff authority regardless of provenance.
- Challenge rotation still deletes older daily/weekly definitions. Already-issued protected proof survives this; unissued legacy claims may need external retained evidence. A retention/archive migration remains separate.
- Document creation time prevents timestamp editing from moving an old source into a new window, but imported records created in a later migration do not necessarily prove their original event time. Do not manufacture proof for them without trusted retained evidence.

## Selective rollout and verification

Deploy indexes before enabling the new backend queries: `stories(author_id, created_at ASC)`, `conversations(created_by, created_at ASC)`, `challenge_rewards(user_id, challenge_id)`, `challenge_rewards(user_id, created_at DESC)`, and `user_badges(user_id, badge_id)`. These are included in `firestore.indexes.json`; existing post/comment/reaction/follow/message indexes are reused. The emulator does not verify production composite-index readiness.

Release the updated reward callables, new `awardBadge`/`revokeBadge` exports, rules, and compatible client together through the repository's normal staged process. Do not deploy all Functions or change production `auth2faRequest`. Historical integrity repair is not part of deployment. Operator review and test-account staging are required before enabling the production change.

Focused checks live in `challengeRewardAuthority.backend.test.ts`, `badgeAuthority.backend.test.ts`, `useModeration.badgeAuthority.test.tsx`, `useBadges.authority.test.tsx`, and `useBattlePass.authority.test.tsx`. The optimistic transaction simulator checks read conflicts, concurrent/replayed claims, deletion before commit, commit failure rollback, ownership, malformed definitions, target validation, and legacy preservation. Staff-callable regressions verify admin/rate gates and binding; hook tests cover the server migration, confirmed responses, stale-account rejection, alias coalescing, existing balance reads, account cache keys, and realtime notification deduplication.

`scripts/test-reward-authority-rules.mjs` runs demo-only denial/compatibility cases. `scripts/test-reward-authority-backend.mjs` additionally runs compiled Admin SDK code against a real loopback Firestore emulator, including concurrent issuance, claim and staff grant transactions, createTime, replay, and UID/profile alias revocation. Both require a `demo-*` project and loopback emulator; the backend fixture clears that synthetic project. Build Functions first, and never run these scripts with production credentials or against a live project.

No browser staging call was made to a production reward or badge endpoint. Source tests do not certify existing production data or native-client rollout compatibility.
