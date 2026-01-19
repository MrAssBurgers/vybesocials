import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { haptics } from '@/lib/haptics';
import { useEffect, useState, useCallback } from 'react';
import { Zap, Check } from 'lucide-react';

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
  onAutoAdd?: () => void;
}

export function NFCSwapAnimation({ 
  isActive, 
  myProfile, 
  theirProfile, 
  onComplete,
  onAutoAdd,
}: NFCSwapAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'appear' | 'shake' | 'lightning' | 'fly' | 'landed' | 'complete'>('idle');

  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      return;
    }

    // Epic animation sequence with haptics
    
    // Phase 1: Profiles pop up in center (0ms)
    setPhase('appear');
    haptics.impact();

    // Phase 2: Shake with vibration (400ms)
    const shakeTimer = setTimeout(() => {
      setPhase('shake');
      haptics.impact();
      // Continuous vibration effect
      const vibrateInterval = setInterval(() => haptics.tap(), 50);
      setTimeout(() => clearInterval(vibrateInterval), 600);
    }, 400);

    // Phase 3: Lightning strike (1000ms)
    const lightningTimer = setTimeout(() => {
      setPhase('lightning');
      haptics.success();
    }, 1000);

    // Phase 4: Fly and swap (1600ms)
    const flyTimer = setTimeout(() => {
      setPhase('fly');
      haptics.impact();
    }, 1600);

    // Phase 5: Landed on other side (2200ms)
    const landedTimer = setTimeout(() => {
      setPhase('landed');
      haptics.success();
      // Trigger auto-add
      onAutoAdd?.();
    }, 2200);

    // Phase 6: Complete (3000ms)
    const completeTimer = setTimeout(() => {
      setPhase('complete');
      haptics.success();
      onComplete?.();
    }, 3000);

    return () => {
      clearTimeout(shakeTimer);
      clearTimeout(lightningTimer);
      clearTimeout(flyTimer);
      clearTimeout(landedTimer);
      clearTimeout(completeTimer);
    };
  }, [isActive, onComplete, onAutoAdd]);

  if (!isActive || !myProfile || !theirProfile) return null;

  // Shake animation keyframes
  const shakeAnimation = {
    x: [0, -8, 8, -8, 8, -6, 6, -4, 4, 0],
    y: [0, -4, 4, -4, 4, -2, 2, -1, 1, 0],
    rotate: [0, -3, 3, -3, 3, -2, 2, -1, 1, 0],
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md"
      >
        {/* Lightning Background Flash */}
        {phase === 'lightning' && (
          <motion.div
            className="absolute inset-0 bg-primary/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0, 0.8, 0, 0.5, 0] }}
            transition={{ duration: 0.5 }}
          />
        )}

        {/* Electric Arc Lines */}
        {(phase === 'lightning' || phase === 'shake') && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={`arc-${i}`}
                className="absolute left-1/2 top-1/2"
                style={{
                  width: '3px',
                  height: `${80 + Math.random() * 120}px`,
                  background: `linear-gradient(to bottom, hsl(var(--primary)), hsl(var(--primary) / 0.5), transparent)`,
                  transformOrigin: 'top center',
                  filter: 'blur(1px)',
                  boxShadow: '0 0 10px hsl(var(--primary)), 0 0 20px hsl(var(--primary))',
                }}
                initial={{ 
                  opacity: 0, 
                  rotate: i * 45,
                  scale: 0,
                  x: '-50%',
                  y: '-50%',
                }}
                animate={{ 
                  opacity: [0, 1, 1, 0],
                  scale: [0.3, 1.2, 1, 0.5],
                  rotate: [i * 45, i * 45 + 15, i * 45 - 10, i * 45],
                }}
                transition={{
                  duration: 0.4,
                  repeat: phase === 'lightning' ? 2 : 1,
                  repeatType: 'reverse',
                  delay: i * 0.02,
                }}
              />
            ))}
            
            {/* Spark particles explosion */}
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={`spark-${i}`}
                className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
                style={{
                  background: i % 2 === 0 ? 'hsl(var(--primary))' : 'white',
                  boxShadow: '0 0 6px hsl(var(--primary))',
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: (Math.random() - 0.5) * 300,
                  y: (Math.random() - 0.5) * 300,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.02,
                  ease: 'easeOut',
                }}
              />
            ))}
          </div>
        )}

        {/* Central Glow Ring */}
        {phase !== 'idle' && phase !== 'complete' && (
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: '300px',
              height: '300px',
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, hsl(var(--primary) / 0.1) 50%, transparent 70%)',
            }}
            animate={{
              scale: phase === 'lightning' ? [1, 2, 1.5] : phase === 'fly' ? [1.5, 3, 0] : [1, 1.2, 1],
              opacity: phase === 'fly' || phase === 'landed' ? 0 : 1,
            }}
            transition={{ duration: 0.5 }}
          />
        )}

        {/* Profile Pictures Container */}
        <div className="relative flex items-center justify-center" style={{ width: '100%', height: '300px' }}>
          
          {/* MY Profile Picture */}
          <motion.div
            className="absolute z-20"
            initial={{ scale: 0, x: 0, y: 0 }}
            animate={{
              scale: phase === 'appear' ? [0, 1.2, 1] : 
                     phase === 'shake' ? 1 :
                     phase === 'lightning' ? 1.1 : 
                     phase === 'fly' ? 0.8 :
                     phase === 'landed' ? 1 :
                     phase === 'complete' ? 1 : 1,
              x: phase === 'appear' ? -60 : 
                 phase === 'shake' ? -60 :
                 phase === 'lightning' ? -60 :
                 phase === 'fly' ? 60 : // Fly to the other side
                 phase === 'landed' ? 60 :
                 phase === 'complete' ? 60 : -60,
              y: phase === 'fly' ? -150 : 0, // Arc upward during fly
              rotate: phase === 'fly' ? 360 : 0,
              ...(phase === 'shake' ? shakeAnimation : {}),
            }}
            transition={{
              duration: phase === 'shake' ? 0.5 : phase === 'fly' ? 0.6 : 0.4,
              type: phase === 'fly' ? 'spring' : 'tween',
              stiffness: 200,
              damping: 15,
            }}
          >
            {/* Glow ring around avatar */}
            <motion.div
              className="absolute -inset-3 rounded-full"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                filter: 'blur(8px)',
              }}
              animate={{
                opacity: phase === 'lightning' || phase === 'fly' ? [0.5, 1, 0.5] : 0.3,
                scale: phase === 'lightning' ? [1, 1.3, 1] : 1,
              }}
              transition={{ duration: 0.3, repeat: phase === 'lightning' ? 2 : 0 }}
            />
            <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-background relative z-10 shadow-2xl">
              <AvatarImage src={myProfile.avatar_url || undefined} alt={myProfile.username} />
              <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-primary to-accent text-white">
                {myProfile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            {/* Username label */}
            <motion.div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'landed' || phase === 'complete' ? 1 : 0 }}
            >
              <span className="text-xs font-medium text-primary bg-background/80 px-2 py-1 rounded-full">
                @{myProfile.username}
              </span>
            </motion.div>
          </motion.div>

          {/* THEIR Profile Picture */}
          <motion.div
            className="absolute z-20"
            initial={{ scale: 0, x: 0, y: 0 }}
            animate={{
              scale: phase === 'appear' ? [0, 1.2, 1] : 
                     phase === 'shake' ? 1 :
                     phase === 'lightning' ? 1.1 : 
                     phase === 'fly' ? 0.8 :
                     phase === 'landed' ? 1 :
                     phase === 'complete' ? 1 : 1,
              x: phase === 'appear' ? 60 : 
                 phase === 'shake' ? 60 :
                 phase === 'lightning' ? 60 :
                 phase === 'fly' ? -60 : // Fly to the other side
                 phase === 'landed' ? -60 :
                 phase === 'complete' ? -60 : 60,
              y: phase === 'fly' ? 150 : 0, // Arc downward during fly
              rotate: phase === 'fly' ? -360 : 0,
              ...(phase === 'shake' ? shakeAnimation : {}),
            }}
            transition={{
              duration: phase === 'shake' ? 0.5 : phase === 'fly' ? 0.6 : 0.4,
              type: phase === 'fly' ? 'spring' : 'tween',
              stiffness: 200,
              damping: 15,
              delay: phase === 'appear' ? 0.1 : 0,
            }}
          >
            {/* Glow ring around avatar */}
            <motion.div
              className="absolute -inset-3 rounded-full"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--accent)), hsl(var(--primary)))',
                filter: 'blur(8px)',
              }}
              animate={{
                opacity: phase === 'lightning' || phase === 'fly' ? [0.5, 1, 0.5] : 0.3,
                scale: phase === 'lightning' ? [1, 1.3, 1] : 1,
              }}
              transition={{ duration: 0.3, repeat: phase === 'lightning' ? 2 : 0 }}
            />
            <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-background relative z-10 shadow-2xl">
              <AvatarImage src={theirProfile.avatar_url || undefined} alt={theirProfile.username} />
              <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-accent to-primary text-white">
                {theirProfile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            {/* Username label */}
            <motion.div
              className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'landed' || phase === 'complete' ? 1 : 0 }}
            >
              <span className="text-xs font-medium text-accent bg-background/80 px-2 py-1 rounded-full">
                @{theirProfile.username}
              </span>
            </motion.div>
          </motion.div>

          {/* Center Lightning Bolt */}
          {(phase === 'shake' || phase === 'lightning') && (
            <motion.div
              className="absolute z-30"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ 
                scale: phase === 'lightning' ? [1, 1.5, 1] : 1, 
                opacity: 1,
                rotate: phase === 'lightning' ? [0, 10, -10, 0] : 0,
              }}
              exit={{ scale: 0, opacity: 0 }}
            >
              <div className="w-16 h-16 rounded-full bg-primary/30 backdrop-blur-sm flex items-center justify-center">
                <Zap 
                  className="h-8 w-8 text-primary drop-shadow-[0_0_10px_hsl(var(--primary))]" 
                  style={{ filter: 'drop-shadow(0 0 15px hsl(var(--primary)))' }}
                />
              </div>
            </motion.div>
          )}

          {/* Success Checkmark */}
          {(phase === 'landed' || phase === 'complete') && (
            <motion.div
              className="absolute z-30"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
            >
              <div className="w-16 h-16 rounded-full bg-green-500/20 backdrop-blur-sm flex items-center justify-center border-2 border-green-500">
                <Check className="h-8 w-8 text-green-500" />
              </div>
            </motion.div>
          )}
        </div>

        {/* Status Text */}
        <motion.div
          className="absolute bottom-1/4 text-center px-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.p 
            className="text-xl font-bold text-foreground"
            key={phase}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
          >
            {phase === 'appear' && '📱 Profiles Detected!'}
            {phase === 'shake' && '⚡ Connecting...'}
            {phase === 'lightning' && '🔥 LINKED!'}
            {phase === 'fly' && '🔄 Swapping...'}
            {phase === 'landed' && '✨ Friends Added!'}
            {phase === 'complete' && '🎉 You\'re now friends!'}
          </motion.p>
          
          {(phase === 'landed' || phase === 'complete') && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-sm text-muted-foreground mt-2"
            >
              You can now message each other
            </motion.p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}