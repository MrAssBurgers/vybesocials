import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { haptics } from '@/lib/haptics';
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

interface NFCSwapAnimationProps {
  isActive: boolean;
  myProfile: {
    username: string;
    avatar_url: string | null;
  } | null;
  theirProfile: {
    username: string;
    avatar_url: string | null;
  } | null;
  onComplete?: () => void;
}

export function NFCSwapAnimation({ 
  isActive, 
  myProfile, 
  theirProfile, 
  onComplete 
}: NFCSwapAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'approach' | 'connect' | 'swap' | 'complete'>('idle');

  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      return;
    }

    // Sequence the animation phases with haptics
    setPhase('approach');
    haptics.tap();

    const connectTimer = setTimeout(() => {
      setPhase('connect');
      haptics.impact();
    }, 600);

    const swapTimer = setTimeout(() => {
      setPhase('swap');
      haptics.success();
    }, 1200);

    const completeTimer = setTimeout(() => {
      setPhase('complete');
      haptics.success();
      onComplete?.();
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      clearTimeout(swapTimer);
      clearTimeout(completeTimer);
    };
  }, [isActive, onComplete]);

  if (!isActive || !myProfile || !theirProfile) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
      >
        {/* Lightning Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Electric arcs */}
          {phase === 'connect' && (
            <>
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={`lightning-${i}`}
                  className="absolute"
                  style={{
                    left: '50%',
                    top: '50%',
                    width: '2px',
                    height: `${60 + Math.random() * 80}px`,
                    background: 'linear-gradient(to bottom, hsl(var(--primary)), transparent)',
                    transformOrigin: 'top center',
                  }}
                  initial={{ 
                    opacity: 0, 
                    rotate: i * 60,
                    scale: 0 
                  }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0.5, 1.2, 0.8],
                    rotate: [i * 60, i * 60 + 10, i * 60 - 5],
                  }}
                  transition={{
                    duration: 0.3,
                    repeat: 3,
                    repeatType: 'reverse',
                    delay: i * 0.05,
                  }}
                />
              ))}
            </>
          )}

          {/* Spark particles */}
          {(phase === 'connect' || phase === 'swap') && (
            <>
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={`spark-${i}`}
                  className="absolute w-1 h-1 rounded-full bg-primary"
                  style={{
                    left: '50%',
                    top: '50%',
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: (Math.random() - 0.5) * 200,
                    y: (Math.random() - 0.5) * 200,
                    opacity: 0,
                    scale: 0,
                  }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.03,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </>
          )}

          {/* Glow ring */}
          {phase !== 'idle' && (
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)',
              }}
              animate={{
                scale: phase === 'connect' ? [1, 1.5, 1.2] : phase === 'swap' ? [1.2, 2, 0] : 1,
                opacity: phase === 'complete' ? 0 : 1,
              }}
              transition={{ duration: 0.4 }}
            />
          )}
        </div>

        {/* Profile Avatars */}
        <div className="relative flex items-center gap-4">
          {/* My Profile */}
          <motion.div
            className="relative"
            animate={{
              x: phase === 'approach' ? 20 : phase === 'swap' ? 80 : phase === 'complete' ? 60 : 0,
              scale: phase === 'connect' ? 1.1 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <motion.div
              className="absolute -inset-2 rounded-full bg-gradient-to-r from-primary to-primary/50"
              animate={{
                opacity: phase === 'connect' || phase === 'swap' ? [0.5, 1, 0.5] : 0,
              }}
              transition={{ duration: 0.3, repeat: Infinity }}
            />
            <Avatar className="w-20 h-20 border-4 border-background relative z-10">
              <AvatarImage src={myProfile.avatar_url || undefined} alt={myProfile.username} />
              <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
                {myProfile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </motion.div>

          {/* Center Connection Icon */}
          <motion.div
            className="relative z-20"
            animate={{
              scale: phase === 'connect' ? [1, 1.3, 1] : phase === 'swap' ? 0 : 1,
              rotate: phase === 'connect' ? [0, 180, 360] : 0,
            }}
            transition={{ duration: 0.4 }}
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center backdrop-blur-sm">
              <Zap className={`h-6 w-6 ${phase === 'connect' || phase === 'swap' ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            </div>
          </motion.div>

          {/* Their Profile */}
          <motion.div
            className="relative"
            animate={{
              x: phase === 'approach' ? -20 : phase === 'swap' ? -80 : phase === 'complete' ? -60 : 0,
              scale: phase === 'connect' ? 1.1 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <motion.div
              className="absolute -inset-2 rounded-full bg-gradient-to-l from-primary to-primary/50"
              animate={{
                opacity: phase === 'connect' || phase === 'swap' ? [0.5, 1, 0.5] : 0,
              }}
              transition={{ duration: 0.3, repeat: Infinity }}
            />
            <Avatar className="w-20 h-20 border-4 border-background relative z-10">
              <AvatarImage src={theirProfile.avatar_url || undefined} alt={theirProfile.username} />
              <AvatarFallback className="text-2xl font-bold bg-secondary text-secondary-foreground">
                {theirProfile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </motion.div>
        </div>

        {/* Status Text */}
        <motion.div
          className="absolute bottom-1/4 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.p 
            className="text-lg font-semibold text-foreground"
            key={phase}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {phase === 'approach' && 'Connecting...'}
            {phase === 'connect' && '⚡ Linked!'}
            {phase === 'swap' && '🔄 Swapping profiles...'}
            {phase === 'complete' && '✨ Friend added!'}
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
