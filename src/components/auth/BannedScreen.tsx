import { motion } from 'framer-motion';
import { Ban, AlertTriangle } from 'lucide-react';

interface BannedScreenProps {
  reason?: string;
  expiresAt?: string | null;
  isPermanent?: boolean;
}

export const BannedScreen = ({ reason, expiresAt, isPermanent }: BannedScreenProps) => {
  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-red-950 via-red-900 to-black flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="text-center max-w-md"
      >
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, -5, 5, 0]
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            repeatDelay: 3
          }}
          className="mb-8"
        >
          <Ban className="w-32 h-32 mx-auto text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]" />
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-6xl md:text-8xl font-black text-red-500 tracking-wider mb-4 drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]"
        >
          BANNED
        </motion.h1>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          <p className="text-xl text-red-200">
            Your account has been suspended from VYBE.
          </p>

          {reason && (
            <div className="bg-red-950/50 border border-red-800 rounded-lg p-4 mt-6">
              <div className="flex items-center gap-2 text-red-400 mb-2">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">Reason</span>
              </div>
              <p className="text-red-200 text-sm">{reason}</p>
            </div>
          )}

          {!isPermanent && expiresAt && (
            <p className="text-red-300 text-sm mt-4">
              Ban expires: {new Date(expiresAt).toLocaleDateString()}
            </p>
          )}

          {isPermanent && (
            <p className="text-red-400 font-semibold mt-4">
              This ban is permanent.
            </p>
          )}

          <p className="text-red-300/70 text-xs mt-8">
            If you believe this is an error, contact support.
          </p>
        </motion.div>
      </motion.div>

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-64 h-64 bg-red-600/10 rounded-full blur-3xl"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              x: [null, Math.random() * window.innerWidth],
              y: [null, Math.random() * window.innerHeight],
            }}
            transition={{
              duration: 20 + i * 5,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
        ))}
      </div>
    </div>
  );
};
