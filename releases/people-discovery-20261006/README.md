# Existing friend suggestions recovery

Matched existing `getDiscoveryProfiles`, general/mutual hooks and six Quick Add screens. Suggestions are read through current Firebase account and canonical ownership checks; errors offer retry instead of empty success. Missing birthday opens the existing private birthday save. No DOB guessing, real account mutation, bulk content migration or new feature.

The service respects ages, profile/mutual visibility, both block directions, existing friends, outgoing requests and dismissals. Duplicate aliases count one intermediary. Replies contain no target email, birthday, Firebase UID or intermediate friend identities. Current-account leases expire after at most 15 seconds; background/account transitions retire reads. Discovery results never persist to disk.

Verification: full 4596 passed, six skipped; client build/native manifest/typecheck/lint pass (five existing warnings); root bundle1102.8KB raw334.8KB gzip. Real Firebase SDK transport accepted114ms for synthetic Bob requiring age review. Real backend13 grouped checks and private birthday62 Rules checks pass. Synthetic preview `/friends/add` displays birthday review, opens a blank disabled-save dialog and cancels without data changes. Physical phone network/GPS/video performance remains unverified.

Exact release resources:

- Only `functions:getDiscoveryProfiles`; preserve DOB migration/admin exports and unrelated Functions.
- Four existing required indexes READY; create only missing `dismissed_profiles(user_id ASC,dismissed_user_id ASC)` from resources.json and await READY.
- Active Firestore baseline8c9ac23dca7994c7093d1168998366588b0ca2e39ab753f9facd3e9581ef069b lacked private birthday access. Exact complete candidate adds only protected canonical owner get/create/update; no list/delete or public DOB write. Candidate SHA256f7be92e5abb8fa5fb8c8a9fc263440a3478a0e9829b92c84d0085402df999f78. Do not deploy broader root Rules. Source-byte assertion verifies the rest of the active baseline is preserved.
- Storage baselinea6aa1032b05815594041d457e4064f72cc6596f9850d527efb84fbec43e3e3d8 remains unchanged.
- Publish exact tested main via Lovable and verify canonical metadata/entry bytes/routes and actual publisher status. Frontend publication pending.

No claim that all content is restored or the app is user-ready. Checked DNA ranking, other raw friend graph consumers, retained content review, old-browser adoption and actual phone location/Clips verification remain open.
