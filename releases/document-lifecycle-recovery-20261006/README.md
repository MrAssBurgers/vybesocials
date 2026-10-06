# Document-native lifecycle recovery

The app mixes document and window listeners for its existing native pause/resume events. A non-bubbling document event cannot reach window listeners. Startup now forwards only non-bubbling document pause/resume events to window, preserving detail. Already-bubbling and window events are delivered once. Existing document consumers receive their original event; no native callback name or permission is invented.

Regression: non-bubbling document pause leaves Clips active on prior source; repaired startup bridge passes. Integration checks cover current-account valid-token profile retry, map grant retirement/resume and Clips visibility, plus event delivery/detail/idempotent installation/cleanup. Full 4558 passed / 6 skipped; build/native validation/types/lint pass (five existing warnings). Bundle 1102.3 KB raw / 334.6 KB gzip. Actual saved synthetic Firebase account reload reaches 3D map.

Frontend only; no backend, Firebase Rules/Auth settings, session purge or GPS consent changes. This proves handling of document-native events; actual Despia producer delivery, phone source adoption, GPS, codecs and frame rate remain unverified. Publish through Lovable from the exact tested main source, then verify public metadata, entry bytes and routes.
