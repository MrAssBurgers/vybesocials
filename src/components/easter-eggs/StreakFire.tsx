import { motion } from 'framer-motion';

interface StreakFireProps {
  count: number;
  size?: 'sm' | 'md' | 'lg';
}

export function StreakFire({ count, size = 'md' }: StreakFireProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const intensity = Math.min(count / 30, 1); // Max intensity at 30 days
  
  return (
    <motion.div 
      className={`relative inline-flex items-center gap-1 ${sizeClasses[size]}`}
      animate={{
        scale: [1, 1.1, 1],
      }}
      transition={{
        duration: 0.5,
        repeat: Infinity,
        repeatDelay: 2,
      }}
    >
      <motion.span
        animate={{
          textShadow: [
            `0 0 ${10 * intensity}px rgba(255, 100, 0, 0.8)`,
            `0 0 ${20 * intensity}px rgba(255, 100, 0, 0.6)`,
            `0 0 ${10 * intensity}px rgba(255, 100, 0, 0.8)`,
          ],
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
        }}
      >
        🔥
      </motion.span>
      <span className="font-bold text-foreground">{count}</span>
      
      {/* Fire particles for high streaks */}
      {count >= 7 && (
        <div className="absolute -inset-2 pointer-events-none overflow-hidden">
          {[...Array(Math.min(count / 7, 5))].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-orange-500 rounded-full"
              initial={{ 
                x: '50%', 
                y: '50%', 
                opacity: 0.8,
                scale: 1,
              }}
              animate={{
                y: [0, -20],
                x: [0, (Math.random() - 0.5) * 20],
                opacity: [0.8, 0],
                scale: [1, 0],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.2,
              }}
              style={{
                left: `${40 + Math.random() * 20}%`,
                bottom: '30%',
              }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
