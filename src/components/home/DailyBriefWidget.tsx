import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { AIBriefSheet } from './AIBriefSheet';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function DailyBriefWidget() {
  const [showBrief, setShowBrief] = useState(false);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);
  const [focusHeadline, setFocusHeadline] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Legacy push deep-link (?openBrief=true) — redirect to dedicated /brief page
  useEffect(() => {
    if (searchParams.get('openBrief') === 'true') {
      const t = searchParams.get('topic');
      const h = searchParams.get('headline');
      const qs = new URLSearchParams();
      if (t) qs.set('topic', t);
      if (h) qs.set('headline', h);
      navigate(`/brief${qs.toString() ? `?${qs}` : ''}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const handleOpenBrief = () => {
    haptics.tap();
    setFocusTopic(null);
    setFocusHeadline(null);
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
            <span className="text-xs ml-1 live-indicator" data-no-auto-contrast>• Live</span>
          </Button>
        </motion.div>
      </div>
      <AIBriefSheet
        open={showBrief}
        onOpenChange={(o) => { setShowBrief(o); if (!o) { setFocusTopic(null); setFocusHeadline(null); } }}
        focusTopic={focusTopic}
        focusHeadline={focusHeadline}
      />
    </>
  );
}
