# Native web recovery preserves a usable page

The recovery script previously restarted an already running Despia page when a newer remote bundle was available, or when a late fallback script failed after the primary module became ready. Either race could interrupt sign-in or discard a draft. The two readiness guards retain the running document; existing bounded recovery for a broken pack remains available.

This release starts from public main `fd46381da919501f5ea45b488d8b7fb1b63bcab7` and changes only the OTA script generator and its regression tests. Firebase backend, Rules, provider configuration, dependencies and native binaries are unchanged. Native binary work and the broader private audit are outside this release.

The ten tests execute the actual generator and its generated inline script. The selected Android WebView observations in `android-webview-ota.json` pin the exact generator hashes: both original scenarios reload and lose the synthetic draft; both candidate scenarios retain one document and the draft. These are actual Android API 36 / WebView 133 executions with synthetic readiness, metadata and form content. They do not certify the full VYBE renderer, physical Play app, real sign-in or provider integrations.

Exact-tree regression, type, lint, build and delivery results are recorded in `verification-local.json` and, after publication, `verification-public.json`. The public verifier requires the exact selected main commit and compares all source/runtime identity parts, entry and stable facade bytes, sixteen route shells and every native-manifest asset.

Global readiness remains open: actual Play startup acceptance, signed native release/configuration, remaining security and backend work, real provider transactions and whole-app performance/load checks are required. Passing this scoped release is not a claim that every feature is ready.
