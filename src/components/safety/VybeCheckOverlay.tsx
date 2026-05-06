import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Check, Rocket, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContentSafety, type SafetyResult } from '@/hooks/useContentSafety';
import { SafetyScanProgress } from '@/components/safety/SafetyScanProgress';
import { AgeRatingSelector, type AgeRating } from './AgeRatingSelector';
import { triggerHaptic } from '@/lib/haptics';
import { shouldBypassSafety } from '@/lib/ownerBypass';

type Phase = 'scanning' | 'rating' | 'ready' | 'blocked';

interface VybeCheckOverlayProps {
  files: File[];
  onComplete: (ageRating: AgeRating) => void;
  onBlocked: (message: string, categories: string[]) => void;
  onCancel: () => void;
  /** If a scan was already run (e.g. pre-scan in composer), skip rescanning. */
  precomputedResult?: {
    blocked?: boolean;
    message?: string;
    categories?: string[];
    suggestedAgeRating?: AgeRating | null;
    ageRatingReasons?: string[];
  } | null;
}

export function VybeCheckOverlay({ files, onComplete, onBlocked, onCancel, precomputedResult }: VybeCheckOverlayProps) {
  const [phase, setPhase] = useState<Phase>(precomputedResult ? 'rating' : 'scanning');
  const [ageRating, setAgeRating] = useState<AgeRating>('safe');
  const ageRatingRef = useRef<AgeRating>('safe');
  const contentSafety = useContentSafety();

  // AI-detected minimum age rating
  const [aiMinRating, setAiMinRating] = useState<AgeRating | null>(
    precomputedResult?.suggestedAgeRating && precomputedResult.suggestedAgeRating !== 'safe'
      ? precomputedResult.suggestedAgeRating
      : null
  );
  const [aiReasons, setAiReasons] = useState<string[]>(precomputedResult?.ageRatingReasons || []);

  // Run scan on mount (skipped if precomputed)
  useEffect(() => {
    if (precomputedResult) {
      if (precomputedResult.blocked) {
        setPhase('blocked');
        onBlocked(
          precomputedResult.message || 'Content violates community guidelines',
          precomputedResult.categories || []
        );
      }
      return;
    }

    let cancelled = false;

    const runScan = async () => {
      const isOwner = await shouldBypassSafety();
      if (isOwner) {
        if (!cancelled) setPhase('rating');
        return;
      }

      if (!files.length || !files[0]) {
        if (!cancelled) setPhase('rating');
        return;
      }

      let result;
      if (files[0].type.startsWith('video/')) {
        result = await contentSafety.scanVideo(files[0]);
      } else {
        result = await contentSafety.scanImage(files[0]);
      }

      if (cancelled) return;

      if (result.result === 'blocked') {
        setPhase('blocked');
        onBlocked(result.message || 'Content violates community guidelines', result.categories || []);
        return;
      }

      if (result.suggestedAgeRating && result.suggestedAgeRating !== 'safe') {
        setAiMinRating(result.suggestedAgeRating);
        setAiReasons(result.ageRatingReasons || []);
      }

      triggerHaptic('light');
      setPhase('rating');
    };

    runScan();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const handleRatingSelect = useCallback((rating: AgeRating) => {
    setAgeRating(rating);
    ageRatingRef.current = rating;
    triggerHaptic('medium');
    setTimeout(() => setPhase('ready'), 300);
  }, []);

  const handlePublish = useCallback(() => {
    triggerHaptic('heavy');
    onComplete(ageRatingRef.current);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[260] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
    >
      <button
        onClick={onCancel}
        className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>

      <AnimatePresence mode="wait">
        {/* Phase 1: Scanning */}
        {phase === 'scanning' && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-80 space-y-6 text-center"
          >
            <div className="relative w-20 h-20 mx-auto">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
              />
              <div className="absolute inset-2 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-8 w-8 text-primary" />
              </div>
            </div>

            <div>
              <p className="text-foreground font-bold text-lg mb-1">Scanning your VYBE...</p>
              <p className="text-muted-foreground text-sm">
                {contentSafety.message || 'Checking content safety'}
              </p>
            </div>

            <SafetyScanProgress
              phase={contentSafety.scanPhase}
              isVideo={files[0]?.type.startsWith('video/')}
            />
          </motion.div>
        )}

        {/* Phase 2: Age Rating */}
        {phase === 'rating' && (
          <motion.div
            key="rating"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full px-6"
          >
            {/* AI restriction notice */}
            {aiMinRating && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-sm mx-auto mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-amber-400">
                      AI detected {aiMinRating} content
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {aiReasons.length > 0
                        ? aiReasons[0]
                        : `This content contains elements unsuitable for viewers under ${aiMinRating === '13+' ? '13' : '18'}.`}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      You cannot set this below {aiMinRating}.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            <AgeRatingSelector
              onSelect={handleRatingSelect}
              minimumRating={aiMinRating || undefined}
            />
          </motion.div>
        )}

        {/* Phase 3: Ready */}
        {phase === 'ready' && (
          <motion.div
            key="ready"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-80 space-y-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
              className="w-20 h-20 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center"
            >
              <Check className="w-10 h-10 text-emerald-400" />
            </motion.div>

            <div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-foreground font-bold text-xl"
              >
                Your VYBE is ready!
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
                style={{
                  borderColor: ageRating === 'safe' ? 'rgb(52 211 153 / 0.5)' : ageRating === '13+' ? 'rgb(251 191 36 / 0.5)' : 'rgb(248 113 113 / 0.5)',
                  color: ageRating === 'safe' ? 'rgb(52 211 153)' : ageRating === '13+' ? 'rgb(251 191 36)' : 'rgb(248 113 113)',
                  backgroundColor: ageRating === 'safe' ? 'rgb(52 211 153 / 0.1)' : ageRating === '13+' ? 'rgb(251 191 36 / 0.1)' : 'rgb(248 113 113 / 0.1)',
                }}
              >
                Rated {ageRating === 'safe' ? 'Safe · All ages' : ageRating}
              </motion.div>
              {aiMinRating && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 }}
                  className="text-xs text-muted-foreground/60 mt-2"
                >
                  🤖 AI enforced minimum rating: {aiMinRating}
                </motion.p>
              )}
            </div>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePublish}
              className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-base flex items-center justify-center gap-2 hover:brightness-110 transition-all"
            >
              <Rocket className="w-5 h-5" />
              Publish
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
