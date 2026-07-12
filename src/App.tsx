import { useState, useEffect, memo, lazy, Suspense, useRef } from 'react';
import './lib/i18n';
import { db } from '@/lib/firebase';
import './styles/liquid.css';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { toast } from 'sonner';
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryPersister, shouldPersistQueryKey } from "@/lib/queryPersister";
import { kickstartThemeHydration, reconcileUserThemeCache } from "@/lib/themeHydration";
import { warmHomeCaches } from "@/lib/warmHomeCaches";
import { getStoredAuthUserId } from "@/lib/legacyAuthStorage";
import { startReconnectManager } from "@/lib/reconnectManager";
import { startOutbox } from "@/lib/dmOutbox";
import { BrowserRouter, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { BUTTER_TRANSITION } from "@/lib/smoothMotion";
import { PlatformProvider } from "@/providers/PlatformProvider";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { CustomThemeProvider } from "@/providers/ThemeProvider";
import { ThemeTransitionProvider } from "@/providers/ThemeTransitionProvider";
import { DebugPanelProvider } from "@/contexts/DebugPanelContext";
import { BugRecheckProvider } from "@/contexts/BugRecheckContext";
import { CallStoreProvider } from "@/lib/callStore";
import { ConnectionStatusBanner } from "@/components/system/ConnectionStatusBanner";
import { UploadProgressBanner } from "@/components/upload/UploadProgressBanner";
import { AccessibilityProvider } from "@/providers/AccessibilityProvider";
import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";
import { saveScrollPosition, restoreScrollPosition } from "@/lib/scrollMemory";
import { RootBottomNavMount } from "@/components/layout/RootBottomNavMount";
import { AgentActionBusProvider } from "@/lib/agent/actionBus/AgentActionBusProvider";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { useContrastAutoGuard } from "@/hooks/useContrastAutoGuard";
import { isNativePerfMode } from "@/lib/nativePerfMode";
import { hasStoredAuthSession } from "@/lib/legacyAuthStorage";
import { getWasLoggedIn, setWasLoggedIn } from "@/lib/wasLoggedIn";
import SmartErrorBoundary from "@/components/error/SmartErrorBoundary";
import { AppErrorFallback } from "@/components/error/AppErrorFallback";
import LocalErrorBoundary from "@/components/error/LocalErrorBoundary";
import { GlobalErrorHandler } from "@/components/error/GlobalErrorHandler";
import { useAppPreloader } from "@/hooks/useAppPreloader";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { CameraOverlayProvider } from "@/contexts/CameraOverlayContext";
import { usePostsRealtime } from "@/hooks/usePostsRealtime";
import { useGlobalRealtimeMessages } from "@/hooks/useGlobalRealtimeMessages";
import { useSpotifyPresence } from "@/hooks/useSpotifyPresence";
import { useExternalPresence } from "@/hooks/useExternalPresence";
const UploadQueueSync = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onComplete = () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = JSON.stringify(q.queryKey).toLowerCase();
          return (
            key.includes('personalized-feed') ||
            key.includes('infinite-following') ||
            key.includes('infinite-posts')
          );
        },
      });
    };
    const onFailed = (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
      if (reason) toast.error(reason);
    };
    window.addEventListener('vybe:upload-complete', onComplete);
    window.addEventListener('vybe:upload-failed', onFailed);
    return () => {
      window.removeEventListener('vybe:upload-complete', onComplete);
      window.removeEventListener('vybe:upload-failed', onFailed);
    };
  }, [queryClient]);
  return null;
};
const SpotifyPresenceInner = () => {
  useSpotifyPresence();
  useExternalPresence();
  return null;
};
const RealtimeSyncInner = () => {
  const queryClient = useQueryClient();
  useGlobalRealtimeMessages();
  useRealtimeProfiles();
  usePostsRealtime();
  useEffect(() => {
    void import('@/components/call/GlobalCallOverlay');
    void import('@/components/call/NativeIncomingCallBridge');
  }, []);
  useEffect(() => {
    const onOutboxFlush = (event: Event) => {
      const cid = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (!cid) return;
      queryClient.invalidateQueries({ queryKey: ['messages', cid] });
      queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };
    window.addEventListener('vybe:dm-outbox-flush', onOutboxFlush);
    return () => window.removeEventListener('vybe:dm-outbox-flush', onOutboxFlush);
  }, [queryClient]);
  return null;
};
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
const RealtimeSyncMount = () => (
  <>
    <RealtimeSyncInner />
    <UploadQueueSync />
  </>
);
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
import {
  reviveQueriesInCache,
  installQueryCacheNormalizer,
  installQueryCacheWriteGuard,
} from "@/lib/persistedCollections";
import { purgeStuckStoryUploads } from "@/lib/storiesCacheSanitize";
import { SnapARProvider } from "@/components/camera/SnapARProvider";
import { ATT_RESUME_EVENT, ensureAppShellVisible } from "@/lib/attResumeRecovery";
import { syncNativeTrackingConsent } from "@/lib/att";
import { readSplashCompleted, markSplashCompleted, shouldSkipInitialSplash } from "@/lib/splashSession";
import { getCachedCurrentProfile, isRawId } from "@/lib/profileCache";
import { resolveProfileAvatarUrl } from "@/lib/profileAvatarCache";
import { batchSignUrls } from "@/lib/signedUrlCache";
import { clearSplashDocumentLocks, markAppReady } from "@/lib/splashDismiss";
import { publishSplashProgress } from "@/lib/splashProgressBridge";
import { resetSplashSessionOnHardReload, hasAppShellPaint } from "@/lib/navigationBoot";
import { navVisibility } from "@/lib/navVisibility";
import { markBootComplete } from "@/lib/bootGuard";
import { ShellVisibilityGuard } from "@/components/system/ShellVisibilityGuard";
import { AppUpdateOverlay } from "@/components/app/AppUpdateOverlay";

