import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Loader2, MessageCircle, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

interface CatchUpData {
  summary: string;
  hasPosts: boolean;
  hasMessages: boolean;
  unreadCount?: number;
  interests?: string[];
}

export function WelcomeHeader() {
  const { profile } = useAuth();
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [catchUpData, setCatchUpData] = useState<CatchUpData | null>(null);

  // Get time-aware greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Night owl vibes';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  // Get day context
  const dayContext = useMemo(() => {
    const day = new Date().getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[day];
  }, []);

  const handleCatchUp = async () => {
    setIsLoading(true);
    haptics.tap();
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to use this feature');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-catch-up`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast.error('Rate limited. Try again in a moment.');
          return;
        }
        if (response.status === 402) {
          toast.error('AI credits exhausted.');
          return;
        }
        throw new Error('Failed to get catch-up');
      }

      const data = await response.json();
      setCatchUpData(data);
      setShowCatchUp(true);
      haptics.success();
    } catch (error) {
      console.error('Catch-up error:', error);
      toast.error('Could not generate catch-up');
    } finally {
      setIsLoading(false);
    }
  };

  const closeCatchUp = () => {
    setShowCatchUp(false);
    haptics.tap();
  };

  if (!profile) return null;

  const displayName = profile.display_name || profile.username || 'there';

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Welcome Message */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-3"
      >
        <h1 className="text-xl font-bold text-foreground">
          {greeting}, <span className="text-primary">@{profile.username}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Happy {dayContext}! Here's what's happening.
        </p>
      </motion.div>

      {/* AI Catch-up Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Button
          onClick={handleCatchUp}
          disabled={isLoading}
          className="w-full h-12 gap-2 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 hover:from-primary/30 hover:via-accent/30 hover:to-primary/30 border border-primary/20 text-foreground backdrop-blur-sm transition-all duration-300"
          variant="ghost"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Getting you caught up...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <span>AI Catch-up</span>
              <span className="text-xs text-muted-foreground ml-1">• See what you missed</span>
            </>
          )}
        </Button>
      </motion.div>

      {/* Catch-up Modal */}
      <AnimatePresence>
        {showCatchUp && catchUpData && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/20 backdrop-blur-xl relative overflow-hidden"
          >
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            {/* Close button */}
            <button
              onClick={closeCatchUp}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-foreground/10 transition-colors z-10"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-xl bg-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Your Catch-up</h3>
            </div>

            {/* Summary */}
            <p className="text-sm text-foreground/90 leading-relaxed mb-3 relative z-10">
              {catchUpData.summary}
            </p>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-3">
              {catchUpData.hasPosts && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Image className="h-3.5 w-3.5 text-primary" />
                  <span>New posts</span>
                </div>
              )}
              {catchUpData.hasMessages && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5 text-accent" />
                  <span>{catchUpData.unreadCount} unread</span>
                </div>
              )}
              {catchUpData.interests && catchUpData.interests.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Based on your interests</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
