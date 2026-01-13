import { useState, useEffect, lazy, Suspense, memo } from 'react';
import './lib/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { EasterEggProvider } from "@/components/easter-eggs/EasterEggProvider";
import { CallStoreProvider } from "@/lib/callStore";
import { GlobalCallOverlay } from "@/components/call/GlobalCallOverlay";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { AccessibilityProvider } from "@/providers/AccessibilityProvider";
import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";
import { Skeleton } from "@/components/ui/skeleton";
import { saveScrollPosition, restoreScrollPosition } from "@/lib/scrollMemory";
import { RootBottomNavMount } from "@/components/layout/RootBottomNavMount";

// Lazy load pages for code splitting
const Landing = lazy(() => import("./pages/Landing"));
const Home = lazy(() => import("./pages/Home"));
const Shorts = lazy(() => import("./pages/Shorts"));
const Explore = lazy(() => import("./pages/Explore"));
const Upload = lazy(() => import("./pages/Upload"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Messages = lazy(() => import("./pages/Messages"));
const NewMessage = lazy(() => import("./pages/NewMessage"));
const AIChat = lazy(() => import("./pages/AIChat"));
const Feedback = lazy(() => import("./pages/Feedback"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Market = lazy(() => import("./pages/Market"));
const CreateListing = lazy(() => import("./pages/CreateListing"));
const ListingDetail = lazy(() => import("./pages/ListingDetail"));
const Events = lazy(() => import("./pages/Events"));
const CreateEvent = lazy(() => import("./pages/CreateEvent"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Community = lazy(() => import("./pages/Community"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - reduce refetches
      gcTime: 1000 * 60 * 30, // 30 minutes cache
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1, // Only retry once
      retryDelay: 1000,
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
});

const PageFallback = memo(() => (
  <div className="min-h-screen bg-background p-4">
    <div className="max-w-xl mx-auto space-y-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  </div>
));

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

const App = memo(() => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Faster splash - 800ms
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <GlassIntensityProvider>
          <AccessibilityProvider>
            <SplashScreen isVisible={showSplash} />
            <AuthProvider>
              <EasterEggProvider>
                <CallStoreProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <BrowserRouter>
                      <ScrollRestoration />
                      <Suspense fallback={<PageFallback />}>
                        <Routes>
                          <Route path="/" element={<Landing />} />
                          <Route path="/home" element={<Home />} />
                          <Route path="/clips" element={<Shorts />} />
                          <Route path="/shorts" element={<Shorts />} />
                          <Route path="/explore" element={<Explore />} />
                          <Route path="/upload" element={<Upload />} />
                          <Route path="/p/:id" element={<PostDetail />} />
                          <Route path="/u/:username" element={<Profile />} />
                          <Route path="/profile" element={<Profile />} />
                          <Route path="/notifications" element={<Notifications />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/onboarding" element={<Onboarding />} />
                          <Route path="/complete-profile" element={<CompleteProfile />} />
                          <Route path="/messages" element={<Messages />} />
                          <Route path="/messages/new" element={<NewMessage />} />
                          <Route path="/messages/ai-autisy" element={<AIChat />} />
                          <Route path="/messages/:conversationId" element={<Messages />} />
                          <Route path="/feedback" element={<Feedback />} />
                          <Route path="/market" element={<Market />} />
                          <Route path="/market/new" element={<CreateListing />} />
                          <Route path="/market/:id" element={<ListingDetail />} />
                          <Route path="/events" element={<Events />} />
                          <Route path="/events/new" element={<CreateEvent />} />
                          <Route path="/admin" element={<AdminDashboard />} />
                          <Route path="/community" element={<Community />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </Suspense>
                      <RootBottomNavMount />
                      <PushNotificationPrompt />
                      <GlobalCallOverlay />
                    </BrowserRouter>
                  </TooltipProvider>
                </CallStoreProvider>
              </EasterEggProvider>
            </AuthProvider>
          </AccessibilityProvider>
        </GlassIntensityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
});

export default App;
