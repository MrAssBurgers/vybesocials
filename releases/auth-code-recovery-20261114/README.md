# Login code recovery and mobile rendering - 2026-11-14

The existing verification gate now yields useful controls after a 15-second wait. Continue verification resumes the original one-use request rather than resubmitting the code. It also handles a success that arrived after the first wait. A retired challenge cannot complete a replacement view. The previous accepted-code Finish signing in recovery, account guards and server checks remain intact. Errors stay visible in an accessible alert.

Code fields and action buttons fit narrow phones. Mobile/native verification no longer blurs the entire screen and dialog. Mobile/native login uses still background/text gradients with the existing response waves, reducing continuous decorative rendering. No authentication/provider settings, secrets, token persistence, backend, native binary or real-user content changes accompany this client repair.

Concurrent main4185e9c was merged before validation, preserving titles, derived inbox previews and both already-deployed baseline-preserving Rules repairs. The scoped inbox implementation retains captured intent/session guards, exact owned private keys, acknowledged membership writes, per-row rollback and checked trash enrichment. The retained-control test also corrected mutateAsync to reject asynchronously.

## Executed validation

- Complete combined suite: 538 files passed, one skipped; 5,213 tests passed, six skipped; 122.99 seconds with eight workers.
- Typecheck, lint (zero errors/warnings), production build, native/boot/entry and bundle budget passed. Entry app-BomBgBd8.js: 858.6 KB raw / 261.9 KB gzip.
- Two delayed-verification regression cases fail against the original modal; final focused auth run passes 97 tests. Combined inbox/title-focused run passes 53 tests.
- Actual modal, OTP, Dialog and CSS at 360x700 using synthetic transport: controls fit, no horizontal page/panel overflow, numeric input and computed native backdrop none. Delayed response resumes to completion with exactly one request. Fixture HMR emitted createRoot warnings while the fixture was edited; these are not production errors. Temporary tab closed, viewport reset and owned server stopped.
- Fresh production preflight: eight expected malformed/unauthenticated rejections pass. This establishes reachability and rejection only, not a real sign-in or email-delivery test.

Tested source SHA256: 764b188e2b816ed38e6a35b8733a224b95b162cb55372db93712732c529c1eb1. Client commit: 6813db823266b3b94ffb7b36601026d793b24567. Lovable deployment: eb893965-f9b5-44dd-b1dc-eb27ccf41876. Publication verification is recorded separately in verification.json after the expected source arrives.

## Limits and next checks

The user's exact verification error is still pending. The reproduction covers a stalled request and usable recovery, not proof of the cause of that real-account failure. No actual password/code/provider/physical Play Store sign-in was exercised. Device bundle adoption, login speed on hardware, fresh-code completion, profile/post loading, location and Clips still need their respective checks. The whole public-readiness goal remains active; known service availability and authority/restoration gaps elsewhere are not certified by this release.

## Verified publication

Deployment eb893965-f9b5-44dd-b1dc-eb27ccf41876 reached vybehub.app with exact tested source764b188e2b816ed38e6a35b8733a224b95b162cb55372db93712732c529c1eb1 and client commit6813db823266b3b94ffb7b36601026d793b24567. See verification.json: ten route shells, public entry digest and all709 native manifest assets passed. Live entryapp-BwMeiZSI.js SHA256935abe80c925154b1e50961d5075df83b143ef68c50593539ce9c93b062525eb. The hosted entry name differs from the local build; source, parts and runtime dependency identity match. Native deployed_at1794703809712.

The first delivery check encountered a transient ECONNRESET. Bounded network-read retries completed successfully; the deployment was not restarted.

Actual already-signed-in production browser: Home loads six articles and ten images, then remains at/home with the same visible content counts after reload. No password form, profile-recovery status or newly captured warning/error. This is browser persistence evidence; no fresh password/code flow, account write or physical-phone performance claim. Temporary browser tab closed.
