# Inbox preference persistence — 2026-11-14

Server-generated inbox previews omitted the conversation ID on embedded membership rows. The strict existing action guard therefore could not identify the viewer's saved pin/mute membership. The preview adapter now retains the participant list and complete conversation/member tuple; the action still re-reads and validates the physical membership before writing.

A stale projection also replaced an acknowledged preference in the legacy cache. Merging now preserves correctly scoped physical memberships, roles and preferences while refreshing projected peer profiles. A synthetic canonical member cannot shadow an existing UID membership. Projection-only conversations retain their existing fallback. No membership, role or server permission is created by this client change.

Current main `2f6e230` was merged before publication, preserving the separately verified deployed premium reader and its client account-session guards. This release makes no additional backend operation; the earlier premium deployment/read receipts remain in [premium-status-20261114](../premium-status-20261114/README.md).

## Verification

- The actual action-hook regression failed before repair: a pinned/muted projected row reported false. Both canonical and legacy-UID merge regressions also failed before repair. The exclusion test confirms that a participant list omitting the viewer cannot dispatch the preference write.
- Final combined full suite: 540 test files passed, one skipped; 5,235 tests passed, six skipped; 204.84 seconds with four workers.
- Typecheck and lint passed with zero warnings/errors. Production build, boot/native entry, CSS and bundle budget passed. Local entry app-V5X68S0y.js: 858.8 KB raw / 262.0 KB gzip.
- Actual isolated browser plus Firebase SDK: loaded saved Unpin/Unmute controls; switched both off; confirmed exact physical membership writes; ran the actual server rebuildConversationInbox; fully reloaded and saw Pin/Mute. Switched both on, rebuilt and reloaded again, then saw Unpin/Unmute. Immediate feedback is also correct before the projection catches up.
- Both real server rebuilds preserve the other UID alias and peer preference records. Test preferences finish at their original values and the demo rollout configuration was restored. See roundtrip.json. Screenshot remains local at ignored work/preferences-persisted.jpg; no real account preference was changed.
- The six normally skipped Auth persistence cases were also enabled and all passed against a separate real Auth emulator on9296/projectdemo-vybe-persistence. The actual browser Firebase SDK covers delayed credential hydration, failed native lookup, explicit signed-out state, logout tombstones, ordinary saved sessions and session-storage fallback. Native vault transport is synthetic; this is not a physical-phone result. The owned test service was stopped afterward. See auth-persistence.json.

## Current backend availability

At 2026-11-15T01:21–01:24Z, checkPremiumSubscription returned a correct 204 browser preflight and 401 UNAUTHENTICATED for an unauthenticated request, with the correct site origin. Its earlier 403 is no longer reproduced. This client repair did not alter that service or IAM; authenticated entitlement and payment behavior remain unverified. tokenMarketplace still returns404 and is absent from the current functions inventory. See availability.json.

No Functions, Rules, indexes, Auth/provider settings, IAM, credentials, billing or native binary changed. The complete app audit remains active, including marketplace rollout prerequisites, authenticated provider journeys and physical-device behavior.

## Verified publication

Source `7e3aa99f374527a56f3de20f36251cc00ca051d2` was published through Lovable deployment `7f7aeaf8-ef2f-4bd6-b4fe-53c6d369b54d`. At 2026-11-15T01:35:26.060Z, vybehub.app served exact tested source fingerprint `96d9b4d0e48d5127361cd6bd4e60813549ce8fc5027d446e35eedee54ee62378` /2662files. Source parts/config/public/runtime identity, the published entry digest, ten route shells and all709 native manifest assets passed. See verification-public.json.

Hosted entry `/assets/app-CcsobMRc.js` has SHA256 `c75b355be49356b3ec99bac352583c182f03b343d6252d967a295c3022f6a952`; native deployed_at is `1794706418135`. Its name differs from the local build; source/runtime identity and its own exact entry bytes are verified. Device installation/adoption and the wider126-route feature inventory remain unverified.
