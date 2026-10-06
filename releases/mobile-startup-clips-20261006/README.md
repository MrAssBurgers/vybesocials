# Mobile startup and clip resources

Checked Firebase profile startup automatically retries transient network failures twice (1s/3s), without signing out or bypassing account confirmation. Exact account/epoch/attempt/lifetime and connectivity/foreground guards retire stale retries. Authoritative failures retain the existing actionable state.

The mobile clip card attaches only its active foreground video source; departed sources are removed and decoder resources released. Existing mute, pause, receipt and network recovery policies remain intact.

Verification: 4578 tests passed, six skipped; production build, native manifest checks, application types and lint passed (five existing warnings). Entry app-CXQeI3LC.js: 1102.7KB raw/334.7KB gzip within unchanged budget. Source identity v2: 92ae5919be51b815c55ff53efd38bf59123f781a548825f6b869b27b6ad8dfff, 2553 inputs. Actual mobile-sized saved synthetic preview played with readyState4, pausedfalse, errornull. No physical-phone GPS, codec or FPS certification.

Production read-only location inspection found the existing sharing service/wrappers/snapshot job active, recent service requests HTTP200, designated sharing disabled and legacy sharing needing review. No account GPS/sharing consent was changed. No backend, Rules or Auth configuration deploy is required for this client slice. The separate discovery UI/backend cutover remains pending.

Publication and exact public source verification are recorded in WORKLOG.md when complete. Browser/phone adoption is a separate check: retained browser still ran older app-CGCcULTp.js despite current public HTTP source before publication.
