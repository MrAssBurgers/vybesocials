# Profile clips query and honest bounded counts

The profile Clips tab previously fetched a mixed first page and discarded non-clips in the browser. Older clips could require scanning unrelated posts before appearing. It now requests contentType short through the existing admitted post-list reader. Returning to Posts restores its original mixed selection, preserving video/text/image grid behavior. Existing account/view/deadline/lease and pagination checks are unchanged.

The header no longer presents a partial page as an exact visible-post total. An unfinished window is a lower bound; a clips-only page does not become a profile total. Confirmed summary labels, including zero, remain authoritative.

Two regression cases failed before repair. The11-case actual Profile render suite passes, including direct older-clip selection, return to Posts, lower-bound counts and exact zero. Full62794exit0:544files pass/one skip,5271tests pass/six skip,121.20seconds. Types/lint/build30447exit0; zero lint warnings/errors, boot/native entry/bundle budget pass. Entryapp-BYBdeFzL.js858.8KB raw/262.0KB gzip. Exact source3f41a04d255a5f9bd5c9538839b92abcf1ac784d000318ac2dd6154907c188e4/2667files independently matches dist after restoring generated public outputs. No runtime edit after checks.

The exact production Firestore author_id IN + type short + created_at DESC/name DESC query succeeded using a random nonexistent author and returned zero documents. No index creation or real content read/write was needed; see verification-query.json. This verifies query availability, not actual authenticated account admission.

Native browser automation fallback: isolated Chrome Guest, actual Profile page/tabs/CSS with explicitly synthetic hooks/header/clip renderer. Posts displayed1+ and the recent post; clicking Clips displayed the older clip and unknown full total; returning to Posts restored1+/recent post. Screenshotwork/profile-older-clip-check.png captures the settled clip tab. No actual media playback, real credentials, account mutation or physical-phone speed is inferred. Initial background Chrome click lacked geometry; activation produced a matching screenshot and the guest test proceeded. Guest window68916closed and helper8357stopped; existing signed-in Chrome263582 was not operated. Browser-integration tools were unavailable for this turn, so no production signed-in walkthrough was made.

This is a client-only existing-flow repair. The verified prior authLoginNotify latency deployment and its exact security/permission boundaries remain preserved. Full public readiness, preserved history/media coverage, provider/device journeys and the user's exact fresh phone-code failure remain open. Publication receipt follows separately.

## Verified publication

Client889f408df617066f9799d5254624fff0509a7207 published through Lovable deployment82c90e38-ab46-421c-9c03-94b9f1f9a3ce. Observation91689exit0 at02:57:56.580Z confirms exact source3f41a04d, all source parts/runtime dependencies, hosted entryapp-B2z0S83B.js/SHA256f3cb9d46479a57c876b98e8591a95e2a2abd7dc0b3356de374c805c89e0dda8c, ten route shells and all709native manifest assets. Native deployed_at1794711426903. See verification-public.json. The pending deploy response alone was not treated as success. No fresh production signed-in UI or physical installed-phone claim follows from these delivery checks.
