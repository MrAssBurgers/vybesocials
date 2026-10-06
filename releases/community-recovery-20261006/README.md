# Existing hub service recovery — 2026-10-06

The shipped app calls five checked Firebase services that were absent from production: `communityCreate`, `communityJoin`, `communityInvite`, `communityManage`, `communitySendMessage`. Their ingress is callable-public while each handler requires Firebase Auth and verifies canonical ownership/admission and channel permission. No credentials or provider configuration changed.

Rules extend only the preceding exact Reports slice (`18f965b2847b6aed6a7bf783dd23e3cac666b0cf3c3fdf231717e2218c720f9a`): four community helpers and eight community leaf matches. Candidate SHA-256 `e24d910b3a8dddf68eb70fc715e48e161c8b5fc288fc341a1d124ea23d715caa`; deployed ruleset `5eec6076-4d4e-470c-abb1-1cb01c8b6e75`. Unrelated helpers and namespaces remain unchanged. Google Rules returned transient 503 twice; the third guarded attempt succeeded against the same unchanged baseline.

Verification: 84 real Rules checks; seven real Firestore backend groups for guest rejection, retained owner hub lookup, owner recovery preserving existing channels/messages, creation replay, invitation/public rejoin, message replay, and leave revocation. The full client foundation suite also covers community hooks, account changes, identity collisions, UI and policy logic.

Historical mutable server_members rows remain quarantined rather than granting private access. Owners can recover their existing hubs; members use current invitations or public rejoin. This preserves original hubs and history without promoting untrusted imported roles. This release does not certify voice-provider connectivity or private attachment uploads, whose matching service/Storage verification remains separate.
