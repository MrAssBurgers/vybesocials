import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sparkles, Settings, RefreshCw, TrendingUp, MessageCircle, Image as ImageIcon, Globe, ExternalLink } from 'lucide-react';
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

function getCachedBrief(): BriefData | null {
  try {
    const cached = localStorage.getItem(BRIEF_CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedBrief(data: BriefData) {
  try {
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchBrief = useCallback(async (isBackground = false) => {
    if (!user) return;
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    // Only show loading if no cached data
    if (!isBackground && !briefData) {
      setIsLoading(true);
    }
    if (isBackground) {
      setIsRefreshing(true);
    }
    
    if (!isBackground) haptics.tap();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!isBackground) toast.error('Please sign in');
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
          if (!isBackground) toast.error('Rate limited. Try again in a moment.');
          return;
        }
        if (response.status === 402) {
          if (!isBackground) toast.error('AI credits exhausted.');
          return;
        }
        throw new Error('Failed to get brief');
      }

      const data = await response.json();
      setBriefData(data);
      setCachedBrief(data);
      if (!isBackground) haptics.success();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Brief error:', error);
      if (!isBackground) toast.error('Could not load brief');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, briefData]);

  // Load cached data instantly, fetch fresh in background
  useEffect(() => {
    if (open && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      
      // If we have cached data, show it and refresh in background
      if (briefData) {
        fetchBrief(true); // Background refresh
      } else {
        fetchBrief(false); // Normal fetch with loading state
      }
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [open, briefData, fetchBrief]);

  const handleRefresh = useCallback(() => {
    hasFetchedRef.current = true;
    setIsLoading(true);
    setBriefData(null);
    fetchBrief(false);
  }, [fetchBrief]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] rounded-t-3xl flex flex-col overflow-hidden bg-background"
          hideCloseButton
        >
          {/* Fixed Header */}
          <SheetHeader className="flex-shrink-0 pb-3 border-b border-border/50">
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
            className="flex-1 overflow-y-auto overscroll-contain py-4 px-1"
            style={{ 
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
              contain: 'strict',
            }}
          >
            {isLoading ? (
              <BriefLoadingState />
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

                {/* Empty state */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && 
                 !briefData.hasPosts && !briefData.hasMessages && (
                  <div className="text-center py-12 animate-in fade-in duration-300">
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
            ) : null}
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
