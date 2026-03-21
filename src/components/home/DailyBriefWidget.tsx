import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { AIBriefSheet } from './AIBriefSheet';
import { useSearchParams } from 'react-router-dom';

export function DailyBriefWidget() {
  const [showBrief, setShowBrief] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('openBrief') === 'true') {
      setShowBrief(true);
      searchParams.delete('openBrief');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleOpenBrief = () => {
    haptics.tap();
    setShowBrief(true);
  };

  return (
    <>
      <div className="px-4 pb-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            onClick={handleOpenBrief}
            className="w-full h-11 gap-2 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 hover:from-primary/30 hover:via-accent/30 hover:to-primary/30 border border-primary/20 text-foreground backdrop-blur-sm transition-all duration-300"
            variant="ghost"
          >
            <VybeMiniIcon size={22} showSparkles animated />
            <span className="text-sm">Your Daily Brief</span>
            <Globe className="h-3.5 w-3.5 text-accent ml-1" />
            <span className="text-xs text-muted-foreground ml-1">• Live</span>
          </Button>
        </motion.div>
      </div>
      <AIBriefSheet open={showBrief} onOpenChange={setShowBrief} />
    </>
  );
}
