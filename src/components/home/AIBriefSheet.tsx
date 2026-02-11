import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, ExternalLink, AlertCircle, Sun, Moon, Sunset, MessageCircle, Globe, ChevronDown, Settings } from 'lucide-react';
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

interface BriefData {
  summary: string;
  hasPosts: boolean;
  hasMessages: boolean;
  unreadCount?: number;
  notificationCount?: number;
  newFollowerCount?: number;
  recentPostCount?: number;
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

// Expandable brief card with image support
const BriefCard = memo(function BriefCard({ 
  update, 
  index 
}: { 
  update: BriefUpdate; 
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Truncate content for preview
  const previewText = update.content.length > 80 
    ? update.content.slice(0, 80) + '...' 
    : update.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="overflow-hidden"
    >
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          haptics.tap();
        }}
        className="w-full text-left group"
      >
        <div className="p-3 rounded-2xl bg-card/80 border border-border/30 hover:border-border/50 transition-all duration-200 active:scale-[0.98]">
          <div className="flex gap-3">
            {/* Optional image thumbnail */}
            {update.imageUrl && (
              <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-muted">
                <img 
                  src={update.imageUrl} 
                  alt="" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              {/* Category tag */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                  {update.interest}
                </span>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>
              
              {/* Preview text */}
              <p className="text-sm text-foreground/90 leading-snug line-clamp-2">
                {isExpanded ? update.content : previewText}
              </p>
            </div>
          </div>
        </div>
      </button>
      
      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 mt-1 rounded-xl bg-muted/30 border border-border/20">
              {/* Full content if truncated */}
              {update.content.length > 80 && (
                <p className="text-sm text-foreground/80 leading-relaxed mb-3">
                  {update.content}
                </p>
              )}
              
              {/* Source links */}
              {update.sources && update.sources.length > 0 && (
                <div className="flex flex-wrap gap-2">
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
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-background/50 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {url.hostname.replace('www.', '').split('.')[0]}
                        </a>
                      );
                    } catch {
                      return null;
                    }
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// Cache key and helpers
const BRIEF_CACHE_KEY = 'vybe_ai_brief_cache';
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes — keep brief fresh

function isValidBrief(data: unknown): data is BriefData {
  if (!data || typeof data !== 'object') return false;
  const brief = data as BriefData;
  return typeof brief.summary === 'string' && brief.summary.trim().length > 0;
}

function getCachedBrief(): BriefData | null {
  try {
    const cached = localStorage.getItem(BRIEF_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL && isValidBrief(data)) {
      return data;
    }
    localStorage.removeItem(BRIEF_CACHE_KEY);
    return null;
  } catch {
    localStorage.removeItem(BRIEF_CACHE_KEY);
    return null;
  }
}

function setCachedBrief(data: BriefData) {
  try {
    if (!isValidBrief(data)) return;
    localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {}
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
    if (!user) {
      setError('Please sign in to see your brief');
      return;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    if (!isBackground) {
      setIsLoading(true);
      setError(null);
    } else {
      setIsRefreshing(true);
    }
    
    if (!isBackground) haptics.tap();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to see your brief');
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
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          setError('Rate limited. Try again in a moment.');
          return;
        }
        if (response.status === 402) {
          setError('AI credits exhausted.');
          return;
        }
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
    if (open) {
      // Always fetch fresh data when opened — ensures real-time accuracy
      hasFetchedRef.current = true;
      fetchBrief(!!briefData); // background refresh if we have cached data
    }
    
    if (!open) {
      hasFetchedRef.current = false;
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [open, fetchBrief]);

  const handleRefresh = useCallback(() => {
    hasFetchedRef.current = true;
    setIsLoading(true);
    setBriefData(null);
    setError(null);
    fetchBrief(false);
  }, [fetchBrief]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[75vh] rounded-t-[2rem] flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-t border-border/20"
          hideCloseButton
          disableInternalScroll
        >
          {/* Drag handle - only close mechanism */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Minimal Header with greeting */}
          <div className="flex-shrink-0 px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TimeIcon className={`h-5 w-5 ${color}`} />
                <div>
                  <h2 className="text-lg font-semibold">{greeting}</h2>
                  {profile?.display_name && (
                    <p className="text-xs text-muted-foreground">{profile.display_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setShowCustomize(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full"
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 pb-8"
            style={{ 
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {isLoading ? (
              <GeneratingScreen />
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="p-3 rounded-full bg-destructive/10 mb-4">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  {error}
                </p>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  Try Again
                </Button>
              </div>
            ) : briefData ? (
              <div className="space-y-4">
                {/* Summary card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-primary/20 flex-shrink-0">
                      <VybeMiniIcon size={16} showSparkles />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground leading-relaxed">
                        {briefData.summary}
                      </p>
                      
                      {/* Real-time quick stats */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {(briefData.notificationCount ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 bg-background/50 px-2 py-1 rounded-lg">
                            🔔 {briefData.notificationCount} notification{(briefData.notificationCount ?? 0) > 1 ? 's' : ''}
                          </span>
                        )}
                        {briefData.hasMessages && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 bg-background/50 px-2 py-1 rounded-lg">
                            <MessageCircle className="h-3 w-3" />
                            {briefData.unreadCount || 0} unread
                          </span>
                        )}
                        {(briefData.newFollowerCount ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-lg">
                            👥 {briefData.newFollowerCount} new follower{(briefData.newFollowerCount ?? 0) > 1 ? 's' : ''}
                          </span>
                        )}
                        {briefData.hasPosts && (
                          <span className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-lg">
                            📸 {briefData.recentPostCount || 0} new post{(briefData.recentPostCount ?? 0) > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Trending Updates */}
                {briefData.liveUpdates && briefData.liveUpdates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Trending for you
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {briefData.liveUpdates.map((update, index) => (
                        <BriefCard key={update.interest + index} update={update} index={index} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && 
                 !briefData.hasPosts && !briefData.hasMessages && (
                  <div className="text-center py-8">
                    <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Add interests to personalize your brief
                    </p>
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
