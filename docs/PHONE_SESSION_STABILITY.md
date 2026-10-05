# Phone session persistence

Closing the app should preserve the current Firebase login. Explicit sign-out,
disabled accounts and current session revocation must still end that login.
This repair does not change Firebase project configuration, token lifetimes or
the user's confirmation and login-approval preferences.

## Repaired failure paths

- Native vault restoration previously stopped participating after the short
  startup budget. A valid delayed reply could arrive after Firebase had already
  initialized without it.
- The installed native SDK dispatched a vault read before installing its callback
  watcher. A synchronous native reply could be erased by that ordering.
- The native backup was marked saved before the write was acknowledged. A failed
  bridge startup could suppress later attempts to save the same session.
- Startup timers treated a provisional empty SDK session as signed out. The root,
  login and private-route surfaces need authoritative restoration readiness.
- A known device could reuse an older revoked session row after fresh credentials
  succeeded. Its watcher could immediately sign out the fresh login.

Normal saved browser credentials still initialize immediately. Only native
recovery without a usable local copy waits for its bounded vault lookup before
Firebase initializes. The SDK hydrates and validates that saved credential;
there is no fabricated session, mid-flight user transplant or forced reload.
Pending and failed recovery have explicit UI states with Retry and deliberate
Sign in again. A timeout does not clear the saved login hint.

Native reads account for the bridge's fixed callback slot, and native saves are
acknowledged by readback with bounded retries. Logout records a durable
signed-out marker before asynchronous cleanup. It also takes precedence over
any SDK persistence surviving an interrupted shutdown. Delayed token refresh,
session registration and logout cleanup are guarded against account changes.

Fresh credentials newer than a revoked device generation create a new checked
generation. The old revoked row remains unchanged. Current Auth incarnation,
profile ownership, credential time and protected session identity are checked
again before trust changes and receipts. Transport failures retain credentials;
a checked pending-confirmation response requires completing sign-in. Expired
approval requests are excluded from reuse. This client gate repair does not
establish server-enforced MFA for every application endpoint; the existing
release limitation in `DEPLOY.md` still applies.

The separate legacy `authLoginApproval` approve mutation still needs its own
generation/revocation audit; it is outside this `authLoginNotify` repair. This
checkpoint does not certify every approval endpoint. Auth and Firestore checks
also do not form a cross-service atomic transaction. Credential timestamps have
one-second precision, so fresh reauthentication must be later than the recorded
revocation cutoff. More than 200 unindexed legacy records for one device produces
an explicit support error; a protected device head avoids that historical scan
on subsequent requests.

## Release boundary

Release the tested client with the exact updated callable `authLoginNotify` and
matching Firestore Rules. Provision the `auth_challenges` index with
`user_id ASC, challenge_type ASC, status ASC, expires_at ASC` before the callable
cutover, so expired approval requests cannot trap subsequent sign-in attempts.
Checked account-profile setup is a prerequisite. The
protected `_auth_device_session_heads` namespace is server-only and retains
durable device-generation evidence without TTL. Existing `user_sessions` rows
remain server-written. No new secret or Auth configuration is required.

This is a compatibility change: old callers lack the checked current-account and
credential fields. Coordinate the rollout and preserve all earlier prerequisites
in `DEPLOY.md`. In particular, this repair does not authorize deploying
`auth2faRequest` or bypass its separate release restriction. A GitHub push alone
does not update the installed phone app; publish the verified commit through
Lovable Share → Publish and verify the Despia manifest/cold-launch update.

## Device verification

Automated bridge tests and a browser reload are not physical phone verification.
After publishing the coordinated release, use a test account on each supported
Android/iOS shell and record the build version:

1. Sign in, wait for the account to load, close the app normally and reopen it.
2. Force-stop/force-close the app and reopen it. Confirm the same account returns
   without submitting credentials or briefly presenting a signed-out screen.
3. Repeat after a device restart and after an ordinary Despia bundle update.
4. Reopen offline. A slow restoration must not erase the saved sign-in; reconnect
   and retry when requested. Data access still follows existing network/privacy
   requirements.
5. Explicitly sign out, close and reopen. The old account must stay signed out.
6. Revoke this device from another test session. Confirm the current revoked
   credentials stop working; sign in again with fresh credentials, close and
   reopen, and confirm the old revoked row cannot sign out that fresh login.
7. Exercise existing confirmation/approval settings and switch test accounts
   while recovery or registration is delayed. Late results must not change the
   newer account or dismiss its gate.

Native bridge nonresponse should offer recovery, not silently assert that no
saved account exists. Real provider delivery and physical-device verification
remain separate from isolated local tests.
