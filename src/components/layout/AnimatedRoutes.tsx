import { lazy, Suspense, memo, useMemo } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { isLowEndDevice } from '@/lib/performanceConfig';

// Lazy load pages for code splitting with webpackPrefetch hints
const Landing = lazy(() => import("@/pages/Landing"));
const Home = lazy(() => import(/* webpackPrefetch: true */ "@/pages/Home"));
const Shorts = lazy(() => import("@/pages/Shorts"));
const Explore = lazy(() => import(/* webpackPrefetch: true */ "@/pages/Explore"));
const Upload = lazy(() => import("@/pages/Upload"));
const PostDetail = lazy(() => import("@/pages/PostDetail"));
const Profile = lazy(() => import("@/pages/Profile"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Settings = lazy(() => import("@/pages/Settings"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Messages = lazy(() => import(/* webpackPrefetch: true */ "@/pages/Messages"));
const NewMessage = lazy(() => import("@/pages/NewMessage"));
const AIChat = lazy(() => import("@/pages/AIChat"));
const Feedback = lazy(() => import("@/pages/Feedback"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Market = lazy(() => import("@/pages/Market"));
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

// Debug panel - only loaded in dev mode
const DebugPanel = lazy(() => import("@/components/debug/DebugPanel").then(m => ({ default: m.DebugPanel })));

const PageFallback = memo(() => (
  <div className="min-h-screen bg-background p-4">
    <div className="max-w-xl mx-auto space-y-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  </div>
));

// Simplified page transition for better performance
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// Faster transitions
const pageTransition = {
  duration: 0.15,
  ease: 'easeOut' as const,
};

/**
 * Animated Routes component - provides smooth page transitions
 */
export function AnimatedRoutes() {
  const location = useLocation();
  
  // Get a simplified key for route grouping (avoid re-animating on same route)
  const getRouteKey = () => {
    const path = location.pathname;
    // Group conversation messages to avoid transition between them
    if (path.startsWith('/messages/') && path !== '/messages/new') {
      return '/messages/:id';
    }
    return path;
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={getRouteKey()}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        className="min-h-screen"
      >
        <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
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
            <Route path="/complete-profile" element={<Navigate to="/onboarding" replace />} />
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
            <Route path="/spaces" element={<Spaces />} />
            <Route path="/watch/:id" element={<Watch />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/invite-friends" element={<InviteFriends />} />
            <Route path="/invite/:identifier" element={<InviteRedeem />} />
            <Route path="/add-friend/:userId" element={<AddFriend />} />
            <Route path="/guidelines" element={<CommunityGuidelines />} />
            <Route path="/admin/metrics" element={<AdminMetrics />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* Debug panel - only in dev mode */}
          {import.meta.env.DEV && (
            <Suspense fallback={null}>
              <DebugPanel />
            </Suspense>
          )}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}
