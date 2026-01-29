import { useState, useEffect, memo } from 'react';
import './lib/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
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
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";

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

// Preloader wrapper component - must be inside QueryClientProvider
function AppWithPreloader() {
  const preloadStatus = useAppPreloader();
  // Skip splash entirely for faster loading - show app immediately
  const [showSplash, setShowSplash] = useState(false);
  
  // Auto-update checker
  useAutoUpdate();
  
  // Real-time profile sync - updates propagate instantly to all users
  useRealtimeProfiles();

  useEffect(() => {
    // Mark as complete immediately
    hasInitialLoadCompleted = true;
  }, []);

  return (
    <>
      <SplashScreen 
        isVisible={showSplash} 
        status={preloadStatus.step}
        progress={preloadStatus.progress}
      />
      <GlobalErrorHandler />
      <AuthProvider>
        <CustomThemeProvider>
          <ThemeTransitionProvider>
            <EasterEggProvider>
              <CallStoreProvider>
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
                      <GlobalCallOverlay />
                      <WarningPopup />
                      <InvitePopup />
                      <BanCheck />
                    </TutorialProvider>
                  </BrowserRouter>
                </TooltipProvider>
              </CallStoreProvider>
            </EasterEggProvider>
          </ThemeTransitionProvider>
        </CustomThemeProvider>
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
