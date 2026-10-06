# Location service dependency patch

The active `manageLocationSharing` service now carries the reviewed `proxy-addr` 2.0.8 lockfile patch. Its actual versioned source archive has 483 files; the lockfile is the only changed file and the other 482 files match the previous deployed archive byte for byte. The installed stage passed eight vendor-condition regression assertions. The service rejects empty unauthenticated requests with `401 UNAUTHENTICATED` before and after the release.

Verification caught the Firebase CLI adding a 20-instance limit where the old revision used the default. A separate field-scoped update explicitly restored the previous effective maximum of 100. The final Cloud Run revision's compared runtime settings match after documented default normalization; the new image and generated build metadata are excluded from that policy comparison. Environment values, runtime identity, secret bindings and build environment remain checked. The raw GCF configuration fingerprint is not claimed identical because the default maximum is now explicit.

The post-release complete metadata inventory has 233 ACTIVE functions on Node 20. The other 232 metadata rows are unchanged. Google schedules Node 20 decommission for 2026-10-30; migration remains open. See [backend runtime readiness](../../docs/BACKEND_RUNTIME_READINESS.md) and [the verification receipt](verification.json).

This release does not patch every function, certify all security gates, demonstrate production exploitation, restore user content, or prove phone GPS/video/loading performance. It changes no client, Rules, user data, provider configuration, OS permissions or native binary.
