# Capacitor native patch verification (2026-10-06)

The vendor advisory [GHSA-rvm3-566m-v7fv](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv) covers a native internal HTTP proxy navigation vulnerability. Inspected local npm dependencies and the checked-in iOS SwiftPM record selected8.4.0; Bun selected8.0.1 for Android/iOS/core. Both are affected ranges. This establishes repository dependency exposure, not the actual version of a binary currently installed on a user's phone.

Android, iOS, core and CLI now have exact8.4.3 pins in package.json and both locks. Other dependencies were preserved. The iOS manifest/pin select8.4.3 at vendor tag revision89e0d8ec2321025f549ddb19259a717467943b97, independently checked with git ls-remote. The resolved-file pin was edited against that tag, without running SwiftPM resolution. Its original originHash and other pins were retained; a Mac resolver must regenerate/verify the actual resolution before archive. The Windows `cap doctor` reports Xcode unavailable. No native binary/archive/signing/store upload was completed here.

Build/test gates check exact patched npm/Bun/installed packages and reject older or nested mismatches. Version metadata includes these actual checked dependencies. `npm run check:native-runtime` also checks the iOS manifest and exact vendor tag pin. Seven gate cases,4,782 app tests, app/native-web asset packaging, types/lint and Login/Sign Up browser rendering pass. Npm audit critical findings dropped2→0;24 other findings remain separately reviewed. These checks do not replace native compilation or phone tests.

On a configured Mac, with the existing app signing setup:

```sh
npm ci --legacy-peer-deps
npm run ios:sync
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App
npm run check:native-runtime
```

Inspect regenerated SwiftPM resolution and build/archive the existing App scheme in Xcode. Confirm the resulting binary uses the patched native runtime, then distribute through the existing TestFlight/App Store channel. If the distributed phone app is built by Despia, request/verify the patched runtime in that actual shell build; repository package pins alone do not attest a provider-built shell. The repository's native/android folder contains bridge/manifest files, not a complete Gradle build project, so an Android binary must be built and checked in the existing configured native distribution environment. Do not generate a different Android shell and claim the current installed application is repaired.

After installing the resulting native update, verify cold launch/persistent account restoration, foreground token recovery, legitimate HTTP/media requests, clips and explicit map sharing. The vendor explicitly requires rebuild and redistribution; Lovable web publication delivers the web dependencies and diagnostics only.
