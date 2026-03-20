/**
 * AR Filter Definition System
 * Defines face-anchored overlays, particles, color grading, and lighting effects.
 */

export interface MaskDef {
  anchor: 'eyes' | 'mouth' | 'forehead' | 'fullFace';
  type: 'glow' | 'solid' | 'outline' | 'emoji';
  color: string;
  emoji?: string;
  opacity?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  lineWidth?: number;
}

export interface ParticleConfig {
  anchor: 'eyes' | 'mouth' | 'forehead' | 'fullFace';
  count: number;       // per frame spawn rate
  color: string;
  secondaryColor?: string;
  size: [number, number]; // [min, max]
  speed: [number, number];
  lifetime: number;     // frames
  gravity?: number;
  spread: number;       // spawn spread in pixels
  shape: 'circle' | 'star' | 'heart' | 'spark';
  glow?: boolean;
}

export interface ColorGradeDef {
  color: string;
  opacity: number;
  blendMode: string;
}

export interface LightingDef {
  color: string;
  intensity: number;
  radius: number;
  offsetX?: number;
  offsetY?: number;
  blendMode?: string;
}

export interface ARFilterDef {
  id: string;
  name: string;
  icon: string;
  category: 'face' | 'color' | 'particle' | 'full';
  premium?: boolean;       // gated behind VYBE Pro
  aiGenerated?: boolean;   // created by AI suggestion engine
  masks?: MaskDef[];
  particles?: ParticleConfig;
  colorGrade?: ColorGradeDef;
  lighting?: LightingDef;
  cssFilter?: string; // CSS filter string for the video element
}

// ==================== PRESET AR FILTERS ====================

export const AR_FILTERS: ARFilterDef[] = [
  // --- Face Masks ---
  {
    id: 'neon-eyes',
    name: 'Neon Eyes',
    icon: '👁️',
    category: 'face',
    masks: [
      { anchor: 'eyes', type: 'glow', color: '#00ffff', opacity: 0.6, scale: 1.2 },
      { anchor: 'eyes', type: 'outline', color: '#ff00ff', opacity: 0.5, scale: 1.0, lineWidth: 2 },
    ],
    lighting: { color: '#00ffff', intensity: 0.15, radius: 1.5, blendMode: 'screen' },
  },
  {
    id: 'golden-crown',
    name: 'Crown',
    icon: '👑',
    category: 'face',
    masks: [
      { anchor: 'forehead', type: 'emoji', emoji: '👑', color: '#ffd700', scale: 1.0, offsetY: -20 },
    ],
    particles: {
      anchor: 'forehead',
      count: 1,
      color: '#ffd700',
      size: [2, 5],
      speed: [0.3, 1.2],
      lifetime: 60,
      gravity: -0.02,
      spread: 80,
      shape: 'spark',
      glow: true,
    },
  },
  {
    id: 'heart-eyes',
    name: 'Heart Eyes',
    icon: '😍',
    category: 'face',
    masks: [
      { anchor: 'eyes', type: 'emoji', emoji: '❤️', color: '#ff0066', scale: 0.5, offsetX: -10 },
      { anchor: 'eyes', type: 'emoji', emoji: '❤️', color: '#ff0066', scale: 0.5, offsetX: 10 },
    ],
    colorGrade: { color: '#ff006622', opacity: 0.1, blendMode: 'overlay' },
  },
  {
    id: 'cyber-mask',
    name: 'Cyber Mask',
    icon: '🤖',
    category: 'face',
    masks: [
      { anchor: 'fullFace', type: 'outline', color: '#00ff88', opacity: 0.4, scale: 1.0, lineWidth: 2 },
      { anchor: 'eyes', type: 'glow', color: '#00ff88', opacity: 0.5, scale: 0.8 },
      { anchor: 'mouth', type: 'outline', color: '#00ff88', opacity: 0.3, scale: 0.9, lineWidth: 1 },
    ],
    lighting: { color: '#00ff88', intensity: 0.1, radius: 2, blendMode: 'screen' },
    cssFilter: 'contrast(1.1) saturate(0.8)',
  },
  {
    id: 'angel-halo',
    name: 'Angel',
    icon: '😇',
    category: 'face',
    masks: [
      { anchor: 'forehead', type: 'emoji', emoji: '😇', color: '#fff', scale: 0.1, offsetY: -40 },
    ],
    particles: {
      anchor: 'forehead',
      count: 2,
      color: '#ffffff',
      secondaryColor: '#ffe4b5',
      size: [1, 3],
      speed: [0.2, 0.8],
      lifetime: 80,
      gravity: -0.01,
      spread: 100,
      shape: 'spark',
      glow: true,
    },
    lighting: { color: '#fffff0', intensity: 0.12, radius: 2, offsetY: -50, blendMode: 'screen' },
  },

  // --- Particle Effects ---
  {
    id: 'sparkle-rain',
    name: 'Sparkles',
    icon: '✨',
    category: 'particle',
    particles: {
      anchor: 'fullFace',
      count: 3,
      color: '#ffd700',
      secondaryColor: '#ff69b4',
      size: [2, 6],
      speed: [0.5, 2],
      lifetime: 50,
      gravity: 0.03,
      spread: 150,
      shape: 'star',
      glow: true,
    },
  },
  {
    id: 'hearts-float',
    name: 'Hearts',
    icon: '💕',
    category: 'particle',
    particles: {
      anchor: 'fullFace',
      count: 2,
      color: '#ff1493',
      secondaryColor: '#ff69b4',
      size: [4, 10],
      speed: [0.5, 1.5],
      lifetime: 70,
      gravity: -0.03,
      spread: 120,
      shape: 'heart',
    },
  },
  {
    id: 'fire-breath',
    name: 'Fire',
    icon: '🔥',
    category: 'particle',
    masks: [
      { anchor: 'mouth', type: 'glow', color: '#ff4500', opacity: 0.3, scale: 1.5 },
    ],
    particles: {
      anchor: 'mouth',
      count: 4,
      color: '#ff4500',
      secondaryColor: '#ffd700',
      size: [3, 8],
      speed: [1, 3],
      lifetime: 30,
      gravity: -0.08,
      spread: 40,
      shape: 'circle',
      glow: true,
    },
  },

  // --- Color/Mood Filters ---
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    icon: '🌅',
    category: 'color',
    colorGrade: { color: '#ff8c00', opacity: 0.15, blendMode: 'overlay' },
    lighting: { color: '#ffd700', intensity: 0.2, radius: 2, offsetX: -100, offsetY: -80, blendMode: 'screen' },
    cssFilter: 'saturate(1.3) brightness(1.05) sepia(0.15)',
  },
  {
    id: 'midnight-blue',
    name: 'Midnight',
    icon: '🌙',
    category: 'color',
    colorGrade: { color: '#000066', opacity: 0.2, blendMode: 'overlay' },
    lighting: { color: '#4444ff', intensity: 0.1, radius: 1.5, blendMode: 'screen' },
    cssFilter: 'brightness(0.9) saturate(0.8) hue-rotate(10deg)',
  },
  {
    id: 'pastel-dream',
    name: 'Pastel',
    icon: '🦄',
    category: 'color',
    colorGrade: { color: '#ffb6c1', opacity: 0.1, blendMode: 'overlay' },
    cssFilter: 'brightness(1.1) saturate(0.7) contrast(0.9)',
    particles: {
      anchor: 'fullFace',
      count: 1,
      color: '#ffb6c1',
      secondaryColor: '#b19cd9',
      size: [2, 4],
      speed: [0.2, 0.6],
      lifetime: 90,
      gravity: -0.01,
      spread: 200,
      shape: 'star',
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    icon: '🎬',
    category: 'color',
    cssFilter: 'grayscale(0.9) contrast(1.3) brightness(0.9)',
    lighting: { color: '#ffffff', intensity: 0.08, radius: 1.2, offsetX: -80, blendMode: 'soft-light' },
  },
];

