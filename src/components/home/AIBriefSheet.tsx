import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Settings, RefreshCw, TrendingUp, MessageCircle, Image as ImageIcon, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { AIBriefCard } from './AIBriefCard';
import { AIBriefCustomizeSheet } from './AIBriefCustomizeSheet';
import { motion, AnimatePresence } from 'framer-motion';

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

export function AIBriefSheet({ open, onOpenChange }: AIBriefSheetProps) {
  const { user, profile } = useAuth();
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
        <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
          <SheetHeader className="pb-2">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/20">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                Your Daily Brief
              </SheetTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowCustomize(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Quick stats */}
            {briefData && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 pt-2"
              >
                {briefData.hasMessages && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-accent/10 px-2 py-1 rounded-full">
                    <MessageCircle className="h-3 w-3 text-accent" />
                    <span>{briefData.unreadCount} unread</span>
                  </div>
                )}
                {briefData.hasPosts && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded-full">
                    <ImageIcon className="h-3 w-3 text-primary" />
                    <span>New posts</span>
                  </div>
                )}
                {briefData.hasLiveData && (
                  <div className="flex items-center gap-1.5 text-xs text-accent font-medium bg-accent/10 px-2 py-1 rounded-full">
                    <Globe className="h-3 w-3" />
                    <span>Live</span>
                  </div>
                )}
              </motion.div>
            )}
          </SheetHeader>

          <ScrollArea className="h-[calc(100%-100px)] mt-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
            ) : briefData ? (
              <div className="space-y-4 pb-8">
                {/* AI Summary */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Quick Summary</span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {briefData.summary}
                  </p>
                </motion.div>

                {/* Live Updates */}
                {briefData.liveUpdates && briefData.liveUpdates.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-accent" />
                      <span className="text-sm font-medium">Live Updates</span>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {briefData.liveUpdates.map((update, index) => (
                        <motion.div
                          key={update.interest}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <AIBriefCard
                            interest={update.interest}
                            content={update.content}
                            sources={update.sources}
                            imageUrl={update.imageUrl}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Empty state for no live data */}
                {(!briefData.liveUpdates || briefData.liveUpdates.length === 0) && !briefData.hasPosts && !briefData.hasMessages && (
                  <div className="text-center py-8">
                    <Globe className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Add interests in settings to get personalized updates
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowCustomize(true)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Customize Brief
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </ScrollArea>
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
