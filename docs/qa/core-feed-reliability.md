# Core feed reliability repair

## Status

The source changes are committed on `qa/mobile-public-readiness-fixes-b7f4`, the branch used by pull request 57. This report does not certify a public release, an authenticated end-to-end test, or a production deployment.

Latest source/test revision recorded here: `15968d713810d7fae201e47322073e400d497b8d`.

## Implemented

- Guest entry routes explain the existing sign-in requirement before mounting database-backed screens. Sign-in preserves the requested destination, filters, and anchor. This is an access/error-handling correction, not implementation of public guest access to posts. Firestore access rules were not relaxed.
- Feed adapters preserve permission and network errors. Feed hooks reject failed reads so retry controls appear instead of a false empty result.
- Clips retain server-ranked order as pages append. Duplicate IDs are removed without reshuffling existing entries.
- Pagination uses received row counts before local filtering, so filtering a full page does not prematurely mark it as the last page.
- Explore includes author IDs needed for filtering, retains the viewer's own posts, normalizes malformed tags, restores URL filters on browser Back/Forward, and provides accessible filter controls.
- Feed keyboard shortcuts ignore typing, dialogs, modifier combinations, and IME composition. Browser storage restrictions no longer break mute preference handling.
- Clip detail query keys include viewer identity. Read errors are distinguished from missing content.
- Clips and Explore have route-level error boundaries. These contain rendering errors but do not prove resolution of the earlier live WebKit authentication-context report.
- Reduced-motion account headings remain visible. An invalid Firebase Storage preconnect was removed.
- Signed-out entry screens no longer mount floating bottom navigation over sign-in controls. Their bottom spacing was adjusted, and three navigation unit tests were added.
- Browser regressions check actual touch hit targets and completed keyboard-focus restoration, rather than only element dimensions or immediate modal visibility.

## Completed verification

Run `33354772048` completed successfully and saved verified source commit `e9f6b0b415aba5a041c4734678e444530dd34499`.

- 495 unit/component tests passed, with zero failures.
- 54 existing shared-UI/auth browser scenarios passed.
- 16 production-build guest entry-route browser scenarios passed.
- Typecheck, lint, build, CSS validation, startup validation, bundle budget, and camera-send static checks exited 0.

The 70 browser scenarios above validate scoped UI behavior. They do not establish successful authenticated feeds, messages, calls, uploads, notifications, purchases, or physical-device behavior.

Evidence artifact: `9744921966`, from run `33354772048`. Its SHA256 is `0aa49f5fb40c84ac326718edbf8f3edf64bf0b1949ae22272fa1f0587cf66911`.

## Subsequent changes and verification limits

Screenshot review after that passing run found a landscape overlap involving floating navigation. The correction is in `874ccb1c6675b3c78f3c33b71b54cea29c77fe8e`.

Run `33356118846` passed static checks, unit tests, and the production build, but failed a browser focus-restoration check. Its guest-route tests did not run.

Commit `0edfd653a4c16a827d16009bf62b5ce2b2ac86f0` waits for modal cleanup to restore focus before asserting. Run `33356892728` again passed the static/unit/build checks but encountered two WebKit long-panel tap timeouts. Its guest-route checks did not run.

Commit `15968d713810d7fae201e47322073e400d497b8d` verifies the visible, enabled, unobscured footer target with a real touchscreen tap and requires the resulting handler state. It also collects guest-route checks independently when shared-UI checks fail.

Run `33357840709` was last observed with typecheck, unit/component tests, lint, production build, CSS/startup/bundle validation, and camera-send static checks successful. Shared-UI browser tests were still in progress at that observation. No completed final browser result is certified by this report. Consult that run and its artifacts for a newer result before merging.

## Test environment

Unit authentication/feed states use mocks. Browser scenarios use the production web build on local preview and isolated shared components. Guest-route browser tests block remote non-read requests. No credentials, real password-reset emails, public posts, private messages, calls, payments, or account deletions were submitted.

## Unverified release requirements

No reusable authorized QA login was recovered. Signed-in posting/uploads, messages, groups, calls, friend actions, notifications, purchases, maps, settings persistence, and cross-user interactions still require end-to-end verification.

Physical iOS/Android devices, native keyboard/back navigation, OAuth handoff, push delivery, offline/background resume, and billing sandbox behavior remain unverified.

The earlier live WebKit Clips authentication-context error requires reproduction in the signed-in application. A guest sign-in screen and an error boundary do not establish that its underlying cause is repaired.

No Firebase rules, secrets, functions, hosting, or live deployment were changed by this repair batch. Historical SMS and security/privacy deployment notes require separate current verification.

## Next three tasks

1. Inspect the final artifacts from run `33357840709`, fix any remaining failures, and repeat the affected browser checks.
2. Complete dedicated-account end-to-end tests and the installed iOS/Android permission/navigation/offline matrix.
3. Review the approved source, publish through the established deployment process, and test the deployed revision.
