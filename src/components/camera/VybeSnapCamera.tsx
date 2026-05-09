import { useState, useRef, useCallback, useEffect, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, SwitchCamera, Zap, ZapOff, Loader2, Timer, Grid3X3, Sun, Moon, Image, Music, Search, UserPlus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeRecordButton } from './VybeRecordButton';
import { VybeSnapEditor } from './VybeSnapEditor';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { getActiveStream, stopCameraStream } from '@/hooks/useCameraPreload';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getRecentMessageUsers } from '@/lib/recentMessageUsers';
import { useNavigate } from 'react-router-dom';
import { useFaceTracking } from '@/hooks/useFaceTracking';
import { AROverlayCanvas } from './AROverlayCanvas';
import { ARFilterPicker } from './ARFilterPicker';
import { ARFilterDef } from '@/lib/arFilters';
import { useSnapAR } from './SnapARProvider';

interface RecordingSegment {
  blob: Blob;
  duration: number;
}

interface VybeSnapCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (mediaUrl: string, isVideo: boolean) => void;
}

const MAX_RECORDING_DURATION = 30;
const TIMER_OPTIONS = [0, 3, 10];

const LENS_FILTERS = [
  { id: 'none', label: 'Normal', icon: '✨', filter: 'none' },
  { id: 'warm', label: 'Warm', icon: '🌅', filter: 'saturate(1.3) sepia(0.15) brightness(1.05)' },
  { id: 'cool', label: 'Cool', icon: '❄️', filter: 'saturate(0.9) hue-rotate(10deg) brightness(1.05)' },
  { id: 'vintage', label: 'Vintage', icon: '📷', filter: 'sepia(0.4) contrast(1.1) brightness(0.95)' },
  { id: 'vivid', label: 'Vivid', icon: '🎨', filter: 'saturate(1.6) contrast(1.1)' },
  { id: 'bw', label: 'B&W', icon: '🖤', filter: 'grayscale(1) contrast(1.2)' },
  { id: 'dreamy', label: 'Dreamy', icon: '💭', filter: 'brightness(1.1) contrast(0.9) saturate(1.2) blur(0.3px)' },
  { id: 'noir', label: 'Noir', icon: '🎬', filter: 'grayscale(0.8) contrast(1.4) brightness(0.9)' },
];

