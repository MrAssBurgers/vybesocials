import { useState, useEffect, memo, lazy, Suspense, useRef } from 'react';
import './lib/i18n';
import { supabase } from '@/integrations/supabase/client';
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
import { CallStoreProvider } from "@/lib/callStore";

import { AccessibilityProvider } from "@/providers/AccessibilityProvider";

import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";
import { saveScrollPosition, restoreScrollPosition } from "@/lib/scrollMemory";
import { RootBottomNavMount } from "@/components/layout/RootBottomNavMount";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { useContrastAutoGuard } from "@/hooks/useContrastAutoGuard";
import SmartErrorBoundary from "@/components/error/SmartErrorBoundary";
import { GlobalErrorHandler } from "@/components/error/GlobalErrorHandler";
import { useAppPreloader } from "@/hooks/useAppPreloader";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { usePostsRealtime } from "@/hooks/usePostsRealtime";
import { useSpotifyPresence } from "@/hooks/useSpotifyPresence";
const SpotifyPresenceMount = () => { useSpotifyPresence(); return null; };
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";
import { SkipToMain, LiveRegion } from "@/components/a11y/Accessibility";
import { AppBackgroundProvider } from "@/components/layout/AppBackground";
import { NavigationRefSetter } from "@/components/layout/NavigationRefSetter";
import { initializeStoredFonts } from "@/hooks/useApplyThemeFonts";
import { initializeCustomAnimations } from "@/hooks/useCustomAnimations";
import { LocationProvider } from "@/providers/LocationProvider";
import { useBriefPreFetch } from "@/hooks/useBriefPreFetch";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { WelcomeBackSplash } from "@/components/ui/WelcomeBackSplash";

// Lazy-load non-critical overlays and providers to reduce initial bundle
const EasterEggProvider = lazy(() => import("@/components/easter-eggs/EasterEggProvider").then(m => ({ default: m.EasterEggProvider })));
const GlobalCallOverlay = lazy(() => import("@/components/call/GlobalCallOverlay").then(m => ({ default: m.GlobalCallOverlay })));
// PushNotificationPrompt removed — was causing floating bell icon
const GlobalMessageNotifications = lazy(() => import("@/components/notifications/GlobalMessageNotifications").then(m => ({ default: m.GlobalMessageNotifications })));
const DespiaOneSignalSync = lazy(() => import("@/components/notifications/DespiaOneSignalSync").then(m => ({ default: m.DespiaOneSignalSync })));
const EnablePushPrompt = lazy(() => import("@/components/notifications/EnablePushPrompt").then(m => ({ default: m.EnablePushPrompt })));
const SmartPingBridge = lazy(() => import("@/components/notifications/SmartPingBridge").then(m => ({ default: m.SmartPingBridge })));
const TabNotificationBadge = lazy(() => import("@/components/notifications/TabNotificationBadge").then(m => ({ default: m.TabNotificationBadge })));
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
const PERSIST_BUSTER = (import.meta as any).env?.VITE_BUILD_ID || 'vybe-cache-v1';

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

// Track if initial load has completed (persists across navigations)
let hasInitialLoadCompleted = false;

// Background brief pre-fetcher (needs auth context)
function BriefPreFetchInit() {
  const [uid, setUid] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUid(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);
  useBriefPreFetch(uid);
  return null;
}

// Persist a flag whenever the user has an active session, so on next boot
// we know to keep the splash up until auth resolves (no login flash).
const WAS_LOGGED_IN_KEY = 'vybe-was-logged-in';
function getWasLoggedIn(): boolean {
  try { return localStorage.getItem(WAS_LOGGED_IN_KEY) === '1'; } catch { return false; }
}
function setWasLoggedIn(value: boolean) {
  try {
    if (value) localStorage.setItem(WAS_LOGGED_IN_KEY, '1');
    else localStorage.removeItem(WAS_LOGGED_IN_KEY);
  } catch { /* noop */ }
}

