import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, ExternalLink, AlertCircle, Sun, Moon, Sunset, MessageCircle, Globe, ChevronDown, ChevronRight, Settings, Users, Bell, Flame, Zap, Target, UserPlus, Sparkles, Newspaper } from 'lucide-react';
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
  sourceFavicons?: string[];
  category?: string;
}

interface ActiveChallenge {
  title: string;
  type: string;
  current: number;
  target: number;
  xp: number;
}

interface UnreadMessagePreview {
  conversationId: string;
  senderName: string;
  preview: string;
  isGroup: boolean;
  groupName?: string;
  time: string;
}

interface NotificationDetail {
  type: string;
  message: string;
  time: string;
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
  unreadMessagePreviews?: UnreadMessagePreview[];
  notificationDetails?: NotificationDetail[];
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const timeConfig = {
  morning: { icon: Sun, greeting: 'Good morning', color: 'text-amber-400', bg: 'from-amber-500/10 to-orange-500/5' },
  afternoon: { icon: Sunset, greeting: 'Good afternoon', color: 'text-orange-400', bg: 'from-orange-500/10 to-red-500/5' },
  evening: { icon: Moon, greeting: 'Good evening', color: 'text-indigo-400', bg: 'from-indigo-500/10 to-purple-500/5' },
};

// ── Compact stat chip ──
const StatChip = memo(function StatChip({ icon: Icon, value, label, variant = 'default' }: { icon: typeof Bell; value: number | string; label: string; variant?: 'default' | 'accent' | 'primary' }) {
  if (value === 0 || value === '0') return null;
  const styles = {
    default: 'bg-muted/40 text-muted-foreground border-border/20',
    accent: 'bg-accent/8 text-accent border-accent/15',
    primary: 'bg-primary/8 text-primary border-primary/15',
  };
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${styles[variant]}`}>
      <Icon className="h-3 w-3" />
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
});

// ── Challenge pill ──
const ChallengePill = memo(function ChallengePill({ challenge, index }: { challenge: ActiveChallenge; index: number }) {
  const pct = Math.min((challenge.current / challenge.target) * 100, 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/25 border border-border/15"
    >
      <div className="p-1 rounded-lg bg-accent/10">
        <Target className="h-3 w-3 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[11px] font-medium text-foreground truncate">{challenge.title}</span>
          <span className="text-[10px] text-primary font-bold ml-1.5">+{challenge.xp}xp</span>
        </div>
        <div className="h-[3px] rounded-full bg-muted/40 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, hsl(var(--accent)), hsl(var(--primary)))' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: 0.2 + index * 0.08, duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{challenge.current}/{challenge.target}</span>
    </motion.div>
  );
});

// ── News card with image ──
const NewsCard = memo(function NewsCard({ update, index }: { update: BriefUpdate; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasImage = !!update.imageUrl;
  const preview = update.content.length > 120 ? update.content.slice(0, 120) + '...' : update.content;
  const isLocal = update.category === 'local';
  const isWorld = update.category === 'world';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <button
        onClick={() => { setExpanded(!expanded); haptics.tap(); }}
        className="w-full text-left group"
      >
        <div className="rounded-2xl bg-card/60 border border-border/10 overflow-hidden hover:border-border/25 transition-all duration-200 active:scale-[0.995]">
          {/* Image hero */}
          {hasImage && (
            <div className="relative w-full h-28 bg-muted/20 overflow-hidden">
              <img 
                src={update.imageUrl} 
                alt={update.interest}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-transparent" />
              <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
                {isLocal && <span className="text-[9px] font-bold text-green-400 bg-green-500/15 backdrop-blur-sm px-1.5 py-0.5 rounded-md uppercase tracking-wider">📍 Local</span>}
                {isWorld && <span className="text-[9px] font-bold text-blue-400 bg-blue-500/15 backdrop-blur-sm px-1.5 py-0.5 rounded-md uppercase tracking-wider">🌍 World</span>}
                {!isLocal && !isWorld && (
                  <span className="text-[9px] font-bold text-primary/90 bg-background/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    {update.interest}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="p-3">
            {/* Interest label (when no image) */}
            {!hasImage && (
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {isLocal ? (
                    <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">📍 Near You</span>
                  ) : isWorld ? (
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">🌍 World</span>
                  ) : (
                    <>
                      <Newspaper className="h-3 w-3 text-primary/50" />
                      <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">
                        {update.interest}
                      </span>
                    </>
                  )}
                </div>
                <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
                  <ChevronDown className="h-3 w-3 text-muted-foreground/25" />
                </motion.div>
              </div>
            )}

            {/* Content */}
            <p className="text-[12.5px] text-foreground/80 leading-relaxed">
              {expanded ? update.content : preview}
            </p>

            {/* Source favicons row */}
            {update.sources && update.sources.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-border/8">
                <div className="flex -space-x-1">
                  {(update.sourceFavicons || update.sources.slice(0, 3).map(s => {
                    try { return `https://www.google.com/s2/favicons?domain=${new URL(s).hostname}&sz=32`; } catch { return null; }
                  })).filter(Boolean).slice(0, 4).map((favicon, i) => (
                    <img 
                      key={i} 
                      src={favicon as string} 
                      alt="" 
                      className="w-3.5 h-3.5 rounded-full border border-background bg-muted"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ))}
                </div>
                <span className="text-[9px] text-muted-foreground/40">
                  {update.sources.length} source{update.sources.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Expanded sources */}
      <AnimatePresence>
        {expanded && update.sources && update.sources.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-2 py-1.5 mt-1 space-y-0.5">
              {update.sources.slice(0, 4).map((source, idx) => {
                try {
                  const url = new URL(source);
                  const domain = url.hostname.replace('www.', '');
                  return (
                    <a
                      key={idx}
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/15 hover:bg-muted/30 transition-colors"
                    >
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`} 
                        alt="" 
                        className="w-3.5 h-3.5 rounded-sm" 
                        loading="lazy"
                      />
                      <span className="text-[10px] text-muted-foreground/70 truncate flex-1">{domain}</span>
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/30 flex-shrink-0" />
                    </a>
                  );
                } catch { return null; }
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// Cache
const BRIEF_CACHE_KEY = 'vybe_ai_brief_cache';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

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

// ── Section header ──
const SectionHeader = memo(function SectionHeader({ icon: Icon, label }: { icon: typeof Bell; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5 mb-2">
      <Icon className="h-3 w-3 text-muted-foreground/50" />
      <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.1em]">{label}</span>
    </div>
  );
});

export function AIBriefSheet({ open, onOpenChange }: AIBriefSheetProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [briefData, setBriefData] = useState<BriefData | null>(() => getCachedBrief());
  const [showCustomize, setShowCustomize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const timeOfDay = getTimeOfDay();
  const { icon: TimeIcon, greeting, color, bg } = timeConfig[timeOfDay];

  const fetchBrief = useCallback(async (isBackground = false) => {
    if (!user) { setError('Please sign in to see your brief'); return; }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    
    if (!isBackground) { setIsLoading(true); setError(null); setLoadingProgress(10); setLoadingStage('auth'); } else { setIsRefreshing(true); }
    if (!isBackground) haptics.tap();

    try {
      if (!isBackground) { setLoadingProgress(20); setLoadingStage('auth'); }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Please sign in to see your brief'); return; }

      if (!isBackground) { setLoadingProgress(35); setLoadingStage('data'); }

      // Try to get GPS location (non-blocking)
      let latitude: number | null = null;
      let longitude: number | null = null;
      const locationEnabled = localStorage.getItem('vybe_ai_location') === 'true';
      
      if (locationEnabled && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 300000 });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          // Location unavailable, continue without it
        }
      }

      let progressInterval: ReturnType<typeof setInterval> | null = null;
      if (!isBackground) {
        let current = 35;
        progressInterval = setInterval(() => {
          current = Math.min(current + 2, 82);
          setLoadingProgress(current);
          if (current >= 50 && current < 70) setLoadingStage('interests');
          else if (current >= 70) setLoadingStage('ai');
        }, 400);
      }

      const bodyPayload: Record<string, any> = {};
      if (latitude && longitude) {
        bodyPayload.latitude = latitude;
        bodyPayload.longitude = longitude;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-catch-up`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify(bodyPayload),
          signal: abortControllerRef.current.signal,
        }
      );

      if (progressInterval) clearInterval(progressInterval);
      if (!isBackground) { setLoadingProgress(85); setLoadingStage('ai'); }

      if (!response.ok) {
        if (response.status === 429) { setError('Rate limited. Try again in a moment.'); return; }
        if (response.status === 402) { setError('AI credits exhausted.'); return; }
        throw new Error('Failed to get brief');
      }

      if (!isBackground) { setLoadingProgress(95); setLoadingStage('done'); }

      const data = await response.json();
      setBriefData(data);
      setCachedBrief(data);
      setError(null);
      if (!isBackground) { setLoadingProgress(100); haptics.success(); }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Could not load brief. Tap refresh to try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setLoadingProgress(0);
      setLoadingStage('');
    }
  }, [user]);

  useEffect(() => {
    if (open && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      // Always fetch fresh data when opening; show cached data in the meantime
      fetchBrief(!!briefData);
    }
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

  const stats = briefData ? [
    { icon: Bell, label: 'notifs', value: briefData.notificationCount || 0, variant: 'accent' as const },
    { icon: MessageCircle, label: 'unread', value: briefData.unreadCount || 0, variant: 'primary' as const },
    { icon: UserPlus, label: 'new followers', value: briefData.newFollowerCount || 0, variant: 'default' as const },
    { icon: Users, label: 'requests', value: briefData.pendingFriendRequests || 0, variant: 'accent' as const },
    { icon: Flame, label: 'streak', value: briefData.streak || 0, variant: 'default' as const },
  ].filter(s => s.value > 0) : [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[80vh] rounded-t-[2rem] flex flex-col overflow-hidden bg-background/98 backdrop-blur-xl border-t border-border/15"
          hideCloseButton
          disableInternalScroll
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/15" />
          </div>

          {/* Header with greeting gradient */}
          <div className={`flex-shrink-0 px-5 py-3 bg-gradient-to-r ${bg} rounded-xl mx-4 mb-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TimeIcon className={`h-5 w-5 ${color}`} />
                <div>
                  <h2 className="text-base font-semibold leading-tight">{greeting}{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}</h2>
                  <p className="text-[11px] text-muted-foreground/60">Here's your daily catch-up</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {briefData && (briefData.userLevel || 0) > 0 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/8 mr-0.5">
                    <Zap className="h-2.5 w-2.5 text-primary" />
                    <span className="text-[10px] font-bold text-primary">Lv.{briefData.userLevel}</span>
                  </div>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setShowCustomize(true)}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 pb-10"
            style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}
          >
            {isLoading ? (
              <GeneratingScreen progress={loadingProgress} stage={loadingStage} />
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="p-3 rounded-full bg-destructive/10 mb-4">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-4">{error}</p>
                <Button variant="outline" size="sm" onClick={handleRefresh}>Try Again</Button>
              </div>
            ) : briefData ? (
              <div className="space-y-5">
                {/* AI Summary card */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-gradient-to-br from-primary/6 via-transparent to-accent/4 border border-primary/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-xl bg-primary/10 flex-shrink-0 mt-0.5">
                      <VybeMiniIcon size={14} showSparkles />
                    </div>
                    <p className="text-[13px] text-foreground/90 leading-relaxed flex-1">
                      {briefData.summary}
                    </p>
                  </div>
                </motion.div>

                {/* Stats row */}
                {stats.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }} className="flex flex-wrap gap-1.5">
                    {stats.map((stat) => (
                      <StatChip key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} variant={stat.variant} />
                    ))}
                    {(briefData.recentPostCount || 0) > 0 && (
                      <StatChip icon={Globe} label="posts" value={briefData.recentPostCount || 0} />
                    )}
                  </motion.div>
                )}

                {/* Unread Messages */}
                {briefData.unreadMessagePreviews && briefData.unreadMessagePreviews.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    <SectionHeader icon={MessageCircle} label="Unread messages" />
                    <div className="space-y-1.5">
                      {briefData.unreadMessagePreviews.slice(0, 4).map((msg, i) => (
                        <motion.button
                          key={msg.conversationId}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => { onOpenChange(false); navigate(`/messages/${msg.conversationId}`); }}
                          className="w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl bg-primary/4 border border-primary/8 hover:border-primary/20 transition-all"
                        >
                          <div className="p-1.5 rounded-lg bg-primary/10">
                            <MessageCircle className="h-3 w-3 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-foreground block truncate">
                              {msg.isGroup ? (msg.groupName || 'Group') : msg.senderName}
                            </span>
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {msg.isGroup ? `${msg.senderName}: ` : ''}{msg.preview}
                            </span>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/30 flex-shrink-0" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Notifications */}
                {briefData.notificationDetails && briefData.notificationDetails.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
                    <SectionHeader icon={Bell} label="Notifications" />
                    <div className="space-y-1">
                      {briefData.notificationDetails.slice(0, 4).map((notif, i) => (
                        <motion.button
                          key={`notif-${i}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => { onOpenChange(false); navigate('/notifications'); }}
                          className="w-full text-left flex items-center gap-2.5 p-2 rounded-xl bg-muted/20 border border-border/10 hover:border-border/25 transition-all"
                        >
                          <div className="p-1 rounded-lg bg-accent/8">
                            <Bell className="h-3 w-3 text-accent" />
                          </div>
                          <span className="text-[11px] text-foreground/75 flex-1 truncate">{notif.message}</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/25 flex-shrink-0" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Active Challenges */}
                {briefData.activeChallenges && briefData.activeChallenges.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }}>
                    <SectionHeader icon={Target} label="Challenges" />
                    <div className="space-y-1.5">
                      {briefData.activeChallenges.slice(0, 3).map((c, i) => (
                        <ChallengePill key={c.title} challenge={c} index={i} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── Trending News (the main upgrade) ── */}
                {briefData.liveUpdates && briefData.liveUpdates.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16 }}>
                    <SectionHeader icon={TrendingUp} label="Trending for you" />
                    <div className="space-y-2.5">
                      {briefData.liveUpdates.map((update, index) => (
                        <NewsCard key={update.interest + index} update={update} index={index} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Refresh button */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                  <Button
                    onClick={handleRefresh}
                    disabled={isLoading || isRefreshing}
                    variant="outline"
                    className="w-full gap-2 border-primary/15 hover:bg-primary/5 h-10"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm">Refresh Brief</span>
                    {(isLoading || isRefreshing) && <RefreshCw className="h-3 w-3 animate-spin" />}
                  </Button>
                </motion.div>

                {/* Empty state */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && 
                 !briefData.hasPosts && !briefData.hasMessages && stats.length === 0 &&
                 (!briefData.unreadMessagePreviews || briefData.unreadMessagePreviews.length === 0) &&
                 (!briefData.notificationDetails || briefData.notificationDetails.length === 0) && (
                  <div className="text-center py-10">
                    <Globe className="h-8 w-8 text-muted-foreground/15 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">Add interests to personalize your brief</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowCustomize(true)}>
                      <Settings className="h-4 w-4 mr-2" />
                      Customize
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <GeneratingScreen progress={loadingProgress} stage={loadingStage} />
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
