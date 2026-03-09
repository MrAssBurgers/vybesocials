import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Dna } from 'lucide-react';
import type { VybeDNA } from '@/hooks/useVybeDNA';

/** Floating particle dot around the orb */
function Particle({ color, delay, radius, duration }: { color: string; delay: number; radius: number; duration: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: 4,
        height: 4,
        backgroundColor: color,
        boxShadow: `0 0 6px 2px ${color}`,
        top: '50%',
        left: '50%',
      }}
      animate={{
        x: [0, radius * Math.cos(delay * Math.PI), -radius * 0.7, radius * 0.5, 0],
        y: [0, -radius * Math.sin(delay * Math.PI), radius * 0.8, -radius * 0.4, 0],
        opacity: [0.3, 1, 0.6, 1, 0.3],
        scale: [0.8, 1.3, 0.9, 1.1, 0.8],
      }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay: delay * 0.5 }}
    />
  );
}

interface DNAOrbProps {
  dna: VybeDNA;
  size?: number;
}

export function DNAOrb({ dna, size = 280 }: DNAOrbProps) {
  const { signature_colors, glyph_pattern, aura_intensity } = dna;
  const c = signature_colors;

  // Generate stable particle configs
  const particles = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      color: c[i % c.length],
      delay: (i / 18) * Math.PI * 2,
      radius: 80 + (i % 3) * 30,
      duration: 6 + (i % 4) * 2,
    }));
  }, [c]);

  const innerSize = size * 0.62;
  const inset = (size - innerSize) / 2;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/* Outer glow pulse */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${c[0]}33 0%, transparent 70%)`,
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Orbital rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            inset: -8 - i * 14,
            border: `1.5px solid ${c[i]}`,
            opacity: 0.2 + i * 0.08,
          }}
          animate={{ rotate: [0, i % 2 === 0 ? 360 : -360] }}
          transition={{ duration: 18 + i * 8, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      {/* Floating particles */}
      {particles.map((p) => (
        <Particle key={p.id} {...p} />
      ))}

      {/* Inner orb */}
      <motion.div
        className="absolute rounded-full flex items-center justify-center overflow-hidden"
        style={{
          top: inset,
          left: inset,
          width: innerSize,
          height: innerSize,
          background: `conic-gradient(from 180deg, ${c[0]}, ${c[1]}, ${c[2]}, ${c[0]})`,
          boxShadow: `
            0 0 ${50 * aura_intensity}px ${c[0]}88,
            inset 0 0 ${30 * aura_intensity}px ${c[1]}44
          `,
        }}
        animate={{ scale: [1, 1.04, 1], rotate: [0, 360] }}
        transition={{
          scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          rotate: { duration: 30, repeat: Infinity, ease: 'linear' },
        }}
      >
        {/* Glass overlay */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.25) 0%, transparent 60%)`,
          }}
        />
        <Dna className="w-14 h-14 text-white drop-shadow-lg relative z-10" />
      </motion.div>

      {/* Pattern label */}
      <motion.div
        className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-card/80 backdrop-blur-sm border border-border/50"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <span className="text-xs text-muted-foreground">
          Pattern: <span className="font-semibold text-foreground capitalize">{glyph_pattern}</span>
        </span>
      </motion.div>
    </div>
  );
}
