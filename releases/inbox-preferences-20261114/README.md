# Inbox preference persistence — 2026-11-14

Server-generated inbox previews omitted the conversation ID on embedded membership rows. The strict existing action guard therefore could not identify the viewer's saved pin/mute membership. The preview adapter now retains the participant list and complete conversation/member tuple; the action still re-reads and validates the physical membership before writing.

A stale projection also replaced an acknowledged preference in the legacy cache. Merging now preserves correctly scoped physical memberships, roles and preferences while refreshing projected peer profiles. A synthetic canonical member cannot shadow an existing UID membership. Projection-only conversations retain their existing fallback. No membership, role or server permission is created by this client change.

## Verification

- The actual action-hook regression failed before repair: a pinned/muted projected row reported false. Both canonical and legacy-UID merge regressions also failed before repair. The exclusion test confirms that a participant list omitting the viewer cannot dispatch the preference write.
- Final full suite: 540 test files passed, one skipped; 5,233 tests passed, six skipped; 205.57 seconds with four workers.
- Typecheck and lint passed with zero warnings/errors. Production build, boot/native entry, CSS and bundle budget passed. Local entry app-Cb8WYRvf.js: 858.6 KB raw / 261.9 KB gzip.
- Actual isolated browser plus Firebase SDK: loaded saved Unpin/Unmute controls; switched both off; confirmed exact physical membership writes; ran the actual server rebuildConversationInbox; fully reloaded and saw Pin/Mute. Switched both on, rebuilt and reloaded again, then saw Unpin/Unmute. Immediate feedback is also correct before the projection catches up.
- Both real server rebuilds preserve the other UID alias and peer preference records. Test preferences finish at their original values and the demo rollout configuration was restored. See roundtrip.json. Screenshot remains local at ignored work/preferences-persisted.jpg; no real account preference was changed.

## Current backend availability

At 2026-11-15T01:21–01:24Z, checkPremiumSubscription returned a correct 204 browser preflight and 401 UNAUTHENTICATED for an unauthenticated request, with the correct site origin. Its earlier 403 is no longer reproduced. This client repair did not alter that service or IAM; authenticated entitlement and payment behavior remain unverified. tokenMarketplace still returns404 and is absent from the current functions inventory. See availability.json.

No Functions, Rules, indexes, Auth/provider settings, IAM, credentials, billing or native binary changed. The complete app audit remains active, including marketplace rollout prerequisites, authenticated provider journeys and physical-device behavior.

Client publication and public delivery evidence will be recorded after verification.
