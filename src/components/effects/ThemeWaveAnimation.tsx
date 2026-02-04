import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

interface ThemeWaveAnimationProps {
  isActive: boolean;
  primaryColor?: string;
  accentColor?: string;
  onComplete?: () => void;
}

/**
 * Cool wave animation that starts from a random corner
 * and fills the screen with the new theme colors
 */
export function ThemeWaveAnimation({
  isActive,
  primaryColor = '280 70% 50%',
  accentColor = '330 80% 60%',
  onComplete,
}: ThemeWaveAnimationProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  // Pick a random corner when animation starts
  const corner = useMemo(() => {
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
    return corners[Math.floor(Math.random() * corners.length)];
  }, [isActive]);

  // Get origin position based on corner
  const getOrigin = () => {
    switch (corner) {
      case 'top-left':
        return { x: '-50%', y: '-50%', originX: '0%', originY: '0%' };
      case 'top-right':
        return { x: '150%', y: '-50%', originX: '100%', originY: '0%' };
      case 'bottom-left':
        return { x: '-50%', y: '150%', originX: '0%', originY: '100%' };
      case 'bottom-right':
        return { x: '150%', y: '150%', originX: '100%', originY: '100%' };
    }
  };

  const origin = getOrigin();

  useEffect(() => {
    if (isActive) {
      setShowSuccess(false);
      const successTimer = setTimeout(() => {
        setShowSuccess(true);
      }, 800);
      
      const completeTimer = setTimeout(() => {
        onComplete?.();
      }, 2000);

      return () => {
        clearTimeout(successTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [isActive, onComplete]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Wave 1 - Primary color */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: origin.originX,
              top: origin.originY,
              background: `radial-gradient(circle, hsl(${primaryColor}) 0%, hsl(${primaryColor} / 0.8) 50%, transparent 70%)`,
              width: '300vmax',
              height: '300vmax',
              transform: `translate(${origin.x}, ${origin.y})`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.5], 
              opacity: [0, 0.9, 0.8, 0],
            }}
            transition={{
              duration: 1.2,
              ease: [0.16, 1, 0.3, 1],
              times: [0, 0.3, 0.7, 1],
            }}
          />

          {/* Wave 2 - Accent color (delayed) */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: origin.originX,
              top: origin.originY,
              background: `radial-gradient(circle, hsl(${accentColor}) 0%, hsl(${accentColor} / 0.6) 40%, transparent 60%)`,
              width: '300vmax',
              height: '300vmax',
              transform: `translate(${origin.x}, ${origin.y})`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.5], 
              opacity: [0, 0.7, 0.5, 0],
            }}
            transition={{
              duration: 1.3,
              delay: 0.15,
              ease: [0.16, 1, 0.3, 1],
              times: [0, 0.3, 0.7, 1],
            }}
          />

          {/* Wave 3 - White flash */}
          <motion.div
            className="absolute rounded-full"
            style={{
              left: origin.originX,
              top: origin.originY,
              background: 'radial-gradient(circle, white 0%, white 30%, transparent 50%)',
              width: '300vmax',
              height: '300vmax',
              transform: `translate(${origin.x}, ${origin.y})`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.5], 
              opacity: [0, 0.3, 0],
            }}
            transition={{
              duration: 0.8,
              delay: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
          />

          {/* Particles */}
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 rounded-full"
              style={{
                left: '50%',
                top: '50%',
                background: i % 2 === 0 
                  ? `hsl(${primaryColor})` 
                  : `hsl(${accentColor})`,
                boxShadow: `0 0 10px hsl(${i % 2 === 0 ? primaryColor : accentColor})`,
              }}
              initial={{ 
                scale: 0, 
                x: 0, 
                y: 0,
                opacity: 0,
              }}
              animate={{ 
                scale: [0, 1.5, 0],
                x: Math.cos((i * 30 * Math.PI) / 180) * 200,
                y: Math.sin((i * 30 * Math.PI) / 180) * 200,
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 1,
                delay: 0.5 + i * 0.03,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* Success Message */}
          <AnimatePresence>
            {showSuccess && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <motion.div
                  className="flex flex-col items-center gap-4 p-8 rounded-3xl"
                  style={{
                    background: `linear-gradient(135deg, hsl(${primaryColor} / 0.2), hsl(${accentColor} / 0.2))`,
                    backdropFilter: 'blur(20px)',
                    border: `2px solid hsl(${primaryColor} / 0.5)`,
                  }}
                  initial={{ y: 20 }}
                  animate={{ y: 0 }}
                >
                  <motion.div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, hsl(${primaryColor}), hsl(${accentColor}))`,
                    }}
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: 2,
                    }}
                  >
                    <Check className="w-8 h-8 text-white" />
                  </motion.div>
                  <div className="text-center">
                    <motion.p 
                      className="text-xl font-bold"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      Theme Applied!
                    </motion.p>
                    <motion.p 
                      className="text-sm text-muted-foreground flex items-center gap-1 justify-center mt-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <VybeMiniIcon size={16} showSparkles />
                      Your VYBE is ready
                    </motion.p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
