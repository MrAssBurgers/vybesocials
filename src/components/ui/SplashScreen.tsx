import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VYBELogo } from './VYBELogo';

interface SplashScreenProps {
  isVisible: boolean;
}

export const SplashScreen = memo(function SplashScreen({ isVisible }: SplashScreenProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
          style={{ willChange: 'opacity' }}
        >
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
          
          {/* Animated logo - faster animation */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.05, opacity: 0 }}
            transition={{ 
              duration: 0.25, 
              ease: 'easeOut'
            }}
            className="relative"
            style={{ willChange: 'transform, opacity' }}
          >
            <VYBELogo size="xl" animated={false} />
            
            {/* Simplified glow effect - no infinite animation for performance */}
            <div className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-3xl" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
