import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export const AppUpdateOverlay = memo(function AppUpdateOverlay() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Checking for updates...');

  useEffect(() => {
    const handleSWUpdate = () => triggerUpdate();
    const handleVybeUpdate = () => triggerUpdate();

    navigator.serviceWorker?.addEventListener('controllerchange', handleSWUpdate);
    window.addEventListener('vybe-app-update', handleVybeUpdate);

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
      { at: 100, text: 'Ready!' },
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

  const isComplete = progress >= 100;

  return (
    <AnimatePresence>
      {isUpdating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
        >
          {/* Subtle radial glow — single, centered, low opacity */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-20"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)',
                filter: 'blur(80px)',
              }}
            />
          </div>

          <div className="relative flex flex-col items-center gap-8 px-8">
            {/* Logo mark */}
            <motion.div
              animate={isComplete ? { scale: [1, 1.1, 1] } : { scale: [1, 1.04, 1] }}
              transition={{ duration: isComplete ? 0.4 : 2.5, repeat: isComplete ? 0 : Infinity, ease: 'easeInOut' }}
            >
              <div className="w-20 h-20 rounded-[22px] bg-primary flex items-center justify-center shadow-lg">
                <span className="text-3xl font-black text-primary-foreground tracking-tighter select-none">V</span>
              </div>
            </motion.div>

            {/* Text */}
            <div className="text-center space-y-1.5">
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                Updating VYBE
              </h2>
              <AnimatePresence mode="wait">
                <motion.p
                  key={statusText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-muted-foreground"
                >
                  {statusText}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Progress bar */}
            <div className="w-52 space-y-2">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <p className="text-xs text-center tabular-nums text-muted-foreground">
                {progress}%
              </p>
            </div>

            {/* Bottom hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ delay: 1.2 }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <Sparkles className="w-3 h-3" />
              <span>This won't take long</span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
