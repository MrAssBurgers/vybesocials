# Firebase token recovery — 2026-10-06

A map read or clip download can fail while Firebase cannot fetch its authentication token, then remain failed after Firebase reconnects without a browser connectivity event. Current-session token enrichment now emits a payload-free ready signal. Failed foreground media and map reads retry through their existing transports and permission checks. Healthy/pending map reads, hidden/offline/paused views and retired accounts are excluded. No credentials or tokens enter the event.

Both new regressions failed before repair. Final suite:4629 passed,6 skipped; build/type/native checks pass; lint has five pre-existing warnings. Startup budget1103.4KB raw/334.9KB gzip. Username availability code now loads when signup needs it; signup validation order is unchanged.

Manual Chrome8397 isolated actual-hook fixture: synthetic token failures shown for map and media; normal page control simulates confirmed token; fresh map read returns with sharing still off and real synthetic video plays. Screenshot outputs/vybe-token-recovery-browser-check.png. Auth ready-signal emission and retirement checks are separately tested. This does not prove phone playback performance or resolve all transport failures. No production account, GPS consent, Rules or backend writes.

Latest120 account evidence review remains read-only:77 missing Auth owners, historical indices but no protected bindings or reviewed recovery records;2profiles/10sentmessages reference those UIDs. Public email or historical index alone is insufficient for account reassignment. No blind Auth seeding or content ownership changes were performed.

Publication pending.

Published tested client `416b37a82b9d1eb5d6fa239fb062a6cafb2bc6e5`, deployment `b881890c-22d1-440e-ab48-711aade33af0`. Actual publisher confirmed “Your website was updated”. Screenshot `outputs/vybe-token-recovery-published.png` was saved before documentation sync; do not overwrite it later.

Exact public source v2 `85c477200bd7f8835a6076d4889bb8a651fbe5c816f87d53c4c70a571483c765` /2561inputs; built `2026-10-06T11:04:02.401Z`; entry `/assets/app-DVzShrah.js` SHA256 `9a029dbafed1ff98b581a025ac7169505fe2dc8dc3d4b2c46bdbccdce5e01eff`. Public metadata, asset bytes and five route HTML checks passed; secondary origin redirects to canonical. Log `work/token-recovery-public-check.log`.

Retained signed-in IAB ordinary reload still loads app-CGCcULTp.js. Actual phone/client adoption, initial Auth transport failure, location sharing and playback performance remain unverified. No cache/session purge or blocked internal-browser inspection workaround. Local8397 fixture session60917 stopped and its temporary tab closed. Corrected historical migration report's unconditional restoration claims. Goal remains active; documentation-only commit does not change the tested release's source identity.