export const VybeSnapCamera = forwardRef<HTMLDivElement, VybeSnapCameraProps>(function VybeSnapCamera({ isOpen, onClose, onSend }, _ref) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'camera' | 'edit' | 'sending'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'photo' | 'video' } | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [showTools, setShowTools] = useState(true);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [selfieFlash, setSelfieFlash] = useState(false);
  const [activeARFilter, setActiveARFilter] = useState<ARFilterDef | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  
  // AR Face Tracking
  const { faces, isReady: arReady, isLoading: arLoading, startTracking, stopTracking } = useFaceTracking({ enabled: isOpen && cameraReady && !!activeARFilter });
  const { applySnapLens, removeSnapLens, isAvailable: snapAvailable } = useSnapAR();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const uiUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const recordingStartTimeRef = useRef(0);
  const totalRecordedTimeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinchStartRef = useRef<number | null>(null);
  const segmentsRef = useRef<RecordingSegment[]>([]);
  const shouldFinalizeOnStopRef = useRef(false);
  const isRecordingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Start camera with proper permission handling
  const startCamera = useCallback(async () => {
    try {
      if (navigator.permissions) {
        try {
          const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (camStatus.state === 'denied') {
            setPermissionDenied(true);
            return;
          }
        } catch {}
      }

      const preloaded = getActiveStream();
      if (preloaded) {
        const videoTrack = preloaded.getVideoTracks()[0];
        const settings = videoTrack?.getSettings?.();
        const currentFacing = settings?.facingMode || 'user';
        const hasAudio = preloaded.getAudioTracks().length > 0;
        
        if (currentFacing === facingMode && hasAudio === soundEnabled) {
          streamRef.current = preloaded;
          setPermissionDenied(false);
          setCameraReady(true);
          if (videoRef.current) {
            videoRef.current.srcObject = preloaded;
            videoRef.current.play().catch(() => {});
          }
          try {
            const capabilities = videoTrack.getCapabilities?.() as any;
            if (capabilities?.zoom) {
              await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel } as any] } as any);
            }
            if (capabilities?.torch && flashEnabled && facingMode === 'environment') {
              await videoTrack.applyConstraints({ advanced: [{ torch: true } as any] } as any);
            }
          } catch {}
          return;
        }
        stopCameraStream();
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 9/16 },
        },
        audio: soundEnabled,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPermissionDenied(false);
      setCameraReady(true);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      
      const videoTrack = stream.getVideoTracks()[0];
      try {
        const capabilities = videoTrack.getCapabilities?.() as any;
        if (capabilities?.zoom) {
          await videoTrack.applyConstraints({ advanced: [{ zoom: zoomLevel } as any] } as any);
        }
        if (capabilities?.torch && flashEnabled && facingMode === 'environment') {
          await videoTrack.applyConstraints({ advanced: [{ torch: true } as any] } as any);
        }
      } catch {}
    } catch (error: any) {
      if (error?.name === 'NotAllowedError') {
        setPermissionDenied(true);
      } else if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
        // Camera is in use by another tab/app or hardware unavailable — surface to user, not console
        setPermissionDenied(true);
        console.warn('[VybeSnapCamera] Camera unavailable (in use by another app):', error?.name);
      } else if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
        setPermissionDenied(true);
        console.warn('[VybeSnapCamera] No compatible camera found:', error?.name);
      } else {
        console.error('[VybeSnapCamera] Camera error:', error);
      }
    }
  }, [facingMode, soundEnabled, zoomLevel, flashEnabled]);

  // Toggle torch
  useEffect(() => {
    if (!streamRef.current || facingMode === 'user') return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const capabilities = videoTrack.getCapabilities?.() as any;
      if (capabilities?.torch) {
        videoTrack.applyConstraints({ advanced: [{ torch: flashEnabled } as any] } as any).catch(() => {});
      }
    } catch {}
  }, [flashEnabled, facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Reset transient state on every open so a stale `phase === 'edit'` (with
      // a revoked blob URL) from the previous DM open can never crash the modal.
      setPhase('camera');
      setSegments([]);
      segmentsRef.current = [];
      setCapturedMedia(prev => {
        if (prev?.url) { try { URL.revokeObjectURL(prev.url); } catch {} }
        return null;
      });
      setRecordingProgress(0);
      progressRef.current = 0;
      setIsRecording(false);
      isRecordingRef.current = false;
      shouldFinalizeOnStopRef.current = false;

      if (!getActiveStream() && !streamRef.current) {
        setCameraReady(false);
      }
      startCamera();
    }
    if (!isOpen) {
      setCameraReady(false);
    }
    return () => stopCamera();
  }, [isOpen, stopCamera, startCamera]);

  useEffect(() => {
    if (streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  // Start face tracking when camera is ready — guard against null video element
  // and unloaded video metadata (the modal can mount inside an animated DM
  // container before the <video> ref is attached, which crashed startTracking).
  useEffect(() => {
    const vid = videoRef.current;
    if (!cameraReady || !vid || !arReady) {
      if (!cameraReady) stopTracking();
      return;
    }
    let cancelled = false;
    const begin = () => {
      if (cancelled || !videoRef.current) return;
      try { startTracking(videoRef.current); } catch (e) { console.warn('[VybeSnapCamera] face tracking start failed', e); }
    };
    const updateSize = () => {
      if (!videoRef.current) return;
      setVideoSize({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight });
    };
    if (vid.readyState >= 2) {
      begin();
      updateSize();
    } else {
      vid.addEventListener('loadedmetadata', () => { begin(); updateSize(); }, { once: true });
    }
    vid.addEventListener('loadedmetadata', updateSize);
    return () => {
      cancelled = true;
      vid.removeEventListener('loadedmetadata', updateSize);
    };
  }, [cameraReady, arReady, startTracking, stopTracking]);


  // Handle AR filter changes (including Snap lens)
  const handleARFilterChange = useCallback(async (filter: ARFilterDef | null) => {
    setActiveARFilter(filter);
    // If filter has a Snap Lens ID, apply via Snap SDK
    if (filter && (filter as any).snapLensId && snapAvailable) {
      await applySnapLens((filter as any).snapLensId, (filter as any).snapGroupId || '');
    } else {
      await removeSnapLens();
    }
    // Apply CSS filter to the video element
    if (filter?.cssFilter) {
      setSelectedFilter(filter.cssFilter);
    } else {
      setSelectedFilter('none');
    }
  }, [snapAvailable, applySnapLens, removeSnapLens]);
  
  // Pinch-to-zoom
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

  const handleSwitchCamera = useCallback(async () => {
    haptics.impact();
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    if (isRecording && streamRef.current) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: soundEnabled,
        });
        const oldVideoTrack = streamRef.current.getVideoTracks()[0];
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
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
        segmentsRef.current = [...segmentsRef.current, { blob, duration }];
        totalRecordedTimeRef.current += duration;
        setSegments([...segmentsRef.current]);
      }
      
      if (shouldFinalizeOnStopRef.current) {
        shouldFinalizeOnStopRef.current = false;
        const allSegments = segmentsRef.current;
        if (allSegments.length > 0) {
          const finalMimeType = allSegments[0].blob.type;
          const mergedBlob = new Blob(allSegments.map(s => s.blob), { type: finalMimeType });
          const videoUrl = URL.createObjectURL(mergedBlob);
          setCapturedMedia({ url: videoUrl, type: 'video' });
          setPhase('edit');
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

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    haptics.impact();
    setIsRecording(true);
    isRecordingRef.current = true;
    
    const remainingTime = MAX_RECORDING_DURATION * 1000 - totalRecordedTimeRef.current;
    if (remainingTime <= 0) return;
    
    startRecordingSegment();
    const recordingStartTime = Date.now();
    
    const updateProgress = () => {
      const currentSegmentTime = Date.now() - recordingStartTime;
      const totalTime = totalRecordedTimeRef.current + currentSegmentTime;
      const progress = Math.min((totalTime / (MAX_RECORDING_DURATION * 1000)) * 100, 100);
      progressRef.current = progress;
      
      if (progress >= 100) {
        shouldFinalizeOnStopRef.current = true;
        stopRecording();
      } else if (isRecordingRef.current) {
        progressFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };
    progressFrameRef.current = requestAnimationFrame(updateProgress);
    
    uiUpdateRef.current = setInterval(() => {
      setRecordingProgress(progressRef.current);
    }, 100);
  }, [startRecordingSegment]);

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
    setRecordingProgress(progressRef.current);
    haptics.success();
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    haptics.success();
    
    // Selfie flash for front camera
    if (facingMode === 'user' || flashEnabled) {
      setShowFlash(true);
      setSelfieFlash(facingMode === 'user');
      setTimeout(() => { setShowFlash(false); setSelfieFlash(false); }, 200);
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outputWidth = Math.min(1080, video.videoWidth);
    const outputHeight = Math.round(outputWidth * (16/9));
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
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
    
    if (facingMode === 'user') {
      ctx.translate(outputWidth, 0);
      ctx.scale(-1, 1);
    }
    
    // Apply filter to canvas
    const filterObj = LENS_FILTERS.find(f => f.id === selectedFilter);
    if (filterObj && filterObj.filter !== 'none') {
      ctx.filter = filterObj.filter;
    }
    
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    
    const imageUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedMedia({ url: imageUrl, type: 'photo' });
    setPhase('edit');
    stopCamera();
  }, [flashEnabled, facingMode, stopCamera, selectedFilter]);

  // Timer-based capture
  const startTimerCapture = useCallback(() => {
    if (timerSeconds === 0) return;
    setTimerCountdown(timerSeconds);
    let count = timerSeconds;
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        setTimerCountdown(null);
        takePhoto();
      } else {
        setTimerCountdown(count);
        haptics.impact();
      }
    }, 1000);
  }, [timerSeconds, takePhoto]);

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
    if (isRecordingRef.current) {
      shouldFinalizeOnStopRef.current = true;
      stopRecording();
    } else {
      if (timerSeconds > 0) {
        startTimerCapture();
      } else {
        takePhoto();
      }
    }
  }, [stopRecording, takePhoto, timerSeconds, startTimerCapture]);

  const handleEditorSend = useCallback((mediaUrl: string) => {
    setPhase('sending');
    onSend(mediaUrl, capturedMedia?.type === 'video');
    setTimeout(() => {
      setCapturedMedia(null);
      setSegments([]);
      setRecordingProgress(0);
      totalRecordedTimeRef.current = 0;
      setPhase('camera');
      onClose();
    }, 800);
  }, [capturedMedia, onSend, onClose]);

  const handleClose = useCallback(() => {
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
  
  // Gallery pick
  const handleGalleryPick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    setCapturedMedia({ url, type: isVideo ? 'video' : 'photo' });
    setPhase('edit');
    stopCamera();
  }, [stopCamera]);

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
            style={{ background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))', padding: '3px' }}
          >
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
          </motion.div>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-white font-semibold text-lg">
            Sending VYBE...
          </motion.p>
        </div>
      </motion.div>
    );
  }

  const currentFilter = LENS_FILTERS.find(f => f.id === selectedFilter);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
    >
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      
      {/* Camera view */}
      <div 
        className="flex-1 relative overflow-hidden rounded-b-3xl"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {permissionDenied ? (
          <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
              <X className="h-8 w-8 text-destructive" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">Camera Access Denied</p>
            <p className="text-white/50 text-sm mb-6">
              Please enable camera access in your settings.
            </p>
            <Button variant="outline" className="rounded-xl" onClick={() => { setPermissionDenied(false); startCamera(); }}>
              Try Again
            </Button>
          </div>
        ) : !cameraReady ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="mb-4">
              <Loader2 className="h-10 w-10 text-primary" />
            </motion.div>
            <p className="text-white/50 text-sm font-medium">Connecting camera...</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              style={{ 
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                filter: activeARFilter?.cssFilter || (selectedFilter !== 'none' 
                  ? LENS_FILTERS.find(f => f.id === selectedFilter)?.filter 
                  : (nightMode ? 'brightness(1.4) contrast(0.9)' : 'none')),
              }}
              playsInline
              muted
              autoPlay
            />
            {/* AR Overlay Canvas — renders face masks, particles, effects */}
            {activeARFilter && videoSize.width > 0 && (
              <AROverlayCanvas
                faces={faces}
                filter={activeARFilter}
                videoWidth={videoSize.width}
                videoHeight={videoSize.height}
                mirrored={facingMode === 'user'}
              />
            )}
          </>
        )}
        
        {/* Grid overlay */}
        {showGrid && cameraReady && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="w-full h-full grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>
          </div>
        )}

        {/* Selfie flash / regular flash overlay */}
        <AnimatePresence>
          {showFlash && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "absolute inset-0 z-50 pointer-events-none",
                selfieFlash ? "bg-yellow-100" : "bg-white"
              )}
            />
          )}
        </AnimatePresence>

        {/* Timer countdown overlay */}
        <AnimatePresence>
          {timerCountdown !== null && (
            <motion.div
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
            >
              <span className="text-8xl font-black text-white drop-shadow-2xl">{timerCountdown}</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Segment indicators */}
        {(segments.length > 0 || isRecording) && (
          <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
            {segments.map((seg, i) => (
              <div key={i} className="h-1 rounded-full bg-white" style={{ flex: seg.duration / (MAX_RECORDING_DURATION * 1000) }} />
            ))}
            {isRecording && (
              <motion.div
                className="h-1 rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ flex: (recordingProgress - (segments.reduce((a, s) => a + s.duration, 0) / (MAX_RECORDING_DURATION * 10))) / 100 }}
              />
            )}
          </div>
        )}

        {/* Zoom indicator */}
        <AnimatePresence>
          {zoomLevel > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.9 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-10"
            >
              <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_24px_rgba(0,0,0,0.35)] text-[11px] font-semibold tracking-wide text-white">
                {zoomLevel.toFixed(1)}×
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Premium vignette for depth */}
        {cameraReady && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                'radial-gradient(120% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.35) 100%), linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 18%, transparent 70%, rgba(0,0,0,0.55) 100%)',
            }}
          />
        )}
      </div>

      {/* ── Top bar — premium glass ──────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 safe-area-inset-top">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          {/* Left: avatar w/ gradient ring + search pill */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/profile')}
              className="relative h-11 w-11 rounded-full p-[2px] active:scale-95 transition-transform"
              style={{ background: 'conic-gradient(from 140deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))' }}
              aria-label="Profile"
            >
              <div className="h-full w-full rounded-full overflow-hidden bg-black ring-2 ring-black/40">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/40 to-accent/40">
                    <span className="text-sm font-bold text-white">{profile?.username?.[0]?.toUpperCase() || 'V'}</span>
                  </div>
                )}
              </div>
            </button>
            <button
              onClick={() => {}}
              className="h-10 px-3.5 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center gap-2 active:scale-95 transition-transform"
              aria-label="Search lenses"
            >
              <Search className="h-4 w-4 text-white" strokeWidth={2.25} />
              <span className="text-[12px] font-medium text-white/90">Search</span>
            </button>
          </div>

          {/* Right: action pills */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/friends')}
              className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Add friend"
            >
              <UserPlus className="h-[18px] w-[18px] text-white" strokeWidth={2.25} />
            </button>
            <button
              onClick={handleClose}
              className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Close camera"
            >
              <X className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right side vertical tools — unified glass stack ── */}
      <AnimatePresence>
        {showTools && !isRecording && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-3 z-20 flex flex-col p-1.5 gap-1.5 rounded-full bg-white/8 backdrop-blur-2xl border border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 76px)' }}
          >
            {/* Switch camera (primary action gets accent) */}
            <button
              onClick={handleSwitchCamera}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 active:scale-90 transition-transform"
              aria-label="Switch camera"
            >
              <SwitchCamera className="h-[18px] w-[18px] text-white" strokeWidth={2.25} />
            </button>

            {/* Flash */}
            <button
              onClick={() => { setFlashEnabled(!flashEnabled); haptics.impact(); }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all",
                flashEnabled ? "bg-yellow-300/25 ring-1 ring-yellow-300/50" : "hover:bg-white/10"
              )}
              aria-label="Toggle flash"
            >
              {flashEnabled
                ? <Zap className="h-[18px] w-[18px] text-yellow-300" fill="currentColor" />
                : <ZapOff className="h-[18px] w-[18px] text-white/85" strokeWidth={2.25} />}
            </button>

            {/* Timer */}
            <button
              onClick={() => {
                const idx = TIMER_OPTIONS.indexOf(timerSeconds);
                setTimerSeconds(TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length]);
                haptics.impact();
              }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center relative active:scale-90 transition-all",
                timerSeconds > 0 ? "bg-primary/30 ring-1 ring-primary/50" : "hover:bg-white/10"
              )}
              aria-label="Self-timer"
            >
              <Timer className="h-[18px] w-[18px] text-white/85" strokeWidth={2.25} />
              {timerSeconds > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-[15px] min-w-[15px] px-[3px] flex items-center justify-center ring-2 ring-black/40">
                  {timerSeconds}
                </span>
              )}
            </button>

            {/* Grid */}
            <button
              onClick={() => { setShowGrid(!showGrid); haptics.impact(); }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all",
                showGrid ? "bg-white/25 ring-1 ring-white/40" : "hover:bg-white/10"
              )}
              aria-label="Composition grid"
            >
              <Grid3X3 className="h-[18px] w-[18px] text-white/85" strokeWidth={2.25} />
            </button>

            {/* Night Mode */}
            <button
              onClick={() => { setNightMode(!nightMode); haptics.impact(); }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all",
                nightMode ? "bg-yellow-300/20 ring-1 ring-yellow-300/40" : "hover:bg-white/10"
              )}
              aria-label="Night mode"
            >
              {nightMode
                ? <Sun className="h-[18px] w-[18px] text-yellow-300" strokeWidth={2.25} />
                : <Moon className="h-[18px] w-[18px] text-white/85" strokeWidth={2.25} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom area — premium dock ──────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 safe-area-inset-bottom">
        {/* Active filter / lens name chip */}
        <AnimatePresence>
          {!isRecording && (activeARFilter || (currentFilter && currentFilter.id !== 'none')) && (
            <motion.div
              key={activeARFilter?.id || currentFilter?.id}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.22 }}
              className="flex justify-center mb-2"
            >
              <div className="px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[11px] font-semibold tracking-wide text-white">
                  {activeARFilter?.name || currentFilter?.label}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lens/filter carousel */}
        {!isRecording && (
          <div className="px-2 mb-4">
            <ARFilterPicker
              currentFilter={activeARFilter?.id || null}
              onFilterChange={handleARFilterChange}
              isTracking={faces.length > 0}
              isLoading={arLoading}
            />
          </div>
        )}

        {/* Capture row */}
        <div className="flex items-end justify-between px-8 pb-3">
          {/* Gallery */}
          <button
            onClick={handleGalleryPick}
            className="h-12 w-12 rounded-2xl overflow-hidden bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Open gallery"
          >
            <Image className="h-[20px] w-[20px] text-white" strokeWidth={2.25} />
          </button>

          {/* Capture button (slightly elevated) */}
          <div className="-mt-1">
            <VybeRecordButton
              isRecording={isRecording}
              progress={recordingProgress}
              maxDuration={MAX_RECORDING_DURATION}
              onCaptureStart={handleCaptureStart}
              onCaptureEnd={handleCaptureEnd}
            />
          </div>

          {/* Music */}
          <button
            onClick={() => haptics.impact()}
            className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Add music"
          >
            <Music className="h-[20px] w-[20px] text-white" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </motion.div>
  );
});
