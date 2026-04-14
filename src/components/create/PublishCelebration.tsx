import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, Eye } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

interface PublishCelebrationProps {
  isUploading: boolean;
  progress: number;
  isComplete: boolean;
  onViewPost?: () => void;
}

// Confetti particle
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const x = Math.random() * 300 - 150;
  const rotate = Math.random() * 720 - 360;
  return (
    <motion.div
      initial={{ y: 0, x: 0, opacity: 1, scale: 1, rotate: 0 }}
      animate={{ y: -200 - Math.random() * 200, x, opacity: 0, scale: 0.5, rotate }}
      transition={{ duration: 1.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="absolute w-2 h-2 rounded-full"
      style={{ backgroundColor: color, bottom: '45%', left: '50%' }}
    />
  );
}

const confettiColors = [
  'hsl(var(--primary))',
  'hsl(280 80% 60%)',
  'hsl(340 80% 60%)',
  'hsl(200 80% 60%)',
  'hsl(120 60% 50%)',
  'hsl(45 90% 55%)',
];

export function PublishCelebration({ isUploading, progress, isComplete, onViewPost }: PublishCelebrationProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isComplete) {
      triggerHaptic('success');
      setShowConfetti(true);
    }
  }, [isComplete]);

  if (!isUploading && !isComplete) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[260] flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(280 20% 8%) 50%, hsl(var(--background)) 100%)',
      }}
    >
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && (
          <>
            {Array.from({ length: 24 }).map((_, i) => (
              <ConfettiParticle key={i} delay={i * 0.04} color={confettiColors[i % confettiColors.length]} />
            ))}
          </>
        )}
      </AnimatePresence>

      <div className="text-center px-8">
        {!isComplete ? (
          <>
            {/* Progress ring */}
            <div className="relative w-32 h-32 mx-auto mb-6">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <motion.circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={339.292}
                  animate={{ strokeDashoffset: 339.292 - (progress / 100) * 339.292 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(280 80% 60%)" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Percentage */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  key={Math.floor(progress)}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl font-bold text-foreground font-mono"
                >
                  {Math.floor(progress)}%
                </motion.span>
              </div>
            </div>
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground text-sm font-medium">Uploading your VYBE...</span>
            </motion.div>
          </>
        ) : (
          <>
            {/* Success */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/40"
            >
              <Check className="w-12 h-12 text-primary-foreground" strokeWidth={3} />
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-bold text-foreground mb-2"
            >
              Your VYBE is live! 🎉
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-muted-foreground text-sm mb-6"
            >
              Shared with the world
            </motion.p>
            {onViewPost && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                whileTap={{ scale: 0.95 }}
                onClick={onViewPost}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25"
              >
                <Eye className="w-4 h-4" /> View Post
              </motion.button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
