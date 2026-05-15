# iOS Setup Guide — VYBE on iPhone

This guide walks you through everything required to take VYBE from the Lovable
sandbox to TestFlight and the Apple App Store. The web app, Capacitor config,
and JS bridges are already in place — these are the **native-side steps** that
must run on a Mac with Xcode.

> Lovable cannot run `npx cap` or open Xcode for you. Pull the project locally,
> follow the steps in order.

---

## 1. Prerequisites

- macOS with **Xcode 15+** installed
- Apple Developer Program account ($99/yr) — required for TestFlight + App Store
- CocoaPods (`sudo gem install cocoapods` if missing)
- Node 20+ and `npm install` already run in the project

---

## 2. Add the iOS Platform

From the project root:

```bash
npm run ios:setup       # adds the ios/ folder + syncs the web build
```

That script runs:

```bash
npm run build
npx cap add ios
npx cap sync ios
```

Open the workspace in Xcode:

```bash
npm run ios:open        # opens ios/App/App.xcworkspace
```

### Hot-reload during development

Set `CAP_DEV=1` so the app loads from the Lovable preview URL instead of the
bundled web build:

```bash
CAP_DEV=1 npx cap sync ios
npm run ios:open
```

**Never** ship a TestFlight/App Store build with `CAP_DEV=1` — Apple will
reject it for loading remote code.

---

## 3. Xcode Capabilities to Enable

In Xcode, select the **App** target → **Signing & Capabilities** → `+ Capability`:

1. **Push Notifications** — required for OneSignal / APNs
2. **Background Modes** → enable:
   - Remote notifications
   - Audio, AirPlay, and Picture in Picture (for voice/video calls)
   - Background fetch
3. **Sign in with Apple** — required because the app offers Google sign-in
   (Apple Guideline 4.8). Without this, App Store review rejects the build.
4. **Associated Domains** → add ALL of:
   - `applinks:vybehub.app`
   - `applinks:www.vybehub.app`
   - `webcredentials:vybehub.app`  ← **required for Passkeys / Face ID sign-in**
   - `webcredentials:www.vybehub.app`
5. **App Tracking Transparency** is automatic — no capability needed, just the
   Info.plist key (see §4).

### 3a. Passkeys / Face ID — apple-app-site-association

Passkeys in WKWebView only work when iOS can verify that this app owns the
domain. The app already serves the file at:

```
https://vybehub.app/.well-known/apple-app-site-association
```

(see `public/.well-known/apple-app-site-association`).

**You MUST replace `TEAMID` in that file with your real Apple Team ID** (10-char
alphanumeric, found in the upper-right of https://developer.apple.com/account).
After replacing it, re-deploy the web app so the file is live, then build the
iOS app. iOS will fetch the AASA on first launch and cache it; if you change
it later, delete + reinstall the app to force a refresh.

The same Team ID + bundle ID combo must appear in:
- `public/.well-known/apple-app-site-association` → both `applinks` and `webcredentials` arrays
- Xcode → Signing & Capabilities → Associated Domains entries above

The Android equivalent (`public/.well-known/assetlinks.json`) needs the SHA-256
fingerprint of your Play app-signing certificate — get it from Play Console →
Setup → App signing.

---

## 4. Info.plist Keys (Rejection-Blockers)

Open `ios/App/App/Info.plist` and add the following inside the top-level
`<dict>`. Every usage description must be human-readable and explain *why*
the app needs the permission, or Apple rejects.

```xml
<!-- Camera & Mic -->
<key>NSCameraUsageDescription</key>
<string>VYBE uses your camera to capture photos, clips, and stories you share with friends.</string>
<key>NSMicrophoneUsageDescription</key>
<string>VYBE uses your microphone for voice notes, video clips, and calls with friends.</string>

<!-- Photo Library -->
<key>NSPhotoLibraryUsageDescription</key>
<string>VYBE uses your photo library so you can share existing pictures and videos in posts and messages.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>VYBE saves photos and videos you create back to your library.</string>

<!-- Location (Friend Map) -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>VYBE uses your location to show your spot on the Friend Map and surface posts nearby.</string>

<!-- Face ID / Passkeys -->
<key>NSFaceIDUsageDescription</key>
<string>VYBE uses Face ID to securely sign you in with your passkey.</string>

<!-- App Tracking Transparency (AdMob, ads personalization) -->
<key>NSUserTrackingUsageDescription</key>
<string>VYBE uses tracking to show ads that match your interests and to keep the app free.</string>

<!-- Apple Music / Audio (sound trends) -->
<key>NSAppleMusicUsageDescription</key>
<string>VYBE uses Apple Music to discover sounds for your clips.</string>

<!-- Background Modes -->
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
  <string>audio</string>
  <string>fetch</string>
</array>

<!-- Custom URL Scheme (matches capacitor.config.ts ios.scheme) -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>app.lovable.vybe</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>vybe</string>
    </array>
  </dict>
</array>

<!-- App-Bound Domains (iOS 14+ — required when limitsNavigationsToAppBoundDomains=true) -->
<key>WKAppBoundDomains</key>
<array>
  <string>vybehub.app</string>
  <string>www.vybehub.app</string>
  <string>agtcyxjxgkdyoxwxkjth.supabase.co</string>
  <string>vybeapp.lovable.app</string>
</array>
```

---

## 5. App Tracking Transparency (ATT)

Already wired in `src/lib/att.ts` and called from `src/lib/admob.ts`.
The system prompt fires the first time AdMob initializes on iOS. No further
work needed — just make sure the `NSUserTrackingUsageDescription` string above
is present, otherwise iOS crashes the app.

---

## 6. Sign in with Apple

Already implemented in `src/pages/Landing.tsx` via Lovable Cloud's managed
Apple provider. After enabling the capability in Xcode (§3.3), no further
code changes are needed.

In the Apple Developer console:

1. Identifiers → your App ID → enable **Sign in with Apple**
2. Make sure the Services ID redirect URL points to:
   `https://agtcyxjxgkdyoxwxkjth.supabase.co/auth/v1/callback`

---

## 7. Push Notifications (APNs via OneSignal)

1. Apple Developer → Keys → `+` → enable **Apple Push Notifications service (APNs)**
2. Download the `.p8` key, note the Key ID and Team ID.
3. OneSignal dashboard → your app → Settings → iOS APNs → upload `.p8`,
   paste Key ID + Team ID + Bundle ID (`app.lovable.416714c8d0134aff984d522418a9bbc7`).
4. Verify delivery from OneSignal's "Test" tab on a real device (push does
   NOT work in the simulator).

