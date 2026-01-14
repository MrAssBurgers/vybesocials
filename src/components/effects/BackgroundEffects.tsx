import { memo, useMemo } from 'react';

interface BackgroundEffectsProps {
  effect: 'none' | 'particles' | 'stars' | 'bubbles' | 'aurora' | 'rain' | 'snow' | 'fireflies' | 'geometric';
}

// CSS-only particles - no framer-motion for better performance
const ParticlesEffect = memo(() => {
  const particles = useMemo(() => 
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 10 + 15,
      delay: Math.random() * 5,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary/20 animate-pulse"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const StarsEffect = memo(() => {
  const stars = useMemo(() => 
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 2 + 1,
      delay: Math.random() * 3,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const BubblesEffect = memo(() => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
      <div className="absolute w-20 h-20 rounded-full border border-accent/30 bg-accent/5 animate-bounce" 
           style={{ left: '10%', bottom: '20%', animationDuration: '4s' }} />
      <div className="absolute w-12 h-12 rounded-full border border-accent/30 bg-accent/5 animate-bounce" 
           style={{ left: '30%', bottom: '40%', animationDuration: '3s', animationDelay: '1s' }} />
      <div className="absolute w-16 h-16 rounded-full border border-accent/30 bg-accent/5 animate-bounce" 
           style={{ left: '60%', bottom: '30%', animationDuration: '5s', animationDelay: '0.5s' }} />
      <div className="absolute w-10 h-10 rounded-full border border-accent/30 bg-accent/5 animate-bounce" 
           style={{ left: '80%', bottom: '50%', animationDuration: '3.5s', animationDelay: '2s' }} />
    </div>
  );
});

const AuroraEffect = memo(() => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(45deg, hsl(var(--primary) / 0.3), hsl(var(--accent) / 0.3), hsl(var(--primary) / 0.3))',
          backgroundSize: '400% 400%',
          animation: 'aurora 15s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes aurora {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
});

const RainEffect = memo(() => {
  const drops = useMemo(() => 
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      duration: Math.random() * 0.5 + 0.3,
      delay: Math.random() * 2,
      height: Math.random() * 20 + 10,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes rain {
          0% { transform: translateY(-30px); opacity: 0.4; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
      {drops.map((d) => (
        <div
          key={d.id}
          className="absolute w-px bg-gradient-to-b from-accent/40 to-transparent"
          style={{
            left: `${d.x}%`,
            top: -30,
            height: d.height,
            animation: `rain ${d.duration}s linear infinite`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const SnowEffect = memo(() => {
  const flakes = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: Math.random() * 6 + 2,
      duration: Math.random() * 5 + 8,
      delay: Math.random() * 5,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes snow {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 0.8; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {flakes.map((f) => (
        <div
          key={f.id}
          className="absolute rounded-full bg-white/80"
          style={{
            left: `${f.x}%`,
            top: -20,
            width: f.size,
            height: f.size,
            animation: `snow ${f.duration}s linear infinite`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const FirefliesEffect = memo(() => {
  const fireflies = useMemo(() => 
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 3,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 2,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {fireflies.map((f) => (
        <div
          key={f.id}
          className="absolute rounded-full animate-pulse"
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: f.size,
            height: f.size,
            background: 'radial-gradient(circle, hsl(50 100% 70%) 0%, transparent 70%)',
            boxShadow: '0 0 10px hsl(50 100% 60%)',
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const GeometricEffect = memo(() => {
  const shapes = useMemo(() => 
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 60 + 20,
      rotation: Math.random() * 360,
      type: ['square', 'circle'][i % 2] as 'square' | 'circle',
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {shapes.map((s) => (
        <div
          key={s.id}
          className={`absolute border border-primary/10 animate-spin ${
            s.type === 'circle' ? 'rounded-full' : 'rounded-lg'
          }`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDuration: '30s',
            opacity: 0.15,
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
    <div className="fixed inset-0 z-0 pointer-events-none will-change-auto">
      <EffectComponent />
    </div>
  );
});

export default BackgroundEffects;
