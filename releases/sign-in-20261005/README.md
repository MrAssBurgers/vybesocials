# Sign-in service repair, 2026-10-05

The user explicitly requested repair of live sign-in and email on vybehub.app. The previous hold on `auth2faRequest` was reviewed against the exact deployed client and backend. This release replaces only `auth2faRequest`, `auth2faVerify`, `authLoginApproval` and `authLoginNotify`; it does not authorize a general Functions deployment or a completed Firebase MFA migration.

The old request/verify artifacts were `43def0347b3990f878db5ce962d208e252abf45d`. Request had no email secret bindings; verify had no Cloud Run invoker binding. Existing Resend/from-address, Twilio and OneSignal secret versions were inspected as metadata only, then bound to their intended functions. No secret values or account flags were read, changed or printed. The existing compute runtime already has token-signing permission. Verify now permits callable invocation after deliberate local sign-out while the handler enforces the single-use private code proof.

All four functions are ACTIVE. Their hashes are request `30c9cec5286bff94c298e2e4f381016fbe8dc219`, verify `59a0ad20461281e3e97364f3b5f99953a0ec82da`, approval `ddf5cde07b261324532ea8047570199d5f19d78f`, notify `49b296f46a2fa73f9518544ca4135ffb49f0225d`. Deployment logs: `work/auth-release-functions-deploy.log`, `work/auth-release-invoker.log`; independent inventory: `work/auth-released-inventory.json`. Public empty-request probes now reach all six ordinary sign-in/profile endpoints with the expected callable rejection. Security settings remain separate: `manageSignInPreferences` 404 and old `authSessionRevoke` platform 403.

Added only the `auth_challenges(user_id ASC, challenge_type ASC, status ASC, expires_at ASC, __name__ ASC)` index, independently READY, and `expireAt` TTL on `_auth_email_challenges` and `_auth_email_limits`, independently ACTIVE. Prior indexes are retained. No TTL on durable device heads or profile ownership evidence. Code expiry is enforced synchronously.

## Rules status

Active Rules remain the reviewed profile-bootstrap baseline, SHA-256 `f421cde69d505389a1665404601e5ba32f8cc5e5815fd00b49ac7b204b544d69`. Both official CLI compilation/test and official Ruleset creation returned Google HTTP 503. Candidate SHA-256 `d13db74d50f07d9eccf672eb55f9a71bdb4f849266585026736624521b263819` changes only preferences plus sign-in status/settings restrictions and explicit private namespace denials. It is **not deployed**.

The baseline's default-deny already protects all three new private code/limit/device-head collections. A separate 77-check exact-baseline/candidate test confirms owners, strangers, staff and anonymous clients cannot read/write/delete private proof, and the owner's settings are readable. Fresh public email status has no code, hash, email address or token. This supports the ordinary sign-in repair independently of the unavailable Rules service. Legacy public challenge restrictions and raw settings-write hardening remain pending; first-factor access and legacy device-approval authority remain explicit limits. Do not describe this as server-enforced Firebase MFA.

When the service is available, re-read the active baseline, stop/rebase/retest if changed, then use only `firebase.sign-in.json` with `--only firestore:rules`. Independently verify the active source hash. Never deploy the repository's whole pending Rules/index manifest.

## Verification

- 11 email challenge/backend Rules groups, 17 device groups + 20 Rules checks, and 7 real Auth token-exchange/device-completion groups passed against isolated emulators with injected mail/push providers.
- 77 exact live-baseline/candidate checks passed. Earlier 96 profile compatibility comparisons retain the same two checked-setup prerequisites. App build, 4,370 tests, typecheck and lint passed; same five lint warnings, no errors. No real email delivery is inferred from these checks.
- Auth UI uses soft drifting radial light, restrained entry motion, clear busy labels and disabled edits/mode switching during requests. Motion respects reduced-motion preferences and never adds a login delay. Browser password autocomplete uses current/new-password appropriately.

Publish the matching finished main commit through Lovable. Verify the deployed manifest, then designated-account password/code/device/profile/reload. Physical phone close/reopen remains user QA. This record is updated separately with the actual publication and live email result.