// Lazy-load non-critical overlays and providers to reduce initial bundle
const EasterEggProvider = lazy(() => import("@/components/easter-eggs/EasterEggProvider").then(m => ({ default: m.EasterEggProvider })));
const GlobalCallOverlay = lazy(() => import("@/components/call/GlobalCallOverlay").then(m => ({ default: m.GlobalCallOverlay })));
const NativeIncomingCallBridge = lazy(() => import("@/components/call/NativeIncomingCallBridge").then(m => ({ default: m.NativeIncomingCallBridge })));
const NativePushTokenBridge = lazy(() => import("@/components/notifications/NativePushTokenBridge").then(m => ({ default: m.NativePushTokenBridge })));
// PushNotificationPrompt removed — was causing floating bell icon
const GlobalMessageNotifications = lazy(() => import("@/components/notifications/GlobalMessageNotifications").then(m => ({ default: m.GlobalMessageNotifications })));
import { DespiaOneSignalSync } from "@/components/notifications/DespiaOneSignalSync";
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

installQueryCacheWriteGuard(queryClient);
installQueryCacheNormalizer(queryClient);

// Start global reconnect manager (refreshes active queries the instant
// connectivity is restored, polls aggressively while offline).
startReconnectManager(queryClient);
startOutbox();

// Build-hash based cache buster so deployments invalidate persisted cache.
const PERSIST_BUSTER = (import.meta as any).env?.VITE_BUILD_ID || 'vybe-cache-v19';

function ScrollRestoration() {
  const location = useLocation();
  
  useEffect(() => {
    const path = location.pathname;
    const isChatThread = path.startsWith('/messages/') && path !== '/messages/new';

    // Chat threads scroll inside ChatView — restoring #main-content fights that layer.
    if (isChatThread) {
      return () => saveScrollPosition(path);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => restoreScrollPosition(path));
    });
    
    return () => {
      saveScrollPosition(path);
    };
  }, [location.pathname]);
  
  return null;
}

// Lazy-load ban check
const BanCheck = lazy(() => import("@/components/app/BanCheck"));

