/**
 * AI Content Badge
 * 
 * Transparent watermark shown on posts detected as AI-generated.
 * Authors can toggle the label if it's incorrect.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface AIBadgeProps {
  postId: string;
  authorId: string;
  isAiGenerated: boolean;
  aiConfidence: number;
  aiOverride: boolean | null;
  className?: string;
}

export function AIBadge({ postId, authorId, isAiGenerated, aiConfidence, aiOverride, className }: AIBadgeProps) {
  const { profile } = useAuth();
  const [override, setOverride] = useState<boolean | null>(aiOverride);
  const [showDispute, setShowDispute] = useState(false);

  // Determine if badge should show
  const showAi = override === true || (override === null && isAiGenerated);
  const isAuthor = profile?.id === authorId;

  if (!showAi && !isAuthor) return null;
  if (!showAi && isAuthor && !isAiGenerated) return null;

  const handleToggle = async (newValue: boolean | null) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ ai_override: newValue } as any)
        .eq('id', postId);

      if (error) throw error;

      setOverride(newValue);
      setShowDispute(false);
      toast.success(newValue === false ? 'AI label removed' : newValue === true ? 'Marked as AI' : 'Reset to auto-detect');
    } catch {
      toast.error('Failed to update');
    }
  };

  return (
    <div className={cn("absolute bottom-3 right-3 z-10", className)}>
      <AnimatePresence mode="wait">
        {showDispute && isAuthor ? (
          <motion.div
            key="dispute"
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 4 }}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
            style={{
              background: 'hsl(var(--card) / 0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid hsl(var(--border) / 0.3)',
            }}
          >
            <span className="text-[10px] font-medium text-muted-foreground mr-1">AI?</span>
            <button
              onClick={() => handleToggle(false)}
              className="h-6 w-6 rounded-full flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
              title="Not AI"
            >
              <X className="h-3 w-3 text-emerald-400" />
            </button>
            <button
              onClick={() => handleToggle(true)}
              className="h-6 w-6 rounded-full flex items-center justify-center bg-primary/20 hover:bg-primary/30 transition-colors"
              title="Confirm AI"
            >
              <Check className="h-3 w-3 text-primary" />
            </button>
            <button
              onClick={() => setShowDispute(false)}
              className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </motion.div>
        ) : showAi ? (
          <motion.button
            key="badge"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={isAuthor ? () => setShowDispute(true) : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 select-none",
              isAuthor && "cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            )}
            style={{
              background: 'hsl(var(--card) / 0.6)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid hsl(var(--primary) / 0.2)',
              boxShadow: '0 2px 8px hsl(var(--primary) / 0.1)',
            }}
          >
            <Bot className="h-3 w-3 text-primary/80" />
            <span className="text-[10px] font-semibold tracking-wide text-foreground/70 uppercase">
              AI
            </span>
            {aiConfidence >= 0.8 && (
              <span className="text-[9px] text-muted-foreground/60">
                {Math.round(aiConfidence * 100)}%
              </span>
            )}
          </motion.button>
        ) : isAuthor && isAiGenerated && override === false ? (
          <motion.button
            key="disputed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDispute(true)}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
            style={{
              background: 'hsl(var(--muted) / 0.4)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Bot className="h-2.5 w-2.5 text-muted-foreground/50 line-through" />
            <span className="text-[9px] text-muted-foreground/40 line-through">AI</span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
