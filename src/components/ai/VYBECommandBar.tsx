import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useFloatingControlVisibility } from '@/hooks/useFloatingControlVisibility';

/** Floating entry to unified VYBE AI agent (/VYBE-AI). */
export function VYBECommandBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const controlVisible = useFloatingControlVisibility();

  const handleOpen = useCallback(() => {
    haptics.tap();
    navigate('/VYBE-AI');
  }, [navigate]);

  if (location.pathname === '/VYBE-AI') return null;

  return (
    <AnimatePresence>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        onClick={handleOpen}
        className={cn(
          'fixed z-50 w-14 h-14 rounded-2xl shadow-lg',
          'bg-gradient-to-br from-primary via-accent to-primary',
          'flex items-center justify-center',
          'hover:scale-105 active:scale-95',
          'bottom-[calc(5rem+env(safe-area-inset-bottom)+12px)] right-4',
          'lg:bottom-8 lg:right-8',
          'duration-300 will-change-transform',
          controlVisible
            ? 'translate-y-0 opacity-100 pointer-events-auto transition-[transform,opacity] ease-out'
            : 'translate-y-28 opacity-0 pointer-events-none transition-[transform,opacity] ease-in',
        )}
        aria-label="Open VYBE AI"
        aria-hidden={!controlVisible}
      >
        <Sparkles className="h-6 w-6 text-white" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse border-2 border-background" />
      </motion.button>
    </AnimatePresence>
  );
}
