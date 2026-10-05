/**
 * AI Content Badge
 * 
 * Transparent watermark shown on posts detected as AI-generated.
 * Authors can toggle the label if it's incorrect.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { usePostMutations } from '@/hooks/usePostMutations';
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
  const actions = usePostMutations(postId);
  const context = useMemo(() => ({ active: true, pending: false, attempt: null as { value: boolean | null; revision: string } | null }), [actions.guard, authorId, aiOverride]);
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const [local, setLocal] = useState({ context, sourceOverride: aiOverride, override: aiOverride, open: false, pending: false, error: '' });
  const current = local.context === context;
  const override = current && local.sourceOverride === aiOverride ? local.override : aiOverride;
  const showDispute = current && local.open;
  const pending = current && local.pending;
  const error = current ? local.error : '';
  const setShowDispute = (open: boolean) => setLocal({ context, sourceOverride: aiOverride, override, open, pending: false, error: '' });
  const guard = () => { actions.guard(); if (!context.active) throw new Error('This post view changed.'); };

  // Determine if badge should show
  const showAi = override === true || (override === null && isAiGenerated);
  const isAuthor = profile?.id === authorId;

  if (!showAi && !isAuthor) return null;
  if (!showAi && isAuthor && !isAiGenerated) return null;

  const handleToggle = async (newValue: boolean | null) => {
    if (context.pending || !isAuthor || !actions.ready) return;
    context.pending = true;
    setLocal({ context, sourceOverride: aiOverride, override, open: true, pending: true, error: '' });
    try {
      guard();
      if (!context.attempt || context.attempt.value !== newValue) {
        const state = await actions.read(postId); guard();
        if (state.status !== 'published' || !state.revision || !state.post) throw new Error(state.needsOwnerConfirmation
          ? 'Review and share this older post before changing its AI label.' : 'This post is no longer available.');
        context.attempt = { value: newValue, revision: state.revision };
      }
      const receipt = await actions.mutate({ action: 'update', postId, expectedRevision: context.attempt.revision, payload: { aiOverride: newValue } });
      guard();
      if (receipt.status !== 'published' || receipt.post?.aiOverride !== newValue) throw new Error('The AI label change was not confirmed. Please retry.');
      context.attempt = null;
      setLocal({ context, sourceOverride: aiOverride, override: receipt.post.aiOverride, open: false, pending: false, error: '' });
      toast.success(newValue === false ? 'AI label removed' : newValue === true ? 'Marked as AI' : 'Reset to auto-detect');
    } catch (cause) {
      try { guard(); } catch { return; }
      const message = cause instanceof Error ? cause.message : 'The AI label change could not be confirmed. Please retry.';
      setLocal({ context, sourceOverride: aiOverride, override, open: true, pending: false, error: message });
      toast.error(message);
    } finally {
      context.pending = false;
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
              disabled={pending || actions.isPending || !actions.ready}
              className="h-6 w-6 rounded-full flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors"
              title="Not AI"
            >
              <X className="h-3 w-3 text-emerald-400" />
            </button>
            <button
              onClick={() => handleToggle(true)}
              disabled={pending || actions.isPending || !actions.ready}
              className="h-6 w-6 rounded-full flex items-center justify-center bg-primary/20 hover:bg-primary/30 transition-colors"
              title="Confirm AI"
            >
              <Check className="h-3 w-3 text-primary" />
            </button>
            <button
              onClick={() => setShowDispute(false)}
              disabled={pending}
              aria-label="Close AI label options"
              className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
            {pending && <span role="status" className="text-xs">Saving…</span>}
            {error && <span role="alert" className="max-w-48 text-xs text-destructive">{error}</span>}
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
