import { motion } from 'framer-motion';
import memeBanBg from '@/assets/meme-ban-bg.png';

interface MemeBanScreenProps {
  reason?: string;
  expiresAt?: string | null;
}

export const MemeBanScreen = ({ reason, expiresAt }: MemeBanScreenProps) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${memeBanBg})` }}
      />
      
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/40" />
      
      {/* Animated laughing emojis */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-4xl"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 500),
              y: -50,
              rotate: 0,
            }}
            animate={{
              y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 100,
              rotate: 360,
            }}
            transition={{
              duration: 3 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: "linear",
            }}
          >
            {['😂', '🤣', '😹', '💀', '😆'][Math.floor(Math.random() * 5)]}
          </motion.div>
        ))}
      </div>
      
      {/* Main content */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 200, 
          damping: 15,
          delay: 0.2 
        }}
        className="relative text-center z-10 px-4"
      >
        <motion.h1
          animate={{ 
            scale: [1, 1.1, 1],
            textShadow: [
              "0 0 20px rgba(255,0,0,0.5)",
              "0 0 60px rgba(255,0,0,0.8)",
              "0 0 20px rgba(255,0,0,0.5)",
            ]
          }}
          transition={{ 
            duration: 1,
            repeat: Infinity,
            repeatType: "reverse"
          }}
          className="text-5xl md:text-7xl lg:text-8xl font-black text-white tracking-wider"
          style={{
            textShadow: '4px 4px 0 #ff0000, -4px -4px 0 #00ff00, 0 0 30px rgba(255,255,255,0.8)',
            fontFamily: 'Impact, sans-serif',
          }}
        >
          HAHAHA
        </motion.h1>
        
        <motion.h2
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-4xl md:text-6xl lg:text-7xl font-black text-yellow-300 mt-4"
          style={{
            textShadow: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 0 20px rgba(255,255,0,0.5)',
            fontFamily: 'Impact, sans-serif',
          }}
        >
          YOU'RE BANNED!
        </motion.h2>
        
        {/* Bouncing emoji */}
        <motion.div
          animate={{ 
            y: [0, -30, 0],
            rotate: [0, 15, -15, 0]
          }}
          transition={{ 
            duration: 0.8,
            repeat: Infinity,
            repeatType: "loop"
          }}
          className="text-8xl mt-8"
        >
          😂
        </motion.div>
        
        {reason && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8 bg-black/60 backdrop-blur-sm rounded-2xl p-4 max-w-md mx-auto border-2 border-yellow-400"
          >
            <p className="text-lg font-bold text-yellow-400">Reason:</p>
            <p className="text-white mt-1">{reason}</p>
          </motion.div>
        )}
        
        {expiresAt && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-4 text-white/80 text-sm bg-black/40 inline-block px-4 py-2 rounded-full"
          >
            Come back on: {new Date(expiresAt).toLocaleDateString()}
          </motion.p>
        )}
      </motion.div>
    </div>
  );
};