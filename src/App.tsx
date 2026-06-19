import { useState, useEffect, memo, lazy, Suspense, useRef } from 'react';
import './lib/i18n';
import { db } from '@/lib/firebase';
import './styles/liquid.css';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryPersister, shouldPersistQueryKey } from "@/lib/queryPersister";
import { startReconnectManager } from "@/lib/reconnectManager";
import { startOutbox } from "@/lib/dmOutbox";
import { BrowserRouter, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { CustomThemeProvider } from "@/providers/ThemeProvider";
import { ThemeTransitionProvider } from "@/providers/ThemeTransitionProvider";
import { DebugPanelProvider } from "@/contexts/DebugPanelContext";
import { BugRecheckProvider } from "@/contexts/BugRecheckContext";
import { CallStoreProvider } from "@/lib/callStore";
import { ConnectionStatusBanner } from "@/components/system/ConnectionStatusBanner";
import { AccessibilityProvider } from "@/providers/AccessibilityProvider";
import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";
import { saveScrollPosition, restoreScrollPosition } from "@/lib/scrollMemory";
import { RootBottomNavMount } from "@/components/layout/RootBottomNavMount";
import { AgentActionBusProvider } from "@/lib/agent/actionBus/AgentActionBusProvider";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { useContrastAutoGuard } from "@/hooks/useContrastAutoGuard";
import { isNativePerfMode } from "@/lib/nativePerfMode";
import { hasStoredSupabaseSession } from "@/lib/supabaseStorageKey";
import { getWasLoggedIn, setWasLoggedIn } from "@/lib/wasLoggedIn";
import SmartErrorBoundary from "@/components/error/SmartErrorBoundary";
import { AppErrorFallback } from "@/components/error/AppErrorFallback";
import LocalErrorBoundary from "@/components/error/LocalErrorBoundary";
import { GlobalErrorHandler } from "@/components/error/GlobalErrorHandler";
import { useAppPreloader } from "@/hooks/useAppPreloader";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { usePostsRealtime } from "@/hooks/usePostsRealtime";
import { useSpotifyPresence } from "@/hooks/useSpotifyPresence";
import { useExternalPresence } from "@/hooks/useExternalPresence";
const SpotifyPresenceInner = () => { useSpotifyPresence(); useExternalPresence(); return null; };
const RealtimeSyncInner = () => { useRealtimeProfiles(); usePostsRealtime(); return null; };
// Mount presence loops AFTER first paint so they don't compete with the
// critical render path. Saves ~200-400ms on cold load.
const SpotifyPresenceMount = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (idle) {
      const id = idle(() => setReady(true), { timeout: 2500 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, []);
  return ready ? <SpotifyPresenceInner /> : null;
};
const RealtimeSyncMount = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (idle) {
      const id = idle(() => setReady(true), { timeout: 1800 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, []);
  return ready ? <RealtimeSyncInner /> : null;
};
import { VybePageLoader } from '@/components/ui/VybeLoader';
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";
import { SkipToMain, LiveRegion } from "@/components/a11y/Accessibility";
import { AppBackgroundProvider } from "@/components/layout/AppBackground";
import { AppGlobalLiquidShell } from "@/components/layout/AppGlobalLiquidShell";
import { VybeLiquidTouchShell } from "@/components/effects/VybeLiquidTouchShell";
import { NavigationRefSetter } from "@/components/layout/NavigationRefSetter";
import { initializeStoredFonts } from "@/hooks/useApplyThemeFonts";
import { initializeCustomAnimations } from "@/hooks/useCustomAnimations";
import { LocationProvider } from "@/providers/LocationProvider";
import { useBriefPreFetch } from "@/hooks/useBriefPreFetch";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { WelcomeBackSplash } from "@/components/ui/WelcomeBackSplash";
import { markPersistRestored } from "@/lib/persistRestoreGate";
import { reviveQueriesInCache } from "@/lib/persistedCollections";
import { purgeStuckStoryUploads } from "@/lib/storiesCacheSanitize";
import { SnapARProvider } from "@/components/camera/SnapARProvider";
import { ATT_RESUME_EVENT, ensureAppShellVisible } from "@/lib/attResumeRecovery";
import { syncNativeTrackingConsent } from "@/lib/att";
import { readSplashCompleted, markSplashCompleted } from "@/lib/splashSession";
import { hideStaticBootSplash } from "@/lib/splashProgressBridge";
import { clearSplashDocumentLocks, markAppReady } from "@/lib/splashDismiss";
import { resetSplashSessionOnHardReload, waitForAppShellPaint, hasAppShellPaint } from "@/lib/navigationBoot";
import { navVisibility } from "@/lib/navVisibility";
import { markBootComplete } from "@/lib/bootGuard";
import { ShellVisibilityGuard } from "@/components/system/ShellVisibilityGuard";

// Lazy-load non-critical overlays and providers to reduce initial bundle
const EasterEggProvider = lazy(() => import("@/components/easter-eggs/EasterEggProvider").then(m => ({ default: m.EasterEggProvider })));
const GlobalCallOverlay = lazy(() => import("@/components/call/GlobalCallOverlay").then(m => ({ default: m.GlobalCallOverlay })));
const NativeIncomingCallBridge = lazy(() => import("@/components/call/NativeIncomingCallBridge").then(m => ({ default: m.NativeIncomingCallBridge })));
const NativePushTokenBridge = lazy(() => import("@/components/notifications/NativePushTokenBridge").then(m => ({ default: m.NativePushTokenBridge })));
// PushNotificationPrompt removed — was causing floating bell icon
const GlobalMessageNotifications = lazy(() => import("@/components/notifications/GlobalMessageNotifications").then(m => ({ default: m.GlobalMessageNotifications })));
const DespiaOneSignalSync = lazy(() => import("@/components/notifications/DespiaOneSignalSync").then(m => ({ default: m.DespiaOneSignalSync })));
const NotificationActionRouter = lazy(() => import("@/components/notifications/NotificationActionRouter").then(m => ({ default: m.NotificationActionRouter })));
const EnablePushPrompt = lazy(() => import("@/components/notifications/EnablePushPrompt").then(m => ({ default: m.EnablePushPrompt })));
const SmartPingBridge = lazy(() => import("@/components/notifications/SmartPingBridge").then(m => ({ default: m.SmartPingBridge })));
const TabNotificationBadge = lazy(() => import("@/components/notifications/TabNotificationBadge").then(m => ({ default: m.TabNotificationBadge })));
const AppIconBadgeMount = lazy(() => import("@/components/notifications/AppIconBadgeMount").then(m => ({ default: m.AppIconBadgeMount })));
const TutorialProvider = lazy(() => import("@/components/tutorial/TutorialProvider").then(m => ({ default: m.TutorialProvider })));
const WarningPopup = lazy(() => import("@/components/moderation/WarningPopup").then(m => ({ default: m.WarningPopup })));
const InvitePopup = lazy(() => import("@/components/invite/InvitePopup").then(m => ({ default: m.InvitePopup })));

const RewardNotificationProvider = lazy(() => import("@/components/vybepass/RewardNotificationProvider").then(m => ({ default: m.RewardNotificationProvider })));
const FounderAppreciation = lazy(() => import("@/components/growth/FounderAppreciation").then(m => ({ default: m.FounderAppreciation })));
const StreakProvider = lazy(() => import("@/components/streak/StreakProvider").then(m => ({ default: m.StreakProvider })));
const PremiumGiftChecker = lazy(() => import("@/components/premium/PremiumGiftChecker").then(m => ({ default: m.PremiumGiftChecker })));
const TrackingConsentDialog = lazy(() => import("@/components/app/TrackingConsentDialog").then(m => ({ default: m.TrackingConsentDialog })));
const CookieConsentBanner = lazy(() => import("@/components/legal/CookieConsentBanner").then(m => ({ default: m.CookieConsentBanner })));
const RatePromptSheet = lazy(() => import("@/components/feedback/RatePromptSheet").then(m => ({ default: m.RatePromptSheet })));
const AutoFriendDrop = lazy(() => import("@/components/friends/AutoFriendDrop").then(m => ({ default: m.AutoFriendDrop })));

// Lazy-load deferred hooks via a wrapper component
const DeferredAuthHooks = lazy(() => import("@/components/app/DeferredAuthHooks"));
const LoginApprovalSheet = lazy(() => import("@/components/auth/LoginApprovalSheet").then(m => ({ default: m.LoginApprovalSheet })));

// Initialize stored fonts, custom animations, and validate env on app load
import { runEnvSanityCheck } from '@/lib/envCheck';

function runSafeBootStep(label: string, callback: () => void) {
  try {
    callback();
  } catch (error) {
    console.error(`[VYBE] ${label} failed during boot:`, error);
  }
}

runSafeBootStep('font initialization', initializeStoredFonts);
runSafeBootStep('custom animation initialization', initializeCustomAnimations);
runSafeBootStep('environment sanity check', () => {
  runEnvSanityCheck();
});

// Expose query client for error recovery
(window as any).__REACT_QUERY_CLIENT__ = null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 minutes - maximize cache hits
      gcTime: 1000 * 60 * 60 * 24 * 14, // 14 days — match persisted cache so hydrated
                                         // queries aren't GC'd before they're shown offline
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true, // When connectivity returns, pull fresh content
      retry: (failureCount, error: any) => {
        // Don't retry auth errors or client errors
        const status = error?.status || error?.statusCode;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      networkMode: 'offlineFirst',
      structuralSharing: true,
      refetchInterval: false,
      placeholderData: (prev: any) => prev, // Keep last good data visible while refetching
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// Expose for error recovery
(window as any).__REACT_QUERY_CLIENT__ = queryClient;

// Start global reconnect manager (refreshes active queries the instant
// connectivity is restored, polls aggressively while offline).
startReconnectManager(queryClient);
startOutbox();

// Build-hash based cache buster so deployments invalidate persisted cache.
const PERSIST_BUSTER = (import.meta as any).env?.VITE_BUILD_ID || 'vybe-cache-v5';

function ScrollRestoration() {
  const location = useLocation();
  
  useEffect(() => {
    restoreScrollPosition(location.pathname);
    
    return () => {
      saveScrollPosition(location.pathname);
    };
  }, [location.pathname]);
  
  return null;
}

// Lazy-load ban check
const BanCheck = lazy(() => import("@/components/app/BanCheck"));

// Track if initial load has completed (persists across navigations in this tab)
resetSplashSessionOnHardReload();
let hasInitialLoadCompleted = readSplashCompleted();
let splashDismissed = false;

function completeInitialSplash(setShowSplash: (v: boolean) => void) {
  if (splashDismissed) return;

  const finish = () => {
    if (splashDismissed) return;
    splashDismissed = true;
    setShowSplash(false);
    hasInitialLoadCompleted = true;
    markSplashCompleted();
    clearSplashDocumentLocks();
    navVisibility.forceShow();
    navVisibility.resetScrollHide();
    requestAnimationFrame(() => {
      markAppReady();
      markBootComplete();
    });
  };

  // Never keep the splash up waiting for paint — hard cap 650ms from dismiss trigger.
  const hardCap = window.setTimeout(finish, 650);
  void waitForAppShellPaint(280).finally(() => {
    window.clearTimeout(hardCap);
    finish();
  });
}

// Background brief pre-fetcher (needs auth context)
function BriefPreFetchInit() {
  const [uid, setUid] = useState<string | undefined>();
  useEffect(() => {
    db.auth.getUser().then(({ data }) => setUid(data.user?.id));
    const { data: { subscription } } = db.auth.onAuthStateChange((_, session) => {
      setUid(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);
  useBriefPreFetch(uid);
  return null;
}

// Persist a flag whenever the user has an active session, so on next boot
// we know to keep the splash up until auth resolves (no login flash).
// Tracks Supabase auth resolution at the App root so the splash can wait for it.
function useAuthResolved() {
  const [resolved, setResolved] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const authTimeoutMs = hasStoredSupabaseSession()
      ? (isNativePerfMode() ? 700 : 1000)
      : (isNativePerfMode() ? 1200 : 1800);
    const forceDone = setTimeout(() => {
      if (!cancelled) setResolved(true);
    }, authTimeoutMs);

    if (hasStoredSupabaseSession()) {
      setHasSession(true);
      setWasLoggedIn(true);
    }

    db.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
      setWasLoggedIn(!!data.session);
      setResolved(true);
    }).catch(() => { if (!cancelled) setResolved(true); });

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      setHasSession(!!session);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setWasLoggedIn(!!session);
      if (event === 'SIGNED_OUT') setWasLoggedIn(false);
      setResolved(true);
    });
    return () => {
      cancelled = true;
      clearTimeout(forceDone);
      subscription.unsubscribe();
    };
  }, []);
  return { authResolved: resolved, hasSession };
}

// Preloader wrapper component - must be inside QueryClientProvider
function AppWithPreloader() {
  const preloadStatus = useAppPreloader();
  const { authResolved, hasSession } = useAuthResolved();
  const wasLoggedInRef = useRef(getWasLoggedIn());
  const [showSplash, setShowSplash] = useState(!hasInitialLoadCompleted);
  const [welcomeBack, setWelcomeBack] = useState<{ username?: string | null; avatarUrl?: string | null } | null>(null);

  // Auto-update checker
  useAutoUpdate();

  // Auto-detect low-contrast text and fix it on the fly (skip on native — DOM scans cause jank)
  useContrastAutoGuard(!isNativePerfMode());

  // Track on-screen keyboard height as --kb-h CSS variable (Android polish)
  useKeyboardHeight();

  // bfcache restore (iOS Safari / some WebViews) — re-show splash if shell is empty.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      ensureAppShellVisible();
      navVisibility.forceShow();
      navVisibility.resetScrollHide();
      if (!hasAppShellPaint()) {
        splashDismissed = false;
        setShowSplash(true);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    hideStaticBootSplash();
    if (!showSplash) {
      clearSplashDocumentLocks();
    }
  }, []);

  useEffect(() => {
    if (!showSplash) return;
    // Hide splash when preloader is done AND auth has resolved.
    const preloaderDone = preloadStatus.isComplete;
    const authDone = authResolved;
    if (preloaderDone && authDone) {
      completeInitialSplash(setShowSplash);
    }
  }, [preloadStatus.isComplete, showSplash, authResolved, hasSession]);

  // Never leave splash up after ATT / system sheets (App Review 2.1a blank screen).
  useEffect(() => {
    if (!showSplash) return;
    const absoluteMax = setTimeout(() => {
      syncNativeTrackingConsent();
      completeInitialSplash(setShowSplash);
    }, isNativePerfMode() ? 900 : 1100);
    return () => clearTimeout(absoluteMax);
  }, [showSplash]);

  // Ensure WebView is visible after splash (App Review 2.1a blank launch on iPad).
  useEffect(() => {
    if (showSplash) return;
    ensureAppShellVisible();
    navVisibility.forceShow();
    navVisibility.resetScrollHide();
  }, [showSplash]);

  const showSplashRef = useRef(showSplash);
  const preloadCompleteRef = useRef(preloadStatus.isComplete);
  const authResolvedRef = useRef(authResolved);
  showSplashRef.current = showSplash;
  preloadCompleteRef.current = preloadStatus.isComplete;
  authResolvedRef.current = authResolved;

  useEffect(() => {
    const dismissSplash = () => {
      if (!showSplashRef.current) return;
      syncNativeTrackingConsent();

      const attempt = () => {
        if (!showSplashRef.current) return true;
        if (preloadCompleteRef.current && authResolvedRef.current) {
          completeInitialSplash(setShowSplash);
          return true;
        }
        return false;
      };

      if (attempt()) return;

      let tries = 0;
      const poll = window.setInterval(() => {
        tries += 1;
        if (attempt() || tries >= 45) {
          window.clearInterval(poll);
          if (showSplashRef.current && tries >= 45) {
            completeInitialSplash(setShowSplash);
          }
        }
      }, 100);
    };

    window.addEventListener(ATT_RESUME_EVENT, dismissSplash);
    return () => window.removeEventListener(ATT_RESUME_EVENT, dismissSplash);
  }, []);

  // Show welcome-back splash on sign-in (not on initial page load with existing session)
  const signInHandledRef = useRef(false);
  useEffect(() => {
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      // Do not invalidate the full cache — wipes offline feed/DM snapshots.
      if (event === 'SIGNED_IN' && !signInHandledRef.current && hasInitialLoadCompleted) {
        signInHandledRef.current = true;
        // Fetch minimal profile info for the splash
        if (session?.user?.id) {
          try {
            const { data } = await db
              .from('profiles')
              .select('username, avatar_url')
              .eq('user_id', session.user.id)
              .limit(1)
              .maybeSingle();
            if (data?.username) {
              setWelcomeBack({ username: data.username, avatarUrl: data.avatar_url });
            }
          } catch { /* skip splash on error */ }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <ShellVisibilityGuard />
      <SplashScreen isVisible={showSplash} />
      {welcomeBack && (
        <WelcomeBackSplash
          username={welcomeBack.username}
          avatarUrl={welcomeBack.avatarUrl}
          onComplete={() => setWelcomeBack(null)}
        />
      )}
      <GlobalErrorHandler />
      <AuthProvider>
        <SpotifyPresenceMount />
        <RealtimeSyncMount />
        <LocalErrorBoundary label="DeferredAuthHooks">
          <Suspense fallback={null}><DeferredAuthHooks /></Suspense>
        </LocalErrorBoundary>
        <LocalErrorBoundary label="LoginApprovalSheet">
          <Suspense fallback={null}><LoginApprovalSheet /></Suspense>
        </LocalErrorBoundary>
        <BriefPreFetchInit />
        
        {/* AppBackgroundProvider: Persistent background layer that survives theme changes */}
        <AppBackgroundProvider>
          <CustomThemeProvider>
            <ThemeTransitionProvider>
              <Suspense fallback={<VybePageLoader delay={0} />}>
                <EasterEggProvider>
                  <CallStoreProvider>
                    <StreakProvider>
                      <TooltipProvider>
                        <Toaster />
                        <Sonner />
                        <BrowserRouter>
                        <AgentActionBusProvider>
                        <LocationProvider>
                          <AppGlobalLiquidShell />
                          <VybeLiquidTouchShell />
                          <div
                            id="app-shell"
                            data-app-shell
                            className="relative z-[1] min-h-dvh bg-background"
                          >
                          <Suspense fallback={<VybePageLoader delay={0} />}>
                            <RewardNotificationProvider>
                              <DebugPanelProvider>
                                <BugRecheckProvider>
                                <Suspense fallback={<VybePageLoader delay={0} />}>
                                  <TutorialProvider>
                                    <NavigationRefSetter />
                                    <ScrollRestoration />
                                    <AnimatedRoutes />
                                    <RootBottomNavMount />
                                    <LocalErrorBoundary label="DeferredOverlays">
                                      <Suspense fallback={null}>
                                        {/* PushNotificationPrompt removed */}
                                        <GlobalMessageNotifications />
                                        <DespiaOneSignalSync />
                                        <NotificationActionRouter />
                                        <EnablePushPrompt />
                                        <SmartPingBridge />
                                        <TabNotificationBadge />
                                        <AppIconBadgeMount />
                                        <GlobalCallOverlay />
                                        <NativeIncomingCallBridge />
                                        <NativePushTokenBridge />
                                        <WarningPopup />
                                        <InvitePopup />
                                        <BanCheck />
                                        <PremiumGiftChecker />
                                        <TrackingConsentDialog />
                                        <FounderAppreciation />
                                        <CookieConsentBanner />
                                        <RatePromptSheet />
                                        <ConnectionStatusBanner />
                                        <AutoFriendDrop />
                                      </Suspense>
                                    </LocalErrorBoundary>
                                  </TutorialProvider>
                                </Suspense>
                                </BugRecheckProvider>
                              </DebugPanelProvider>
                            </RewardNotificationProvider>
                          </Suspense>
                          {/* Touch ripple removed */}
                          </div>
                        </LocationProvider>
                        </AgentActionBusProvider>
                        </BrowserRouter>
                      </TooltipProvider>
                    </StreakProvider>
                  </CallStoreProvider>
                </EasterEggProvider>
              </Suspense>
            </ThemeTransitionProvider>
          </CustomThemeProvider>
        </AppBackgroundProvider>
      </AuthProvider>
    </>
  );
}

const App = memo(() => {
  return (
    <SmartErrorBoundary fallback={<AppErrorFallback />}>
      <SkipToMain />
      <LiveRegion />
      <PersistQueryClientProvider
        client={queryClient}
        onSuccess={() => {
          reviveQueriesInCache(queryClient);
          purgeStuckStoryUploads(queryClient);
          markPersistRestored();
        }}
        onError={() => {
          markPersistRestored();
        }}
        persistOptions={{
          persister: queryPersister,
          // 14 days — keep everything (feed, DMs, profiles) usable offline
          // across multiple app sessions, just like Instagram/X.
          maxAge: 1000 * 60 * 60 * 24 * 14,
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            // Persist successful AND errored queries — if we have stale data
            // for a key we want to keep showing it even if the last refetch
            // failed (e.g. offline).
            shouldDehydrateQuery: (q) =>
              (q.state.status === 'success' || (q.state.status === 'error' && q.state.data !== undefined)) &&
              shouldPersistQueryKey(q.queryKey, q.state.data),
            shouldDehydrateMutation: () => false,
          },
        }}
      >
        <ThemeProvider>
          <SnapARProvider>
          <GlassIntensityProvider>
            <AccessibilityProvider>
              {/* Tween defaults remove per-frame spring physics app-wide; components that
                  need a spring still opt-in explicitly via their own `transition` prop. */}
              <MotionConfig reducedMotion={isNativePerfMode() ? 'always' : 'user'} transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.18 }}>
                <AppWithPreloader />
              </MotionConfig>
            </AccessibilityProvider>
          </GlassIntensityProvider>
          </SnapARProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SmartErrorBoundary>
  );
});

export default App;
