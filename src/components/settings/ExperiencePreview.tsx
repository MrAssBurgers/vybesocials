import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Sparkles } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { haptics } from '@/lib/haptics';
import { premiumSounds } from '@/lib/premiumSounds';
import { usePlatformContext } from '@/providers/PlatformProvider';

/** A single, user-triggered preview: no idle animation or background timers. */
export function ExperiencePreview() {
  const { reducedMotion, motionIntensity } = useTheme();
  const { isLowPerformance } = usePlatformContext();
  const [preview, setPreview] = useState(0);
  const [liked, setLiked] = useState(false);
  const calm = motionIntensity === 'calm';
  const staticFeedback = reducedMotion || isLowPerformance;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4 flex items-center justify-between gap-4 overflow-hidden">
      <div>
        <p className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Try the feel</p>
        <p className="text-xs text-muted-foreground mt-1">A little celebration, tuned to your motion and feedback settings.</p>
      </div>
      <div className="relative shrink-0">
        {!staticFeedback && liked && preview > 0 && (
          <motion.span
            key={preview}
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-primary pointer-events-none"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: calm ? 1.35 : 1.9 }}
            transition={{ duration: calm ? 0.3 : 0.5, ease: 'easeOut' }}
          />
        )}
        <motion.button
          type="button"
          aria-label="Preview like feedback"
          aria-pressed={liked}
          className="relative w-14 h-14 rounded-full bg-primary/15 border border-primary/30 text-primary flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          whileTap={staticFeedback ? undefined : { scale: calm ? 0.96 : 0.9 }}
          onClick={() => {
            setLiked(value => !value);
            setPreview(value => value + 1);
            haptics.like();
            premiumSounds.toggle();
          }}
        >
          <motion.span
            key={preview}
            initial={false}
            animate={staticFeedback || !liked ? { scale: 1, rotate: 0 } : { scale: [1, calm ? 1.1 : 1.28, 1], rotate: calm ? 0 : [0, -12, 8, 0] }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
          >
            <Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} />
          </motion.span>
        </motion.button>
      </div>
    </div>
  );
}
