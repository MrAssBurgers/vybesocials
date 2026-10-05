# Production sign-in recovery

This is a release inventory and read-only diagnosis from 2026-10-05. It does not record a production deployment, send a verification email, change account settings or approve a broad authentication migration. The existing enabled email-confirmation setting must remain enforced; an incomplete server response must not silently bypass it.

## Observed production state

**Profile bootstrap update, 2026-10-05:** Firebase access was reconnected and the narrow already-signed-in profile release was deployed. `ensureAccountProfile` and strict `claimProfileByEmail` are active and both reject empty public requests with callable `401 UNAUTHENTICATED`. The reviewed Rules slice from the actual deployed baseline is active with SHA-256 `f421cde69d505389a1665404601e5ba32f8cc5e5815fd00b49ac7b204b544d69`; see [the release record](../releases/profile-bootstrap-20261005/README.md). This removes the missing endpoint blocker. The original account on the physical phone still needs a successful retry. The fresh email sign-in and Security settings gaps below remain: `auth2faVerify` and `authSessionRevoke` platform 403, `manageSignInPreferences` 404. No frontend publish, provider request, secret or Auth setting change occurred.

`https://vybehub.app/version.json` reported commit `ea52a9bf2ec7bee3f2773c3eb174f151af23d757`, built at `2026-10-05T09:28:29.012Z`. `/login` served its matching `app-BsTRIiE_.js` entry. The lazy `emailConfirmation-D6Y6-Ep3.js` module contains the screenshot's exact error, “The email confirmation could not be started. Please sign in again.” Its validation requires an acknowledged challenge ID, matching owner UID and a current expiry. The new client is live; an authenticated server receipt mismatch is the immediate failure indicated by that message. An unauthenticated probe cannot establish which field was missing.

Before the profile release, empty callable requests contained only `{"data":{}}`; no account identifier, credential, code or provider request was supplied. Initial results:

| Named endpoint | Observed response | What it establishes |
|---|---|---|
| `auth2faRequest` | 401 callable `UNAUTHENTICATED` | Route exists; authenticated challenge issuance is unverified. |
| `auth2faVerify` | 403 platform response, not a callable error | Code verification cannot reach runtime validation through this public endpoint. |
| `authLoginNotify` | 401 callable `UNAUTHENTICATED` | Route exists; current checked device receipts are unverified. |
| `authLoginApproval` | 400 callable `INVALID_ARGUMENT` | Route exists; approval/email fallback behavior is unverified. |
| `ensureAccountProfile` | 404 platform response | Required checked profile setup is unavailable at the public endpoint. |
| `claimProfileByEmail` | 401 callable `UNAUTHENTICATED` | Route exists; this does not prove the unsafe historical implementation was replaced. |
| `manageSignInPreferences` | 404 platform response | Checked sign-in settings are unavailable. |
| `authSessionRevoke` | 403 platform response | The account-wide sign-out callable is inaccessible through this endpoint. |

`node scripts/check-auth-release.mjs --project vybe-daaab` repeats these non-mutating protocol checks. A passing result proves reachability and basic rejection only, not code delivery, authenticated response compatibility, Rules, indexes, custom-token minting or phone persistence.

The initial Firebase CLI inventory failed authentication. Access has since been reconnected and the named profile release verified as recorded above. Other authenticated response contracts, provider delivery and runtime signing permissions remain unverified. Do not inspect or print credential files or secret values.

## Minimum sign-in to owned-profile release

### Signed-in phone blocked on profile loading

The subsequent phone screenshot, “Your account is signed in, but your profile could not be loaded,” is a different stage of the same release mismatch. Cold session restoration calls `ensureAccountProfile` before admitting the owned profile. A fresh empty-request probe still returned a platform 404 on 2026-10-05. Retrying or entering the password again cannot restore a missing endpoint. The client now distinguishes readable missing/incompatible-service responses, timeouts, explicit network failures and ownership review; SDK `internal` failures remain ambiguous because CORS and transport failures share that code. It retains the signed-in account and the exact uncertain setup request. This diagnostic change does not repair the live service.

For this already-signed-in path, the smallest candidate release is `ensureAccountProfile` and the strict replacement `claimProfileByEmail`, with the matching profile/index ownership and private binding/receipt/recovery Rules applied to the actual deployed baseline. It requires no new composite index, TTL or provider secret. Review baseline compatibility before releasing; do not deploy the whole repository Rules file. A unique existing profile owned by the current Auth UID keeps its original ID and content. Conflicts require explicit review, never a replacement profile or email-based reassignment. Fresh email-confirmed sign-in still requires the complete release below.

The named Function set for the existing password/email-confirmation flow is:

| Function | Required behavior/dependency |
|---|---|
| `auth2faRequest` | Current owner-bound challenge receipt; server-private OTP authority; existing `RESEND_API_KEY` and `EMAIL_FROM` bindings. |
| `auth2faVerify` | Public callable invocation after the client's deliberate local sign-out; strict challenge/code validation; single-use custom-token issuance. Platform IAM must permit the intended invocation while the function enforces proof. Verify the existing runtime's custom-token signing capability. |
| `authLoginApproval` | Matching email fallback/resend contract. This export also includes existing device/SMS branches, so review the complete artifact and preserve its existing Resend/Twilio bindings without provisioning or changing them implicitly. |
| `authLoginNotify` | Matching UID, Auth creation time and credential-time receipt; protected device generation; consumed email proof plus verified Firebase token claim before confirming an email-completed device. Existing OneSignal bindings are part of this export; this inventory does not authorize real push. |
| `ensureAccountProfile` | Checked `ensure` before device registration for an existing unbound account, without exposing the app before confirmation. Post-confirmation profile hydration must use the same current account. |
| `claimProfileByEmail` | Replace the old ownership-changing entry point with the same strict checked contract, even though the new client's normal bootstrap uses `ensureAccountProfile`. Leaving the historical bypass available undermines the canonical binding. |

