import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, ExternalLink, AlertCircle, Sun, Moon, Sunset, MessageCircle, Globe, ChevronDown, Settings, Users, Bell, Flame, Zap, Target, UserPlus } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { AIBriefCustomizeSheet } from './AIBriefCustomizeSheet';
import { GeneratingScreen } from './AIBriefLoadingState';

interface AIBriefSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BriefUpdate {
  interest: string;
  content: string;
  sources?: string[];
  imageUrl?: string;
}

interface ActiveChallenge {
  title: string;
  type: string;
  current: number;
  target: number;
  xp: number;
}

interface BriefData {
  summary: string;
  hasPosts: boolean;
  hasMessages: boolean;
  unreadCount?: number;
  notificationCount?: number;
  newFollowerCount?: number;
  recentPostCount?: number;
  pendingFriendRequests?: number;
  streak?: number;
  userLevel?: number;
  userXp?: number;
  activeChallenges?: ActiveChallenge[];
  liveUpdates: BriefUpdate[];
  hasLiveData: boolean;
}

// Get time of day for greeting
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const timeConfig = {
  morning: { icon: Sun, greeting: 'Good morning', color: 'text-amber-400' },
  afternoon: { icon: Sunset, greeting: 'Good afternoon', color: 'text-orange-400' },
  evening: { icon: Moon, greeting: 'Good evening', color: 'text-indigo-400' },
};

