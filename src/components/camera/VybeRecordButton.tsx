import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface VybeRecordButtonProps {
  isRecording: boolean;
  progress: number; // 0-100
  maxDuration: number; // in seconds
  onCaptureStart: () => void;
  onCaptureEnd: () => void;
  disabled?: boolean;
}

// Color phases with their time ranges (in seconds)
const COLOR_PHASES = [
  { start: 0, end: 5, color: '#3B82F6' },    // Electric blue
  { start: 5, end: 10, color: '#8B5CF6' },   // Purple
  { start: 10, end: 15, color: '#EC4899' },  // Hot pink
  { start: 15, end: 20, color: '#F97316' },  // Orange
  { start: 20, end: 25, color: '#FACC15' },  // Yellow
  { start: 25, end: 30, color: 'rainbow' },  // Neon rainbow
];

// Interpolate between two hex colors
function interpolateColor(color1: string, color2: string, factor: number): string {
  if (color2 === 'rainbow') {
    // Return a cycling rainbow hue
    const hue = (factor * 360) % 360;
    return `hsl(${hue}, 100%, 60%)`;
  }
  
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Get current color based on elapsed time
function getCurrentColor(elapsedSeconds: number): string {
  for (let i = 0; i < COLOR_PHASES.length; i++) {
    const phase = COLOR_PHASES[i];
    if (elapsedSeconds >= phase.start && elapsedSeconds < phase.end) {
      const nextPhase = COLOR_PHASES[i + 1];
      if (nextPhase) {
        const phaseProgress = (elapsedSeconds - phase.start) / (phase.end - phase.start);
        return interpolateColor(phase.color, nextPhase.color, phaseProgress);
      }
      // Last phase - rainbow mode
      if (phase.color === 'rainbow') {
        const hue = ((elapsedSeconds - phase.start) * 72) % 360;
        return `hsl(${hue}, 100%, 60%)`;
      }
      return phase.color;
    }
  }
  return COLOR_PHASES[0].color;
}

// Get phase index for haptic/sound feedback
function getPhaseIndex(elapsedSeconds: number): number {
  return Math.floor(elapsedSeconds / 5);
}

export function VybeRecordButton({
  isRecording,
  progress,
  maxDuration,
  onCaptureStart,
  onCaptureEnd,
  disabled = false,
}: VybeRecordButtonProps) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; angle: number }[]>([]);
  const lastPhaseRef = useRef(-1);
  const particleIdRef = useRef(0);
  
  // SVG calculations - ring sits just outside the button
  const buttonSize = 80; // w-20 = 80px
  const strokeWidth = 4;
  const ringPadding = 6; // gap between button edge and ring
  const svgSize = buttonSize + (ringPadding + strokeWidth) * 2;
  const center = svgSize / 2;
  const radius = (buttonSize / 2) + ringPadding;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  const elapsedSeconds = (progress / 100) * maxDuration;
  const currentColor = useMemo(() => getCurrentColor(elapsedSeconds), [elapsedSeconds]);
  
  // Phase change feedback (haptic + sound tick)
  useEffect(() => {
    if (!isRecording) {
      lastPhaseRef.current = -1;
      return;
    }
    
    const currentPhase = getPhaseIndex(elapsedSeconds);
    if (currentPhase !== lastPhaseRef.current && lastPhaseRef.current !== -1) {
      haptics.impact();
      // Could add synth tick sound here
    }
    lastPhaseRef.current = currentPhase;
  }, [elapsedSeconds, isRecording]);
  
  // Spawn particles while recording
  useEffect(() => {
    if (!isRecording) {
      setParticles([]);
      return;
    }
    
    // Spawn rate increases with progress
    const spawnRate = 100 + (progress * 2); // 100ms to 300ms
    const interval = setInterval(() => {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius + 5 + Math.random() * 10;
      setParticles(prev => [
        ...prev.slice(-20), // Keep max 20 particles
        {
          id: particleIdRef.current++,
          x: center + Math.cos(angle) * distance,
          y: center + Math.sin(angle) * distance,
          angle: angle * (180 / Math.PI),
        },
      ]);
    }, spawnRate);
    
    return () => clearInterval(interval);
  }, [isRecording, progress, center, radius]);
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: svgSize, height: svgSize }}>
      {/* Particle effects */}
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{ 
              x: particle.x - center, 
              y: particle.y - center, 
              scale: 0.5, 
              opacity: 1 
            }}
            animate={{ 
              x: (particle.x - center) * 1.5, 
              y: (particle.y - center) * 1.5, 
              scale: 0, 
              opacity: 0 
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute w-2 h-2 rounded-full pointer-events-none"
            style={{ 
              background: `radial-gradient(circle, ${currentColor} 0%, transparent 70%)`,
              boxShadow: `0 0 6px ${currentColor}`,
            }}
          />
        ))}
      </AnimatePresence>
      
      {/* Progress ring SVG - always rendered, but hidden when not recording */}
      <svg 
        className="absolute inset-0 pointer-events-none"
        width={svgSize}
        height={svgSize}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isRecording ? "rgba(255,255,255,0.15)" : "transparent"}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isRecording ? currentColor : "transparent"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            filter: isRecording ? `drop-shadow(0 0 4px ${currentColor}) drop-shadow(0 0 8px ${currentColor})` : 'none',
            transition: 'stroke 0.3s ease, stroke-dashoffset 50ms linear',
          }}
        />
      </svg>
      
      {/* Main button */}
      <motion.button
        onTouchStart={!disabled ? onCaptureStart : undefined}
        onTouchEnd={!disabled ? onCaptureEnd : undefined}
        onMouseDown={!disabled ? onCaptureStart : undefined}
        onMouseUp={!disabled ? onCaptureEnd : undefined}
        onMouseLeave={isRecording ? onCaptureEnd : undefined}
        disabled={disabled}
        className="relative w-20 h-20 rounded-full flex items-center justify-center touch-none"
        whileTap={!isRecording ? { scale: 0.95 } : undefined}
      >
        {/* Static outer ring when not recording */}
        {!isRecording && (
          <motion.div 
            className="absolute inset-0 rounded-full border-[3px] border-white/90"
            animate={{ 
              boxShadow: [
                '0 0 0 0 rgba(255,255,255,0.4)',
                '0 0 0 8px rgba(255,255,255,0)',
              ]
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        
        {/* Growing/pulsing glow behind button when recording */}
        {isRecording && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ 
              background: `radial-gradient(circle, ${currentColor}40 0%, transparent 70%)`,
            }}
            animate={{ 
              scale: [1, 1.15, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        
        {/* Inner button - morphs from circle to red square when recording */}
        <motion.div
          className={cn(
            "z-10 shadow-lg",
            isRecording 
              ? "bg-red-500" 
              : "bg-white"
          )}
          animate={{
            width: isRecording ? 24 : 64,
            height: isRecording ? 24 : 64,
            borderRadius: isRecording ? 6 : 32,
          }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            boxShadow: isRecording 
              ? `0 0 20px ${currentColor}, 0 0 40px ${currentColor}50`
              : '0 4px 12px rgba(0,0,0,0.3)',
          }}
        />
      </motion.button>
    </div>
  );
}