// Tracks Supabase auth resolution at the App root so the splash can wait for it.
function useAuthResolved() {
  const [resolved, setResolved] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
      setWasLoggedIn(!!data.session);
      setResolved(true);
    }).catch(() => { if (!cancelled) setResolved(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setHasSession(!!session);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setWasLoggedIn(!!session);
      if (event === 'SIGNED_OUT') setWasLoggedIn(false);
      setResolved(true);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
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

  // Auto-detect low-contrast text and fix it on the fly
  useContrastAutoGuard();

  // Real-time profile sync - updates propagate instantly to all users
  useRealtimeProfiles();
  usePostsRealtime();

  // Track on-screen keyboard height as --kb-h CSS variable (Android polish)
  useKeyboardHeight();

  useEffect(() => {
    if (!showSplash) return;
    // Hide splash only when preloader is done AND auth has resolved.
    // If we knew the user was logged in last time, also wait until session restored
    // (or auth definitively says there is none) to avoid the login flash.
    const preloaderDone = preloadStatus.isComplete;
    const authDone = authResolved && (wasLoggedInRef.current ? (hasSession || authResolved) : true);
    if (preloaderDone && authDone) {
      setShowSplash(false);
      hasInitialLoadCompleted = true;
    }
  }, [preloadStatus.isComplete, showSplash, authResolved, hasSession]);

  // Show welcome-back splash on sign-in (not on initial page load with existing session)
  const signInHandledRef = useRef(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        queryClient.invalidateQueries();
      }

      // Show welcome splash only on explicit sign-in, not token refresh or initial load
      if (event === 'SIGNED_IN' && !signInHandledRef.current && hasInitialLoadCompleted) {
        signInHandledRef.current = true;
        // Fetch minimal profile info for the splash
        if (session?.user?.id) {
          try {
            const { data } = await supabase
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
      <SplashScreen 
        isVisible={showSplash} 
        status={preloadStatus.step}
        progress={preloadStatus.progress}
      />
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
        <Suspense fallback={null}><DeferredAuthHooks /></Suspense>
        <Suspense fallback={null}><LoginApprovalSheet /></Suspense>
        <BriefPreFetchInit />
        <LocationProvider>
        {/* AppBackgroundProvider: Persistent background layer that survives theme changes */}
        <AppBackgroundProvider>
          <CustomThemeProvider>
            <ThemeTransitionProvider>
              <Suspense fallback={null}>
                <EasterEggProvider>
                  <CallStoreProvider>
                    <StreakProvider>
                      <TooltipProvider>
                        <Toaster />
                        <Sonner />
                        <BrowserRouter>
                          <Suspense fallback={null}>
                            <RewardNotificationProvider>
                              <DebugPanelProvider>
                                <Suspense fallback={null}>
                                  <TutorialProvider>
                                    <NavigationRefSetter />
                                    <ScrollRestoration />
                                    <AnimatedRoutes />
                                    <RootBottomNavMount />
                                    <Suspense fallback={null}>
                                      {/* PushNotificationPrompt removed */}
                                      <GlobalMessageNotifications />
                                      <DespiaOneSignalSync />
                                      <EnablePushPrompt />
                                      <SmartPingBridge />
                                      <TabNotificationBadge />
                                      <GlobalCallOverlay />
                                      <WarningPopup />
                                      <InvitePopup />
                                      <BanCheck />
                                      <PremiumGiftChecker />
                                      <TrackingConsentDialog />
                                      <FounderAppreciation />
                                      <CookieConsentBanner />
                                      <RatePromptSheet />
                                    </Suspense>
                                  </TutorialProvider>
                                </Suspense>
                              </DebugPanelProvider>
                            </RewardNotificationProvider>
                          </Suspense>
                        </BrowserRouter>
                      </TooltipProvider>
                    </StreakProvider>
                  </CallStoreProvider>
                </EasterEggProvider>
              </Suspense>
            </ThemeTransitionProvider>
          </CustomThemeProvider>
        </AppBackgroundProvider>
        </LocationProvider>
      </AuthProvider>
    </>
  );
}

const App = memo(() => {
  return (
    <SmartErrorBoundary>
      <SkipToMain />
      <LiveRegion />
      <PersistQueryClientProvider
        client={queryClient}
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
              shouldPersistQueryKey(q.queryKey),
            shouldDehydrateMutation: () => false,
          },
        }}
      >
        <ThemeProvider>
          <GlassIntensityProvider>
            <AccessibilityProvider>
              {/* Tween defaults remove per-frame spring physics app-wide; components that
                  need a spring still opt-in explicitly via their own `transition` prop. */}
              <MotionConfig reducedMotion="user" transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.22 }}>
                <AppWithPreloader />
              </MotionConfig>
            </AccessibilityProvider>
          </GlassIntensityProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SmartErrorBoundary>
  );
});

export default App;
