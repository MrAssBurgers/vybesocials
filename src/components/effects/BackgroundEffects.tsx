import { memo, useMemo } from 'react';

interface BackgroundEffectsProps {
  effect: 'none' | 'particles' | 'stars' | 'bubbles' | 'aurora' | 'rain' | 'snow' | 'fireflies' | 'geometric';
}

const ParticlesEffect = memo(() => {
  const particles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 6 + 3,
      duration: Math.random() * 8 + 6,
      delay: Math.random() * 4,
      hue: Math.floor(Math.random() * 360),
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes particle-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
          25% { transform: translateY(-30px) scale(1.3); opacity: 1; }
          50% { transform: translateY(-15px) scale(0.8); opacity: 0.8; }
          75% { transform: translateY(-40px) scale(1.1); opacity: 0.9; }
        }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle, hsl(${p.hue} 90% 65%) 0%, hsl(${(p.hue + 60) % 360} 80% 50%) 100%)`,
            boxShadow: `0 0 ${p.size * 2}px hsl(${p.hue} 90% 60% / 0.6)`,
            animation: `particle-float ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const StarsEffect = memo(() => {
  const stars = useMemo(() => 
    Array.from({ length: 35 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1.5,
      duration: Math.random() * 1.5 + 0.8,
      delay: Math.random() * 3,
      color: ['#fff', '#a5f3fc', '#c4b5fd', '#fde68a', '#fca5a5'][i % 5],
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.4); }
        }
      `}</style>
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: s.color,
            boxShadow: `0 0 ${s.size * 3}px ${s.color}`,
            animation: `star-twinkle ${s.duration}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const BubblesEffect = memo(() => {
  const bubbles = useMemo(() =>
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      x: Math.random() * 90 + 5,
      size: Math.random() * 40 + 15,
      duration: Math.random() * 6 + 5,
      delay: Math.random() * 4,
      hue: [280, 200, 320, 160, 40][i % 5],
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes bubble-rise {
          0% { transform: translateY(100%) scale(0.6); opacity: 0; }
          20% { opacity: 0.7; }
          80% { opacity: 0.5; }
          100% { transform: translateY(-120%) scale(1.2); opacity: 0; }
        }
      `}</style>
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="absolute rounded-full"
          style={{
            left: `${b.x}%`,
            bottom: 0,
            width: b.size,
            height: b.size,
            border: `2px solid hsl(${b.hue} 80% 70% / 0.5)`,
            background: `radial-gradient(circle at 30% 30%, hsl(${b.hue} 80% 80% / 0.3), transparent)`,
            boxShadow: `inset 0 0 10px hsl(${b.hue} 70% 60% / 0.2), 0 0 15px hsl(${b.hue} 70% 60% / 0.15)`,
            animation: `bubble-rise ${b.duration}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const AuroraEffect = memo(() => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes aurora-sweep {
          0% { background-position: 0% 50%; filter: hue-rotate(0deg); }
          33% { background-position: 50% 100%; filter: hue-rotate(30deg); }
          66% { background-position: 100% 50%; filter: hue-rotate(-20deg); }
          100% { background-position: 0% 50%; filter: hue-rotate(0deg); }
        }
      `}</style>
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: 'linear-gradient(45deg, #06b6d4, #8b5cf6, #ec4899, #10b981, #f59e0b, #06b6d4)',
          backgroundSize: '400% 400%',
          animation: 'aurora-sweep 10s ease-in-out infinite',
        }}
      />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          background: 'linear-gradient(135deg, transparent 20%, #a78bfa 40%, transparent 60%, #34d399 80%)',
          backgroundSize: '300% 300%',
          animation: 'aurora-sweep 14s ease-in-out infinite reverse',
        }}
      />
    </div>
  );
});

const RainEffect = memo(() => {
  const drops = useMemo(() => 
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      duration: Math.random() * 0.4 + 0.25,
      delay: Math.random() * 2,
      height: Math.random() * 25 + 12,
      hue: 200 + Math.random() * 40,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes rain-fall {
          0% { transform: translateY(-30px); opacity: 0.7; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
      {drops.map((d) => (
        <div
          key={d.id}
          className="absolute w-px"
          style={{
            left: `${d.x}%`,
            top: -30,
            height: d.height,
            background: `linear-gradient(to bottom, hsl(${d.hue} 80% 70% / 0.7), transparent)`,
            boxShadow: `0 0 3px hsl(${d.hue} 80% 70% / 0.3)`,
            animation: `rain-fall ${d.duration}s linear infinite`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
});

const SnowEffect = memo(() => {
  const flakes = useMemo(() => 
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: Math.random() * 7 + 3,
      duration: Math.random() * 5 + 6,
      delay: Math.random() * 5,
      sway: Math.random() * 40 - 20,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes snow-drift {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 0.9; }
          50% { transform: translateY(50vh) translateX(var(--sway)) rotate(180deg); opacity: 0.7; }
          100% { transform: translateY(100vh) translateX(0) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {flakes.map((f) => (
        <div
          key={f.id}
          className="absolute rounded-full"
          style={{
            '--sway': `${f.sway}px`,
            left: `${f.x}%`,
            top: -20,
            width: f.size,
            height: f.size,
            background: 'radial-gradient(circle, #fff 0%, #e0f2fe 60%, transparent 100%)',
            boxShadow: '0 0 6px rgba(255,255,255,0.8)',
            animation: `snow-drift ${f.duration}s linear infinite`,
            animationDelay: `${f.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

const FirefliesEffect = memo(() => {
  const fireflies = useMemo(() => 
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      x: Math.random() * 90 + 5,
      y: Math.random() * 90 + 5,
      size: Math.random() * 5 + 4,
      duration: Math.random() * 2 + 1.5,
      delay: Math.random() * 3,
      wanderX: Math.random() * 30 - 15,
      wanderY: Math.random() * 30 - 15,
      hue: 45 + Math.random() * 30,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes firefly-glow {
          0%, 100% { opacity: 0.2; transform: translate(0, 0) scale(0.8); }
          30% { opacity: 1; transform: translate(var(--wx), var(--wy)) scale(1.3); }
          60% { opacity: 0.4; transform: translate(calc(var(--wx) * -0.5), calc(var(--wy) * 0.5)) scale(1); }
        }
      `}</style>
      {fireflies.map((f) => (
        <div
          key={f.id}
          className="absolute rounded-full"
          style={{
            '--wx': `${f.wanderX}px`,
            '--wy': `${f.wanderY}px`,
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: f.size,
            height: f.size,
            background: `radial-gradient(circle, hsl(${f.hue} 100% 75%) 0%, hsl(${f.hue} 100% 50% / 0.4) 50%, transparent 70%)`,
            boxShadow: `0 0 ${f.size * 3}px hsl(${f.hue} 100% 60% / 0.7), 0 0 ${f.size * 6}px hsl(${f.hue} 100% 50% / 0.3)`,
            animation: `firefly-glow ${f.duration}s ease-in-out infinite`,
            animationDelay: `${f.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

const GeometricEffect = memo(() => {
  const shapes = useMemo(() => 
    Array.from({ length: 10 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 50 + 20,
      rotation: Math.random() * 360,
      type: ['square', 'circle', 'triangle'][i % 3] as string,
      hue: (i * 36) % 360,
      duration: Math.random() * 15 + 15,
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes geo-drift {
          0% { transform: rotate(0deg) scale(1); opacity: 0.2; }
          50% { transform: rotate(180deg) scale(1.15); opacity: 0.35; }
          100% { transform: rotate(360deg) scale(1); opacity: 0.2; }
        }
      `}</style>
      {shapes.map((s) => (
        <div
          key={s.id}
          className={`absolute ${s.type === 'circle' ? 'rounded-full' : s.type === 'square' ? 'rounded-lg' : ''}`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            border: `1.5px solid hsl(${s.hue} 70% 60% / 0.35)`,
            background: `linear-gradient(135deg, hsl(${s.hue} 70% 60% / 0.08), hsl(${(s.hue + 90) % 360} 70% 60% / 0.05))`,
            animation: `geo-drift ${s.duration}s linear infinite`,
            ...(s.type === 'triangle' ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' } : {}),
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
