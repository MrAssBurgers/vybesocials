import { useState, useEffect, forwardRef } from 'react';
import './lib/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { EasterEggProvider } from "@/components/easter-eggs/EasterEggProvider";
import { CallProvider } from "@/components/chat/CallProvider";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { AccessibilityProvider } from "@/providers/AccessibilityProvider";
import { GlassIntensityProvider } from "@/components/ui/glass/GlassIntensityProvider";

// Lazy load pages for better performance
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Shorts from "./pages/Shorts";
import Explore from "./pages/Explore";
import Upload from "./pages/Upload";
import PostDetail from "./pages/PostDetail";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Onboarding from "./pages/Onboarding";
import Messages from "./pages/Messages";
import NewMessage from "./pages/NewMessage";
import AIChat from "./pages/AIChat";

import Feedback from "./pages/Feedback";
import CompleteProfile from "./pages/CompleteProfile";
import NotFound from "./pages/NotFound";
import Market from "./pages/Market";
import CreateListing from "./pages/CreateListing";
import ListingDetail from "./pages/ListingDetail";
import Events from "./pages/Events";
import CreateEvent from "./pages/CreateEvent";
import AdminDashboard from "./pages/AdminDashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10, // 10 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Show splash for minimum time, then hide
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);

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
                <CallProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <BrowserRouter>
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
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </BrowserRouter>
                  </TooltipProvider>
                </CallProvider>
              </EasterEggProvider>
            </AuthProvider>
          </AccessibilityProvider>
        </GlassIntensityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
