# Firebase token recovery — 2026-10-06

A map read or clip download can fail while Firebase cannot fetch its authentication token, then remain failed after Firebase reconnects without a browser connectivity event. Current-session token enrichment now emits a payload-free ready signal. Failed foreground media and map reads retry through their existing transports and permission checks. Healthy/pending map reads, hidden/offline/paused views and retired accounts are excluded. No credentials or tokens enter the event.

Both new regressions failed before repair. Final suite:4629 passed,6 skipped; build/type/native checks pass; lint has five pre-existing warnings. Startup budget1103.4KB raw/334.9KB gzip. Username availability code now loads when signup needs it; signup validation order is unchanged.

Manual Chrome8397 isolated actual-hook fixture: synthetic token failures shown for map and media; normal page control simulates confirmed token; fresh map read returns with sharing still off and real synthetic video plays. Screenshot outputs/vybe-token-recovery-browser-check.png. Auth ready-signal emission and retirement checks are separately tested. This does not prove phone playback performance or resolve all transport failures. No production account, GPS consent, Rules or backend writes.

Latest120 account evidence review remains read-only:77 missing Auth owners, historical indices but no protected bindings or reviewed recovery records;2profiles/10sentmessages reference those UIDs. Public email or historical index alone is insufficient for account reassignment. No blind Auth seeding or content ownership changes were performed.

Publication pending.
