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
  const strokeWidth = 6; // Thicker ring for visibility
  const ringPadding = 8; // gap between button edge and ring
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
          {/* Animated gradient with bright, saturated colors */}
          <linearGradient id="vybe-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))">
              <animate attributeName="stop-color" 
                values="hsl(var(--primary)); hsl(var(--accent)); hsl(var(--primary))" 
                dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="hsl(var(--accent))">
              <animate attributeName="stop-color" 
                values="hsl(var(--accent)); hsl(var(--primary)); hsl(var(--accent))" 
                dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="hsl(var(--primary))">
              <animate attributeName="stop-color" 
                values="hsl(var(--primary)); hsl(var(--accent)); hsl(var(--primary))" 
                dur="2s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          {/* Glow filter for bright neon effect */}
          <filter id="vybe-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="hsl(var(--primary))" floodOpacity="0.8" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={isRecording ? "rgba(255,255,255,0.2)" : "transparent"}
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
            filter: isRecording ? 'url(#vybe-glow)' : 'none',
            willChange: 'stroke-dashoffset',
          }}
        />
      </svg>
      
      {/* Main button - uses Pointer Events for reliable mobile behavior */}
      <button
        ref={buttonRef}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          buttonRef.current?.setPointerCapture(e.pointerId);
          onCaptureStart();
        }}
        onPointerUp={(e) => {
          if (disabled) return;
          buttonRef.current?.releasePointerCapture(e.pointerId);
          onCaptureEnd();
        }}
        onPointerCancel={(e) => {
          if (disabled) return;
          buttonRef.current?.releasePointerCapture(e.pointerId);
          onCaptureEnd();
        }}
        onPointerLeave={(e) => {
          // Only trigger if recording and pointer not captured
          if (isRecording && !buttonRef.current?.hasPointerCapture(e.pointerId)) {
            onCaptureEnd();
          }
        }}
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
            className="absolute inset-0 rounded-full border-4 border-white/90"
            style={{
              boxShadow: '0 0 20px rgba(255,255,255,0.3)',
            }}
          />
        )}
        
        {/* Glow behind button when recording - GPU accelerated */}
        {isRecording && (
          <div
            className="absolute rounded-full animate-pulse"
            style={{ 
              width: '120%',
              height: '120%',
              left: '-10%',
              top: '-10%',
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, hsl(var(--accent) / 0.2) 50%, transparent 70%)',
              animationDuration: '1s',
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
              ? '0 0 20px hsl(var(--primary) / 0.7), 0 0 40px hsl(var(--accent) / 0.4)'
              : '0 2px 6px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
}
