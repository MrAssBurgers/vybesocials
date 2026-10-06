# Mobile connection and native resume recovery

Restores transient profile setup on network return or native resume when Firebase still has a valid token. Only the failed current-account bootstrap retries; account review/permission failures and retired account reads do not. Native lifecycle events now bubble from document to window exactly once, reaching existing Auth/session listeners.

Clips respond to native pause/resume even if the WebView visibility remains visible. Map location reads retire old grants on native pause and immediately check fresh permission leases on resume. Requested GPS watches stop on pause, reject queued old callbacks and restart on resume; no new GPS consent or sharing grant is created.

Validation: four initial regression cases failed on previous source. Full suite 4,554 passed / 6 skipped; production build, native manifest, typecheck and lint pass (five existing warnings). Bundle 1101.9 KB raw / 334.5 KB gzip. Synthetic Firebase preview saved login loads the existing 3D map; Clips readyState 4, paused false, MediaError null. Responsive desktop/local SDK results are not physical-phone GPS, codec or frame-rate certification.

Frontend-only release via tested main/Lovable publication. Firebase Rules, Functions, Auth configuration and user sharing consent unchanged. Actual phone networking and older mounted-client adoption remain open verification work.
