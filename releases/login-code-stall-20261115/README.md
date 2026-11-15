# Stalled email-code recovery

Email verification now stops waiting on a stalled transport after 30 seconds and offers Retry code check using the same private recovery key. It does not automatically resubmit. Replies arriving before that deadline still continue automatically; later replies cannot complete the UI twice. Failed resend delivery no longer discards recovery material from the original attempt. Accepted-code account completion retains its existing separate guards and retry.

Temporary Firebase Admin account lookup failures now return unavailable rather than incorrectly retiring the sign-in request. Confirmed missing accounts, disabled accounts and invalid proofs still fail closed. Only auth2faVerify is selected for a six-file, baseline-preserving Node22 release; no Auth settings, secret, IAM, Rules or unrelated service change is required.

24 focused UI cases pass, including two new regressions reproduced against the prior source. Full suite: 551 files passed / one skipped, 5,424 tests passed / six skipped. Types, lint, Functions compilation and production build pass. Lint has zero warnings/errors. Actual Node22 demo Firebase Auth/Firestore/callable SDK: 21 cases pass, including four injected Auth lookup failures around consumption and confirmed account deletion. The previous helper incorrectly returned failed-precondition in the same outage reproduction.

Actual phone-sized controls were exercised in Chrome using synthetic transport: first reply stalled, retry succeeded without entering the code again, two calls shared one attempt key, and the late first reply did not complete twice. This does not establish physical Play Store performance, real email delivery, the user's exact failure or whole-app readiness.

Deployment/publication readback will be recorded separately. Preserve existing staged marketplace source; it is not part of this authentication release.
