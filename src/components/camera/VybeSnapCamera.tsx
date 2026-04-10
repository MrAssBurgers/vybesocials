import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, SwitchCamera, Zap, ZapOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VybeRecordButton } from './VybeRecordButton';
import { VybeSnapEditor } from './VybeSnapEditor';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface RecordingSegment {
  blob: Blob;
  duration: number;
}

interface VybeSnapCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (mediaUrl: string, isVideo: boolean) => void;
}

const MAX_RECORDING_DURATION = 30; // 30 seconds max

export function VybeSnapCamera({ isOpen, onClose, onSend }: VybeSnapCameraProps) {
  const [phase, setPhase] = useState<'camera' | 'edit' | 'sending'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [cameraActivated, setCameraActivated] = useState(false);
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'photo' | 'video' } | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const uiUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const recordingStartTimeRef = useRef(0);
  const totalRecordedTimeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinchStartRef = useRef<number | null>(null);
  
  // NEW: Refs for reliable finalization (fixes race condition)
  const segmentsRef = useRef<RecordingSegment[]>([]);
  const shouldFinalizeOnStopRef = useRef(false);
  const isRecordingRef = useRef(false);
  
  // Start camera
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 9/16 }, // Vertical
        },
        audio: soundEnabled,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      // Apply zoom if supported
      const videoTrack = stream.getVideoTracks()[0];
      try {
        const capabilities = videoTrack.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number } };
        if (capabilities?.zoom) {
          // Use any to bypass strict typing for vendor-specific constraint
          await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel } as any] } as any);
        }
      } catch (e) {
        // Zoom not supported on this device
      }
    } catch (error) {
      console.error('[VybeSnapCamera] Camera error:', error);
    }
  }, [facingMode, soundEnabled, zoomLevel]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Reset activation state when camera closes
  useEffect(() => {
    if (!isOpen) {
      setCameraActivated(false);
    }
    return () => stopCamera();
  }, [isOpen, stopCamera]);

  // Activate camera from user gesture
  const handleActivateCamera = useCallback(() => {
    setCameraActivated(true);
    startCamera();
  }, [startCamera]);
  
  // Handle pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartRef.current = distance;
    }
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current !== null) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = distance / pinchStartRef.current;
      setZoomLevel(prev => Math.max(1, Math.min(5, prev * scale)));
      pinchStartRef.current = distance;
    }
  }, []);

  // Switch camera (works while recording)
  const handleSwitchCamera = useCallback(async () => {
    haptics.impact();
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // If recording, we need to handle the stream switch
    if (isRecording && streamRef.current) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: soundEnabled,
        });
        
        // Replace video track in the stream
        const oldVideoTrack = streamRef.current.getVideoTracks()[0];
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          // Stop current segment, switch, and restart
          mediaRecorderRef.current.stop();
          
          // Wait a moment then restart with new camera
          setTimeout(() => {
            streamRef.current = newStream;
            if (videoRef.current) {
              videoRef.current.srcObject = newStream;
            }
            oldVideoTrack.stop();
            startRecordingSegment();
          }, 100);
        }
      } catch (error) {
        console.error('[VybeSnapCamera] Camera switch error:', error);
      }
    }
  }, [facingMode, isRecording, soundEnabled]);

  // Start recording a segment
  const startRecordingSegment = useCallback(() => {
    if (!streamRef.current) return;
    
    recordedChunksRef.current = [];
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';
    
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const duration = Date.now() - recordingStartTimeRef.current;
      
      if (blob.size > 0 && duration > 100) {
        // Push to ref synchronously (source of truth)
        segmentsRef.current = [...segmentsRef.current, { blob, duration }];
        totalRecordedTimeRef.current += duration;
        // Update React state for UI
        setSegments([...segmentsRef.current]);
      }
      
      // If we should finalize (user released or max duration), do it now
      if (shouldFinalizeOnStopRef.current) {
        shouldFinalizeOnStopRef.current = false;
        
        // Merge all segments
        const allSegments = segmentsRef.current;
        if (allSegments.length > 0) {
          const finalMimeType = allSegments[0].blob.type;
          const mergedBlob = new Blob(allSegments.map(s => s.blob), { type: finalMimeType });
          const videoUrl = URL.createObjectURL(mergedBlob);
          
          setCapturedMedia({ url: videoUrl, type: 'video' });
          setPhase('edit');
          
          // Stop camera after finalizing
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        }
      }
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100);
    recordingStartTimeRef.current = Date.now();
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    
    haptics.impact();
    setIsRecording(true);
    isRecordingRef.current = true;
    
    // Calculate remaining time
    const remainingTime = MAX_RECORDING_DURATION * 1000 - totalRecordedTimeRef.current;
    if (remainingTime <= 0) return;
    
    startRecordingSegment();
    
    // Progress timer
    const recordingStartTime = Date.now();
    
    // RAF for smooth 60fps progress tracking (updates ref, not state)
    const updateProgress = () => {
      const currentSegmentTime = Date.now() - recordingStartTime;
      const totalTime = totalRecordedTimeRef.current + currentSegmentTime;
      const progress = Math.min((totalTime / (MAX_RECORDING_DURATION * 1000)) * 100, 100);
      progressRef.current = progress;
      
      if (progress >= 100) {
        // Max duration reached - request finalization
        shouldFinalizeOnStopRef.current = true;
        stopRecording();
      } else if (isRecordingRef.current) {
        progressFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };
    progressFrameRef.current = requestAnimationFrame(updateProgress);
    
    // Separate UI update at 10fps (100ms) for React state - reduces VDOM diffing
    uiUpdateRef.current = setInterval(() => {
      setRecordingProgress(progressRef.current);
    }, 100);
  }, [startRecordingSegment]);

  // Stop recording
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (progressFrameRef.current) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
    
    if (uiUpdateRef.current) {
      clearInterval(uiUpdateRef.current);
      uiUpdateRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingProgress(progressRef.current); // Final sync
    haptics.success();
  }, []);

  // Note: finalizeRecording is now handled inside mediaRecorder.onstop
  // when shouldFinalizeOnStopRef.current === true

  // Take photo
  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    haptics.success();
    
    // Flash effect
    if (flashEnabled) {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 150);
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to video dimensions (vertical 9:16)
    const outputWidth = Math.min(1080, video.videoWidth);
    const outputHeight = Math.round(outputWidth * (16/9));
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
    // Calculate crop for 9:16
    const videoAspect = video.videoWidth / video.videoHeight;
    const targetAspect = 9/16;
    
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    
    if (videoAspect > targetAspect) {
      sw = video.videoHeight * targetAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / targetAspect;
      sy = (video.videoHeight - sh) / 2;
    }
    
    // Mirror for front camera
    if (facingMode === 'user') {
      ctx.translate(outputWidth, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    const imageUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedMedia({ url: imageUrl, type: 'photo' });
    setPhase('edit');
    stopCamera();
  }, [flashEnabled, facingMode, stopCamera]);

  // Capture button handlers
  const handleCaptureStart = useCallback(() => {
    isHoldingRef.current = true;
    
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startRecording();
      }
    }, 300);
  }, [startRecording]);

  const handleCaptureEnd = useCallback(() => {
    isHoldingRef.current = false;
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    // Use ref for reliable check (avoids stale closure)
    if (isRecordingRef.current) {
      // Signal that we want to finalize when onstop fires
      shouldFinalizeOnStopRef.current = true;
      stopRecording();
    } else {
      takePhoto();
    }
  }, [stopRecording, takePhoto]);

  // Handle send from editor
  const handleEditorSend = useCallback((mediaUrl: string) => {
    setPhase('sending');
    onSend(mediaUrl, capturedMedia?.type === 'video');
    
    setTimeout(() => {
      // Reset state
      setCapturedMedia(null);
      setSegments([]);
      setRecordingProgress(0);
      totalRecordedTimeRef.current = 0;
      setPhase('camera');
      onClose();
    }, 800);
  }, [capturedMedia, onSend, onClose]);

  // Handle close
  const handleClose = useCallback(() => {
    // Clear finalization flags
    shouldFinalizeOnStopRef.current = false;
    segmentsRef.current = [];
    isRecordingRef.current = false;
    
    stopCamera();
    stopRecording();
    setCapturedMedia(null);
    setSegments([]);
    setRecordingProgress(0);
    totalRecordedTimeRef.current = 0;
    setPhase('camera');
    onClose();
  }, [stopCamera, stopRecording, onClose]);
  
  // Visibility change handler - stop recording if page goes background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecordingRef.current) {
        shouldFinalizeOnStopRef.current = true;
        stopRecording();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stopRecording]);

  if (!isOpen) return null;

  // Editor phase
  if (phase === 'edit' && capturedMedia) {
    return (
      <VybeSnapEditor
        mediaUrl={capturedMedia.url}
        mediaType={capturedMedia.type}
        onSend={handleEditorSend}
        onCancel={() => {
          setCapturedMedia(null);
          setSegments([]);
          setRecordingProgress(0);
          totalRecordedTimeRef.current = 0;
          setPhase('camera');
          startCamera();
        }}
      />
    );
  }

  // Sending phase
  if (phase === 'sending') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
              padding: '3px',
            }}
          >
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
              <VybeMiniIcon size={32} showSparkles />
            </div>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-white font-semibold text-lg"
          >
            Sending VYBE...
          </motion.p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
    >
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Camera view */}
      <div 
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {!cameraActivated ? (
          <div 
            className="w-full h-full flex flex-col items-center justify-center cursor-pointer"
            onClick={handleActivateCamera}
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-20 h-20 rounded-full bg-muted/20 border-2 border-primary/50 flex items-center justify-center mb-4"
            >
              <VybeMiniIcon size={32} />
            </motion.div>
            <p className="text-muted-foreground text-sm font-medium">Tap to activate camera</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            style={{ 
              transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
            }}
            playsInline
            muted
            autoPlay
          />
        )}
        
        {/* Flash overlay */}
        <AnimatePresence>
          {showFlash && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-50 bg-white pointer-events-none"
            />
          )}
        </AnimatePresence>
        
        {/* Segment indicators */}
        {(segments.length > 0 || isRecording) && (
          <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
            {segments.map((seg, i) => (
              <div
                key={i}
                className="h-1 rounded-full bg-white"
                style={{ 
                  flex: seg.duration / (MAX_RECORDING_DURATION * 1000),
                }}
              />
            ))}
            {isRecording && (
              <motion.div
                className="h-1 rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ flex: (recordingProgress - (segments.reduce((a, s) => a + s.duration, 0) / (MAX_RECORDING_DURATION * 10))) / 100 }}
                layoutId="recording-segment"
              />
            )}
          </div>
        )}
      </div>
      
      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between safe-area-inset-top bg-gradient-to-b from-black/60 to-transparent">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleClose} 
          className="text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60"
        >
          <X className="h-6 w-6" />
        </Button>
        
        <motion.div 
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/40 to-accent/40 backdrop-blur-md border border-white/30"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500 }}
        >
          <VybeMiniIcon size={18} showSparkles />
          <span className="text-sm text-white font-bold tracking-wide">VYBE</span>
        </motion.div>
        
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60"
          >
            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSwitchCamera}
            className="text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60"
          >
            <SwitchCamera className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-10 safe-area-inset-bottom bg-gradient-to-t from-black/80 to-transparent">
        {/* Flash toggle */}
        <div className="flex justify-center mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFlashEnabled(!flashEnabled)}
            className={cn(
              "rounded-full px-4",
              flashEnabled 
                ? "bg-yellow-400/20 text-yellow-400" 
                : "bg-black/40 text-white/70"
            )}
          >
            {flashEnabled ? <Zap className="h-4 w-4 mr-2" /> : <ZapOff className="h-4 w-4 mr-2" />}
            {flashEnabled ? 'Flash On' : 'Flash Off'}
          </Button>
        </div>
        
        {/* Capture button */}
        <div className="flex justify-center">
          <VybeRecordButton
            isRecording={isRecording}
            progress={recordingProgress}
            maxDuration={MAX_RECORDING_DURATION}
            onCaptureStart={handleCaptureStart}
            onCaptureEnd={handleCaptureEnd}
          />
        </div>
        
        {/* Hint */}
        <motion.p 
          className="text-center text-white/60 text-sm mt-4"
          animate={{ opacity: isRecording ? 0 : 1 }}
        >
          Tap for photo • Hold for video
        </motion.p>
      </div>
    </motion.div>
  );
}
