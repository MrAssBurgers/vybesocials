# Core backend Node 22 migration

`ensureAccountProfile`, `readSocialFeed` and `manageLocationSharing` are ACTIVE on Node 22. Each runtime candidate started from its current versioned deployed archive. Only `package.json` and the top-level engine in `package-lock.json` changed from 20 to 22; the other 481 of 483 archive files and all dependency versions stayed intact.

Actual compiled modules loaded under Node 22.23.3, including all 286 exports in each archive. Five existing authority/regression scripts passed 67 grouped checks and 223 Rules checks against an isolated local Firebase project. Three actual entrypoint authentication checks and three type checks passed. The full project had 4,844 passing tests and six skipped tests under Node 22; production build and bundle/native-package checks passed. A moved fixture's Rules path needed correction; no archived handler or assertion changed.

Each deployment request updated only `buildConfig.runtime` and `buildConfig.source`. Actual downloaded deployed ZIP bytes match the reviewed candidates. Complete canonical service settings, excluding the new revision identifier, match before and after; triggers and build environment are unchanged. All three live empty unauthenticated calls reject with `401 UNAUTHENTICATED`. Local fixtures and emulators were stopped without touching existing shared services.

The complete post-release inventory has 233 ACTIVE functions: three on Node 22 and 230 on Node 20. The other 230 metadata rows are unchanged. Remaining runtime migration, the repository's Node 20 default, other dependency advisories, Auth security gates, legitimate Firebase restoration and physical-phone QA remain open. This release does not certify instant loading, signed-in live behavior, GPS permission, codec compatibility or native package adoption.

See [the exact verification receipt](verification.json) and [backend runtime readiness](../../docs/BACKEND_RUNTIME_READINESS.md). There was no client, Rules, user data, provider, OS permission or native binary update.
