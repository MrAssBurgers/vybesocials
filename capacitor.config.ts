import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for VYBE.
 *
 * Hot-reload (development): set CAP_DEV=1 in your shell before running
 *   `npx cap sync` / `npx cap run ios` to point the native shell at
 *   https://vybehub.app (production SPA). Default (unset) ships bundled `dist/`.
 *
 *   CAP_DEV=1 npx cap sync ios
 *
 * IMPORTANT: CAP_DEV remote will NOT show local CSS/JS from this repo until
 * Lovable Publish (or you sync without CAP_DEV so the shell loads local dist).
 * Use unset CAP_DEV + `npm run build && npx cap sync ios` to verify layout CSS
 * in Simulator before publish.
 *
 * Never ship a production build (TestFlight / App Store) with CAP_DEV set.
 */
const IS_DEVELOPMENT = process.env.CAP_DEV === '1';

const config: CapacitorConfig = {
  // Must be Java-package form (no dashes) for Capacitor iOS/Android.
  // Matches Despia / store bundle id used elsewhere in the app.
  appId: 'com.despia.vybe',
  appName: 'VYBE',
  webDir: 'dist',
  ...(IS_DEVELOPMENT && {
    server: {
      // Load production web app in the Capacitor shell (Simulator-friendly).
      url: 'https://vybehub.app',
      cleartext: true,
    },
  }),
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      // Match :root --background (240 10% 4% → #09090b) so any WebView peek blends
      backgroundColor: '#09090b',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#09090b',
    },
    Keyboard: {
      // iOS uses 'native' for proper resize behavior with fixed inputs
      // (chat composer, comment box). 'body' breaks fixed-bottom layouts on iOS.
      resize: 'native',
      resizeOnFullScreen: true,
      style: 'DARK',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'apple.com'],
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
    App: {
      // Universal Link host — must match Associated Domains capability in Xcode:
      // applinks:vybehub.app, applinks:www.vybehub.app
    },


  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#09090b',
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#09090b',
    // Custom URL scheme for OAuth callbacks. Add the matching CFBundleURLSchemes
    // entry to ios/App/App/Info.plist.
    scheme: 'vybe',
    // Restrict navigation to app-bound domains (iOS 14+). Requires WKAppBoundDomains
    // in Info.plist (see docs/IOS_SETUP.md). Off under CAP_DEV so remote
    // https://vybehub.app + CDNs load in Simulator without a domain allowlist miss.
    limitsNavigationsToAppBoundDomains: !IS_DEVELOPMENT,
    // Allow webview to handle webrtc / camera / mic without external Safari
    handleApplicationNotifications: false,
  },
};

export default config;
