# Offline app page integrity — 2026-10-06

The offline worker previously saved every successful navigation response as `/`, including JSON, JavaScript, maintenance pages and generic error HTML. A blocked cache could also reject an otherwise successful online navigation. It now saves only HTML containing the actual app script, excludes maintenance content, and validates cached HTML before offline fallback. Cache validation runs in a synchronous `waitUntil` registration, separately from delivery of the online response. Cache write/read failures are contained. Installation uses the same validation.

The reconnect fallback no longer reloads immediately forever. It provides a mobile-sized branded connection message and an explicit retry.

Eight regression cases cover valid app caching, preservation across JSON/script/error/maintenance responses, blocked cache open/write, and a previously corrupted JSON fallback. Six failed before the fix. Focused worker/boot/update/push tests: 30 passed. Final full suite: 4617 passed / 6 skipped. Build, types, lint (five existing warnings), native manifest and bundle budget passed: 1103.3 KB raw / 335.0 KB gzip under 1125/335 limits.

Manual Chrome test at isolated loopback8396 used the actual worker and synthetic app HTML; visiting version JSON followed by a socket failure on `/map` restored validated app HTML. Screenshot: parent workspace `outputs/vybe-offline-shell-browser-check.png`. It tests the core worker repair; the final reconnect fallback is additionally verified by regression. The fixture contains no Firebase/account/GPS data and its server session32434 was stopped. No production internal-worker inspection or manual cache/session purge was performed.

New browser evidence: direct public `/version.json?check=25f4a648` navigation returned old CGC metadata in IAB (e14563a, 2026-10-05T20:26) and old 5p metadata in Chrome (unknown commit, 2026-10-06T01:15), while direct server HTTP checks returned the published current release. This narrows the adoption diagnosis but does not establish the active worker or another component as its cause. Diagnostic JSON tabs were closed and the retained production account tab navigated normally to Home. Do not assert this fix resolves the reported phone Auth/network/map/Clips failures.

Publication and exact public worker/source checks pending. Existing Firebase account/content restoration and physical-device readiness remain required.