// Track if initial load has completed (persists across navigations in this tab)
resetSplashSessionOnHardReload();
const skipInitialSplash = shouldSkipInitialSplash();
let hasInitialLoadCompleted = skipInitialSplash || readSplashCompleted();
let splashDismissed = skipInitialSplash;
const splashShownAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
const MIN_SPLASH_MS = 280;

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

  publishSplashProgress(100, "Let's go! ✨");
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - splashShownAt;
  const holdMs = Math.max(0, MIN_SPLASH_MS - elapsed);
  window.setTimeout(() => {
    window.setTimeout(finish, isNativePerfMode() ? 80 : 100);
  }, holdMs);
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
  const optimistic =
    skipInitialSplash ||
    getWasLoggedIn() ||
    hasStoredAuthSession() ||
    !!getCachedCurrentProfile();
  const [resolved, setResolved] = useState(optimistic);
  const [hasSession, setHasSession] = useState(
    () => optimistic || hasStoredAuthSession(),
  );
  useEffect(() => {
    let cancelled = false;
    const authTimeoutMs = optimistic
      ? (isNativePerfMode() ? 150 : 200)
      : hasStoredAuthSession()
        ? (isNativePerfMode() ? 300 : 400)
        : (isNativePerfMode() ? 600 : 700);
    const forceDone = setTimeout(() => {
      if (!cancelled) setResolved(true);
    }, authTimeoutMs);

    if (hasStoredAuthSession()) {
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
  const [showSplash, setShowSplash] = useState(!skipInitialSplash && !hasInitialLoadCompleted);
  const [welcomeBack, setWelcomeBack] = useState<{
    username?: string | null;
    avatarUrl?: string | null;
    profileId?: string | null;
  } | null>(null);

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
    if (showSplash) return;
    clearSplashDocumentLocks();
  }, [showSplash]);

  const showSplashRef = useRef(showSplash);
  const preloadCompleteRef = useRef(preloadStatus.isComplete);
  const authResolvedRef = useRef(authResolved);
  showSplashRef.current = showSplash;
  preloadCompleteRef.current = preloadStatus.isComplete;
  authResolvedRef.current = authResolved;

  useEffect(() => {
    if (!showSplash) return;
    const preloaderDone = preloadStatus.isComplete;
    const authDone = authResolved;
    if (preloaderDone && authDone) {
      completeInitialSplash(setShowSplash);
    }
  }, [preloadStatus.isComplete, showSplash, authResolved, hasSession]);

  // After fresh sign-in, dismiss splash once preload + auth gates pass.
  useEffect(() => {
    const { data: { subscription } } = db.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN' || !showSplashRef.current) return;
      window.setTimeout(() => {
        if (showSplashRef.current && preloadCompleteRef.current && authResolvedRef.current) {
          completeInitialSplash(setShowSplash);
        }
      }, 400);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Safety cap — never leave splash up indefinitely (slow networks / ATT sheets).
  useEffect(() => {
    if (!showSplash) return;
    const absoluteMax = setTimeout(() => {
      syncNativeTrackingConsent();
      completeInitialSplash(setShowSplash);
    }, isNativePerfMode() ? 10000 : 12000);
    return () => clearTimeout(absoluteMax);
  }, [showSplash]);

  // Ensure WebView is visible after splash (App Review 2.1a blank launch on iPad).
  useEffect(() => {
    if (showSplash) return;
    ensureAppShellVisible();
    navVisibility.forceShow();
    navVisibility.resetScrollHide();
  }, [showSplash]);

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
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      // Do not invalidate the full cache — wipes offline feed/DM snapshots.
      if (event === 'SIGNED_IN' && !signInHandledRef.current && hasInitialLoadCompleted) {
        signInHandledRef.current = true;

        const showWelcomeBack = (profile: {
          id: string;
          username: string;
          avatar_url?: string | null;
        }) => {
          if (isRawId(profile.username)) return;
          const avatarUrl = resolveProfileAvatarUrl(profile.id, profile.avatar_url);
          if (avatarUrl) void batchSignUrls([avatarUrl]);
          setWelcomeBack({
            username: profile.username,
            avatarUrl: avatarUrl ?? profile.avatar_url,
            profileId: profile.id,
          });
        };

        const cached = getCachedCurrentProfile();
        if (cached?.username) {
          showWelcomeBack(cached);
        }

        if (session?.user?.id) {
          void (async () => {
            try {
              const { data } = await db
                .from('profiles')
                .select('id, username, avatar_url')
                .eq('user_id', session.user.id)
                .limit(1)
                .maybeSingle();
              if (data?.username) showWelcomeBack(data);
            } catch { /* keep cache-based splash */ }
          })();
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
          profileId={welcomeBack.profileId}
          onComplete={() => setWelcomeBack(null)}
        />
      )}
      <GlobalErrorHandler />
      <LocalErrorBoundary label="AppUpdateOverlay">
        <AppUpdateOverlay />
      </LocalErrorBoundary>
      <AuthProvider>
        <LocalErrorBoundary label="SpotifyPresenceMount">
          <SpotifyPresenceMount />
        </LocalErrorBoundary>
        <LocalErrorBoundary label="RealtimeSyncMount">
          <RealtimeSyncMount />
        </LocalErrorBoundary>
        <LocalErrorBoundary label="DeferredAuthHooks">
          <Suspense fallback={null}><DeferredAuthHooks /></Suspense>
        </LocalErrorBoundary>
        <LocalErrorBoundary label="LoginApprovalSheet">
          <Suspense fallback={null}><LoginApprovalSheet /></Suspense>
        </LocalErrorBoundary>
        <LocalErrorBoundary label="BriefPreFetchInit">
          <BriefPreFetchInit />
        </LocalErrorBoundary>
        
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
                        <AgentActionBusProvider>
                        <LocationProvider>
                          <CameraOverlayProvider>
                          <AppGlobalLiquidShell />
                          <VybeLiquidTouchShell />
                          <div
                            id="app-shell"
                            data-app-shell
                            className="relative z-[1] app-shell min-h-dvh w-full max-w-full overflow-hidden bg-transparent"
                          >
                          <Suspense fallback={null}>
                            <RewardNotificationProvider>
                              <DebugPanelProvider>
                                <BugRecheckProvider>
                                <Suspense fallback={null}>
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
                                        <UploadProgressBanner />
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
                          </CameraOverlayProvider>
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
          reconcileUserThemeCache(queryClient, getStoredAuthUserId());
          kickstartThemeHydration(queryClient);
          void warmHomeCaches(queryClient);
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
              {/* Tween defaults — buttery expo-out; springs opt-in per component. */}
              <PlatformProvider>
                <MotionConfig reducedMotion="user" transition={BUTTER_TRANSITION}>
                  <AppWithPreloader />
                </MotionConfig>
              </PlatformProvider>
            </AccessibilityProvider>
          </GlassIntensityProvider>
          </SnapARProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SmartErrorBoundary>
  );
});

export default App;
