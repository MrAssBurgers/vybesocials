## iPhone (iOS) Support Plan

The project already has Capacitor 8 wired up (config, plugins, `useNativeFeatures`, RevenueCat, AdMob, push, camera, haptics). What's missing is everything around the **actual iOS shell, App Store readiness, and iOS-specific polish**. Here's what I'll do.

---

### 1. iOS Project & Config Hardening
- Update `capacitor.config.ts`:
  - Flip `IS_DEVELOPMENT` to a proper `process.env`-driven flag so production builds never hit the Lovable preview URL.
  - Add iOS-specific keys: `scheme: 'VYBE'`, `limitsNavigationsToAppBoundDomains: true`, `scrollEnabled: true`, `overrideUserAgent` for analytics, `backgroundColor`.
  - Configure `App` deep linking (`app.lovable...://` + universal link host `vybehub.app`).
- Add a documented `npx cap add ios` + `npx cap sync` workflow (cannot be run inside Lovable sandbox — instructions only).

### 2. iOS Permissions (Info.plist)
Generate a `Info.plist` patch script + docs covering every usage description Apple requires (rejection-blockers):
- `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`
- `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`
- `NSLocationWhenInUseUsageDescription` (Friend Map)
- `NSContactsUsageDescription` (Friend discovery, if used)
- `NSFaceIDUsageDescription` (WebAuthn / passkeys)
- `NSUserTrackingUsageDescription` (AdMob/ATT)
- `NSAppleMusicUsageDescription` (music features)
- Background modes: `remote-notification`, `audio` (for calls), `fetch`.

### 3. App Tracking Transparency (ATT)
- Add `@capacitor-community/app-tracking-transparency` (or AdMob's built-in ATT bridge).
- New `useATT` hook that requests ATT once on first launch, before AdMob init. Required or AdMob/Apple rejects.

### 4. Safe-Area & Layout Fixes for Notch/Dynamic Island
- Audit AppLayout, BottomNav, headers, fullscreen overlays (Stories, Clips, Camera, Calling, DM) and ensure `safe-area-top` / `safe-area-bottom` are applied. Several full-screen modals currently assume Android edge-to-edge.
- Add `viewport-fit=cover` to `index.html` meta viewport (verify present).
- Add iOS-only CSS class on `<html>` via `Capacitor.getPlatform()` for targeted tweaks (e.g., disable `100vh`, prefer `100dvh`).

### 5. iOS Keyboard & Input Behavior
- Configure `@capacitor/keyboard` `resize: 'native'` for iOS (current `body` mode breaks fixed bottom inputs in DM/Comments).
- Add `KeyboardResize` listener to scroll active input into view for chat & comment composers.
- Disable iOS double-tap zoom & rubber-band on lockable surfaces (camera, video player) via `touch-action` + `overscroll-behavior`.

### 6. Push Notifications (APNs)
- Add APNs setup docs: enable Push Notifications + Background Modes capabilities in Xcode, upload APNs key to OneSignal.
- Verify `useOneSignal` integration registers the iOS device token and routes deep links via `App.addListener('appUrlOpen')`.

### 7. Sign in with Apple (Required by Apple if Google is offered)
- Add `@capacitor-community/apple-sign-in`.
- New `signInWithApple()` path in auth using Lovable Cloud's managed Apple provider (no BYOC needed initially).
- Add Apple button to Landing/Login pages alongside Google. **Without this, App Store review rejects the build.**

### 8. RevenueCat / IAP for iOS
- Verify RevenueCat iOS API key is wired (currently has Android-style usage). Add `Purchases.configure({ apiKey: IOS_KEY })` branch.
- Document StoreKit product setup matching existing entitlements (VYBE Pro tiers, gifting).
- Disable Stripe paywall paths on iOS to comply with Apple's IAP rule for digital goods.

### 9. AdMob iOS
- Add iOS AdMob App ID to `capacitor.config.ts` plugin block.
- Ensure ATT prompt fires before AdMob init.

### 10. Splash Screen & App Icons
- Add a script under `scripts/generate-ios-assets.ts` using `@capacitor/assets` to produce all required iOS icon sizes + splash variants from existing brand assets.
- Use the dynamic V splash logic already documented in memory.

### 11. iOS-Specific Bug Surfaces (from project memory)
- Hidden `<input type="file">` Toybox constraint — audit & fix any animated containers wrapping file inputs.
- Camera: ensure `stopCameraStream()` runs on iOS before WebRTC call init (already in memory, verify).
- Google OAuth `redirect_uri` must remain `window.location.origin` — works because `Browser` plugin handles it; document Custom URL Scheme fallback.
- WebKit video autoplay: add `playsInline muted` to all `<video>` elements used in feeds/stories (audit Clips, Stories, Watch).

### 12. Build & Submission Prep
- Add `package.json` scripts: `ios:dev`, `ios:build`, `ios:open`, `ios:sync`.
- Document the full export → Xcode → TestFlight pipeline (cannot run from Lovable sandbox).

---

### What I will edit in this project
- `capacitor.config.ts` — env-driven server URL, iOS scheme, deep links, AdMob iOS app ID.
- `index.html` — `viewport-fit=cover`, apple-touch-icon, status-bar-style meta.
- `src/lib/capacitor.ts` — add `isIOS`, `isAndroid` helpers, ATT request, Apple sign-in bridge.
- `src/hooks/useATT.ts` (new) — one-shot ATT prompt before tracking/ads.
- `src/hooks/useAppleAuth.ts` (new) + Apple button on Landing/Login.
- `src/hooks/usePlatformInit.ts` (new) — boot orchestrator (StatusBar, Keyboard, ATT, Push, RevenueCat) gated per platform.
- Targeted CSS / safe-area fixes in AppLayout, BottomNav, fullscreen overlays.
- `<video>` audit pass for `playsInline`.
- `scripts/generate-ios-assets.ts` (new) + iOS docs (`docs/IOS_SETUP.md`).

### What you'll need to do (cannot run inside Lovable)
1. Export project to GitHub → `git pull`.
2. `npm install` → `npx cap add ios` → `npx cap sync ios`.
3. Open `ios/App/App.xcworkspace` in Xcode on a Mac.
4. Add capabilities: Push Notifications, Background Modes (remote-notification, audio), Sign in with Apple, Associated Domains (`applinks:vybehub.app`).
5. Drop in the AdMob iOS App ID, RevenueCat iOS API key, OneSignal APNs key.
6. Archive → upload to TestFlight.

A `docs/IOS_SETUP.md` walks through every step with screenshots-friendly instructions.

---

Want me to also tackle iPad layout (split view, larger breakpoints) in this pass, or keep it iPhone-only for now?