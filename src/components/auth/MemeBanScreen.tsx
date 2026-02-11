import { motion } from 'framer-motion';
import { useMemeBanBackgrounds } from '@/hooks/useMemeBanBackgrounds';
import { useMemo } from 'react';

interface MemeBanScreenProps {
  reason?: string;
  expiresAt?: string | null;
  customGifUrl?: string | null;
}

// Fallback GIF URL
const FALLBACK_GIF_URL = 'https://media1.tenor.com/m/jUMex_rdqPwAAAAC/among-us-twerk.gif';

export const MemeBanScreen = ({ reason, expiresAt, customGifUrl }: MemeBanScreenProps) => {
  const { data: backgrounds } = useMemeBanBackgrounds();
  const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleString() : null;

  // Use custom GIF if provided, otherwise pick a random background
  const backgroundUrl = useMemo(() => {
    // If a custom GIF was set for this ban, use it
    if (customGifUrl) {
      return customGifUrl;
    }
    
    // Otherwise pick a random one from the library
    if (!backgrounds || backgrounds.length === 0) {
      return FALLBACK_GIF_URL;
    }
    const randomIndex = Math.floor(Math.random() * backgrounds.length);
    return backgrounds[randomIndex].gif_url;
  }, [backgrounds, customGifUrl]);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-black" style={{ width: '100vw', height: '100dvh' }}>
      {/* Fullscreen GIF background - stretched to fill entire viewport */}
      <img
        src={backgroundUrl}
        alt=""
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: 'cover', objectPosition: 'center', width: '100vw', height: '100dvh' }}
        draggable={false}
      />

      {/* Slight overlay for text readability */}
      <div className="absolute inset-0 bg-black/30" style={{ width: '100vw', height: '100dvh' }} />

      <div className="relative z-10 flex min-h-full items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-full max-w-2xl text-center"
        >
          <motion.div
            animate={{ rotate: [0, -2, 2, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="inline-block"
          >
            <motion.h1
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.4, repeat: Infinity, repeatType: 'mirror' }}
              className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-white"
              style={{
                textShadow: '4px 4px 0 #ff0000, -2px -2px 0 #00ff00, 0 0 40px rgba(255,255,0,0.8)',
                fontFamily: 'Impact, sans-serif',
              }}
            >
              HAHA YOUR BANNED
            </motion.h1>
          </motion.div>

          <motion.div
            className="mt-6 text-8xl"
            animate={{ y: [0, -15, 0], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            😂
          </motion.div>

          {reason && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 rounded-2xl border-2 border-yellow-400 bg-black/60 backdrop-blur-sm px-6 py-4 text-left inline-block"
            >
              <p className="text-lg font-bold text-yellow-400">Reason:</p>
              <p className="mt-1 text-white break-words">{reason}</p>
            </motion.div>
          )}

          {expiresLabel && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-4 text-white/80 text-sm bg-black/50 inline-block px-4 py-2 rounded-full"
            >
              Come back on: <span className="font-bold text-yellow-300">{expiresLabel}</span>
            </motion.p>
          )}
        </motion.div>
      </div>
    </div>
  );
};
