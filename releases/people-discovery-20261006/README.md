# Existing friend suggestions recovery

Matched existing `getDiscoveryProfiles`, general/mutual hooks and six Quick Add screens. Suggestions are read through current Firebase account and canonical ownership checks; errors offer retry instead of empty success. Missing birthday opens the existing private birthday save. No DOB guessing, real account mutation, bulk content migration or new feature.

The service respects ages, profile/mutual visibility, both block directions, existing friends, outgoing requests and dismissals. Duplicate aliases count one intermediary. Replies contain no target email, birthday, Firebase UID or intermediate friend identities. Current-account leases expire after at most 15 seconds; background/account transitions retire reads. Discovery results never persist to disk.

Verification: final full4597 passed, six skipped; client build/native manifest/typecheck/lint pass (five existing warnings); root bundle1102.8KB raw334.8KB gzip. Real Firebase SDK transport accepted106ms for synthetic Bob requiring age review. Real backend14 grouped checks and private birthday62 Rules checks pass. Synthetic preview `/friends/add` displays birthday review, opens a blank disabled-save dialog and cancels without data changes. Physical phone network/GPS/video performance remains unverified.

Before publication, an authorized designated server domain read took11748ms. A protected-binding negative prefilter now rejects unbound/retired candidates before identity query fan-out; all admitted identities still pass every original ownership/uniqueness/incarnation check. Eight bounded concurrent candidates preserve deterministic result order. Same account read5524ms afterward; emulator120selected30admitted639ms. These are server/domain measurements, not physical phone or callable response guarantees. A demonstrated shortened-lease flicker test fails before/pass after lease-driven early refresh; expired responses still disappear.

Exact release resources:

- Only `functions:getDiscoveryProfiles`; preserve DOB migration/admin exports and unrelated Functions.
- Four existing required indexes READY; create only missing `dismissed_profiles(user_id ASC,dismissed_user_id ASC)` from resources.json and await READY.
- Active Firestore baseline8c9ac23dca7994c7093d1168998366588b0ca2e39ab753f9facd3e9581ef069b lacked private birthday access. Exact complete candidate adds only protected canonical owner get/create/update; no list/delete or public DOB write. Candidate SHA256f7be92e5abb8fa5fb8c8a9fc263440a3478a0e9829b92c84d0085402df999f78. Do not deploy broader root Rules. Source-byte assertion verifies the rest of the active baseline is preserved.
- Storage baselinea6aa1032b05815594041d457e4064f72cc6596f9850d527efb84fbec43e3e3d8 remains unchanged.
- Published exact tested main35eaa6764253b570dcdf4d50257dbff0ca28ec29 via Lovable, deployment863520cd-d4d8-45a6-9b36-eb777375894c. Actual publisher confirms website up to date. Public schema v2 source6989a8657709728f025d7f9aa3ef0923aa68d4cef0f505e9e644b4622dcda6ce/2560inputs; built2026-10-06T09:47:02.049Z; entry/assets/app-CGo4OQaB.js SHA8389c41dea6b94d884a3a43eebecb76cc4f4deab62dcaf4e5c1146fb277911de. Exact metadata/entry bytes/five route HTML verified; secondary redirects canonical. Publication screenshot outputs/vybe-discovery-recovery-published.png.

Final named service ACTIVE/update09:45:00.169589821Z, all five indexes READY, exact Firestore candidatef7be92e5 active/ruleseta1e2c40a-f544-4155-8f7b-f6c7e5317923; Storagea6aa1032 unchanged. Actual guest HTTP returns401UNAUTHENTICATED with canonical CORS. No other Functions or broader root Rules deployed. Initial Rules creation503 and Git push reset recovered on one retry each; failed actions did not substitute for verification.

Public HTTP serves current build, but retained IAB still runsapp-CGCcULTp.js; a new Chrome tab and normal reload runapp-5p_yKDY_.js with legacy raw discovery fallback and DM membership permission warnings. `/friends/add` HTTP serves currentCGo with no-cache/must-revalidate/max-age0, no Vary/Age. Browser release-adoption cause remains unproven; no session/cache/worker purge or real private birthday/GPS change was performed. Do not claim actual signed-in current-client/phone flow verified.

No claim that all content is restored or the app is user-ready. Checked DNA ranking, other raw friend graph consumers, retained content review, old-browser adoption and actual phone location/Clips verification remain open.
