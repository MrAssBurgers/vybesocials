/**
 * Minimized Call Pill
 * 
 * Draggable floating pill showing:
 * - Call duration
 * - Mic muted indicator
 * - Tap to restore full call UI
 */

import { useState, useRef, useEffect } from 'react';
import { motion, useDragControls, PanInfo } from 'framer-motion';
import { Mic, MicOff, Phone, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MinimizedCallPillProps {
  duration: number;
  isMuted: boolean;
  isVideo: boolean;
  onRestore: () => void;
}

export function MinimizedCallPill({ duration, isMuted, isVideo, onRestore }: MinimizedCallPillProps) {
  const [position, setPosition] = useState({ x: 16, y: 100 });
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Snap to nearest edge
    const viewportWidth = window.innerWidth;
    const pillWidth = 140;
    const margin = 16;
    
    let newX = info.point.x;
    if (newX < viewportWidth / 2) {
      newX = margin;
    } else {
      newX = viewportWidth - pillWidth - margin;
    }
    
    // Clamp Y position
    const newY = Math.max(60, Math.min(window.innerHeight - 100, info.point.y));
    
    setPosition({ x: newX, y: newY });
  };

  return (
    <>
      {/* Invisible drag constraints container */}
      <div 
        ref={constraintsRef}
        className="fixed inset-0 pointer-events-none z-[9998]"
        style={{ top: 60, bottom: 80 }}
      />
      
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ 
          scale: 1, 
          opacity: 1,
          x: position.x,
          y: position.y,
        }}
        exit={{ scale: 0, opacity: 0 }}
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.95 }}
        onClick={onRestore}
        className={cn(
          "fixed z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-full",
          "bg-gradient-to-r from-emerald-500 to-emerald-600",
          "shadow-lg shadow-emerald-500/30",
          "border border-white/20",
          "cursor-pointer touch-none",
          "hover:shadow-emerald-500/50 transition-shadow"
        )}
        style={{
          top: 0,
          left: 0,
        }}
      >
        {/* Call type icon */}
        {isVideo ? (
          <Video className="w-4 h-4 text-white" />
        ) : (
          <Phone className="w-4 h-4 text-white" />
        )}
        
        {/* Duration */}
        <span className="text-sm font-medium text-white tabular-nums">
          {formatDuration(duration)}
        </span>
        
        {/* Mute indicator */}
        <div className={cn(
          "flex items-center justify-center w-5 h-5 rounded-full",
          isMuted ? "bg-red-500/80" : "bg-white/20"
        )}>
          {isMuted ? (
            <MicOff className="w-3 h-3 text-white" />
          ) : (
            <Mic className="w-3 h-3 text-white" />
          )}
        </div>
        
        {/* Pulsing dot to indicate active call */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-2 h-2 rounded-full bg-white"
        />
      </motion.button>
    </>
  );
}
