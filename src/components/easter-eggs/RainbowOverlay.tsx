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
          rgba(255, 0, 0, 0.1) 0%,
          rgba(255, 127, 0, 0.1) 10%,
          rgba(255, 255, 0, 0.1) 20%,
          rgba(0, 255, 0, 0.1) 30%,
          rgba(0, 0, 255, 0.1) 40%,
          rgba(143, 0, 255, 0.1) 50%,
          rgba(255, 0, 0, 0.1) 60%,
          rgba(255, 127, 0, 0.1) 70%,
          rgba(255, 255, 0, 0.1) 80%,
          rgba(0, 255, 0, 0.1) 90%,
          rgba(0, 0, 255, 0.1) 100%
        )`,
        backgroundSize: '200% 100%',
        animation: 'rainbow-shift 2.8s linear infinite',
      }}
    >
      <style>{`
        @keyframes rainbow-shift {
          from { background-position: 0% 50%; }
          to { background-position: 100% 50%; }
        }
      `}</style>
    </motion.div>
  );
}
