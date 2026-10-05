## Home customization release

The editor now inserts added widgets at the top, provides a drag grip and keyboard/touch move buttons, exposes clear width/height controls, and preserves drafts on refresh or failed saves. Imported preferences keep their existing document ID. Account-scoped caching and migrated-profile rollback prevent another account's layout or a rejected optimistic update from appearing saved.

The adjacent Rules candidate changes only `user_preferences` against the authenticated live baseline `projects/vybe-daaab/rulesets/4583d3f4-8f6c-42fa-80b9-c2d0cc1dc41e`, SHA-256 `f421cde69d505389a1665404601e5ba32f8cc5e5815fd00b49ac7b204b544d69`. Repeated ownership helper evaluation previously exhausted the 1,000-expression limit for a missing migrated-profile preference document. The focused check retains account binding, profile ownership, deleted-profile and UID collision restrictions, supports existing imported document IDs, and prevents ownership reassignment.

Candidate SHA-256: `8a8e05c4f38abfa1a905b60e0f5ee0fc49f287015c22b1169e6970577f7db596`.

Validation: 33 checks across exact baseline/current/candidate Rules, including reproduction of the baseline failure, and 15 real Auth/Firestore SDK checks against the retained demo. The candidate differs from the actual baseline only in this collection block. Client tests cover addition, cancellation, resizing, retry, late completion, legacy rows, separate appearance settings and account changes. Browser drag/save/reload and a separate account were checked.

**Not deployed:** three official Firebase CLI attempts on 2026-10-05 returned HTTP 503 from the Google Rules service. The first compiled successfully before upload failed; subsequent attempts failed at the service's test endpoint. Independent authenticated reads after the attempts confirm the baseline above remains active. Logs: `work/home-customization-rules-{deploy,retry,final-attempt}.log`. Do not treat this source checkpoint or a Git push as a successful live Rules release.

Once the service recovers, re-read the actual live baseline and stop/rebase/retest if its hash changed. Release only the adjacent candidate:

```powershell
node ../qa-tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --only firestore:rules --project vybe-daaab --config firebase.home-customization.json --non-interactive
```

Verify the resulting active Rules source/hash independently. Do not release the repository's whole pending Rules file or deploy unrelated Functions. No Functions, indexes, secrets, Storage policy or Auth configuration changes belong to this repair.

The finished client is delivered through `origin/main`. Production web/phone UI still requires Lovable Share → Publish after the existing coordinated sign-in prerequisites in [SIGN_IN_RECOVERY.md](../../docs/SIGN_IN_RECOVERY.md). The user's requested live login was attempted on `vybehub.app` and remained blocked by “The email confirmation could not be started.” The current combined source must not be published as an isolated Home fix against incompatible sign-in services; the historical `auth2faRequest` restriction remains.
