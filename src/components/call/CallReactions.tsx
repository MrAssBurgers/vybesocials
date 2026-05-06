import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
}

const REACTIONS = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '👋', label: 'Wave' },
];

interface CallReactionsProps {
  onReaction?: (emoji: string) => void;
  /** A unique signal that increments each time a remote reaction arrives, paired with its emoji */
  incomingReaction?: { emoji: string; nonce: number } | null;
}

export function CallReactions({ onReaction, incomingReaction }: CallReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [incomingFloats, setIncomingFloats] = useState<FloatingEmoji[]>([]);

  const sendReaction = useCallback((emoji: string) => {
    triggerHaptic('light');
    onReaction?.(emoji);

    const id = Date.now() + Math.random();
    const x = Math.random() * 120 - 60;
    setFloatingEmojis(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2000);
    setIsOpen(false);
  }, [onReaction]);

  // Receive remote reactions in an effect (NEVER during render — that caused infinite loops)
  const lastNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!incomingReaction) return;
    if (lastNonceRef.current === incomingReaction.nonce) return;
    lastNonceRef.current = incomingReaction.nonce;
    const id = Date.now() + Math.random();
    const x = Math.random() * 80 - 40;
    setIncomingFloats(prev => [...prev, { id, emoji: incomingReaction.emoji, x }]);
    const t = setTimeout(() => setIncomingFloats(prev => prev.filter(e => e.id !== id)), 2000);
    return () => clearTimeout(t);
  }, [incomingReaction]);

  return (
    <div className="relative">
      {/* Floating emojis (sent) */}
      <div className="fixed bottom-40 left-1/2 -translate-x-1/2 pointer-events-none z-[100]">
        <AnimatePresence>
          {floatingEmojis.map(fe => (
            <motion.div
              key={fe.id}
              initial={{ y: 0, x: 0, opacity: 1, scale: 0.5 }}
              animate={{ y: -200, x: fe.x, opacity: 0, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute text-4xl"
            >
              {fe.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Floating emojis (incoming) */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-[100]">
        <AnimatePresence>
          {incomingFloats.map(fe => (
            <motion.div
              key={fe.id}
              initial={{ y: 0, x: 0, opacity: 1, scale: 0.5 }}
              animate={{ y: 80, x: fe.x, opacity: 0, scale: 2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute text-5xl"
            >
              {fe.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Reaction picker */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-2 rounded-2xl backdrop-blur-2xl bg-black/60 border border-white/10 shadow-2xl"
            data-no-auto-contrast
          >
            {REACTIONS.map(r => (
              <motion.button
                key={r.emoji}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.8 }}
                onClick={() => sendReaction(r.emoji)}
                className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors text-2xl"
                title={r.label}
              >
                {r.emoji}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => { triggerHaptic('light'); setIsOpen(!isOpen); }}
        className={cn(
          "h-11 w-11 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center transition-all duration-300",
          isOpen
            ? "bg-white/20 text-white ring-2 ring-primary/50"
            : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
        )}
      >
        <Smile className="h-5 w-5 sm:h-6 sm:w-6" />
      </motion.button>
    </div>
  );
}
