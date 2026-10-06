# Mobile connection and native resume recovery

Restores transient profile setup on network return or native resume when Firebase still has a valid token. Only the failed current-account bootstrap retries; account review/permission failures and retired account reads do not. Native lifecycle events now bubble from document to window exactly once, reaching existing Auth/session listeners.

Clips respond to native pause/resume even if the WebView visibility remains visible. Map location reads retire old grants on native pause and immediately check fresh permission leases on resume. Requested GPS watches stop on pause, reject queued old callbacks and restart on resume; no new GPS consent or sharing grant is created.

Validation: four initial regression cases failed on previous source. Full suite 4,554 passed / 6 skipped; production build, native manifest, typecheck and lint pass (five existing warnings). Bundle 1101.9 KB raw / 334.5 KB gzip. Synthetic Firebase preview saved login loads the existing 3D map; Clips readyState 4, paused false, MediaError null. Responsive desktop/local SDK results are not physical-phone GPS, codec or frame-rate certification.

Frontend-only release via tested main/Lovable publication. Firebase Rules, Functions, Auth configuration and user sharing consent unchanged. Actual phone networking and older mounted-client adoption remain open verification work.

Published main `14c84c72679e9e5aa542a2b6c0d5a6e317478d63`, deployment `ef976fe9-395c-48ac-b077-6c93c05b3a53`, confirmed by publisher. Public source `15715b3df1bd526c0a6462a4ad62850c06d5da663dda737c0b229f5aeffc3a58` (2545 inputs), built 2026-10-06T08:25:24.997Z. Entry `/assets/app-BDSp7RCo.js`, SHA256 `ac3a23b83ca4ff301ac2fc883977a62b3d98844940717791dcf36934b2a3812f`; exact metadata, entry bytes and five route HTML references verified. Secondary Lovable origin redirects canonical. Native producer test covers Capacitor; actual Despia event delivery and phone testing remain open.
