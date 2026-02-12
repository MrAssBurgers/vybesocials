import { lazy, Suspense, memo, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { isLowEndDevice } from '@/lib/performanceConfig';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { preloadCriticalRoutes, preloadSecondaryRoutes } from '@/lib/routePreloader';
import { useDebugCapture } from '@/hooks/useDebugCapture';

// CRITICAL PAGE - Load eagerly for instant first navigation
import Home from "@/pages/Home";

// High-priority pages - lazy but prefetched early
const Explore = lazy(() => import("@/pages/Explore"));
const Market = lazy(() => import("@/pages/Market"));
const Messages = lazy(() => import("@/pages/Messages"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Settings = lazy(() => import("@/pages/Settings"));
const Shorts = lazy(() => import("@/pages/Shorts"));
const Profile = lazy(() => import("@/pages/Profile"));

// Secondary pages - lazy load but prefetch
const Landing = lazy(() => import("@/pages/Landing"));
const Upload = lazy(() => import("@/pages/Upload"));
const PostDetail = lazy(() => import("@/pages/PostDetail"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const NewMessage = lazy(() => import("@/pages/NewMessage"));
const AIChat = lazy(() => import("@/pages/AIChat"));
const Feedback = lazy(() => import("@/pages/Feedback"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const CreateListing = lazy(() => import("@/pages/CreateListing"));
const ListingDetail = lazy(() => import("@/pages/ListingDetail"));
const Events = lazy(() => import("@/pages/Events"));
const CreateEvent = lazy(() => import("@/pages/CreateEvent"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const Community = lazy(() => import("@/pages/Community"));
const Spaces = lazy(() => import("@/pages/Spaces"));
const Watch = lazy(() => import("@/pages/Watch"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const InviteFriends = lazy(() => import("@/pages/InviteFriends"));
const InviteRedeem = lazy(() => import("@/pages/InviteRedeem"));
const AddFriend = lazy(() => import("@/pages/AddFriend"));
const CommunityGuidelines = lazy(() => import("@/pages/CommunityGuidelines"));
const AdminMetrics = lazy(() => import("@/pages/AdminMetrics"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const BadgeLibrary = lazy(() => import("@/pages/BadgeLibrary"));
const ChallengesHub = lazy(() => import("@/pages/ChallengesHub"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const HowUDoinHub = lazy(() => import("@/pages/HowUDoinHub"));
const BusinessPortal = lazy(() => import("@/pages/BusinessPortal"));
const OrderSuccess = lazy(() => import("@/pages/OrderSuccess"));
const OrderCancelled = lazy(() => import("@/pages/OrderCancelled"));

// Debug panels
const DebugPanel = lazy(() => import("@/components/debug/DebugPanel").then(m => ({ default: m.DebugPanel })));
import { ProductionDebugPanel } from '@/components/debug/ProductionDebugPanel';
import { useDebugPanel } from '@/contexts/DebugPanelContext';

// Minimal fallback - just shows content area, no skeleton flicker
const PageFallback = memo(() => (
  <div className="min-h-screen bg-background" />
));

// Apple-style liquid page transition
const pageVariants = {
  initial: { opacity: 0, y: 6, scale: 0.998 },
  animate: { opacity: 1, y: 0, scale: 1 },
};

// Liquid spring for page transitions
const pageTransition = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 24,
  mass: 0.9,
};

/**
 * Animated Routes component - provides smooth page transitions
 * Critical pages are eagerly loaded for instant navigation
 */
export function AnimatedRoutes() {
  const location = useLocation();
  const debugPanel = useDebugPanel();
  const { isOpen: debugOpen, setIsOpen: setDebugOpen, isAdmin: isDebugAdmin } = debugPanel || { isOpen: false, setIsOpen: () => {}, isAdmin: false };
  
  // Always capture errors/network — independent of panel visibility
  useDebugCapture();
  
  // Preload all routes after initial render
  useEffect(() => {
    // Preload secondary routes after a short delay
    const timer = setTimeout(() => {
      preloadSecondaryRoutes();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Get a simplified key for route grouping (avoid re-animating on same route)
  const getRouteKey = () => {
    const path = location.pathname;
    // Group conversation messages to avoid transition between them
    if (path.startsWith('/messages/') && path !== '/messages/new') {
      return '/messages/:id';
    }
    // Group profile pages
    if (path.startsWith('/u/')) {
      return '/u/:username';
    }
    return path;
  };

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={getRouteKey()}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        transition={pageTransition}
        className="min-h-screen bg-background"
      >
        <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
            {/* Public routes - no authentication required */}
            <Route path="/" element={<Landing />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/guidelines" element={<CommunityGuidelines />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/invite/:identifier" element={<InviteRedeem />} />
            
            {/* CRITICAL ROUTES - Eagerly loaded, instant navigation */}
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/clips" element={<ProtectedRoute><Shorts /></ProtectedRoute>} />
            <Route path="/shorts" element={<ProtectedRoute><Shorts /></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />
            <Route path="/market" element={<ProtectedRoute><Market /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/messages/:conversationId" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/u/:username" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            
            {/* Secondary routes - lazy loaded but prefetched */}
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/p/:id" element={<ProtectedRoute><PostDetail /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/complete-profile" element={<Navigate to="/onboarding" replace />} />
            <Route path="/messages/new" element={<ProtectedRoute><NewMessage /></ProtectedRoute>} />
            <Route path="/messages/ai-autisy" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
            <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
            <Route path="/market/new" element={<ProtectedRoute><CreateListing /></ProtectedRoute>} />
            <Route path="/market/:id" element={<ProtectedRoute><ListingDetail /></ProtectedRoute>} />
            <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
            <Route path="/events/new" element={<ProtectedRoute><CreateEvent /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
            <Route path="/spaces" element={<ProtectedRoute><Spaces /></ProtectedRoute>} />
            <Route path="/watch/:id" element={<ProtectedRoute><Watch /></ProtectedRoute>} />
            <Route path="/invite-friends" element={<ProtectedRoute><InviteFriends /></ProtectedRoute>} />
            <Route path="/add-friend/:userId" element={<ProtectedRoute><AddFriend /></ProtectedRoute>} />
            <Route path="/admin/metrics" element={<ProtectedRoute><AdminMetrics /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
            <Route path="/badges" element={<ProtectedRoute><BadgeLibrary /></ProtectedRoute>} />
            <Route path="/challenges" element={<ProtectedRoute><ChallengesHub /></ProtectedRoute>} />
            <Route path="/howudoin" element={<ProtectedRoute><HowUDoinHub /></ProtectedRoute>} />
            <Route path="/events/:id" element={<ProtectedRoute><Events /></ProtectedRoute>} />
            <Route path="/business" element={<ProtectedRoute><BusinessPortal /></ProtectedRoute>} />
            <Route path="/business/:slug" element={<ProtectedRoute><BusinessPortal /></ProtectedRoute>} />
            <Route path="/order-success" element={<OrderSuccess />} />
            <Route path="/order-cancelled" element={<OrderCancelled />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* Dev-only debug panel */}
          {import.meta.env.DEV && (
            <Suspense fallback={null}>
              <DebugPanel />
            </Suspense>
          )}
          {/* Production debug panel — always mounted, admin-gated */}
          {isDebugAdmin && (
            <ProductionDebugPanel isOpen={debugOpen} onClose={() => setDebugOpen(false)} />
          )}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}
