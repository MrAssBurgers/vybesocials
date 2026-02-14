import { useEffect, useState, memo, lazy, Suspense } from 'react';
import './lib/i18n'; // Must be synchronous - needed before React renders
// liquid.css is loaded inside AppWithPreloader useEffect
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { CustomThemeProvider } from "@/providers/ThemeProvider";
import { ThemeTransitionProvider } from "@/providers/ThemeTransitionProvider";
import { DebugPanelProvider } from "@/contexts/DebugPanelContext";
import { CallStoreProvider } from "@/lib/callStore";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { AccessibilityProvider } from "@/providers/AccessibilityProvider";
import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";
import { saveScrollPosition, restoreScrollPosition } from "@/lib/scrollMemory";
import { RootBottomNavMount } from "@/components/layout/RootBottomNavMount";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import SmartErrorBoundary from "@/components/error/SmartErrorBoundary";
import { GlobalErrorHandler } from "@/components/error/GlobalErrorHandler";
import { useAppPreloader } from "@/hooks/useAppPreloader";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { usePostsRealtime } from "@/hooks/usePostsRealtime";
const AnimatedRoutes = lazy(() => 
  import("@/components/layout/AnimatedRoutes")
    .then(m => ({ default: m.AnimatedRoutes }))
    .catch(() => {
      // Retry once on chunk load failure (common after deployments)
      return import("@/components/layout/AnimatedRoutes").then(m => ({ default: m.AnimatedRoutes }));
    })
);
import { AppBackgroundProvider } from "@/components/layout/AppBackground";
import { initializeStoredFonts } from "@/hooks/useApplyThemeFonts";
import { initializeCustomAnimations } from "@/hooks/useCustomAnimations";

// Lazy-load toast/tooltip UI components - not needed for initial paint
const LazyToaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const LazySonner = lazy(() => import("@/components/ui/sonner").then(m => ({ default: m.Toaster })));
const LazyTooltipProvider = lazy(() => import("@/components/ui/tooltip").then(m => ({ default: m.TooltipProvider })));

// Simple passthrough tooltip provider for SSR/initial render
function MinimalTooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <LazyTooltipProvider>{children}</LazyTooltipProvider>
    </Suspense>
  );
}

// Lazy-load non-critical overlays and providers to reduce initial bundle
const EasterEggProvider = lazy(() => import("@/components/easter-eggs/EasterEggProvider").then(m => ({ default: m.EasterEggProvider })));
const GlobalCallOverlay = lazy(() => import("@/components/call/GlobalCallOverlay").then(m => ({ default: m.GlobalCallOverlay })));
const PushNotificationPrompt = lazy(() => import("@/components/notifications/PushNotificationPrompt").then(m => ({ default: m.PushNotificationPrompt })));
const GlobalMessageNotifications = lazy(() => import("@/components/notifications/GlobalMessageNotifications").then(m => ({ default: m.GlobalMessageNotifications })));
const TabNotificationBadge = lazy(() => import("@/components/notifications/TabNotificationBadge").then(m => ({ default: m.TabNotificationBadge })));
const TutorialProvider = lazy(() => import("@/components/tutorial/TutorialProvider").then(m => ({ default: m.TutorialProvider })));
const WarningPopup = lazy(() => import("@/components/moderation/WarningPopup").then(m => ({ default: m.WarningPopup })));
const InvitePopup = lazy(() => import("@/components/invite/InvitePopup").then(m => ({ default: m.InvitePopup })));
const AppUpdateOverlay = lazy(() => import("@/components/app/AppUpdateOverlay").then(m => ({ default: m.AppUpdateOverlay })));
const RewardNotificationProvider = lazy(() => import("@/components/vybepass/RewardNotificationProvider").then(m => ({ default: m.RewardNotificationProvider })));
const StreakProvider = lazy(() => import("@/components/streak/StreakProvider").then(m => ({ default: m.StreakProvider })));

// Lazy-load deferred hooks via a wrapper component
const DeferredAuthHooks = lazy(() => import("@/components/app/DeferredAuthHooks"));

// Initialize stored fonts and custom animations on app load (with safety catch)
try { initializeStoredFonts(); } catch (e) { console.warn('[App] initializeStoredFonts failed:', e); }
try { initializeCustomAnimations(); } catch (e) { console.warn('[App] initializeCustomAnimations failed:', e); }

// Expose query client for error recovery
(window as any).__REACT_QUERY_CLIENT__ = null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 minutes - maximize cache hits
      gcTime: 1000 * 60 * 180, // 3 hour cache for even better persistence
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
      retryDelay: 200,
      networkMode: 'offlineFirst',
      structuralSharing: true,
      refetchInterval: false,
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// Expose for error recovery
(window as any).__REACT_QUERY_CLIENT__ = queryClient;

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


// Preloader wrapper component - must be inside QueryClientProvider
function AppWithPreloader() {
  // Background data prefetch with splash screen
  const { step, progress, isComplete } = useAppPreloader();
  const [showSplash, setShowSplash] = useState(true);
  
  // Dismiss splash when preloader completes
  useEffect(() => {
    if (isComplete) {
      // Brief delay for smooth transition
      const timer = setTimeout(() => setShowSplash(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);

  // Load deferred CSS after mount
  useEffect(() => {
    import('./styles/liquid.css').catch(() => {});
  }, []);

  // Auto-update checker
  useAutoUpdate();
  
  // Real-time profile sync - updates propagate instantly to all users
  useRealtimeProfiles();
  usePostsRealtime();

  return (
    <>
      <GlobalErrorHandler />
      <SplashScreen isVisible={showSplash} status={step} progress={progress} />
      <AuthProvider>
        <Suspense fallback={null}><DeferredAuthHooks /></Suspense>
        {/* AppBackgroundProvider: Persistent background layer that survives theme changes */}
        <AppBackgroundProvider>
          <CustomThemeProvider>
            <ThemeTransitionProvider>
              <Suspense fallback={null}>
                <EasterEggProvider>
                  <CallStoreProvider>
                    <Suspense fallback={null}>
                      <RewardNotificationProvider>
                        <StreakProvider>
                          <MinimalTooltipProvider>
                            <Suspense fallback={null}><LazyToaster /><LazySonner /></Suspense>
                            <BrowserRouter>
                              <DebugPanelProvider>
                                <Suspense fallback={null}>
                                  <TutorialProvider>
                                    <ScrollRestoration />
                                    <AnimatedRoutes />
                                    <RootBottomNavMount />
                                    <Suspense fallback={null}>
                                      <PushNotificationPrompt />
                                      <GlobalMessageNotifications />
                                      <TabNotificationBadge />
                                      <GlobalCallOverlay />
                                      <WarningPopup />
                                      <InvitePopup />
                                      <BanCheck />
                                      <AppUpdateOverlay />
                                    </Suspense>
                                  </TutorialProvider>
                                </Suspense>
                              </DebugPanelProvider>
                            </BrowserRouter>
                          </MinimalTooltipProvider>
                        </StreakProvider>
                      </RewardNotificationProvider>
                    </Suspense>
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
    <SmartErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <GlassIntensityProvider>
            <AccessibilityProvider>
              <AppWithPreloader />
            </AccessibilityProvider>
          </GlassIntensityProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SmartErrorBoundary>
  );
});

export default App;