---

## 8. RevenueCat / In-App Purchases

Apple's Guideline 3.1.1 forbids using Stripe for digital goods (VYBE Pro,
gifted premium, in-app currency). On iOS the app routes through RevenueCat
instead — see `src/lib/iapGating.ts`.

1. App Store Connect → My Apps → your app → Features → In-App Purchases —
   create the SKUs that match your RevenueCat products (e.g. `vybe_pro_monthly`,
   `vybe_pro_yearly`).
2. RevenueCat dashboard → your project → Apple App Store → upload the
   App-Specific Shared Secret.
3. Add the iOS API key to `src/lib/revenuecat.ts` (use `Capacitor.getPlatform()`
   to pick the right key).
4. Test purchases with a Sandbox Apple ID on a real device.

---

## 9. AdMob iOS

1. AdMob console → Apps → Add App (iOS) → grab the iOS App ID
   (`ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`).
2. Add it to Info.plist:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX</string>
<key>SKAdNetworkItems</key>
<array>
  <!-- Paste the SKAdNetwork list from https://developers.google.com/admob/ios/ios14 -->
</array>
```

3. Replace the test unit IDs in `src/lib/admob.ts` (`USE_TEST_ADS = false`).

---

## 10. App Icons & Splash Screens

Use the `@capacitor/assets` tool to generate every required size from a
single 1024×1024 source:

```bash
npm install --save-dev @capacitor/assets
mkdir -p resources
# Drop a 1024x1024 icon at resources/icon.png and a 2732x2732 splash at resources/splash.png
npx capacitor-assets generate --ios
```

The generated `AppIcon.appiconset` and `Splash.imageset` land directly in
`ios/App/App/Assets.xcassets/`.

---

## 11. Build & Submit

```bash
npm run build
npx cap sync ios     # or: CAP_DEV=1 npx cap sync ios for dev hot-reload
npm run ios:open
```

In Xcode:

1. Set the team under Signing & Capabilities (Automatic signing recommended)
2. Select **Any iOS Device (arm64)** as the run target
3. Product → Archive
4. Distribute App → App Store Connect → Upload
5. Wait for processing (~10 min), then add to a TestFlight group

---

## 12. Common Rejection Reasons (avoid these)

- ❌ Missing `NSUserTrackingUsageDescription` → app crashes on first ATT prompt
- ❌ Offering Google sign-in without Sign in with Apple
- ❌ Stripe checkout for digital subscriptions on iOS (use IAP instead)
- ❌ Background WebView loading `lovableproject.com` (CAP_DEV not unset)
- ❌ "Demo" / "test" content visible to reviewers — make sure seeded posts look real
- ❌ Crashes on first launch on a fresh device (test in Xcode + on a sandbox Apple ID)

---

## 13. Updating After Code Changes

Any time you change web code (most of the time):

```bash
npm run build && npx cap sync ios
```

Native-only changes (Info.plist, capabilities) only require an Xcode build,
no `cap sync` needed.
