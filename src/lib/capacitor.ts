import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Platform detection
export const isNativePlatform = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isWeb = Capacitor.getPlatform() === 'web';

// Initialize native plugins
export async function initializeNativePlugins() {
  if (!isNativePlatform) return;

  try {
    // Hide splash screen after app is ready
    await SplashScreen.hide({ fadeOutDuration: 500 });

    // Configure status bar — overlay so the WebView extends edge-to-edge
    if (isAndroid) {
      await StatusBar.setStyle({ style: Style.Dark });
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch (e) {
        console.warn('[Capacitor] setOverlaysWebView not available:', e);
      }
    } else if (isIOS) {
      await StatusBar.setStyle({ style: Style.Dark });
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch {}
    }

    // Setup keyboard listeners
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      document.body.classList.add('keyboard-visible');
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.style.setProperty('--keyboard-height', '0px');
      document.body.classList.remove('keyboard-visible');
    });

    // Handle back button on Android — leave DM threads to inbox (replace) so
    // history.back() doesn't bounce into phantom sheet entries or skip the list.
    App.addListener('backButton', ({ canGoBack }) => {
      const path = window.location.pathname;
      const segment = path.startsWith('/messages/')
        ? path.slice('/messages/'.length).split(/[/?#]/)[0] ?? ''
        : '';
      const isDmThread =
        Boolean(segment) && !['search', 'requests', 'new', 'ai-autisy'].includes(segment);
      if (isDmThread) {
        document.documentElement.removeAttribute('data-dm-active');
        window.history.replaceState(window.history.state, '', '/messages');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    // Handle app state changes
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        document.dispatchEvent(new CustomEvent('app-resumed'));
      } else {
        document.dispatchEvent(new CustomEvent('app-paused'));
      }
    });

    // Handle deep links — Universal Links, custom scheme, OAuth callback return.
    App.addListener('appUrlOpen', ({ url }) => {
      void (async () => {
        try {
          const parsed = new URL(url);
          const path = parsed.pathname + parsed.search + parsed.hash;

          const { isDespiaOAuthReturnUrl, completeDespiaOAuthFromUrl } = await import('@/lib/despiaOAuth');
          if (isDespiaOAuthReturnUrl(url)) {
            const result = await completeDespiaOAuthFromUrl(url);
            if (result.error) {
              sessionStorage.setItem('vybe-oauth-error', result.error.message);
            }
            window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
          }

          const isOAuthReturn =
            path.startsWith('/auth/callback') ||
            parsed.search.includes('code=') ||
            parsed.hash.includes('access_token');

          if (isOAuthReturn) {
            const { firebaseAuth } = await import('@/lib/firebase');
            await firebaseAuth.completeOAuthRedirectIfNeeded();
          }

          if (path && path !== '/') {
            window.history.pushState({}, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        } catch (e) {
          console.warn('[Capacitor] Bad deep link:', url, e);
        }
      })();
    });

    console.log('[Capacitor] Native plugins initialized successfully');
  } catch (error) {
    console.error('[Capacitor] Failed to initialize native plugins:', error);
  }
}

// Native haptic feedback
export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium') {
  if (!isNativePlatform) return;
  
  try {
    const impactStyle = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy
    }[style];
    
    await Haptics.impact({ style: impactStyle });
  } catch (error) {
    console.warn('[Capacitor] Haptic feedback failed:', error);
  }
}

export async function hapticNotification(type: 'success' | 'warning' | 'error' = 'success') {
  if (!isNativePlatform) return;
  
  try {
    const notificationType = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error
    }[type];
    
    await Haptics.notification({ type: notificationType });
  } catch (error) {
    console.warn('[Capacitor] Haptic notification failed:', error);
  }
}

export async function hapticVibrate(duration: number = 100) {
  if (!isNativePlatform) return;
  
  try {
    await Haptics.vibrate({ duration });
  } catch (error) {
    console.warn('[Capacitor] Haptic vibrate failed:', error);
  }
}

// Show/hide splash screen manually
export async function showSplash() {
  if (!isNativePlatform) return;
  await SplashScreen.show({ autoHide: false });
}

export async function hideSplash() {
  if (!isNativePlatform) return;
  await SplashScreen.hide({ fadeOutDuration: 500 });
}

// Keyboard utilities
export async function hideKeyboard() {
  if (!isNativePlatform) return;
  await Keyboard.hide();
}

export async function showKeyboard() {
  if (!isNativePlatform) return;
  await Keyboard.show();
}

// App info
export async function getAppInfo() {
  if (!isNativePlatform) {
    return { version: '1.0.0', build: '1', name: 'VYBE' };
  }
  return await App.getInfo();
}

// Exit app (Android only)
export async function exitApp() {
  if (isAndroid) {
    await App.exitApp();
  }
}
