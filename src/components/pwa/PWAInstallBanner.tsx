import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePWAInstallPrompt } from '@/hooks/usePWAInstallPrompt';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const PWAInstallBanner = memo(function PWAInstallBanner() {
  const { showPrompt, install, dismiss } = usePWAInstallPrompt();

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm"
        >
          <div className="liquid-glass-card p-4 rounded-2xl shadow-xl border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <VybeMiniIcon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground">Add VYBE to Home Screen</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Get the full app experience with instant access</p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={install} className="rounded-full h-8 px-4 gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" />
                    Install
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismiss} className="rounded-full h-8 px-3 text-xs text-muted-foreground">
                    Not now
                  </Button>
                </div>
              </div>
              <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
