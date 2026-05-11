import { useState, useRef, useCallback, useEffect, forwardRef, Component, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, SwitchCamera, Zap, ZapOff, Loader2, Timer, Grid3X3,
  Sun, Moon, Image as ImageIcon, Sparkles, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { VybeRecordButton } from './VybeRecordButton';
import { VybeSnapEditor } from './VybeSnapEditor';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { getActiveStream, stopCameraStream } from '@/hooks/useCameraPreload';

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
const TIMER_OPTIONS = [0, 3, 10] as const;

const LENS_FILTERS = [
  { id: 'none', label: 'Normal', filter: 'none' },
  { id: 'warm', label: 'Warm', filter: 'saturate(1.3) sepia(0.15) brightness(1.05)' },
  { id: 'cool', label: 'Cool', filter: 'saturate(0.9) hue-rotate(10deg) brightness(1.05)' },
  { id: 'vintage', label: 'Vintage', filter: 'sepia(0.4) contrast(1.1) brightness(0.95)' },
  { id: 'vivid', label: 'Vivid', filter: 'saturate(1.6) contrast(1.1)' },
  { id: 'bw', label: 'B&W', filter: 'grayscale(1) contrast(1.2)' },
  { id: 'dreamy', label: 'Dreamy', filter: 'brightness(1.1) contrast(0.9) saturate(1.2) blur(0.3px)' },
  { id: 'noir', label: 'Noir', filter: 'grayscale(0.8) contrast(1.4) brightness(0.9)' },
];

// ── Crash safety: render-time error boundary so a thrown effect/render
// inside the camera surface doesn't blow up the entire WebView (Despia).
class CameraErrorBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.warn('[VybeSnapCamera] render error', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center px-8 text-center">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4">
            <X className="h-8 w-8 text-white" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">Camera unavailable</p>
          <p className="text-white/60 text-sm mb-6">Something went wrong opening the camera.</p>
          <Button variant="outline" className="rounded-xl" onClick={this.props.onClose}>Close</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const isDespia = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /despia/i.test(ua);
};

export const VybeSnapCamera = forwardRef<HTMLDivElement, VybeSnapCameraProps>(function VybeSnapCamera({ isOpen, onClose, onSend }, _ref) {
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
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [showGrid, setShowGrid] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [selfieFlash, setSelfieFlash] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

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

  // ── Defensive camera open ──
  const startCamera = useCallback(async () => {
    try {
      // Skip Permissions API entirely on Despia/Android WebView — it can throw
      // synchronously and crash the wrapper. Native permission UI handles it.
      if (!isDespia() && navigator.permissions) {
        try {
          const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (camStatus.state === 'denied') {
            setPermissionDenied(true);
            return;
          }
        } catch {/* swallow — unsupported in WebViews */}
      }

      // Reuse a preloaded stream only if its tracks are still live.
      const preloaded = getActiveStream();
      if (preloaded) {
        const tracks = preloaded.getTracks();
        const allLive = tracks.length > 0 && tracks.every(t => t.readyState === 'live');
        const videoTrack = preloaded.getVideoTracks()[0];
        const settings = videoTrack?.getSettings?.();
        const currentFacing = settings?.facingMode || 'user';
        const hasAudio = preloaded.getAudioTracks().length > 0;

        if (allLive && currentFacing === facingMode && hasAudio === soundEnabled) {
          streamRef.current = preloaded;
          setPermissionDenied(false);
          setCameraReady(true);
          // Defer attaching the source until the <video> exists in the DOM.
          requestAnimationFrame(() => {
            if (videoRef.current && streamRef.current) {
              videoRef.current.srcObject = streamRef.current;
              videoRef.current.play().catch(() => {});
            }
          });
          return;
        }
        try { stopCameraStream(); } catch {}
      }

      // Tear down any prior stream we owned
      if (streamRef.current) {
        try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
        streamRef.current = null;
      }

      // Try simple constraints first (safer in WebViews), then refine.
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: soundEnabled,
        });
      } catch (simpleErr: any) {
        // Fall back to "any camera" if facingMode failed
        if (simpleErr?.name === 'OverconstrainedError' || simpleErr?.name === 'NotFoundError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: soundEnabled });
        } else {
          throw simpleErr;
        }
      }

      setPermissionDenied(false);
      setCameraReady(true);
      streamRef.current = stream;

      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      });

      // Best-effort torch / zoom on the new track (never throw)
      const videoTrack = stream.getVideoTracks()[0];
      try {
        const capabilities = videoTrack?.getCapabilities?.() as any;
        if (capabilities?.torch && flashEnabled && facingMode === 'environment') {
          videoTrack.applyConstraints({ advanced: [{ torch: true } as any] } as any).catch(() => {});
        }
      } catch {}
    } catch (error: any) {
      const name = error?.name;
      if (name === 'NotAllowedError') setPermissionDenied(true);
      else if (name === 'NotReadableError' || name === 'AbortError' || name === 'NotFoundError' || name === 'OverconstrainedError') {
        setPermissionDenied(true);
        console.warn('[VybeSnapCamera] Camera unavailable:', name);
      } else {
        setPermissionDenied(true);
        console.error('[VybeSnapCamera] Camera error:', error);
      }
    }
  }, [facingMode, soundEnabled, flashEnabled]);

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
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCameraReady(false);
      return;
    }
    // Reset transient state every open so a stale phase from prior open can't crash.
    setPhase('camera');
    setSegments([]);
    segmentsRef.current = [];
    setCapturedMedia(prev => {
      if (prev?.url?.startsWith('blob:')) { try { URL.revokeObjectURL(prev.url); } catch {} }
      return null;
    });
    setRecordingProgress(0);
    progressRef.current = 0;
    setIsRecording(false);
    isRecordingRef.current = false;
    shouldFinalizeOnStopRef.current = false;
    setShowFilters(false);
    setShowMore(false);

    if (!getActiveStream() && !streamRef.current) setCameraReady(false);
    // Defer init one frame so the <video> is mounted before we attach a stream.
    const id = requestAnimationFrame(() => { startCamera(); });
    return () => {
      cancelAnimationFrame(id);
      stopCamera();
    };
  }, [isOpen, stopCamera, startCamera]);

  useEffect(() => {
    if (!cameraReady) return;
    if (streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraReady]);

  // Pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
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

  const handleSwitchCamera = useCallback(() => {
    haptics.impact();
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  const startRecordingSegment = useCallback(() => {
    if (!streamRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      console.warn('[VybeSnapCamera] MediaRecorder not available on this device');
      return;
    }
    recordedChunksRef.current = [];

    const supports = (t: string) => {
      try { return MediaRecorder.isTypeSupported?.(t); } catch { return false; }
    };
    const mimeType = supports('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : supports('video/webm')
        ? 'video/webm'
        : 'video/mp4';

    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
    } catch {
      try { mediaRecorder = new MediaRecorder(streamRef.current); } catch (e) { console.warn('[VybeSnapCamera] MediaRecorder unavailable', e); return; }
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mediaRecorder.mimeType || mimeType });
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
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }
        }
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100);
    recordingStartTimeRef.current = Date.now();
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
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
  }, [startRecordingSegment, stopRecording]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    haptics.success();

    if (facingMode === 'user' || flashEnabled) {
      setShowFlash(true);
      setSelfieFlash(facingMode === 'user');
      setTimeout(() => { setShowFlash(false); setSelfieFlash(false); }, 200);
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outputWidth = Math.min(1080, video.videoWidth || 1080);
    const outputHeight = Math.round(outputWidth * (16 / 9));
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const vw = video.videoWidth || outputWidth;
    const vh = video.videoHeight || outputHeight;
    const videoAspect = vw / vh;
    const targetAspect = 9 / 16;
    let sx = 0, sy = 0, sw = vw, sh = vh;

    if (videoAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }

    if (facingMode === 'user') {
      ctx.translate(outputWidth, 0);
      ctx.scale(-1, 1);
    }

    const filterObj = LENS_FILTERS.find(f => f.id === selectedFilter);
    if (filterObj && filterObj.filter !== 'none') ctx.filter = filterObj.filter;

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
      if (isHoldingRef.current) startRecording();
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
    } else if (timerSeconds > 0) {
      startTimerCapture();
    } else {
      takePhoto();
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

  const handleGalleryPick = useCallback(() => fileInputRef.current?.click(), []);

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
      <CameraErrorBoundary onClose={handleClose}>
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
      </CameraErrorBoundary>
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
        <div className="flex flex-col items-center gap-5">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="h-10 w-10 text-white" />
          </motion.div>
          <p className="text-white/80 text-sm font-medium">Sending…</p>
        </div>
      </motion.div>
    );
  }

  return (
    <CameraErrorBoundary onClose={handleClose}>
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

        {/* Camera surface */}
        <div
          className="flex-1 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          {permissionDenied ? (
            <div className="w-full h-full flex flex-col items-center justify-center px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <X className="h-8 w-8 text-white" />
              </div>
              <p className="text-white font-semibold text-lg mb-2">Camera unavailable</p>
              <p className="text-white/60 text-sm mb-6">Enable camera access in your settings to take a Snap.</p>
              <Button variant="outline" className="rounded-xl" onClick={() => { setPermissionDenied(false); startCamera(); }}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                  filter: selectedFilter !== 'none'
                    ? LENS_FILTERS.find(f => f.id === selectedFilter)?.filter
                    : (nightMode ? 'brightness(1.4) contrast(0.9)' : 'none'),
                }}
                playsInline
                muted
                autoPlay
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}>
                    <Loader2 className="h-8 w-8 text-white/70" />
                  </motion.div>
                </div>
              )}
            </>
          )}

          {/* Grid */}
          {showGrid && cameraReady && (
            <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/15" />
              ))}
            </div>
          )}

          {/* Flash overlay */}
          <AnimatePresence>
            {showFlash && (
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'absolute inset-0 z-50 pointer-events-none',
                  selfieFlash ? 'bg-yellow-100' : 'bg-white'
                )}
              />
            )}
          </AnimatePresence>

          {/* Timer countdown */}
          <AnimatePresence>
            {timerCountdown !== null && (
              <motion.div
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
              >
                <span className="text-8xl font-light text-white drop-shadow-2xl">{timerCountdown}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Segment / progress indicators */}
          {(segments.length > 0 || isRecording) && (
            <div className="absolute top-3 left-4 right-4 flex gap-1 z-10">
              {segments.map((seg, i) => (
                <div key={i} className="h-[3px] rounded-full bg-white" style={{ flex: seg.duration / (MAX_RECORDING_DURATION * 1000) }} />
              ))}
              {isRecording && (
                <div
                  className="h-[3px] rounded-full bg-white"
                  style={{
                    flex: Math.max(0,
                      (recordingProgress - (segments.reduce((a, s) => a + s.duration, 0) / (MAX_RECORDING_DURATION * 10))) / 100
                    ),
                  }}
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
                <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-[11px] font-medium text-white">
                  {zoomLevel.toFixed(1)}×
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Top bar — minimal IG style ── */}
        <div className="absolute top-0 left-0 right-0 z-20" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <button
              onClick={handleClose}
              className="h-10 w-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Close camera"
            >
              <X className="h-7 w-7 text-white drop-shadow-md" strokeWidth={2.25} />
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => { setFlashEnabled(v => !v); haptics.impact(); }}
                className="h-10 w-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Toggle flash"
              >
                {flashEnabled
                  ? <Zap className="h-6 w-6 text-yellow-300 drop-shadow-md" fill="currentColor" />
                  : <ZapOff className="h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />}
              </button>
              <button
                onClick={handleSwitchCamera}
                className="h-10 w-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />
              </button>
              <button
                onClick={() => { setShowMore(true); haptics.impact(); }}
                className="h-10 w-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                aria-label="More options"
              >
                <MoreHorizontal className="h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Filter strip — appears above shutter */}
          <AnimatePresence>
            {showFilters && !isRecording && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.2 }}
                className="px-4 pb-4"
              >
                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                  {LENS_FILTERS.map(f => {
                    const active = selectedFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => { setSelectedFilter(f.id); haptics.impact(); }}
                        className={cn(
                          'shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition-transform',
                        )}
                      >
                        <div className={cn(
                          'w-14 h-14 rounded-full overflow-hidden ring-2 transition-all',
                          active ? 'ring-white scale-110' : 'ring-white/20'
                        )}>
                          <video
                            // tiny preview using current stream — not strictly necessary; show solid fill
                            className="w-full h-full object-cover"
                            style={{
                              filter: f.filter === 'none' ? 'none' : f.filter,
                              background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
                            }}
                            ref={(el) => {
                              if (el && streamRef.current && !el.srcObject) {
                                try { el.srcObject = streamRef.current; el.play().catch(() => {}); } catch {}
                              }
                            }}
                            muted
                            playsInline
                            autoPlay
                          />
                        </div>
                        <span className={cn(
                          'text-[10px] font-medium tracking-wide',
                          active ? 'text-white' : 'text-white/60'
                        )}>
                          {f.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Shutter row — IG/Snap layout */}
          <div className="flex items-center justify-between px-10 pb-6">
            <button
              onClick={handleGalleryPick}
              className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Open gallery"
            >
              <ImageIcon className="h-6 w-6 text-white" strokeWidth={2.25} />
            </button>

            <VybeRecordButton
              isRecording={isRecording}
              progress={recordingProgress}
              maxDuration={MAX_RECORDING_DURATION}
              onCaptureStart={handleCaptureStart}
              onCaptureEnd={handleCaptureEnd}
            />

            <button
              onClick={() => { setShowFilters(v => !v); haptics.impact(); }}
              className={cn(
                'h-12 w-12 rounded-2xl backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform',
                showFilters ? 'bg-white text-black' : 'bg-white/15 text-white'
              )}
              aria-label="Toggle filters"
            >
              <Sparkles className="h-6 w-6" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* ── More sheet ── */}
        <Sheet open={showMore} onOpenChange={setShowMore}>
          <SheetContent
            side="bottom"
            className="bg-black/95 backdrop-blur-xl border-white/10 rounded-t-3xl text-white pb-safe"
          >
            <SheetTitle className="text-white text-base font-semibold mb-4">Options</SheetTitle>

            {/* Timer */}
            <div className="space-y-2 mb-5">
              <p className="text-xs uppercase tracking-wider text-white/50 font-medium">Timer</p>
              <div className="flex gap-2">
                {TIMER_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setTimerSeconds(s); haptics.impact(); }}
                    className={cn(
                      'flex-1 h-11 rounded-xl text-sm font-medium transition-colors',
                      timerSeconds === s ? 'bg-white text-black' : 'bg-white/10 text-white/80'
                    )}
                  >
                    {s === 0 ? 'Off' : `${s}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="divide-y divide-white/10 rounded-2xl bg-white/5 overflow-hidden">
              <ToggleRow
                icon={<Grid3X3 className="h-5 w-5" />}
                label="Grid"
                value={showGrid}
                onChange={() => { setShowGrid(v => !v); haptics.impact(); }}
              />
              <ToggleRow
                icon={nightMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                label="Night mode"
                value={nightMode}
                onChange={() => { setNightMode(v => !v); haptics.impact(); }}
              />
              <ToggleRow
                icon={<Timer className="h-5 w-5" />}
                label="Sound"
                value={soundEnabled}
                onChange={() => { setSoundEnabled(v => !v); haptics.impact(); }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </motion.div>
    </CameraErrorBoundary>
  );
});

function ToggleRow({ icon, label, value, onChange }: { icon: ReactNode; label: string; value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-3 text-white">
        <span className="text-white/80">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span
        className={cn(
          'h-6 w-10 rounded-full relative transition-colors',
          value ? 'bg-white' : 'bg-white/20'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all',
            value ? 'left-[18px]' : 'left-0.5 bg-white'
          )}
        />
      </span>
    </button>
  );
}
