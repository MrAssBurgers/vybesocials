# Community entry, recovery and account binding

Existing community cards were mouse-only, URL changes could disagree with the selected view, unavailable queries could appear as empty lists, and delayed service calls did not carry their initiating account/profile through Firebase transport.

Cards now expose named keyboard buttons and focus feedback. URL selection follows same-page links and browser history, with room data scoped to its community. Invitation links received while mounted open the existing dialog and remove the invitation from the URL. Named search and 44px primary controls improve access. Loading, empty, unavailable and failed states have distinct messages and Retry actions. Join progress identifies the chosen community.

Requests carry the initiating UID and available profile ID. The five existing community callables reject an explicit mismatch before any community domain write. A mismatched profile may still consume the existing rate-limit counter. Legacy callers retain the existing verified Auth/private-admission policy; this does not widen membership or establish a complete credential/profile-incarnation audit.

## Executed checks before combining newer main

- New regressions reproduced the original defects. Final focused six files/102 cases pass. Full suite:546 files passed/one skipped,5,279 tests passed/six skipped,124.56 seconds, exit0. Typecheck/lint/build/boot/native entry/CSS/bundle budget pass; lint zero errors/warnings. Client identity20ceab76f5f8250a441f1f6abc95d8a8d57462e409da0396931b4f8d412c8358,2,670 files. This is the pre-merge checkpoint, not the final publication identity.
- Actual Node22.23.5 frozen-package entrypoint check exposes exactly the five intended callables and rejects missing authentication on all five.
- Actual demo Firebase Auth tokens, HTTP callables and Firestore SDK: nine journey groups pass, including creation replay, private discovery, invitation rotation, membership replay, private-channel exclusion, text replay, send permission, leave/revocation and preserved owner history. No forged admissions or Admin writes in this journey.
- Seven additional private-surface groups pass, including actual attachment bytes/range/HEAD and immediate GET/HEAD revocation. This separate fixture uses Admin only for explicitly temporary setup/restoration; its friendship prerequisite now uses the actual authenticated send/accept services.
- Native Chrome at390px with actual page/cards/CSS and explicitly synthetic hooks: card entry, same-page Beta/media link, browser Back through Alpha/chat to list, failed-list notice and successful Retry, named search/filtered result transition observed. Selected-shell/dialog transport is excluded in this interface fixture. Keyboard behavior is executed in component tests; this manual pass does not prove a complete live browser-to-Firebase journey, wide layout, voice or physical phone.
- Exact live Firestore source was read without changing cloud policy and used in the emulator. Storage came from the local QA baseline and was not independently compared to live. Disposable demo state was exported with quotas/history preserved between runtime changes.

## Release boundaries

All four transitive shared modules are semantically identical to both deployed source baselines. Only the caller checks differ in community.js. The isolated package pins the deployed Firebase SDK versions13.10.0/6.6.0 and exports exactly communityCreate, communityJoin, communityInvite, communityManage and communitySendMessage. Eight inherited moderate npm audit findings remain; no forced dependency upgrade was included.

Backend and client publication receipts follow only after successful deployment verification. No production messages, communities, memberships, account settings or purchases were submitted during QA. Other Functions, Rules, indexes, Auth/provider settings, secrets and native binaries are outside this release. The entire-app goal remains active: physical-device lifecycle/performance, providers, history/authority reconciliation, marketplace readiness and permanent account cleanup remain open.

Owned QA servers stopped after tests. Final emulator export hit a Windows rename lock after writing all data; verified its complete export metadata and copied the owned synthetic export into work/local-preview/state-community-final-20261114. No reset or production operation occurred. User-added unrelated browser tab was preserved; no whole-window close was issued.

## Final combined local verification

Preserved origin/main bf8414a, including the already released optional-login-location service and direct profile Clips query, plus prepared marketplace actor/Rules work. No marketplace or authentication backend was included in this deployment. Final combined suite exits0:547 files passed/one skipped,5,304 tests passed/six skipped,120.95 seconds. Typecheck, zero-warning lint, production build, Functions compile, boot/native entry, CSS and bundle budget pass. Local entry app-D5dCDkXi.js858.8KB raw/262.0KB gzip; exact client identity669f178b04519504093fddf71fff9801236cf6cc4982dca3b8bac8b3c22e5bc2/2,672files matches dist. No runtime source edit after these checks.

The frozen five-export archive SHA25634f2ad1b42b075bf1727c0bcadb3bfbc890e03d17267a47153e93188ec209f5d is54,068bytes. Submitted exactly one source/runtime update for each of the five existing services; service settings are excluded from the update mask. Four old Node20 services move to Node22, while communityManage retains Node22. Operation handles are retained; pending operations must be observed, never resubmitted. Completion/source readback follows separately.

## Verified backend completion

At2026-11-15T03:43:30.730Z all five operations completed successfully. Each existing function is ACTIVE Node22, and each downloaded deployed archive exactly matches the staged/tested34f2ad1b digest. All service configuration fields other than the expected revision identity are independently unchanged. All five browser preflights return204 with the correct origin and guest POSTs return401/UNAUTHENTICATED. No real member action was submitted. See deployment-backend.json. No backend update was resubmitted.

A newer accepted-code completion client3941e8c arrived before publication and is preserved in merged source d5379f6. It keeps observing accepted login work through slow profile/device checks and retains the exact account/challenge guards. The final combined client checks are rerunning for that changed runtime source; the5,304-test/669f178b checkpoint above is now the earlier combined checkpoint, not the eventual published identity.
