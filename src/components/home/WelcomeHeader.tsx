import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { AIBriefSheet } from './AIBriefSheet';

export function WelcomeHeader() {
  const { profile } = useAuth();
  const [showBrief, setShowBrief] = useState(false);

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

  const handleOpenBrief = () => {
    haptics.tap();
    setShowBrief(true);
  };

  if (!profile) return null;

  return (
    <>
      <div className="px-4 pt-4 pb-2">
        {/* Welcome Message */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-3"
        >
          <h1 className="text-xl font-bold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
            {greeting}, <span className="text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">@{profile.username}</span>
          </h1>
          <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
            Happy {dayContext}! Here's what's happening.
          </p>
        </motion.div>

        {/* AI Brief Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Button
            onClick={handleOpenBrief}
            className="w-full h-12 gap-2 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 hover:from-primary/30 hover:via-accent/30 hover:to-primary/30 border border-primary/20 text-foreground backdrop-blur-sm transition-all duration-300"
            variant="ghost"
          >
            <VybeMiniIcon size={16} showSparkles animated />
            <span>Your Daily Brief</span>
            <Globe className="h-3.5 w-3.5 text-accent ml-1" />
            <span className="text-xs text-muted-foreground ml-1">• Live</span>
          </Button>
        </motion.div>
      </div>

      <AIBriefSheet open={showBrief} onOpenChange={setShowBrief} />
    </>
  );
}
