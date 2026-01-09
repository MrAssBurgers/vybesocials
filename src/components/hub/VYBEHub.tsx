import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Calendar, Shield, X } from 'lucide-react';
import { useUserRole } from '@/hooks/useModeration';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';

interface VYBEHubProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VYBEHub({ isOpen, onClose }: VYBEHubProps) {
  const navigate = useNavigate();
  const { data: userRole } = useUserRole();
  
  const isAdminOrMod = userRole === 'admin' || userRole === 'moderator';

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    playSound('tap');
    onClose();
    navigate(path);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Hub Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="liquid-glass rounded-3xl overflow-hidden">
              {/* Header */}
              <div className="p-4 text-center border-b border-white/10">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring' }}
                >
                  <h2 className="text-xl font-bold gradient-text">VYBE Hub</h2>
                  <p className="text-sm text-muted-foreground">Quick access</p>
                </motion.div>
              </div>

              {/* Menu Items */}
              <div className="p-4 space-y-3">
                {/* Market */}
                <motion.button
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  onClick={() => handleNavigate('/market')}
                  className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] transition-transform"
                >
                  <div className="w-12 h-12 rounded-xl gradient-animated flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-lg">Market</p>
                    <p className="text-sm text-muted-foreground">Buy & sell with friends</p>
                  </div>
                </motion.button>

                {/* Events */}
                <motion.button
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  onClick={() => handleNavigate('/events')}
                  className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] transition-transform"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-lg">Events</p>
                    <p className="text-sm text-muted-foreground">Discover what's happening</p>
                  </div>
                </motion.button>

                {/* Admin Panel - Only for admins/mods */}
                {isAdminOrMod && (
                  <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 }}
                    onClick={() => handleNavigate('/admin')}
                    className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] transition-transform border border-yellow-500/30"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
                      <Shield className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-lg">Admin Panel</p>
                      <p className="text-sm text-muted-foreground">Moderation tools</p>
                    </div>
                  </motion.button>
                )}
              </div>

              {/* Close Button */}
              <div className="p-4 border-t border-white/10">
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  onClick={onClose}
                  className="w-full p-3 rounded-2xl liquid-glass-subtle text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Close
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook to detect double-tap anywhere
export function useVYBEHub() {
  const [isOpen, setIsOpen] = useState(false);
  const lastTapTime = useRef(0);

  const handleDoubleTap = useCallback((e: TouchEvent | MouseEvent) => {
    // Only trigger on double-tap, not on interactive elements
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, video, [role="button"]');
    if (isInteractive) return;

    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      triggerHaptic('medium');
      playSound('pop');
      setIsOpen(true);
    }
    lastTapTime.current = now;
  }, []);

  useEffect(() => {
    // Touch support
    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        handleDoubleTap(e);
      }
    };

    // Mouse support for desktop
    const handleClick = (e: MouseEvent) => {
      handleDoubleTap(e);
    };

    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('click', handleClick);
    };
  }, [handleDoubleTap]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}
