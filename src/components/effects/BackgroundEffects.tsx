import { useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';

interface BackgroundEffectsProps {
  effect: 'none' | 'particles' | 'stars' | 'bubbles' | 'aurora' | 'rain' | 'snow' | 'fireflies' | 'geometric';
}

// Individual effect components
const ParticlesEffect = memo(() => {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 10 + 15,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/20"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -100, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
});

const StarsEffect = memo(() => {
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 2 + 1,
    delay: Math.random() * 3,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
          }}
          animate={{
            opacity: [0.2, 1, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
});

const BubblesEffect = memo(() => {
  const bubbles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: Math.random() * 20 + 10,
    duration: Math.random() * 10 + 10,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className="absolute rounded-full border border-accent/30 bg-accent/5"
          style={{
            left: `${b.x}%`,
            bottom: -50,
            width: b.size,
            height: b.size,
          }}
          animate={{
            y: [0, -window.innerHeight - 100],
            x: [0, Math.sin(b.id) * 50],
            opacity: [0.3, 0.6, 0],
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
});

const AuroraEffect = memo(() => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'linear-gradient(45deg, hsl(var(--primary) / 0.3), hsl(var(--accent) / 0.3), hsl(var(--primary) / 0.3))',
          backgroundSize: '400% 400%',
        }}
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(-45deg, hsl(var(--accent) / 0.4), transparent, hsl(var(--primary) / 0.4))',
          backgroundSize: '300% 300%',
        }}
        animate={{
          backgroundPosition: ['100% 0%', '0% 100%', '100% 0%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
});

const RainEffect = memo(() => {
  const drops = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    duration: Math.random() * 0.5 + 0.3,
    delay: Math.random() * 2,
    height: Math.random() * 20 + 10,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {drops.map((d) => (
        <motion.div
          key={d.id}
          className="absolute w-px bg-gradient-to-b from-accent/40 to-transparent"
          style={{
            left: `${d.x}%`,
            top: -30,
            height: d.height,
          }}
          animate={{
            y: [0, window.innerHeight + 50],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
});

const SnowEffect = memo(() => {
  const flakes = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    size: Math.random() * 6 + 2,
    duration: Math.random() * 5 + 8,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {flakes.map((f) => (
        <motion.div
          key={f.id}
          className="absolute rounded-full bg-white/80"
          style={{
            left: `${f.x}%`,
            top: -20,
            width: f.size,
            height: f.size,
          }}
          animate={{
            y: [0, window.innerHeight + 50],
            x: [0, Math.sin(f.id) * 100, 0],
            rotate: [0, 360],
          }}
          transition={{
            duration: f.duration,
            delay: f.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
});

const FirefliesEffect = memo(() => {
  const fireflies = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 3,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {fireflies.map((f) => (
        <motion.div
          key={f.id}
          className="absolute rounded-full"
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: f.size,
            height: f.size,
            background: 'radial-gradient(circle, hsl(50 100% 70%) 0%, transparent 70%)',
            boxShadow: '0 0 10px hsl(50 100% 60%), 0 0 20px hsl(50 100% 50%)',
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0.8, 1.2, 0.8],
            x: [0, Math.random() * 40 - 20, 0],
            y: [0, Math.random() * 40 - 20, 0],
          }}
          transition={{
            duration: f.duration,
            delay: f.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
});

const GeometricEffect = memo(() => {
  const shapes = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 60 + 20,
    rotation: Math.random() * 360,
    duration: Math.random() * 20 + 20,
    delay: Math.random() * 5,
    type: ['square', 'triangle', 'circle'][Math.floor(Math.random() * 3)] as 'square' | 'triangle' | 'circle',
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {shapes.map((s) => (
        <motion.div
          key={s.id}
          className={`absolute border border-primary/20 ${
            s.type === 'circle' ? 'rounded-full' : s.type === 'triangle' ? '' : 'rounded-lg'
          }`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            clipPath: s.type === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
          }}
          animate={{
            rotate: [s.rotation, s.rotation + 360],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
});

export const BackgroundEffects = memo(function BackgroundEffects({ effect }: BackgroundEffectsProps) {
  if (effect === 'none') return null;

  const EffectComponent = {
    particles: ParticlesEffect,
    stars: StarsEffect,
    bubbles: BubblesEffect,
    aurora: AuroraEffect,
    rain: RainEffect,
    snow: SnowEffect,
    fireflies: FirefliesEffect,
    geometric: GeometricEffect,
  }[effect];

  if (!EffectComponent) return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <EffectComponent />
    </div>
  );
});

export default BackgroundEffects;