// Stat pill component
const StatPill = memo(function StatPill({ 
  icon: Icon, label, value, accent = false 
}: { 
  icon: typeof Bell; label: string; value: number | string; accent?: boolean;
}) {
  if (value === 0 || value === '0') return null;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
      accent 
        ? 'bg-primary/10 text-primary border border-primary/20' 
        : 'bg-muted/50 text-muted-foreground border border-border/30'
    }`}>
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span>{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
});

// Challenge progress bar
const ChallengeCard = memo(function ChallengeCard({ challenge, index }: { challenge: ActiveChallenge; index: number }) {
  const progress = Math.min((challenge.current / challenge.target) * 100, 100);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/20"
    >
      <div className="p-1.5 rounded-lg bg-accent/10">
        <Target className="h-3.5 w-3.5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-foreground truncate">{challenge.title}</span>
          <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
            {challenge.current}/{challenge.target}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
          <motion.div 
            className="h-full rounded-full bg-gradient-to-r from-accent to-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ delay: 0.3 + index * 0.1, duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>
      <span className="text-[10px] font-semibold text-primary flex-shrink-0">+{challenge.xp}</span>
    </motion.div>
  );
});

// Expandable brief card
const BriefCard = memo(function BriefCard({ 
  update, index 
}: { 
  update: BriefUpdate; index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const previewText = update.content.length > 100 
    ? update.content.slice(0, 100) + '...' 
    : update.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
    >
      <button
        onClick={() => { setIsExpanded(!isExpanded); haptics.tap(); }}
        className="w-full text-left group"
      >
        <div className="p-3 rounded-2xl bg-card/60 border border-border/20 hover:border-border/40 transition-all duration-200 active:scale-[0.99]">
          <div className="flex items-start gap-2.5">
            {update.imageUrl && (
              <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-muted">
                <img src={update.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-bold text-primary/80 uppercase tracking-widest">
                  {update.interest}
                </span>
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
                  <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
                </motion.div>
              </div>
              <p className="text-[13px] text-foreground/85 leading-relaxed">
                {isExpanded ? update.content : previewText}
              </p>
            </div>
          </div>
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && update.sources && update.sources.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 mt-1 rounded-xl bg-muted/20">
              <div className="flex flex-wrap gap-1.5">
                {update.sources.slice(0, 3).map((source, idx) => {
                  try {
                    const url = new URL(source);
                    return (
                      <a
                        key={idx}
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-background/60 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {url.hostname.replace('www.', '').split('.')[0]}
                      </a>
                    );
                  } catch { return null; }
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// Cache
const BRIEF_CACHE_KEY = 'vybe_ai_brief_cache';
const CACHE_TTL = 1000 * 60 * 5;

function isValidBrief(data: unknown): data is BriefData {
  if (!data || typeof data !== 'object') return false;
  return typeof (data as BriefData).summary === 'string' && (data as BriefData).summary.trim().length > 0;
}

function getCachedBrief(): BriefData | null {
  try {
    const cached = localStorage.getItem(BRIEF_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL && isValidBrief(data)) return data;
    localStorage.removeItem(BRIEF_CACHE_KEY);
    return null;
  } catch { localStorage.removeItem(BRIEF_CACHE_KEY); return null; }
}

function setCachedBrief(data: BriefData) {
  try { if (isValidBrief(data)) localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
}

export function AIBriefSheet({ open, onOpenChange }: AIBriefSheetProps) {
  const { user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [briefData, setBriefData] = useState<BriefData | null>(() => getCachedBrief());
  const [showCustomize, setShowCustomize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const timeOfDay = getTimeOfDay();
  const { icon: TimeIcon, greeting, color } = timeConfig[timeOfDay];

  const fetchBrief = useCallback(async (isBackground = false) => {
    if (!user) { setError('Please sign in to see your brief'); return; }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    
    if (!isBackground) { setIsLoading(true); setError(null); } else { setIsRefreshing(true); }
    if (!isBackground) haptics.tap();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Please sign in to see your brief'); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-catch-up`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({}),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        if (response.status === 429) { setError('Rate limited. Try again in a moment.'); return; }
        if (response.status === 402) { setError('AI credits exhausted.'); return; }
        throw new Error('Failed to get brief');
      }

      const data = await response.json();
      setBriefData(data);
      setCachedBrief(data);
      setError(null);
      if (!isBackground) haptics.success();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Could not load brief. Tap refresh to try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) { hasFetchedRef.current = true; fetchBrief(!!briefData); }
    if (!open) hasFetchedRef.current = false;
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [open, fetchBrief]);

  const handleRefresh = useCallback(() => {
    hasFetchedRef.current = true;
    setIsLoading(true);
    setBriefData(null);
    setError(null);
    fetchBrief(false);
  }, [fetchBrief]);

  // Determine which stats to show
  const stats = briefData ? [
    { icon: Bell, label: 'notifs', value: briefData.notificationCount || 0, accent: true },
    { icon: MessageCircle, label: 'unread', value: briefData.unreadCount || 0, accent: true },
    { icon: UserPlus, label: 'followers', value: briefData.newFollowerCount || 0, accent: false },
    { icon: Users, label: 'requests', value: briefData.pendingFriendRequests || 0, accent: true },
    { icon: Flame, label: 'streak', value: briefData.streak || 0, accent: false },
  ].filter(s => s.value > 0) : [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[75vh] rounded-t-[2rem] flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-t border-border/20"
          hideCloseButton
          disableInternalScroll
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/20" />
          </div>

          {/* Header */}
          <div className="flex-shrink-0 px-5 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TimeIcon className={`h-5 w-5 ${color}`} />
                <div>
                  <h2 className="text-lg font-semibold leading-tight">{greeting}</h2>
                  {profile?.display_name && (
                    <p className="text-xs text-muted-foreground/70">{profile.display_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {briefData && (briefData.userLevel || 0) > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/5 mr-1">
                    <Zap className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-bold text-primary">Lv.{briefData.userLevel}</span>
                  </div>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setShowCustomize(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
                  <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 pb-8"
            style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}
          >
            {isLoading ? (
              <GeneratingScreen />
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="p-3 rounded-full bg-destructive/10 mb-4">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-4">{error}</p>
                <Button variant="outline" size="sm" onClick={handleRefresh}>Try Again</Button>
              </div>
            ) : briefData ? (
              <div className="space-y-4">
                {/* AI Summary */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-accent/5 border border-primary/15"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-xl bg-primary/15 flex-shrink-0 mt-0.5">
                      <VybeMiniIcon size={14} showSparkles />
                    </div>
                    <p className="text-[13px] text-foreground/90 leading-relaxed flex-1">
                      {briefData.summary}
                    </p>
                  </div>
                </motion.div>

                {/* Stats row */}
                {stats.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-wrap gap-1.5"
                  >
                    {stats.map((stat) => (
                      <StatPill key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} accent={stat.accent} />
                    ))}
                    {(briefData.recentPostCount || 0) > 0 && (
                      <StatPill icon={Globe} label="posts" value={briefData.recentPostCount || 0} />
                    )}
                  </motion.div>
                )}

                {/* Active Challenges */}
                {briefData.activeChallenges && briefData.activeChallenges.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5 px-0.5 mb-1">
                      <Target className="h-3 w-3 text-muted-foreground/60" />
                      <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                        Challenges in progress
                      </span>
                    </div>
                    {briefData.activeChallenges.slice(0, 3).map((challenge, index) => (
                      <ChallengeCard key={challenge.title} challenge={challenge} index={index} />
                    ))}
                  </motion.div>
                )}

                {/* Trending Updates */}
                {briefData.liveUpdates && briefData.liveUpdates.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-0.5 mb-1">
                      <TrendingUp className="h-3 w-3 text-muted-foreground/60" />
                      <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                        Trending for you
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {briefData.liveUpdates.map((update, index) => (
                        <BriefCard key={update.interest + index} update={update} index={index} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && 
                 !briefData.hasPosts && !briefData.hasMessages && stats.length === 0 && (
                  <div className="text-center py-8">
                    <Globe className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">Add interests to personalize your brief</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowCustomize(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Customize
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <GeneratingScreen />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AIBriefCustomizeSheet
        open={showCustomize}
        onOpenChange={setShowCustomize}
        onPreferencesUpdated={handleRefresh}
      />
    </>
  );
}
