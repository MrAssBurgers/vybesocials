import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for VYBE.
 *
 * Hot-reload (development): set CAP_DEV=1 in your shell before running
 *   `npx cap sync` / `npx cap run ios` to point the native shell at the
 *   Lovable preview URL. Default (production) ships the bundled `dist/`.
 *
 *   CAP_DEV=1 npx cap sync ios
 *
 * Never ship a production build (TestFlight / App Store) with CAP_DEV set.
 */
const IS_DEVELOPMENT = process.env.CAP_DEV === '1';

const config: CapacitorConfig = {
  appId: 'app.lovable.416714c8d0134aff984d522418a9bbc7',
  appName: 'VYBE',
  webDir: 'dist',
  ...(IS_DEVELOPMENT && {
    server: {
      url: 'https://416714c8-d013-4aff-984d-522418a9bbc7.lovableproject.com?forceHideBadge=true',
      cleartext: true,
    },
  }),
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: '#0a0a0b',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0b',
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
    Camera: {
      permissions: ['camera', 'photos'],
    },
    App: {
      // Universal Link host — must match Associated Domains capability in Xcode:
      // applinks:vybehub.app, applinks:www.vybehub.app
    },
    GoogleAuth: {
      // Web OAuth client ID — used to mint the ID token that Supabase verifies.
      // Get from Google Cloud Console → Credentials → "Web application" client.
      // iOS additionally needs GIDClientID + REVERSED_CLIENT_ID in Info.plist.
      // Android additionally needs an Android OAuth client with the package's SHA-1.
      // See docs/NATIVE_AUTH_SETUP.md.
      scopes: ['profile', 'email'],
      serverClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0a0a0b',
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0a0b',
    // Custom URL scheme for OAuth callbacks. Add the matching CFBundleURLSchemes
    // entry to ios/App/App/Info.plist.
    scheme: 'vybe',
    // Restrict navigation to app-bound domains (iOS 14+ security requirement
    // for Service Workers, Web APIs in WebView). Configure WKAppBoundDomains
    // in Info.plist (see docs/IOS_SETUP.md).
    limitsNavigationsToAppBoundDomains: true,
    // Allow webview to handle webrtc / camera / mic without external Safari
    handleApplicationNotifications: false,
  },
};

export default config;
