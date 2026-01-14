import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Calendar, X, Shield, Users } from 'lucide-react';
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

  const menuItems = [
    { 
      path: '/market', 
      icon: ShoppingBag, 
      label: 'Marketplace', 
      description: 'Buy & sell with friends',
      gradient: 'gradient-animated'
    },
    { 
      path: '/events', 
      icon: Calendar, 
      label: 'Community Events', 
      description: "Discover what's happening",
      gradient: 'bg-gradient-to-br from-violet-500 to-purple-600'
    },
    { 
      path: '/community', 
      icon: Users, 
      label: 'Communities', 
      description: 'Discord-style servers',
      gradient: 'bg-gradient-to-br from-indigo-500 to-blue-600'
    },
  ];

  const adminItem = {
    path: '/admin',
    icon: Shield,
    label: 'Admin Panel',
    description: 'Manage & moderate',
    gradient: 'bg-gradient-to-br from-red-500 to-rose-600'
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
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ 
              type: 'spring', 
              stiffness: 300, 
              damping: 25,
              mass: 0.8
            }}
            className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none"
          >
            <motion.div 
              className="liquid-glass overflow-hidden rounded-3xl w-[90vw] max-w-sm pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* Header */}
              <div className="p-4 text-center border-b border-white/10">
                <h2 className="text-xl font-bold gradient-text">VYBE Hub</h2>
                <p className="text-sm text-muted-foreground">Quick access</p>
              </div>

              {/* Menu Items */}
              <motion.div 
                className="p-4 space-y-3"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: 0.04,
                      delayChildren: 0.05
                    }
                  }
                }}
              >
                {menuItems.map((item) => (
                  <motion.button
                    key={item.path}
                    variants={{
                      hidden: { opacity: 0, y: 12, scale: 0.95 },
                      visible: { 
                        opacity: 1, 
                        y: 0, 
                        scale: 1,
                        transition: {
                          type: 'spring',
                          stiffness: 400,
                          damping: 25
                        }
                      }
                    }}
                    onClick={() => handleNavigate(item.path)}
                    className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                  >
                    <div className={`w-12 h-12 rounded-xl ${item.gradient} flex items-center justify-center`}>
                      <item.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-lg">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </motion.button>
                ))}

                {/* Admin Panel - Only visible to admins/mods */}
                {isModOrAdmin && (
                  <motion.button
                    variants={{
                      hidden: { opacity: 0, y: 12, scale: 0.95 },
                      visible: { 
                        opacity: 1, 
                        y: 0, 
                        scale: 1,
                        transition: {
                          type: 'spring',
                          stiffness: 400,
                          damping: 25
                        }
                      }
                    }}
                    onClick={() => handleNavigate(adminItem.path)}
                    className="w-full p-4 rounded-2xl liquid-glass-button flex items-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                  >
                    <div className={`w-12 h-12 rounded-xl ${adminItem.gradient} flex items-center justify-center`}>
                      <adminItem.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold text-lg">{adminItem.label}</p>
                      <p className="text-sm text-muted-foreground">{adminItem.description}</p>
                    </div>
                  </motion.button>
                )}
              </motion.div>

              {/* Close Button */}
              <div className="p-4 border-t border-white/10">
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.2 }}
                  onClick={onClose}
                  className="w-full p-3 rounded-2xl liquid-glass-subtle text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Close
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
