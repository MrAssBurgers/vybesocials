# Fix top-of-screen gap in Despia APK

## Problem
In the Despia APK screenshot, a wallpaper-colored band appears between the system status bar (clock/battery) and the VYBE header. The web header already uses `safe-area-inset-top`, but on Android the WebView is honoring `<meta name="theme-color" content="#8B5CF6">` (purple) and the Despia native shell is leaving the WebView pushed BELOW the status bar instead of underlapping it. Result: visible non-app strip.

## Changes

### 1. `index.html`
- Change `<meta name="theme-color" content="#8B5CF6">` to `#0B0B10` (Deep Navy / app background) so on any Android shell that paints the status bar from theme-color, it matches the header and there is no visible seam.

### 2. `src/lib/capacitor.ts`
- In `initializeNativePlugins()` (Android branch), call `StatusBar.setOverlaysWebView({ overlay: true })` so the WebView extends edge-to-edge under the status bar. Remove the explicit `setBackgroundColor` (only valid when not overlaying). The header's existing `safe-area-inset-top` padding will keep the logo/search clear of the clock.
- Keep `Style.Dark` so status-bar icons stay light on the dark background.

### 3. Despia-specific note (no code change required)
Despia wraps the same web app — once `theme-color` is dark and the meta `apple-mobile-web-app-status-bar-style="black-translucent"` (already set) is in place, Despia's Android shell will paint the status-bar strip with the dark background. No Despia dashboard change is needed for this fix.

## Why this works
- `theme-color` controls the Android Chrome / WebView status-bar tint when the page is loaded standalone or in a wrapper that doesn't override it. Matching it to the app background eliminates the colored seam.
- `setOverlaysWebView(true)` tells Capacitor's StatusBar plugin to make the WebView draw underneath the status bar, so `env(safe-area-inset-top)` becomes non-zero and the header (which is already `fixed top-0` with `safe-area-top` padding) extends visually to the very top edge.

## Out of scope (already done in previous turn)
- Bottom-nav frosted strip on left/right of pill
- Wallet page scroll & background zoom
- Despia OneSignal / NFC bridge availability — those depend on Despia dashboard capabilities being enabled and a fresh APK build; the web hooks (`DespiaOneSignalSync`, `useNativeFriendDrop`) are already wired correctly.
