/**
 * Pre-Join Call Screen
 * 
 * Polished glass-card UI for device check before joining a call.
 * UI only - does not change any Daily/call logic.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, Phone, PhoneOff,
  Settings, ChevronDown, ChevronUp, Loader2, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { MOTION_CONFIG, MOTION_VARIANTS } from '@/lib/motion';

interface PreJoinScreenProps {
  callerName: string;
  callerAvatar?: string | null;
  isVideoCall: boolean;
  isReady: boolean;
  isJoining: boolean;
  statusText: string;
  onJoin: () => void;
  onCancel: () => void;
  localVideoStream?: MediaStream | null;

  /** Optional controlled toggles (so the overlay can apply settings on join) */
  micMuted?: boolean;
  cameraOff?: boolean;
  onMicToggle?: (nextMuted: boolean) => void;
  onCameraToggle?: (nextOff: boolean) => void;
}

export function PreJoinScreen({
  callerName,
  callerAvatar,
  isVideoCall,
  isReady,
  isJoining,
  statusText,
  onJoin,
  onCancel,
  localVideoStream,
  micMuted,
  cameraOff,
  onMicToggle,
  onCameraToggle,
}: PreJoinScreenProps) {
  const [internalMuted, setInternalMuted] = useState(false);
  const [internalCameraOff, setInternalCameraOff] = useState(!isVideoCall);

  const effectiveMuted = micMuted ?? internalMuted;
  const effectiveCameraOff = cameraOff ?? internalCameraOff;

  const [showSettings, setShowSettings] = useState(false);
  const [micActivity, setMicActivity] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Set up video preview
  useEffect(() => {
    if (videoRef.current && localVideoStream && !effectiveCameraOff) {
      videoRef.current.srcObject = localVideoStream;
    }
  }, [localVideoStream, effectiveCameraOff]);

  // Mock mic activity animation (visual only)
  useEffect(() => {
    if (effectiveMuted) {
      setMicActivity(0);
      return;
    }

    // Simulate mic activity for visual feedback
    const animate = () => {
      setMicActivity(Math.random() * 0.7 + 0.3);
      animationRef.current = requestAnimationFrame(() => {
        setTimeout(animate, 100 + Math.random() * 200);
      });
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [effectiveMuted]);

  const handleToggleMic = useCallback(() => {
    const next = !effectiveMuted;
    if (onMicToggle) onMicToggle(next);
    else setInternalMuted(next);
  }, [effectiveMuted, onMicToggle]);

  const handleToggleCamera = useCallback(() => {
    const next = !effectiveCameraOff;
    if (onCameraToggle) onCameraToggle(next);
    else setInternalCameraOff(next);
  }, [effectiveCameraOff, onCameraToggle]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
    >
      {/* Blurred background overlay */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-2xl" />
      
      {/* Subtle gradient accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Glass Card */}
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={MOTION_CONFIG.spring.snappy}
        className="relative z-10 w-full max-w-md"
      >
        <div className="relative overflow-hidden rounded-3xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-2xl">
          {/* Top edge highlight */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
          
          {/* Close button */}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <PhoneOff className="h-4 w-4" />
          </button>

          <div className="p-6 pt-8">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold text-foreground mb-1">
                Ready to join?
              </h1>
              <p className="text-sm text-muted-foreground">
                Check your mic & camera before entering
              </p>
            </div>

            {/* Preview Area */}
            <div className="relative mb-6">
              <div className={cn(
                "relative aspect-video rounded-2xl overflow-hidden flex items-center justify-center",
                "bg-muted/50 border border-border/30"
              )}>
                {/* Camera Preview or Avatar */}
                {isVideoCall && !effectiveCameraOff && localVideoStream ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {/* Active camera glow */}
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-primary/30 ring-inset pointer-events-none" />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Avatar className="h-20 w-20 ring-4 ring-muted-foreground/10">
                      <AvatarImage src={callerAvatar || undefined} />
                      <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                        {callerName?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {(effectiveCameraOff || !isVideoCall) && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <VideoOff className="h-3 w-3" />
                        Camera off
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* User info below preview */}
              <div className="text-center mt-3">
                <p className="text-sm font-medium text-foreground">{callerName}</p>
                <motion.p 
                  className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 mt-1"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Joining...
                    </>
                  ) : isReady ? (
                    <>
                      <Check className="h-3 w-3 text-success" />
                      Ready
                    </>
                  ) : (
                    statusText
                  )}
                </motion.p>
              </div>
            </div>

            {/* Device Controls Row */}
            <div className="flex items-center justify-center gap-3 mb-4">
              {/* Mic Toggle */}
              <button
                onClick={handleToggleMic}
                className={cn(
                  "relative flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200",
                  effectiveMuted 
                    ? "bg-destructive/20 text-destructive hover:bg-destructive/30" 
                    : "bg-muted hover:bg-muted-foreground/20 text-foreground"
                )}
              >
                {effectiveMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                
                {/* Mic activity indicator */}
                {!effectiveMuted && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/50 pointer-events-none"
                    animate={{ scale: 1 + micActivity * 0.15, opacity: micActivity }}
                    transition={{ duration: 0.1 }}
                  />
                )}
              </button>

              {/* Camera Toggle */}
              {isVideoCall && (
                <button
                  onClick={handleToggleCamera}
                  className={cn(
                    "flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200",
                    effectiveCameraOff 
                      ? "bg-destructive/20 text-destructive hover:bg-destructive/30" 
                      : "bg-muted hover:bg-muted-foreground/20 text-foreground"
                  )}
                >
                  {effectiveCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>
              )}


              {/* Settings Toggle */}
              <button
                onClick={() => setShowSettings(prev => !prev)}
                className={cn(
                  "flex items-center justify-center h-12 w-12 rounded-full transition-all duration-200",
                  showSettings 
                    ? "bg-primary/20 text-primary" 
                    : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>

            {/* Collapsible Device Settings */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 mb-4 rounded-xl bg-muted/30 border border-border/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Microphone</span>
                      <span className="text-xs text-foreground">Default Device</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Camera</span>
                      <span className="text-xs text-foreground">Default Camera</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Speaker</span>
                      <span className="text-xs text-foreground">Default Speaker</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Join Button */}
            <motion.button
              onClick={onJoin}
              disabled={!isReady || isJoining}
              whileTap={isReady && !isJoining ? { scale: 0.98 } : undefined}
              className={cn(
                "w-full h-14 rounded-2xl font-medium text-base flex items-center justify-center gap-2 transition-all duration-200",
                isReady && !isJoining
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {isJoining ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Phone className="h-5 w-5" />
                  Join Call
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
