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

## Final accepted-code and community client check

Final combined source936a2f8b4b4b825d79adfe7f98819d4d479fa799355a06aae7f78e6b5ff8987e/2,672files includes3941e8c; ce2eaae adds only its verified publication records. Full suite5,308passed/six skipped,547files passed/one skipped,119.67s, exit0. Typecheck/zero-warning lint/build/boot/native entry/CSS/budget pass; app-CXFE5ehE.js858.9KB raw/262.0KB gzip. Source independently matches dist. verification-local.json is the final source identity; verification-earlier-local.json preserves the prior5,304-test checkpoint. No runtime edit after these checks.

## Verified initial community client delivery and keyboard follow-up

Client c8e19cdc441b0807ac1e43e1e8a95334467eedcf was published once through Lovable b17c7c1f-b3ad-443b-96e2-4311dbc4e1b2. At2026-11-15T03:48:27.590Z source936a2f8b, all source/runtime parts, entry/assets/app-vdAdjJGx.js/SHA2562baccb67bf558604cb0d9ccc6402f69b39ce2ef2351c588a2b06e47040d2f15b, fifteen route shells and all709 native assets pass. Native deployed_at1794714465623. Initial client/source/delivery receipts have explicit initial filenames because a subsequent manual keyboard check found an extra focus stop. No backend redeployment is needed for that follow-up.

The six skipped-by-default browser Firebase Auth persistence cases also passed separately against disposable Auth9296:6passed,0skipped,1.86seconds. Synthetic vault transport is not physical native vault evidence. The owned Auth/hub/logging processes stopped.

After the user-added Google tab closed independently, the returned QA window again contained only the owned preview. A new390/840px walkthrough observed wide layout, empty search, a mounted incoming invitation/cleared URL, and successful Enter entry on the named card. It also exposed a redundant animated-wrapper Tab stop that does not activate. Framer Motion supplies focusability to whileTap wrappers; the inner button was correct, but one additional Tab was required. Strengthened the existing keyboard test to use actual Tab navigation instead of calling focus directly; both Enter/Space variants fail before the follow-up. Both wrapper containers now explicitly stay out of sequential focus and their native entry/Join controls retain it. The final focused3cases pass, including Tab/Enter on Join. No new feature or backend change.

A fresh final source fixture was prepared, but browser control then ended with: it could not determine the current browser URL on Windows with enough confidence to enforce policy. No further browser interaction was issued; no tool reset, alternative automation or policy workaround was attempted. The rebuilt source's manual verification and publication remain pending. The original source's wide/invitation/manual Enter observations are not substituted as proof of the final focus fix. Owned preview server39970 was stopped; the owned browser tab remains because closing it would require further prohibited app input.

Final keyboard candidate local sourceebefd5780ad460dd5a2b60674a5143988ded1952c6ddc66d56e5857d3cc25393/2672files: full34577exit0,547files pass/one skip,5,308tests pass/six skipped,158.13s. Types/lint/build15785exit0,zero lint errors/warnings,boot/native entry/CSS/budget pass;app-DGXisj8z.js858.9KB raw/262.0KB gzip. No runtime edit after final checks; generated public outputs restored. verification-local.json explicitly records unpublished/manual-pending status. Source remains on the repair branch rather than advancing production without its required manual check.

## Final keyboard manual verification completed

In the following authorized turn, fresh native window/page observation recovered the exact final fixture normally. At390x844: My ->Tab panel ->Tab named Alpha button ->Enter opens Alpha/chat without the former redundant stop. Discover ->Tab panel ->Tab search ->Tab Join Gamma ->Space shows Joining and then Gamma/chat. Exact component source comparison passes; actual page/cards/CSS, explicit synthetic shell/transport. No live social/account action. Verification-keyboard-manual.json records the bounded result. No helper reset or browser-policy workaround was used. Owned QA window9178600 closed; fresh native list confirms unrelated Chrome263582 preserved. Owned preview36140 stopped.

The locally checked ebefd578 source is now manually verified and ready for client-only publication. The earlier interruption and initial936a2f8b release receipts remain historical evidence. None of the five unchanged backend handlers need another update. Physical phone and actual live member/provider transactions remain separate requirements.
