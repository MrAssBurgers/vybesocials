import { motion } from 'framer-motion';

export function RainbowOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 pointer-events-none z-[99]"
      style={{
        background: `linear-gradient(
          45deg,
          rgba(255, 0, 0, 0.1) 0%,
          rgba(255, 127, 0, 0.1) 14%,
          rgba(255, 255, 0, 0.1) 28%,
          rgba(0, 255, 0, 0.1) 42%,
          rgba(0, 0, 255, 0.1) 56%,
          rgba(75, 0, 130, 0.1) 70%,
          rgba(143, 0, 255, 0.1) 84%,
          rgba(255, 0, 0, 0.1) 100%
        )`,
        backgroundSize: '400% 400%',
        animation: 'rainbow-shift 2s linear infinite',
      }}
    >
      <style>{`
        @keyframes rainbow-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </motion.div>
  );
}
