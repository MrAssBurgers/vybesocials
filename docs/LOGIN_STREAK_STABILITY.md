# Login streak stability

This checkpoint repairs daily login tracking and the existing restore flow. It does not change relationship streaks, award rewards, introduce a subscription requirement, or deploy anything to production.

## Current behavior

`manageLoginStreak` is the checked callable for `read`, `track`, and `restore`. Requests bind the authenticated UID, canonical profile ID, and current Firebase Auth creation time through `expectedOwnerUid`, `expectedProfileId`, and `expectedAccountCreatedAt`. A current protected account-profile binding is required. Identity, profile/index collisions, binding retirement, and Auth incarnation are checked before data is returned or committed.

Tracking runs in a Firestore transaction using server time. The first tracked day captures an IANA timezone. That calendar remains fixed when the device timezone changes; the response and popup identify the effective timezone. Civil dates, rather than elapsed 24-hour periods, handle daylight-saving and year boundaries. Multiple tabs, concurrent calls, and repeated logins cannot increment the same calendar day twice.

A restore is available only for a **verified previous run with exactly one missed calendar day**, and only **until midnight ending the current return day in the saved streak timezone**. The broken-day tracking operation may already have started a new one-day run; it retains the eligible previous run. Restore sets the count to that previous run plus today's login once. It does not restore the longest-ever streak, add a fictional login on the missed day, or revive a run after multiple missed days. The server rechecks the captured state revision and eligibility at commit.

The existing launch policy makes functional perks free. `LOGIN_STREAK_RESTORE_LAUNCH_FREE = true` explicitly preserves that policy on the server, matching `usePremiumStatus`; no caller flag or profile premium field grants access. The popup says restoration is available during launch. If that policy is deliberately changed in a later release, the existing helper requires a current accepted private premium grant or unexpired active UID subscription. Expired, revoked, pending, malformed, or foreign entitlements are not accepted. This checkpoint does not make a pricing decision or add a restore frequency limit.

## Retries and client lifecycle

Track and restore requests carry stable UUIDs. Restore also carries the displayed 48-hex revision. Protected receipts bind the exact normalized request, actor, account incarnation, resulting state revision, day, and checked event flags. An exact retry can replay only while that result is still current; an old-day or superseded receipt fails without replaying a celebration, changing the run, or recreating missing state.

The client validates the complete receipt and preserves uncertain requests in bounded same-tab retry storage. Account epoch, native Firebase user, mounted view, and popup presentation guards retire late completions. A 15-second deadline exposes retry; it cannot cancel a server transaction that may already have committed. Retry therefore uses the same request instead of assuming a timeout meant failure.

The provider tracks once per observed calendar day while visible, with bounded minute, focus, and foreground checks for a session kept open across midnight. Failed daily attempts require deliberate retry rather than a mutation loop. Status reads require a fresh mounted result, never previous-account placeholders. Login-streak queries are excluded from persisted query data. Headers expose a retry state when reading fails. The popup distinguishes a new run, a verified restore, unverified historical data, and unavailable state; it displays the restore deadline and removes the action after that deadline. Popup motion respects reduced-motion preferences.

## Historical records

Raw `login_streaks` records were previously caller writable. They cannot prove an earned historical run, premium access, or a restore entitlement.

- A single bounded, well-formed, currently owned legacy record is preserved for display. Its current run may continue when dated today or yesterday, and its historical best remains displayed. That inherited run remains explicitly unverified for restoration until a natural break starts a new checked run.
- Multiple matching rows, malformed values, and future dates are reported as ambiguous or invalid. The service does not pick an arbitrary row, delete old records, or silently rewrite them.
- The original documents remain untouched. The first checked track records the legacy display snapshot separately from verified state. Later raw changes do not alter the protected history.
- Corrupt protected state requires review; the service does not reset it automatically. Recovery that changes an independently bound account/profile may require deliberate streak-specific review, rather than transferring history automatically.

Counts are bounded at 1,000,000. This is a validation/storage bound, not a new reward or pricing policy. No longest-streak value from historical storage authorizes restoration or rewards.

## Coordinated release

Follow [DEPLOY.md](../DEPLOY.md). This document records requirements, not a completed deployment.

1. Ensure the existing checked account-profile setup is deployed and clients can obtain a valid `_account_profile_bindings/{uid}` binding; see [ACCOUNT_PROFILE_STABILITY.md](ACCOUNT_PROFILE_STABILITY.md).
2. Deploy the named callable **`manageLoginStreak`**, exported from `functions/src/loginStreak.ts` by `functions/src/index.ts`. Its new helper is `functions/src/_shared/loginStreakAuthority.ts`. It uses Firebase Auth and Firestore, has a per-UID limit of 60 calls per minute, and needs no new provider, secret, or Auth configuration.
3. Release the checked streak client, including the compatibility calls in `socialRpc.ts` and the brief reader in `briefRpc.ts`, together with the Firestore rule cutover. Raw `login_streaks`, `_login_streak_state`, and `_login_streak_receipts` reads and writes are denied to every client, including owners and admin claims. The Admin SDK authority performs the checked operations. Old clients that still read or write raw streak documents will fail after this cutover.

There are **no new indexes or TTL policies** for this feature. `_login_streak_state/{uid}` is durable checked state. `_login_streak_receipts/{requestHash}` is durable retry evidence; do not apply automatic receipt expiry without redesigning replay protection. Relationship `streaks` and `reaction_streaks` rules are unchanged. This release does not request `auth2faRequest` deployment.

Auth and Firestore do not share an atomic commit. The helper checks current Auth before and immediately before the transaction result/write, and binds its creation time, but this is not universal account-incarnation enforcement across unrelated legacy endpoints. Production availability and migrated-data compatibility must be verified after the coordinated deployment. No production streak record, real subscription, or provider was exercised by this checkpoint.

## Verification

- `scripts/test-login-streak-backend.mjs`: **15 backend groups and 60 Rules checks passed** against isolated demo Auth/Firestore. Coverage includes strict actor/incarnation binding, concurrent same-day tracking, exact retries, stale receipts, one-day restoration before/after tracking, expired and multi-day gaps, preserved/ambiguous legacy records, timezone movement, DST/year boundaries, late account changes, malformed protected state/receipts, and raw-access denial for owner/other/admin/guest.
- `src/lib/loginStreakAuthority.backend.test.ts`: **16 tests passed**, covering civil midnight/DST calculations and launch-free versus paid-entitlement expiry checks.
- The checked client/compatibility/provider/calendar/popup suites passed **38 focused tests**, including account changes, exact uncertain retries, deadline failures, overnight/foreground tracking, failed-read states, and restore-deadline copy/expiry.
- Functions build, application typecheck, scoped lint, and diff checks passed during integration. Root integration owns the final full-suite/build and manual preview results; this document does not substitute focused results for those checks.

Backend evidence is in `work/stability-eighth-login-streak-backend.log`. The fixture refuses the retained preview project and requires isolated Firestore `127.0.0.1:8387` and Auth `127.0.0.1:9297`; both emulators were stopped cleanly afterward. Do not run its clearing fixture against a live or retained preview dataset.
