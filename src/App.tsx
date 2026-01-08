import './lib/i18n';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { EasterEggProvider } from "@/components/easter-eggs/EasterEggProvider";

// Pages
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
import AdminDashboard from "./pages/AdminDashboard";
import Feedback from "./pages/Feedback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 10, // 10 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <EasterEggProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/home" element={<Home />} />
                <Route path="/shorts" element={<Shorts />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/p/:id" element={<PostDetail />} />
                <Route path="/u/:username" element={<Profile />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/messages/new" element={<NewMessage />} />
                <Route path="/messages/:conversationId" element={<Messages />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/feedback" element={<Feedback />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </EasterEggProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
