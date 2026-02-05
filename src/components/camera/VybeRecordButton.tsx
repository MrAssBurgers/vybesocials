import { useEffect, useRef, useMemo } from 'react';
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

// Get phase index for haptic/sound feedback
function getPhaseIndex(elapsedSeconds: number): number {
  return Math.floor(elapsedSeconds / 5);
}

// Get color for current phase (simplified - no per-frame interpolation)
function getPhaseColor(phaseIndex: number, elapsedSeconds: number): string {
  const phase = COLOR_PHASES[Math.min(phaseIndex, COLOR_PHASES.length - 1)];
  if (phase.color === 'rainbow') {
    const hue = ((elapsedSeconds - phase.start) * 72) % 360;
    return `hsl(${hue}, 100%, 60%)`;
  }
  return phase.color;
}

export function VybeRecordButton({
  isRecording,
  progress,
  maxDuration,
  onCaptureStart,
  onCaptureEnd,
  disabled = false,
}: VybeRecordButtonProps) {
  const lastPhaseRef = useRef(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // SVG calculations - ring sits just outside the button
  const buttonSize = 80; // w-20 = 80px
  const strokeWidth = 4;
  const ringPadding = 6; // gap between button edge and ring
  const svgSize = buttonSize + (ringPadding + strokeWidth) * 2;
  const center = svgSize / 2;
  const radius = (buttonSize / 2) + ringPadding;
  const circumference = 2 * Math.PI * radius;
  
  const elapsedSeconds = (progress / 100) * maxDuration;
  const currentPhase = getPhaseIndex(elapsedSeconds);
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  // Memoize color per phase change only (not per frame)
  const currentColor = useMemo(() => {
    return getPhaseColor(currentPhase, elapsedSeconds);
  }, [currentPhase, elapsedSeconds]);
  
  // Phase change feedback (haptic + sound tick)
  useEffect(() => {
    if (!isRecording) {
      lastPhaseRef.current = -1;
      return;
    }
    
    if (currentPhase !== lastPhaseRef.current && lastPhaseRef.current !== -1) {
      haptics.impact();
    }
    lastPhaseRef.current = currentPhase;
  }, [currentPhase, isRecording]);
  
  // Static CSS particles (rendered once, animated via CSS)
  const particles = useMemo(() => {
    if (!isRecording) return null;
    return Array.from({ length: 8 }).map((_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const tx = Math.cos(angle) * 30;
      const ty = Math.sin(angle) * 30;
      return (
        <div
          key={i}
          className="vybe-particle"
          style={{
            left: '50%',
            top: '50%',
            marginLeft: -3,
            marginTop: -3,
            '--tx': `${tx}px`,
            '--ty': `${ty}px`,
            '--particle-color': currentColor,
            animationDelay: `${i * 0.075}s`,
          } as React.CSSProperties}
        />
      );
    });
  }, [isRecording, currentColor]);
  
  return (
    <div 
      className="relative flex items-center justify-center" 
      style={{ width: svgSize, height: svgSize }}
    >
      {/* CSS-only particle effects - GPU accelerated */}
      {isRecording && particles}
      
      {/* Progress ring SVG - always rendered, but hidden when not recording */}
      <svg 
        className="absolute inset-0 pointer-events-none vybe-record-ring"
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
            filter: isRecording ? `drop-shadow(0 0 6px ${currentColor})` : 'none',
            transition: 'stroke-dashoffset 16ms linear',
          }}
        />
      </svg>
      
      {/* Main button */}
      <button
        ref={buttonRef}
        onTouchStart={!disabled ? onCaptureStart : undefined}
        onTouchEnd={!disabled ? onCaptureEnd : undefined}
        onMouseDown={!disabled ? onCaptureStart : undefined}
        onMouseUp={!disabled ? onCaptureEnd : undefined}
        onMouseLeave={isRecording ? onCaptureEnd : undefined}
        disabled={disabled}
        className={cn(
          "relative w-20 h-20 rounded-full flex items-center justify-center touch-none",
          "active:scale-95 transition-transform duration-100"
        )}
        style={{ transform: 'translateZ(0)' }}
      >
        {/* Static outer ring when not recording */}
        {!isRecording && (
          <div 
            className="absolute inset-0 rounded-full border-[3px] border-white/90 animate-pulse"
            style={{ animationDuration: '1.5s' }}
          />
        )}
        
        {/* Glow behind button when recording - GPU accelerated */}
        {isRecording && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ 
              background: `radial-gradient(circle, ${currentColor}30 0%, transparent 70%)`,
              animationDuration: '0.5s',
            }}
          />
        )}
        
        {/* Inner button - morphs from circle to red square when recording */}
        <div
          className={cn(
            "z-10 transition-all duration-150 ease-out",
            isRecording 
              ? "bg-red-500" 
              : "bg-white"
          )}
          style={{
            width: isRecording ? 24 : 64,
            height: isRecording ? 24 : 64,
            borderRadius: isRecording ? 6 : 32,
            filter: isRecording 
              ? `drop-shadow(0 0 12px ${currentColor})`
              : 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))',
          }}
        />
      </button>
    </div>
  );
}
