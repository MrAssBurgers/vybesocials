import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sparkles, Settings, RefreshCw, TrendingUp, ExternalLink, AlertCircle, X, Sun, Moon, Sunset, MessageCircle, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { AIBriefCustomizeSheet } from './AIBriefCustomizeSheet';
import { BriefLoadingState } from './AIBriefLoadingState';

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

const timeIcons = {
  morning: Sun,
  afternoon: Sunset,
  evening: Moon,
};

// Memoized minimal card component
const BriefCard = memo(function BriefCard({ update, index }: { update: BriefUpdate; index: number }) {
  return (
    <div 
      className="p-4 rounded-2xl bg-card border border-border/30 animate-in fade-in slide-in-from-bottom-2"
      style={{ 
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
        animationDuration: '250ms'
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-primary/80 uppercase tracking-wider">{update.interest}</span>
        <TrendingUp className="h-3 w-3 text-muted-foreground/50" />
      </div>
      
      <p className="text-sm text-foreground/90 leading-relaxed">
        {update.content}
      </p>

      {update.sources && update.sources.length > 0 && (
        <div className="flex gap-2 mt-3">
          {update.sources.slice(0, 2).map((source, idx) => {
            try {
              const url = new URL(source);
              return (
                <a
                  key={idx}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
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
  );
});

// Cache key and helpers
const BRIEF_CACHE_KEY = 'vybe_ai_brief_cache';
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

// Validate that brief data is actually usable
function isValidBrief(data: unknown): data is BriefData {
  if (!data || typeof data !== 'object') return false;
  const brief = data as BriefData;
  // Must have a non-empty summary string
  return typeof brief.summary === 'string' && brief.summary.trim().length > 0;
}

function getCachedBrief(): BriefData | null {
  try {
    const cached = localStorage.getItem(BRIEF_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    // Check TTL and validate data structure
    if (Date.now() - timestamp < CACHE_TTL && isValidBrief(data)) {
      return data;
    }
    // Clear invalid cache
    localStorage.removeItem(BRIEF_CACHE_KEY);
    return null;
  } catch {
    localStorage.removeItem(BRIEF_CACHE_KEY);
    return null;
  }
}

function setCachedBrief(data: BriefData) {
  try {
    // Only cache valid data
    if (!isValidBrief(data)) return;
    localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore storage errors
  }
}

export function AIBriefSheet({ open, onOpenChange }: AIBriefSheetProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [briefData, setBriefData] = useState<BriefData | null>(() => getCachedBrief());
  const [showCustomize, setShowCustomize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchBrief = useCallback(async (isBackground = false) => {
    if (!user) {
      setError('Please sign in to see your brief');
      return;
    }
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    // Always show loading if no cached data (and not background)
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
        if (!isBackground) toast.error('Please sign in');
        return;
      }

      console.log('Fetching AI brief...');
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
          if (!isBackground) toast.error('Rate limited. Try again in a moment.');
          return;
        }
        if (response.status === 402) {
          setError('AI credits exhausted.');
          if (!isBackground) toast.error('AI credits exhausted.');
          return;
        }
        const errorText = await response.text();
        console.error('Brief response error:', response.status, errorText);
        throw new Error('Failed to get brief');
      }

      const data = await response.json();
      console.log('Brief data received:', data);
      setBriefData(data);
      setCachedBrief(data);
      setError(null);
      if (!isBackground) haptics.success();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Brief error:', err);
      setError('Could not load brief. Tap refresh to try again.');
      if (!isBackground) toast.error('Could not load brief');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  // Load cached data instantly, fetch fresh in background
  useEffect(() => {
    if (open && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      
      // Always fetch when opening (cached data shows instantly, fresh data replaces it)
      if (briefData) {
        fetchBrief(true); // Background refresh
      } else {
        fetchBrief(false); // Normal fetch with loading state
      }
    }
    
    // Reset on close so next open fetches again
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
          className="h-[80vh] rounded-t-[2rem] flex flex-col overflow-hidden bg-background/95 backdrop-blur-xl border-t border-border/20"
          hideCloseButton
          disableInternalScroll
        >
          {/* Minimal drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>

          {/* Clean Header */}
          <SheetHeader className="flex-shrink-0 px-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const TimeIcon = timeIcons[getTimeOfDay()];
                  return <TimeIcon className="h-5 w-5 text-primary" />;
                })()}
                <SheetTitle className="text-xl font-semibold">
                  {getTimeOfDay().charAt(0).toUpperCase() + getTimeOfDay().slice(1)} Brief
                </SheetTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full"
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Scrollable Content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 pb-8"
            style={{ 
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {isLoading ? (
              <BriefLoadingState />
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 animate-in fade-in duration-300">
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
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Summary */}
                <div className="space-y-2">
                  <p className="text-base text-foreground leading-relaxed">
                    {briefData.summary}
                  </p>
                  
                  {/* Quick stats */}
                  {(briefData.hasMessages || briefData.hasPosts) && (
                    <div className="flex gap-3 pt-2">
                      {briefData.hasMessages && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {briefData.unreadCount} unread
                        </span>
                      )}
                      {briefData.hasPosts && (
                        <span className="text-xs text-muted-foreground">
                          New posts from friends
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Live Updates */}
                {briefData.liveUpdates && briefData.liveUpdates.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Trending
                    </h3>
                    {briefData.liveUpdates.map((update, index) => (
                      <BriefCard key={update.interest + index} update={update} index={index} />
                    ))}
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
              <BriefLoadingState />
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
