import { useEffect, useRef, useMemo, useState } from 'react';
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

// Phase count for haptic feedback
const PHASE_DURATION = 5; // seconds per phase

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
  const ringRef = useRef<SVGCircleElement>(null);
  
  // SVG calculations - ring sits just outside the button
  const buttonSize = 80; // w-20 = 80px
  const strokeWidth = 4;
  const ringPadding = 6; // gap between button edge and ring
  const svgSize = buttonSize + (ringPadding + strokeWidth) * 2;
  const center = svgSize / 2;
  const radius = (buttonSize / 2) + ringPadding;
  const circumference = 2 * Math.PI * radius;
  
  const elapsedSeconds = (progress / 100) * maxDuration;
  const currentPhase = Math.floor(elapsedSeconds / PHASE_DURATION);
  
  // Update ring progress via ref (no re-render) for buttery smooth animation
  useEffect(() => {
    if (ringRef.current) {
      const offset = circumference - (progress / 100) * circumference;
      ringRef.current.style.strokeDashoffset = `${offset}`;
    }
  }, [progress, circumference]);
  
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
  
  // Static CSS particles using theme colors
  const particles = useMemo(() => {
    if (!isRecording) return null;
    return Array.from({ length: 6 }).map((_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      const tx = Math.cos(angle) * 30;
      const ty = Math.sin(angle) * 30;
      const isAccent = i % 2 === 0;
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
            '--particle-color': isAccent ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
            animationDelay: `${i * 0.1}s`,
          } as React.CSSProperties}
        />
      );
    });
  }, [isRecording]);
  
  return (
    <div 
      className="relative flex items-center justify-center" 
      style={{ width: svgSize, height: svgSize }}
    >
      {/* CSS-only particle effects - GPU accelerated */}
      {isRecording && particles}
      
      {/* Progress ring SVG - always rendered, but hidden when not recording */}
      <svg 
        className="absolute inset-0 pointer-events-none"
        width={svgSize}
        height={svgSize}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <defs>
          <linearGradient id="vybe-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="50%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
        </defs>
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
          ref={ringRef}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isRecording ? "url(#vybe-ring-gradient)" : "transparent"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          style={{
            filter: isRecording ? 'drop-shadow(0 0 8px hsl(var(--primary) / 0.6))' : 'none',
            willChange: 'stroke-dashoffset',
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
            className="absolute inset-0 rounded-full border-[3px] border-white/90"
          />
        )}
        
        {/* Glow behind button when recording - GPU accelerated */}
        {isRecording && (
          <div
            className="absolute inset-0 rounded-full"
            style={{ 
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)',
            }}
          />
        )}
        
        {/* Inner button - morphs from circle to red square when recording */}
        <div
          className={cn(
            "z-10 transition-all duration-150 ease-out",
            isRecording 
              ? "bg-destructive" 
              : "bg-white"
          )}
          style={{
            width: isRecording ? 24 : 64,
            height: isRecording ? 24 : 64,
            borderRadius: isRecording ? 6 : 32,
            boxShadow: isRecording 
              ? '0 0 16px hsl(var(--primary) / 0.5)'
              : '0 2px 6px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
}
