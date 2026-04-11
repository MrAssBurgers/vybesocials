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
          90deg,
          rgba(255, 0, 0, 0.1),
          rgba(255, 127, 0, 0.1),
          rgba(255, 255, 0, 0.1),
          rgba(0, 255, 0, 0.1),
          rgba(0, 0, 255, 0.1),
          rgba(143, 0, 255, 0.1),
          rgba(255, 0, 0, 0.1)
        )`,
        backgroundSize: '300% 100%',
        animation: 'rainbow-shift 3s linear infinite',
      }}
    >
      <style>{`
        @keyframes rainbow-shift {
          from { background-position: 0% 50%; }
          to { background-position: -100% 50%; }
        }
      `}</style>
    </motion.div>
  );
}