// ==================== PARTICLE SYSTEM ====================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  shape: ParticleConfig['shape'];
  glow: boolean;
  rotation: number;
  rotationSpeed: number;
}

export class ParticleSystem {
  particles: Particle[] = [];
  private frameCount = 0;

  spawn(x: number, y: number, spread: number, config: ParticleConfig) {
    this.frameCount++;
    // Only spawn every few frames to control density
    if (this.frameCount % 3 !== 0) return;

    const count = Math.min(config.count, 5); // cap spawn rate
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 200) break; // particle cap

      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * config.spread;
      const speed = config.speed[0] + Math.random() * (config.speed[1] - config.speed[0]);
      const size = config.size[0] + Math.random() * (config.size[1] - config.size[0]);

      this.particles.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * speed * 2,
        vy: (Math.random() - 0.5) * speed * 2,
        size,
        color: Math.random() > 0.5 && config.secondaryColor ? config.secondaryColor : config.color,
        life: config.lifetime,
        maxLife: config.lifetime,
        shape: config.shape,
        glow: config.glow || false,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.rotation += p.rotationSpeed;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / (p.maxLife * 0.3)); // fade out
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size * 3;
      }

      ctx.fillStyle = p.color;

      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'star':
          this.drawStar(ctx, 0, 0, 5, p.size, p.size * 0.4);
          break;

        case 'heart':
          this.drawHeart(ctx, 0, 0, p.size);
          break;

        case 'spark':
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.3, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.3, 0);
          ctx.closePath();
          ctx.fill();
          break;
      }

      ctx.restore();
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerR: number, innerR: number) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.3);
    ctx.bezierCurveTo(cx - size, cy - size * 0.5, cx - size * 0.5, cy - size, cx, cy - size * 0.5);
    ctx.bezierCurveTo(cx + size * 0.5, cy - size, cx + size, cy - size * 0.5, cx, cy + size * 0.3);
    ctx.fill();
  }
}
