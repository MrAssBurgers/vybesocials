import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const showComplete = progress >= 100;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden"
        >
          {/* Animated background gradients */}
          <div className="absolute inset-0">
            <motion.div 
              className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10"
              animate={{ 
                background: [
                  'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
                  'radial-gradient(circle at 70% 70%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
                  'radial-gradient(circle at 30% 70%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
                  'radial-gradient(circle at 30% 30%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
                ]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Floating particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-primary/20"
                style={{
                  left: `${15 + i * 15}%`,
                  top: `${20 + (i % 3) * 25}%`,
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0.3, 0.7, 0.3],
                  scale: [1, 1.3, 1],
                }}
                transition={{
                  duration: 2 + i * 0.3,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
          
          {/* Logo container */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.6, 
              ease: [0.34, 1.56, 0.64, 1],
              delay: 0.1
            }}
            className="relative mb-10"
          >
            {/* Glow ring effect */}
            <motion.div
              className="absolute -inset-8 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            
            {/* Spinning ring */}
            <motion.div
              className="absolute -inset-4 rounded-full border-2 border-primary/20"
              style={{ borderTopColor: 'hsl(var(--primary))' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Logo icon */}
            <motion.div
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden flex items-center justify-center shadow-2xl"
              animate={showComplete ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {/* Animated gradient background */}
              <motion.div 
                className="absolute inset-0"
                animate={{
                  background: [
                    'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(225deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(315deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                    'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Glass overlay */}
              <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />
              
              {/* V Logo */}
              <svg viewBox="0 0 32 32" fill="none" className="relative z-10 w-12 h-12 sm:w-14 sm:h-14">
                <motion.path
                  d="M6 8L16 24L26 8"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                />
                <motion.path
                  d="M10 6C10 6 12 10 16 10C20 10 22 6 22 6"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.7 }}
                  transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
                />
                <motion.circle
                  cx="16"
                  cy="24"
                  r="2"
                  fill="white"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.9 }}
                />
              </svg>
              
              {/* Shine effect */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>
          </motion.div>

          {/* VYBE Text */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-3xl sm:text-4xl font-display font-black tracking-tight gradient-text mb-8"
          >
            VYBE
          </motion.h1>

          {/* Progress bar container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="w-56 sm:w-64"
          >
            {/* Progress bar background */}
            <div className="relative h-1.5 bg-muted/30 rounded-full overflow-hidden backdrop-blur-sm">
              {/* Animated background shimmer */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Progress fill */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                  backgroundSize: '200% 100%',
                }}
                animate={{ 
                  width: `${progress}%`,
                  backgroundPosition: ['0% 0%', '100% 0%'],
                }}
                transition={{ 
                  width: { duration: 0.3, ease: 'easeOut' },
                  backgroundPosition: { duration: 2, repeat: Infinity, ease: 'linear' }
                }}
              />
              
              {/* Glow at progress tip */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full blur-sm"
                style={{
                  left: `${progress}%`,
                  marginLeft: '-8px',
                  background: 'hsl(var(--primary))',
                  opacity: progress > 0 && progress < 100 ? 0.8 : 0,
                }}
              />
            </div>

            {/* Status text */}
            <motion.div
              className="flex justify-between items-center mt-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <motion.span 
                key={status}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-muted-foreground truncate max-w-[140px]"
              >
                {status}
              </motion.span>
              <motion.span
                className="text-sm font-medium tabular-nums"
                style={{ 
                  color: showComplete ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'
                }}
              >
                {Math.round(progress)}%
              </motion.span>
            </motion.div>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="absolute bottom-8 sm:bottom-12 text-xs text-muted-foreground"
          >
            The Next Generation Social Platform
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