Do not make the new device reader accept an unbound existing profile merely to unblock login. The client must perform the checked ownership setup under its current attempt guard before registration. A truly empty new account's limited deferred-tracking receipt is not a substitute for migrated-account setup. Email completion must return a real checked device session, not a deferred receipt.

The UI must keep first-factor and custom-token SDK events behind the current confirmation attempt, use bounded checks, and reject late completion after account/gate replacement. Soft sign-out uses the guarded persistence adapter so a delayed cleanup cannot erase a later login. A verified code must also complete current device registration before the UI announces success or navigates.

`manageSignInPreferences` and `authSessionRevoke` are additional blockers for the already-shipped Security settings, not prerequisites for a successful ordinary login. Include them only in an explicitly reviewed settings rollout with their own strict Rules, indexes and receipt/limit TTL resources from [ACCOUNT_SETTINGS_STABILITY.md](ACCOUNT_SETTINGS_STABILITY.md). Preserve default-unavailable enable capabilities; do not silently toggle an existing enabled account.

## Firestore resources and compatibility

Prepare a reviewed Rules release from the actual deployed baseline. **Do not deploy the entire current `firestore.rules` or index manifest merely to repair login**: they contain unrelated pending content, map, media and settings cutovers.

The authentication/profile slice requires:

- Deny raw client access to `_auth_email_challenges`, `_auth_email_limits`, `_auth_device_session_heads`, `_account_profile_bindings`, `_account_profile_receipts` and `_account_profile_recovery`.
- Keep email secrets/custom tokens out of readable `auth_challenges`. Permit only the intended exact-owner non-secret status reads; deny direct challenge writes.
- Exact-UID reading of `user_2fa_settings`; settings changes use the checked settings authority rather than raw writes. Keep `user_sessions` and `login_history` owner-readable and server-written.
- Server-owned `user_auth_index` writes, exact-UID index reads, server-owned profile creation and immutable profile ownership on ordinary edits. Include canonical ownership helpers and retired/malformed-binding rejection; test helper read budgets against the deployed Rules baseline.
- Provision the `auth_challenges` composite index `(user_id ASC, challenge_type ASC, status ASC, expires_at ASC)` before enabling the current device reader. Retain existing indexes still required by other deployed approval consumers, including the prior `created_at DESC` form; do not delete indexes as part of this repair.
- Enable `expireAt` TTL on `_auth_email_challenges` and `_auth_email_limits` for eventual one-day cleanup. Code/status expiry is checked synchronously and never depends on TTL deletion. Device heads, account bindings, account receipts and approved recovery/retirement evidence are durable and have **no TTL**. Checked profile setup needs no new composite index.

For an existing unique `profiles.user_id == Auth UID` account, setup preserves the exact migrated profile ID and content, repairs its canonical index and creates the protected binding. It does not require public-email claiming or a verified email for that unchanged ownership. Ambiguous owners, conflicting UID/profile aliases or changed ownership produce an explicit recovery state. Never pick the first matching email, run the old merge/claim scripts, reassign by username, or create an arbitrary replacement profile to force a successful sign-in.

Changed-UID recovery is a separate deliberate operation: independently reviewed private evidence must bind the current Auth incarnation, verified email and exact source versions; the user explicitly confirms it. Both source identity aliases must be checked and retired. The shared `requireAdmin` consumers listed in [ACCOUNT_PROFILE_STABILITY.md](ACCOUNT_PROFILE_STABILITY.md) need their corresponding reviewed retirement-aware versions before using recovery to retire identities. This inventory does not authorize a mass redeploy of those consumers or approve any recovery record.

## Release-blocking verification

1. Reconnect the CLI and inspect only selected deployment metadata: project/region, current named Functions, invoker accessibility, required secret **names/bindings**, service account and index readiness. Do not log secret values. Resolve the observed 403/404 responses without broadening unrelated services.
2. Build the selected Functions artifact and run the isolated email, account-profile and login-device regressions. Include a real Firebase custom-token exchange followed by current device registration, a unique migrated account without a binding, expiry/replay, delayed identity changes and sign-out/new-login races. Provider delivery stays injected in isolated tests.
3. Test the reviewed Rules slice against the actual deployed baseline. Prove protected raw denial, preserved legitimate owner reads, no profile/index reassignment, and no unrelated feature cutover. Old clients with raw setup writes or unchecked device payloads are incompatible; plan the web/native client transition explicitly.
4. Release only the reviewed named Functions/resources, then publish the matching commit through Lovable Share → Publish. Verify the public release manifest rather than assuming GitHub push published it. A rollback must retain durable bindings, tombstones and receipts; never restore an unsafe claiming endpoint or disable an account's email setting to hide an error.
5. With authorized designated accounts, verify password → code receipt → local sign-out → delivered code → custom-token exchange → checked device session → original owned profile. Also verify an account without email confirmation, sign-out/reload, failure/retry and current browser/native return paths. A reachable endpoint and emulator mail sink do not prove real email delivery. Actual Android/iOS force-close persistence remains physical-device QA.

The historical WORKLOG restriction explicitly kept `auth2faRequest` undeployed while production returned `{ok:true}` without a challenge. This inventory identifies the coordinated repair needed for the now-strict client; it does not silently lift that restriction or claim deployment authorization. Existing first-factor backend access and the legacy device-approval approve/poll authority remain separate limits. This email-confirmation repair must not be described as completed server-enforced Firebase MFA.
