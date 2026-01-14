import { motion } from 'framer-motion';
import memeBanBg from '@/assets/meme-ban-bg.gif';

interface MemeBanScreenProps {
  reason?: string;
  expiresAt?: string | null;
}

export const MemeBanScreen = ({ reason, expiresAt }: MemeBanScreenProps) => {
  const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleString() : null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Fullscreen GIF background */}
      <img
        src={memeBanBg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Readability overlay */}
      <div className="absolute inset-0 bg-background/10 backdrop-brightness-50 backdrop-saturate-150" />

      <div className="relative z-10 flex min-h-full items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="w-full max-w-2xl text-center"
        >
          <motion.div
            animate={{ rotate: [0, -1.5, 1.5, 0] }}
            transition={{ duration: 0.45, repeat: Infinity }}
            className="inline-block rounded-3xl border border-border bg-background/40 px-6 py-6 backdrop-blur-md"
          >
            <motion.h1
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatType: 'mirror' }}
              className="text-4xl md:text-6xl font-black tracking-tight text-foreground drop-shadow-[0_0_24px_hsl(var(--primary)_/_0.55)]"
            >
              HAHA YOUR BANNED
            </motion.h1>

            <motion.div
              className="mt-4 text-7xl"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            >
              😂
            </motion.div>

            {reason && (
              <div className="mt-6 rounded-2xl border border-border bg-background/35 px-4 py-3 text-left">
                <p className="text-sm font-semibold text-foreground">Reason</p>
                <p className="mt-1 text-sm text-muted-foreground break-words">{reason}</p>
              </div>
            )}

            {expiresLabel && (
              <p className="mt-4 text-sm text-muted-foreground">
                Come back on: <span className="font-medium text-foreground">{expiresLabel}</span>
              </p>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};
