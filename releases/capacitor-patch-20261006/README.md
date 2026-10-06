# Scoped patched Capacitor dependency release

Tested source: `01247fd702a22dfd5ba4b970c4bde3560fb98482`. Web publication job: `c00a7582-4a5a-434e-8302-043e32996726`.

Exact Android/iOS/core/CLI8.4.3 pins align local npm and hosted Bun with the [vendor's patched release](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv). Other dependencies were preserved. The iOS manifest/pin select the independently verified vendor8.4.3 tag. Build/test gates reject old/mismatched installed and locked runtime packages; native preflight also checks iOS records. Version metadata records the checked versions.

Seven gate cases and4,782 app tests pass, six skipped. App/native-web packaging, types, bundle limits and lint pass(5existing warnings). Compiled Login and Sign Up render with no captured runtime errors. Root npm critical findings drop2→0;24 other findings remain. No native compiler/archive/store upload was completed: Windows lacks Xcode, actual SwiftPM resolution must regenerate its retained originHash, and the actual distributed provider/store shell must be rebuilt and verified. Read [the concrete native continuation](../../docs/NATIVE_SECURITY_PATCH.md). Web publication does not certify installed-phone remediation.

The hosting UI confirmed “Your website was updated.” Canonical all source v2/runtime dependency fields, entry bytes and nine route references match the tested source. Secondary Lovable address redirects to canonical, not independent origin evidence. See `verification.json` for exact source/publication/audit proof. Firebase backend, Rules, Auth, consent, location and records unchanged. Full user readiness, historical restoration, current browser/phone adoption and remaining security checks stay open.
