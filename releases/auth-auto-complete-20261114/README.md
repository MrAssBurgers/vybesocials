# Delayed verification and mobile rendering

The existing code gate now observes the original one-use request until it settles. After 15 seconds, it shows a calm connection status and permits changing accounts; a later valid receipt completes automatically without another tap or verification submission. Incorrect codes and transport failures still expose recovery, accepted receipts still support Finish signing in, and closing/reopening or replacing a challenge retires the old response.

The expiry label updates independently so the OTP/dialog does not rerender every second. At phone widths/touch input, working feedback paints one small unfilled ring instead of three large gradient/shadow rings. Login/signup button color layers pause while a field has focus. Reduced-motion behavior is retained.

Two changed delayed-response regressions failed against the prior implementation. The focused 18-case gate suite passes, including a five-second countdown with no OTP rerender and delayed same-challenge close/reopen. Pre-merge full suite: 542 files passed/one skipped; 5,244 tests passed/six skipped, exit zero. Types/lint (zero warnings/errors), production build, boot/native entry and unchanged bundle budget pass. Pre-merge source aeb5a316192817bab679a49ea42750214dd768f466c783d07258a74bd307f5fd; app-CdwAnGbx.js 858.8KB raw/262.0KB gzip.

Actual OTP/Dialog/CSS at 360x700 with explicitly synthetic transport: entered six digits once, delayed receipt arrived automatically after 22 seconds, completion observed once and request count remained one. No horizontal page/panel overflow; one displayed 165.6px working ring, two hidden, no ring shadow/gradient. No captured warning/error. Screenshot work/auth-auto-complete-mobile.jpg, temporary tab23 closed and viewport reset. Owned helper8357 stopped; existing preview services preserved.

Fresh unauthenticated production preflight passed all eight expected protocol rejections. Recent HTTP metadata contained no real verification completion in the observed 24-hour window; its three verify requests were malformed probes. Other observed device-registration POST200 latencies were about 2.4-4.4 seconds. These observations do not identify the user's actual code failure or prove phone speed. No backend, Rules, Auth/provider settings, real email/code, account setting or native binary was changed. Real delivered-code completion and installed Play Store performance remain open. The whole readiness goal remains active.

Concurrent public profile/clip repairs must be preserved and combined checks/publication recorded before handoff.
