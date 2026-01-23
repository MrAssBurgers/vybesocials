import { useState, useEffect, useCallback, memo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Settings, RefreshCw, TrendingUp, MessageCircle, Image as ImageIcon, Globe, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { AIBriefCustomizeSheet } from './AIBriefCustomizeSheet';

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
const BriefCard = memo(function BriefCard({ update }: { update: BriefUpdate }) {
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
    <div className="p-4 rounded-xl bg-card/80 border border-border/50">
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

export function AIBriefSheet({ open, onOpenChange }: AIBriefSheetProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  const fetchBrief = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    haptics.tap();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in');
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
        throw new Error('Failed to get brief');
      }

      const data = await response.json();
      setBriefData(data);
      haptics.success();
    } catch (error) {
      console.error('Brief error:', error);
      toast.error('Could not load brief');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && !briefData) {
      fetchBrief();
    }
  }, [open, briefData, fetchBrief]);

  const handleRefresh = () => {
    setBriefData(null);
    fetchBrief();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent 
          side="bottom" 
          className="h-[85vh] rounded-t-3xl flex flex-col overflow-hidden bg-background"
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
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
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
            
            {/* Status badges */}
            {briefData && (
              <div className="flex gap-2 pt-2">
                {briefData.hasMessages && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent/10 px-2 py-1 rounded-full">
                    <MessageCircle className="h-3 w-3 text-accent" />
                    {briefData.unreadCount} unread
                  </div>
                )}
                {briefData.hasPosts && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded-full">
                    <ImageIcon className="h-3 w-3 text-primary" />
                    New posts
                  </div>
                )}
                {briefData.hasLiveData && (
                  <div className="flex items-center gap-1 text-xs text-accent font-medium bg-accent/10 px-2 py-1 rounded-full">
                    <Globe className="h-3 w-3" />
                    Live
                  </div>
                )}
              </div>
            )}
          </SheetHeader>

          {/* Scrollable Content */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch py-4 px-1"
            style={{ minHeight: 0 }}
          >
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : briefData ? (
              <div className="space-y-4">
                {/* Summary Card */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-accent/5 border border-primary/20">
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
                      <BriefCard key={update.interest + index} update={update} />
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && 
                 !briefData.hasPosts && !briefData.hasMessages && (
                  <div className="text-center py-12">
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
