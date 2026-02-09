import { useState, useEffect, memo } from 'react';
import './lib/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useRetroactiveSync } from "@/hooks/useRetroactiveSync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { CustomThemeProvider } from "@/providers/ThemeProvider";
import { ThemeTransitionProvider } from "@/providers/ThemeTransitionProvider";
import { EasterEggProvider } from "@/components/easter-eggs/EasterEggProvider";
import { CallStoreProvider } from "@/lib/callStore";
import { GlobalCallOverlay } from "@/components/call/GlobalCallOverlay";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { AccessibilityProvider } from "@/providers/AccessibilityProvider";
import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { GlobalMessageNotifications } from "@/components/notifications/GlobalMessageNotifications";
import { TabNotificationBadge } from "@/components/notifications/TabNotificationBadge";
import { saveScrollPosition, restoreScrollPosition } from "@/lib/scrollMemory";
import { RootBottomNavMount } from "@/components/layout/RootBottomNavMount";
import { TutorialProvider } from "@/components/tutorial/TutorialProvider";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import SmartErrorBoundary from "@/components/error/SmartErrorBoundary";
import { GlobalErrorHandler } from "@/components/error/GlobalErrorHandler";
import { WarningPopup } from "@/components/moderation/WarningPopup";
import { BannedScreen } from "@/components/auth/BannedScreen";
import { MemeBanScreen } from "@/components/auth/MemeBanScreen";
import { InvitePopup } from "@/components/invite/InvitePopup";
import { useBanStatus } from "@/hooks/useBanStatus";
import { useAppPreloader } from "@/hooks/useAppPreloader";
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { useGlobalRealtimeMessages } from "@/hooks/useGlobalRealtimeMessages";
import { usePrefetchBackgrounds } from '@/hooks/useUserBackgrounds';
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";
import { AppBackgroundProvider } from "@/components/layout/AppBackground";
import { useDynamicFavicon } from "@/hooks/useDynamicFavicon";
import { useDynamicManifest } from "@/hooks/useDynamicManifest";
import { RewardNotificationProvider } from "@/components/vybepass/RewardNotificationProvider";
import { useDailyLoginChallenge } from "@/hooks/useDailyLogin";
import { StreakProvider } from "@/components/streak/StreakProvider";
import { initializeStoredFonts } from "@/hooks/useApplyThemeFonts";

// Initialize stored fonts on app load
initializeStoredFonts();

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

// Ban check component
function BanCheck() {
  const { data: banData } = useBanStatus();
  
  if (!banData) return null;
  
  if (banData.is_meme_ban) {
    return <MemeBanScreen reason={banData.reason} expiresAt={banData.expires_at} customGifUrl={banData.custom_gif_url} />;
  }
  
  return (
    <BannedScreen 
      reason={banData.reason} 
      expiresAt={banData.expires_at} 
      isPermanent={banData.is_permanent} 
    />
  );
}

// Track if initial load has completed (persists across navigations)
let hasInitialLoadCompleted = false;

// Component that requires AuthProvider context
function AuthenticatedPreloads() {
  // Prefetch user backgrounds for instant settings load
  usePrefetchBackgrounds();
  // Global realtime messages - ensures DMs update instantly everywhere
  useGlobalRealtimeMessages();
  // Dynamic favicon that syncs with user's VYBE theme colors
  useDynamicFavicon();
  // Dynamic PWA manifest with theme-colored icons
  useDynamicManifest();
  // Sync retroactive challenge progress and owner badges
  useRetroactiveSync();
  // Track daily login for challenges
  useDailyLoginChallenge();
  return null;
}

// Preloader wrapper component - must be inside QueryClientProvider
function AppWithPreloader() {
  const preloadStatus = useAppPreloader();
  // Only show splash on truly initial load, not on navigation
  const [showSplash, setShowSplash] = useState(!hasInitialLoadCompleted);
  
  // Auto-update checker
  useAutoUpdate();
  
  // Real-time profile sync - updates propagate instantly to all users
  useRealtimeProfiles();

  useEffect(() => {
    // Only hide splash when preloading is truly complete
    if (preloadStatus.isComplete && showSplash) {
      // Small delay for smooth transition
      const timer = setTimeout(() => {
        setShowSplash(false);
        hasInitialLoadCompleted = true;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [preloadStatus.isComplete, showSplash]);

  return (
    <>
      <SplashScreen 
        isVisible={showSplash} 
        status={preloadStatus.step}
        progress={preloadStatus.progress}
      />
      <GlobalErrorHandler />
      <AuthProvider>
        <AuthenticatedPreloads />
        {/* AppBackgroundProvider: Persistent background layer that survives theme changes */}
        <AppBackgroundProvider>
          <CustomThemeProvider>
            <ThemeTransitionProvider>
              <EasterEggProvider>
                <CallStoreProvider>
                  <RewardNotificationProvider>
                    <StreakProvider>
                      <TooltipProvider>
                        <Toaster />
                        <Sonner />
                        <BrowserRouter>
                          <TutorialProvider>
                            <ScrollRestoration />
                            <AnimatedRoutes />
                            <RootBottomNavMount />
                            <PushNotificationPrompt />
                            <GlobalMessageNotifications />
                            <TabNotificationBadge />
                            <GlobalCallOverlay />
                            <WarningPopup />
                            <InvitePopup />
                            <BanCheck />
                          </TutorialProvider>
                        </BrowserRouter>
                      </TooltipProvider>
                    </StreakProvider>
                  </RewardNotificationProvider>
                </CallStoreProvider>
              </EasterEggProvider>
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
