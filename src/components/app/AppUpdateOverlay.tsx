import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Sparkles, Zap } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

/**
 * Detects Vite HMR / service worker updates and shows a premium loading overlay.
 * Also exposed as a manual trigger via window.dispatchEvent(new Event('vybe-app-update')).
 */
export const AppUpdateOverlay = memo(function AppUpdateOverlay() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Checking for updates...');

  useEffect(() => {
    // Listen for service-worker update events
    const handleSWUpdate = () => triggerUpdate();

    // Listen for custom vybe update event
    const handleVybeUpdate = () => triggerUpdate();

    // Listen for Vite HMR connection events (reconnection = new build)
    const handleViteReconnect = () => {
      // Small delay so the new modules can load
      setTimeout(() => triggerUpdate(), 200);
    };

    navigator.serviceWorker?.addEventListener('controllerchange', handleSWUpdate);
    window.addEventListener('vybe-app-update', handleVybeUpdate);

    // Check for updates via Vite's import.meta.hot
    if (import.meta.hot) {
      import.meta.hot.on('vite:beforeFullReload', () => {
        triggerUpdate();
      });
    }

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleSWUpdate);
      window.removeEventListener('vybe-app-update', handleVybeUpdate);
    };
  }, []);

  const triggerUpdate = () => {
    setIsUpdating(true);
    setProgress(0);
    setStatusText('Preparing update...');

    const steps = [
      { at: 15, text: 'Downloading latest version...' },
      { at: 40, text: 'Applying changes...' },
      { at: 65, text: 'Optimizing experience...' },
      { at: 85, text: 'Almost there...' },
      { at: 100, text: 'Done! ✨' },
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        setProgress(steps[stepIndex].at);
        setStatusText(steps[stepIndex].text);
        stepIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsUpdating(false);
          setProgress(0);
        }, 600);
      }
    }, 400);
  };

  return (
    <AnimatePresence>
      {isUpdating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--background))' }}
        >
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-primary/30"
                initial={{
                  x: `${20 + Math.random() * 60}%`,
                  y: '110%',
                  scale: 0.5 + Math.random(),
                }}
                animate={{
                  y: '-10%',
                  opacity: [0, 0.8, 0],
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: 'linear',
                }}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-6 px-8">
            {/* Animated logo */}
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative"
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/30">
                <VybeMiniIcon size={36} showSparkles animated />
              </div>
              
              {/* Orbiting sparkle */}
              <motion.div
                className="absolute -top-1 -right-1"
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                style={{ transformOrigin: '50% 150%' }}
              >
                <Sparkles className="w-4 h-4 text-accent" />
              </motion.div>
            </motion.div>

            {/* Status text */}
            <div className="text-center space-y-2">
              <motion.h2
                key={statusText}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg font-bold text-foreground"
              >
                Updating VYBE
              </motion.h2>
              <motion.p
                key={statusText + '-sub'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-muted-foreground"
              >
                {statusText}
              </motion.p>
            </div>

            {/* Progress bar */}
            <div className="w-56 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            {/* Subtle hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 1 }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Zap className="w-3 h-3" />
              <span>This won't take long</span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
