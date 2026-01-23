import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sparkles, Settings, RefreshCw, TrendingUp, MessageCircle, Image as ImageIcon, Globe, ExternalLink, AlertCircle } from 'lucide-react';
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

// Memoized card component for performance
const BriefCard = memo(function BriefCard({ update, index }: { update: BriefUpdate; index: number }) {
  const getEmoji = (topic: string) => {
    const emojis: Record<string, string> = {
      politics: '🗳️', gaming: '🎮', cooking: '🍳', fitness: '💪', music: '🎵',
      sports: '⚽', movies: '🎬', technology: '💻', fashion: '👗', travel: '✈️',
      art: '🎨', photography: '📸', reading: '📚', science: '🔬', business: '📈',
      health: '🏥', nature: '🌿', comedy: '😂', animals: '🐾', diy: '🔧',
      'breaking news': '📰', 'stock market': '📊', crypto: '₿', 'ai news': '🤖',
      space: '🚀', climate: '🌍', 'pop culture': '⭐',
    };
    return emojis[topic.toLowerCase()] || '✨';
  };

  return (
    <div 
      className="p-4 rounded-xl bg-card/80 border border-border/50 will-change-transform animate-in fade-in slide-in-from-bottom-2"
      style={{ 
        contain: 'layout style paint',
        animationDelay: `${index * 60}ms`,
        animationFillMode: 'both',
        animationDuration: '300ms'
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getEmoji(update.interest)}</span>
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">{update.interest}</span>
        <TrendingUp className="h-3 w-3 text-accent ml-auto" />
      </div>
      
      <p className="text-sm text-foreground leading-relaxed mb-3">
        {update.content}
      </p>

      {update.sources && update.sources.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
          {update.sources.slice(0, 2).map((source, idx) => {
            try {
              const url = new URL(source);
              return (
                <a
                  key={idx}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 text-xs text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {url.hostname.replace('www.', '')}
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
          className="h-[85vh] rounded-t-3xl flex flex-col overflow-hidden bg-background"
          hideCloseButton
           disableInternalScroll
        >
          {/* Fixed Header */}
          <SheetHeader className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <div className="p-1.5 rounded-lg bg-primary/15">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                Your Daily Brief
              </SheetTitle>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 transition-transform duration-500 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setShowCustomize(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Status badges with smooth fade */}
            <div 
              className="flex gap-2 pt-2 transition-opacity duration-300"
              style={{ opacity: briefData ? 1 : 0 }}
            >
              {briefData?.hasMessages && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent/10 px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <MessageCircle className="h-3 w-3 text-accent" />
                  {briefData.unreadCount} unread
                </div>
              )}
              {briefData?.hasPosts && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-1 duration-200 delay-75">
                  <ImageIcon className="h-3 w-3 text-primary" />
                  New posts
                </div>
              )}
              {briefData?.hasLiveData && (
                <div className="flex items-center gap-1 text-xs text-accent font-medium bg-accent/10 px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-1 duration-200 delay-150">
                  <Globe className="h-3 w-3" />
                  Live
                </div>
              )}
            </div>
          </SheetHeader>

          {/* Scrollable Content - GPU accelerated */}
           <div 
             className="flex-1 overflow-y-auto overscroll-contain touch-pan-y py-4 px-4"
            style={{ 
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
               // Avoid size containment here; it can break scrolling on some mobile browsers
               contain: 'layout style paint',
            }}
          >
            {isLoading ? (
              <BriefLoadingState />
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 animate-in fade-in duration-300">
                <div className="p-4 rounded-full bg-destructive/10 mb-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-base font-medium text-foreground mb-2">Couldn't Load Brief</h3>
                <p className="text-sm text-muted-foreground text-center mb-4 max-w-[250px]">
                  {error}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            ) : briefData ? (
              <div className="space-y-4 animate-in fade-in duration-300">
                {/* Summary Card */}
                <div 
                  className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20"
                  style={{ animation: 'fadeSlideIn 0.3s ease-out forwards' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Quick Summary</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {briefData.summary}
                  </p>
                </div>

                {/* Live Updates */}
                {briefData.liveUpdates && briefData.liveUpdates.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <TrendingUp className="h-4 w-4 text-accent" />
                      <span className="text-sm font-semibold">Live Updates</span>
                    </div>
                    {briefData.liveUpdates.map((update, index) => (
                      <BriefCard key={update.interest + index} update={update} index={index} />
                    ))}
                  </div>
                )}

                {/* Empty state - only show if we have a summary but no other content */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && 
                 !briefData.hasPosts && !briefData.hasMessages && (
                  <div className="text-center py-8 animate-in fade-in duration-300">
                    <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">
                      Add interests to get personalized updates
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCustomize(true)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Customize Brief
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              // Initial state before loading starts
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
