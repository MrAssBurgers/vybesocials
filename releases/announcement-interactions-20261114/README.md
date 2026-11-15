# Home announcement recovery

The existing Home announcement query failed in production because its newest-active index was missing. Owners also could not load or save their own dismissal preferences because the live rules had no matching access block. The one additive index is now READY, and only the 25-line canonical-owner preference block has been activated. The exact production query succeeds.

## Released backend

- Project: `vybe-daaab`.
- Index: `announcements/is_active ASC, created_at DESC, __name__ DESC`, `CICAgNiZwpcK`; no other index changed.
- Previous Rules: `86ff97a3-2fb3-4b3c-b582-f4e92cda6542`, SHA256 `5e089eb26cc72314e1eff017a70166aa5040fb1f172e01125164b5050945e4e3`.
- Active Rules: `11329c9e-47f8-4192-9f0a-d7dbf197c669`, SHA256 `1aaf28af3e57a6a5ba445c9b35a739ed110b177465a5fb63dc7dfa9b1074c222`, verified by release/source readback at `2026-11-15T04:59:46.377Z`.
- Every unrelated baseline byte is preserved. This uses the existing protected canonical-profile owner helper. Owner and announcement fields are immutable. Browser deletion, cross-owner/staff/guest access and arbitrary new fields remain denied. Compatible historical row IDs and extra metadata survive replay.
- Compilation: zero errors, 12 inherited warnings. Actual local Firebase Auth/Firestore SDK: 28 checks passed, including query/upsert/replay, other-account denial, retired binding/profile denial and historical data preservation. The exact previous baseline fails the owner preference read.
- Independent demo cleanup audit: zero Auth users and zero documents. No real production announcement, dismissal, notification, email or account was submitted for testing. No Functions, Storage Rules, Auth/provider settings or secrets changed.

See `deployment-rules.json`, `index-deployment.json`, `verification-query.json`, `verification-sdk.json`, `compile.json`, `prepared.json` and `cleanup.json`. `baseline.rules` and the exact candidate under `security/` retain the rollback/source evidence. Root Rules and the root index manifest contain unrelated pending work and must not be deployed wholesale.

## Client candidate: not published yet

The repaired component adds a named keyboard opener, separate dismissal control, portaled dialog, Escape/focus return, acknowledged dismissal with Retry, stable selected announcement, account-session retirement and reduced-motion handling. Media displays actual GIF images, retains legacy video GIF playback, and exposes loading failures with Retry; URL replacement resets failure state.

The focused 17 checks and final combined 5,384 tests pass, with six default Auth-persistence skips. Types, lint, build, boot/native entry, CSS and bundle budget pass. Actual native Chrome interface checks now pass at320/390/840px, including keyboard/Escape/focus, long-content scroll, pending/failed/successful dismissal, stable selected ID, account retirement, read Retry, decoded image/GIF/video playback and source recovery. Browser control recovered through a fresh supported observation in the next turn; no bypass/reset was used. See verification-manual.json. Current main2de9b00 is preserved and the final combined checks pass:551files,5,384tests,one file/six default Auth-persistence skips,119.97seconds; types/lint/build/Functions compile/boot/native/CSS/budget pass. Source8daaa749/2681files independently matches dist. No product runtime edit followed manual verification. The client is ready to publish. This is progress toward the full-app audit; it does not certify live authenticated journeys, physical phones, staff fanout or whole-app readiness.
