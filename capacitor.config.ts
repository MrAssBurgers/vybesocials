import type { CapacitorConfig } from '@capacitor/cli';

// Set to true for development (hot reload from preview URL)
// Set to false for production builds (uses bundled assets)
const IS_DEVELOPMENT = true;

const config: CapacitorConfig = {
  appId: 'app.lovable.762a689eac3b48a59a179f1c2b5b3a2b',
  appName: 'VYBE',
  webDir: 'dist',
  // Only use server URL in development mode
  ...(IS_DEVELOPMENT && {
    server: {
      url: 'https://762a689e-ac3b-48a5-9a17-9f1c2b5b3a2b.lovableproject.com?forceHideBadge=true',
      cleartext: true
    }
  }),
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: '#0a0a0b',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0b'
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    Camera: {
      permissions: ['camera', 'photos']
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0a0a0b',
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined
    }
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0a0a0b'
  }
};

export default config;
