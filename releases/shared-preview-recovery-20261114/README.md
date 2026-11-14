# Shared post preview recovery — 2026-11-14

Source commit: `8d075b9883868198e531b56c49bf6182dacf10e3`, based on current live `8dc767e3ce1181e62427c4ebe4041a70009a2f9c`.

Shared previews now use the existing fifteen-second post deadline, retire pending work on hide/stop, reject a departed batch's completion, and follow the shared native foreground generation. Four new regressions fail before the repair and pass afterward. Existing checked preview admission, account isolation, conversation boundaries, permission leases and visible-ID batching remain in place.

Final verification: 5,174 tests passed, six skipped; 532 test files passed, one skipped. Typecheck passed. Lint passed with five existing warnings. Production/native/entry/budget build passed (857.5 KB raw / 261.4 KB gzip). One existing native token timing test failed in the first concurrent full run; it passed focused and in the complete rerun with four workers. No product change was made to suppress that failure.

A browser walkthrough at 390×700 used the actual shared-post bubble, provider and preview service with synthetic transport. A stalled response exposes Retry preview; retry renders fresh admitted content; native pause clears it; resume loads again; the late initial response cannot replace current content. This is not a real-account or physical-phone result.

Publication is pending. No publish call was dispatched. Lovable's existing repair request `main:user#00000000002374#usr:6KBKBVSP` in thread `main`, created 2026-11-14T23:05:56Z, remains running with no terminal response. The project still reports source `8dc767e3`, `agentFinished:false`; GitHub main has the new source. Poll that exact request with get_message, inspect response.status, then verify the resulting source and preserve both repairs before publishing. Do not restart the request or deploy the older October6 release.

Current live fingerprint is `620ed3cae9cf6c17b8263b91b7dec233f9d5487289de8e7feceb6dd915b945bd`; candidate fingerprint is `8693588123a7d607098681123cfc405a111c2366a1c55aacdb153d936e58eb77`. The latter was built locally; it is not a live-delivery claim. `work/verify-shared-preview-public.mjs` can verify exact source, entry bytes, route shells and native assets after publishing.

The attached unauthenticated probes establish only route/input rejection or OPTIONS/CORS behavior. Eight auth checks pass; map/location/feed/list/preview OPTIONS pass. Premium check remains403; three marketplace/stream endpoint names remain404. No Functions, Rules, IAM, providers, credentials, content, billing or native binaries were changed. Whole-app readiness, checked historical restoration and actual installed mobile behavior remain open.
