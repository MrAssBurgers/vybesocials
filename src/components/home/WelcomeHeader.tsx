import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Flame, Zap, ChevronRight } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { AIBriefSheet } from './AIBriefSheet';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { useNextLevelProgress } from '@/hooks/useVybePass';
import { LiveActivityTicker } from './LiveActivityTicker';
import { useNavigate, useSearchParams } from 'react-router-dom';


export function WelcomeHeader() {
  const { profile } = useAuth();
  const [showBrief, setShowBrief] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const streakCount = useStreakCount();
  const { currentLevel, progressPercent, xpToNextLevel, currentXP } = useNextLevelProgress();
  const navigate = useNavigate();

  // Auto-open brief from push notification link (?openBrief=true)
  useEffect(() => {
    if (searchParams.get('openBrief') === 'true') {
      setShowBrief(true);
      searchParams.delete('openBrief');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Get time-aware greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Night owl vibes';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);


  const handleOpenBrief = () => {
    haptics.tap();
    setShowBrief(true);
  };

  if (!profile) return null;

  return (
    <>
      <div className="px-4 pt-4 pb-2 space-y-3">
        {/* Welcome Message — frosted glass with aurora glow */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/85 px-4 py-3 shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.35)]"
        >
          {/* Aurora glow blobs */}
          <div className="pointer-events-none absolute -top-12 -left-8 h-32 w-32 rounded-full bg-primary/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-16 -right-10 h-36 w-36 rounded-full bg-accent/20 blur-3xl" aria-hidden />
          {/* Top sheen */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" aria-hidden />

          <div className="relative">
            <h1 className="text-xl font-bold text-foreground">
              {greeting}, <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">@{profile.username}</span>
            </h1>
            <LiveActivityTicker />
          </div>
        </motion.div>

        {/* Streak + XP Strip — compact retention display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <div 
            className="p-2.5 cursor-pointer rounded-xl border border-border/50 bg-card/80" 
            onClick={() => navigate('/challenges')}
          >
            <div className="flex items-center gap-3">
              {/* Streak pill */}
              {streakCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20">
                  <Flame className="h-3.5 w-3.5 text-accent" />
                  <span className="text-xs font-bold text-accent">{streakCount}</span>
                </div>
              )}
              
              {/* XP progress */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold">Lv.{currentLevel}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{xpToNextLevel} XP to next</span>
                </div>
                <Progress value={progressPercent} className="h-1.5" />
              </div>
              
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </div>
          </div>
        </motion.div>

        {/* AI Brief Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Button
            onClick={handleOpenBrief}
            className="w-full h-11 gap-2 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 hover:from-primary/30 hover:via-accent/30 hover:to-primary/30 border border-primary/20 text-foreground backdrop-blur-sm transition-all duration-300"
            variant="ghost"
          >
            <VybeMiniIcon size={22} showSparkles animated />
            <span className="text-sm">Your Daily Brief</span>
            <Globe className="h-3.5 w-3.5 text-accent ml-1" />
            <span className="text-xs ml-1 live-indicator" data-no-auto-contrast>• Live</span>
          </Button>
        </motion.div>
      </div>

      <AIBriefSheet open={showBrief} onOpenChange={setShowBrief} />
    </>
  );
}
