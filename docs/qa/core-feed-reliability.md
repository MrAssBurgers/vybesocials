# Core feed reliability repair

## Status

The source changes are committed and merged into `main` through pull request 60.

Latest public-readiness merge revision: `8a938101700d726322e959fea50eca0552945d56`.

## Implemented

- Guest entry routes explain the existing sign-in requirement before mounting database-backed screens. Sign-in preserves the requested destination, filters, and anchor. This is an access/error-handling correction, not implementation of public guest access to posts. Firestore access rules were not relaxed.
- Feed adapters preserve permission and network errors. Feed hooks reject failed reads so retry controls appear instead of a false empty result.
- Clips retain server-ranked order as pages append. Duplicate IDs are removed without reshuffling existing entries.
- Pagination uses received row counts before local filtering, so filtering a full page does not prematurely mark it as the last page.
- Explore includes author IDs needed for filtering, retains the viewer's own posts, normalizes malformed tags, restores URL filters on browser Back/Forward, and provides accessible filter controls.
- Feed keyboard shortcuts ignore typing, dialogs, modifier combinations, and IME composition. Browser storage restrictions no longer break mute preference handling.
- Clip detail query keys include viewer identity. Read errors are distinguished from missing content.
- Clips and Explore have route-level error boundaries. These contain rendering errors but do not prove resolution of earlier live WebKit authentication-context reports.
- Reduced-motion account headings remain visible. An invalid Firebase Storage preconnect was removed.
- Signed-out entry screens no longer mount floating bottom navigation over sign-in controls. Their bottom spacing was adjusted, and navigation unit tests were added.
- Browser regressions check actual touch hit targets and completed keyboard-focus restoration, rather than only element dimensions or immediate modal visibility.

## Public-readiness merge 60

The following additional hardening is now on `main`:

- Global profile and post realtime subscriptions wait for a resolved authenticated session, preventing unnecessary listeners on signed-out public routes.
- Shared dialogs use one constrained flex scroll area and expose a 44-pixel close target without enlarging the visual puck.
- Skip-to-content resolves an existing page main landmark or creates a temporary route-shell `role="main"` fallback without duplicating authenticated landmarks.
- Explicit healthy maintenance builds remove stale reconstruction overlays, and production performs a one-time network-confirmed cached-shell refresh.
- Despia iOS Apple Sign-In prefers the Apple JS `usePopup: true` route while Android retains the existing `oauth://` handoff.
- A valid Firebase session wins over a late opaque Apple callback error, preventing a false internal-error message after successful sign-in.
- Stripe-hosted URLs are validated, duplicate opens are locked, native shells open them outside the app WebView, and Connect onboarding uses authenticated profile identity instead of placeholder details.
- Focused regression tests cover public-readiness dialog/main behavior and the new Apple/Stripe routing helpers.

## Verification

Pull-request CI and the post-merge `main` CI both completed successfully.

Verified CI steps:

- Dependency installation
- Lint
- Type check
- Unit/component tests
- Production build

The GitHub workflow does not certify live third-party providers or physical devices.

## Remaining provider/device checks

These remain manual release gates and must not be described as completed until tested on real builds and provider sandboxes:

- Apple Sign-In on installed iPhone and iPad builds
- Stripe Connect return/resume behavior on iOS and Android
- APNs, FCM, and OneSignal delivery plus notification tap routing
- LiveKit audio/video calls, permissions, backgrounding, reconnect, and clean hang-up
- Native camera/microphone permission denial and recovery
- Store billing sandbox behavior
- Despia OTA update from the previous published binary

## Release decision

The merged source passes the repository's automated CI gate. It is suitable for Lovable sync and preview deployment, but public store release still requires the provider/device checks listed above.