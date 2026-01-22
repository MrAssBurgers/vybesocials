import { useEffect, memo } from 'react';
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
import { useRealtimeProfiles } from "@/hooks/useRealtimeProfiles";
import { AnimatedRoutes } from "@/components/layout/AnimatedRoutes";
import { AppReadinessGate } from "@/components/app/AppReadinessGate";
import { OfflineBanner } from "@/components/app/OfflineBanner";
import { ServerStatusBanner } from "@/components/app/ServerStatusBanner";
import { AUTH_ONLY_MODE } from "@/lib/authOnlyMode";

// Expose query client for error recovery
(window as any).__REACT_QUERY_CLIENT__ = null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 15, // 15 minutes - reduce refetches further
      gcTime: 1000 * 60 * 120, // 2 hour cache for better persistence
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
      retryDelay: 300,
      networkMode: 'offlineFirst',
      structuralSharing: true,
      // Prevent duplicate requests
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

function RealtimeProfilesBootstrap() {
  useRealtimeProfiles();
  return null;
}

// App shell - must be inside QueryClientProvider
function AppShell() {
  // Auto-update checker
  useAutoUpdate();

  // Real-time profile sync - disabled in AUTH-ONLY mode

  return (
    <>
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
                    {!AUTH_ONLY_MODE && <RealtimeProfilesBootstrap />}

                    {AUTH_ONLY_MODE ? (
                      <>
                        <ScrollRestoration />
                        <AppReadinessGate>
                          <ServerStatusBanner />
                          <OfflineBanner />
                          <AnimatedRoutes />
                          <RootBottomNavMount />
                          <PushNotificationPrompt />
                          <GlobalMessageNotifications />
                          <GlobalCallOverlay />
                          <WarningPopup />
                          <InvitePopup />
                          {/* Ban checks disabled in auth-only mode */}
                        </AppReadinessGate>
                      </>
                    ) : (
                      <TutorialProvider>
                        <ScrollRestoration />
                        <AppReadinessGate>
                          <ServerStatusBanner />
                          <OfflineBanner />
                          <AnimatedRoutes />
                          <RootBottomNavMount />
                          <PushNotificationPrompt />
                          <GlobalMessageNotifications />
                          <GlobalCallOverlay />
                          <WarningPopup />
                          <InvitePopup />
                          <BanCheck />
                        </AppReadinessGate>
                      </TutorialProvider>
                    )}
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
              <AppShell />
            </AccessibilityProvider>
          </GlassIntensityProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SmartErrorBoundary>
  );
});

export default App;
