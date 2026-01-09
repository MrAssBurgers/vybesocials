import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Calendar, X, Shield } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserRole } from '@/hooks/useModeration';

interface VYBEHubProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VYBEHub({ isOpen, onClose }: VYBEHubProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: userRole } = useUserRole();
  const isModOrAdmin = userRole === 'admin' || userRole === 'moderator';

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    playSound('tap');
    onClose();
    navigate(path);
  };

  // Centered animation for all devices
  const animation = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
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
            {...animation}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="liquid-glass overflow-hidden rounded-3xl">
              
              {/* Header */}
              <div className="p-4 text-center border-b border-white/10">
                <motion.div
                  initial={{ scale: 0.9 }}
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
                  className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 rounded-xl gradient-animated flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-lg">Marketplace</p>
                    <p className="text-sm text-muted-foreground">Buy & sell with friends</p>
                  </div>
                </motion.button>

                {/* Events */}
                <motion.button
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  onClick={() => handleNavigate('/events')}
                  className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <Calendar className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-lg">Community Events</p>
                    <p className="text-sm text-muted-foreground">Discover what's happening</p>
                  </div>
                </motion.button>

                {/* Admin Panel - Only visible to admins/mods */}
                {isModOrAdmin && (
                  <motion.button
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 }}
                    onClick={() => handleNavigate('/admin')}
                    className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                      <Shield className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-lg">Admin Panel</p>
                      <p className="text-sm text-muted-foreground">Manage & moderate</p>
                    </div>
                  </motion.button>
                )}
              </div>

              {/* Close Button */}
              <div className="p-4 border-t border-white/10">
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
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
