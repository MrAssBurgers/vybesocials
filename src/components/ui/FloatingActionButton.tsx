import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Camera, Film, MessageCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { sounds } from '@/lib/sounds';
import { MOTION_CONFIG } from '@/lib/motion';

interface QuickAction {
  icon: typeof Plus;
  label: string;
  path: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: Camera, label: 'Post', path: '/upload?type=post', color: 'bg-pink-500' },
  { icon: Film, label: 'Clip', path: '/upload?type=clip', color: 'bg-purple-500' },
  { icon: Sparkles, label: 'Story', path: '/upload?type=story', color: 'bg-cyan-500' },
  { icon: MessageCircle, label: 'Message', path: '/messages/new', color: 'bg-yellow-500' },
];

interface FloatingActionButtonProps {
  className?: string;
}

export function FloatingActionButton({ className }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const toggleMenu = useCallback(() => {
    haptics.select();
    sounds.pop();
    setIsOpen((prev) => !prev);
  }, []);

  const handleAction = useCallback((path: string) => {
    haptics.tap();
    sounds.tap();
    setIsOpen(false);
    navigate(path);
  }, [navigate]);

  // Hide on scroll
  const [isVisible, setIsVisible] = useState(true);
  
  // Note: scroll hiding is handled via CSS class `.is-scrolling` from useScrollOptimization

  return (
    <div 
      className={cn(
        'fixed z-40 transition-opacity duration-300',
        'bottom-24 right-4 lg:bottom-8 lg:right-8',
        className
      )}
    >
      {/* Action buttons radial menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Actions */}
            {QUICK_ACTIONS.map((action, index) => {
              // Calculate position in arc
              const angle = -90 - (index * 30); // Start from top, spread 30 degrees each
              const radius = 80;
              const x = Math.cos((angle * Math.PI) / 180) * radius;
              const y = Math.sin((angle * Math.PI) / 180) * radius;

              return (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    x, 
                    y,
                    transition: {
                      delay: index * 0.05,
                      ...MOTION_CONFIG.spring.bouncy,
                    }
                  }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0, 
                    x: 0, 
                    y: 0,
                    transition: { duration: 0.15 }
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleAction(action.path)}
                  className={cn(
                    'absolute w-12 h-12 rounded-full flex items-center justify-center shadow-lg',
                    action.color,
                    'text-white'
                  )}
                  style={{ right: 6, bottom: 6 }}
                >
                  <action.icon className="w-5 h-5" />
                </motion.button>
              );
            })}

            {/* Labels */}
            {QUICK_ACTIONS.map((action, index) => {
              const angle = -90 - (index * 30);
              const radius = 130;
              const x = Math.cos((angle * Math.PI) / 180) * radius;
              const y = Math.sin((angle * Math.PI) / 180) * radius;

              return (
                <motion.span
                  key={`label-${action.label}`}
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: 1,
                    x,
                    y,
                    transition: { delay: index * 0.05 + 0.1 }
                  }}
                  exit={{ opacity: 0 }}
                  className="absolute text-xs font-medium text-foreground bg-background/80 px-2 py-1 rounded-full backdrop-blur-sm"
                  style={{ right: 6, bottom: 6 }}
                >
                  {action.label}
                </motion.span>
              );
            })}
          </>
        )}
      </AnimatePresence>

      {/* Main FAB button */}
      <motion.button
        onClick={toggleMenu}
        className={cn(
          'w-14 h-14 rounded-full shadow-xl flex items-center justify-center',
          'gradient-animated text-white',
          'hover:shadow-2xl transition-shadow'
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ rotate: isOpen ? 45 : 0 }}
        transition={MOTION_CONFIG.spring.snappy}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <Plus className="w-6 h-6" />
        )}
      </motion.button>
    </div>
  );
}
