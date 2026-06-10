import { useState, useRef, useCallback, useEffect, lazy, Suspense, Component, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Music2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeRecordButton } from '@/components/camera/VybeRecordButton';
import { CreateModeSelector, type CreateMode } from './CreateModeSelector';
import { CreateFilterModeToggle } from './CreateFilterModeToggle';
import { CreateCameraCoach } from './CreateCameraCoach';
import { MobilePostComposer } from './MobilePostComposer';
import { SoundControls } from '@/components/sounds/SoundControls';
import { CameraFilterCarousel, getFilterCSS } from '@/components/camera/CameraFilterCarousel';
import { CameraTopControls } from '@/components/camera/CameraTopControls';
import { CameraZoomIndicator } from '@/components/camera/CameraZoom';
import { AROverlayCanvas } from '@/components/camera/AROverlayCanvas';
import { ARFilterPicker } from '@/components/camera/ARFilterPicker';
import { GalleryDrawer } from './GalleryDrawer';
import { useFaceTracking } from '@/hooks/useFaceTracking';
import { ARFilterDef, getDefaultARFilter, arFilterNeedsFace } from '@/lib/arFilters';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { Sound } from '@/hooks/useSounds';
import { isCameraSafeMode } from '@/lib/cameraSafeMode';
import { captureVideoFrameWithAR } from '@/lib/arCapture';
import { isARSupported, clearARDisabledForSession } from '@/lib/arEngine';
import { createCameraMediaRecorder, recordingBlobType } from '@/lib/cameraRecording';
import { acquirePostCameraStream, attachAudioToStream, stopStream } from '@/lib/postCameraStream';
import { resolveVideoContentType } from '@/lib/resolveVideoContentType';

const SoundPicker = lazy(() =>
  import('@/components/sounds/SoundPicker').then((m) => ({ default: m.SoundPicker }))
);
const MusicGallery = lazy(() =>
  import('@/components/music/MusicGallery').then((m) => ({ default: m.MusicGallery }))
);

class CreateStudioErrorBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[MobileCreateStudio] render crash:', err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center px-8 text-center">
          <p className="text-white font-semibold text-lg mb-2">Camera unavailable</p>
          <p className="text-white/60 text-sm mb-6">Something went wrong opening the camera.</p>
          <Button variant="outline" className="rounded-xl" onClick={this.props.onClose}>
            Close
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface MobileCreateStudioProps {
  onClose: () => void;
  initialSound?: Sound | null;
}

const MAX_RECORDING_DURATION = 60;

export function MobileCreateStudio({ onClose, initialSound }: MobileCreateStudioProps) {
  const [mode, setMode] = useState<CreateMode>('photo');
  const [phase, setPhase] = useState<'camera' | 'compose'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flash, setFlash] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);
  const [composeContentType, setComposeContentType] = useState<'text' | 'post' | 'short' | 'video'>('post');
  const [showFlash, setShowFlash] = useState(false);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(initialSound || null);
  const [selectedTrack, setSelectedTrack] = useState<any>(null);
  const [showMusicGallery, setShowMusicGallery] = useState(false);
  const [soundStartTime, setSoundStartTime] = useState(0);
  const [currentFilter, setCurrentFilter] = useState('normal');
  const [timer, setTimer] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [arFilter, setArFilter] = useState<ARFilterDef | null>(null);
  const [filterMode, setFilterMode] = useState<'color' | 'ar'>('color');
  const [videoDimensions, setVideoDimensions] = useState({ width: 1920, height: 1080 });
  const [showGalleryDrawer, setShowGalleryDrawer] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);

  useEffect(() => {
    if (phase !== 'compose' || capturedFiles.length === 0) return;
    if (mode === 'text') {
      setComposeContentType('text');
      return;
    }
    const file = capturedFiles[0];
    if (!file.type.startsWith('video/')) {
      setComposeContentType('post');
      return;
    }
    let cancelled = false;
    resolveVideoContentType(file).then((type) => {
      if (!cancelled) setComposeContentType(type);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, capturedFiles, mode]);

  // Face tracking / AR — lite mode on phones/WebViews; full on desktop
  const arSupported = isARSupported();
  const safeCamera = isCameraSafeMode();
  const { faces, isReady: arReady, isLoading: arLoading, profile: arProfile, startTracking, stopTracking } = useFaceTracking({
    // Preload face model while camera is open so AR tab feels instant
    enabled: arSupported && phase === 'camera',
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const uiUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const arOverlayRef = useRef<HTMLCanvasElement>(null);

  // Pinch zoom refs
  const lastPinchDistRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const zoomIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    navVisibility.setInCommunityChat(true);
    return () => { navVisibility.setInCommunityChat(false); };
  }, []);

  // Start camera
  const filterModeRef = useRef(filterMode);
  const arReadyRef = useRef(arReady);
  filterModeRef.current = filterMode;
  arReadyRef.current = arReady;

  const startCamera = useCallback(async () => {
    try {
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraReady(false);

      const stream = await acquirePostCameraStream(facingMode);
      if (!mountedRef.current) {
        stopStream(stream);
        return;
      }

      if (!stream) {
        setCameraBlocked(true);
        return;
      }

      setCameraBlocked(false);
      streamRef.current = stream;

      requestAnimationFrame(() => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.onloadedmetadata = () => {
            if (!videoRef.current) return;
            setVideoDimensions({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            });
            if (filterModeRef.current === 'ar' && arReadyRef.current) {
              startTracking(videoRef.current);
            }
          };
          videoRef.current.play().catch(() => {});
          setCameraReady(true);
        } catch (err) {
          console.warn('[MobileCreateStudio] video attach failed:', err);
          setCameraBlocked(true);
        }
      });

      zoomRef.current = 1;
      setZoomLevel(1);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      console.warn('[MobileCreateStudio] Camera error (suppressed):', e?.name || err);
      setCameraBlocked(true);
      setCameraReady(false);
      try {
        const { reportAppCrash } = await import('@/lib/bugReportClient');
        reportAppCrash({
          error: err instanceof Error ? err : new Error(e?.message || e?.name || 'Camera failed'),
          source: 'camera:mobile-create-studio',
          reason: `getUserMedia failed (${e?.name || 'unknown'}): ${e?.message || ''}`.slice(0, 240),
          mode: 'auto',
          context: { facingMode, mode, name: e?.name, message: e?.message },
        }).catch(() => {});
      } catch {}
    }
  }, [facingMode, startTracking]);

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    stopTracking();
    setCameraReady(false);
  }, [stopTracking]);

  useEffect(() => {
    if (filterMode !== 'ar' || !arReady || phase !== 'camera') {
      stopTracking();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const tryStart = () => {
      if (video.videoWidth > 0 && video.readyState >= 2) {
        startTracking(video);
      }
    };

    tryStart();
    video.addEventListener('loadedmetadata', tryStart);
    return () => {
      video.removeEventListener('loadedmetadata', tryStart);
    };
  }, [filterMode, arReady, phase, startTracking, stopTracking, facingMode, cameraReady]);

  useEffect(() => {
    if (phase === 'camera' && mode !== 'text') {
      const delay = safeCamera ? 280 : 120;
      const t = setTimeout(() => {
        if (mountedRef.current) startCamera();
      }, delay);
      return () => {
        clearTimeout(t);
        stopCamera();
      };
    }
    return () => stopCamera();
  }, [phase, startCamera, stopCamera, mode, safeCamera, facingMode]);

  // Pinch-to-zoom handler
  const handlePinchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastPinchDistRef.current = null;
      return;
    }
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (lastPinchDistRef.current !== null) {
      const scale = dist / lastPinchDistRef.current;
      const newZoom = Math.min(5, Math.max(1, zoomRef.current * scale));
      zoomRef.current = newZoom;
      setZoomLevel(newZoom);
      setShowZoomIndicator(true);
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        const caps = track.getCapabilities?.() as any;
        if (caps?.zoom) {
          const nativeZoom = caps.zoom.min + (newZoom - 1) / 4 * (caps.zoom.max - caps.zoom.min);
          try { (track as any).applyConstraints({ advanced: [{ zoom: Math.min(nativeZoom, caps.zoom.max) }] }); } catch {}
        }
      }
      if (zoomIndicatorTimeoutRef.current) clearTimeout(zoomIndicatorTimeoutRef.current);
      zoomIndicatorTimeoutRef.current = setTimeout(() => setShowZoomIndicator(false), 1500);
    }
    lastPinchDistRef.current = dist;
  }, []);

  const previewTransform = `scale(${zoomLevel})`;
  const videoCssFilter =
    safeCamera
      ? undefined
      : filterMode === 'ar'
        ? arFilter?.cssFilter || undefined
        : getFilterCSS(currentFilter) || undefined;

  const handlePinchEnd = useCallback(() => { lastPinchDistRef.current = null; }, []);

  // Take photo with shutter animation
  const takePhoto = useCallback(() => {
    const doCapture = () => {
      if (!videoRef.current || !canvasRef.current) return;
      triggerHaptic('medium');

      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 200);

      if (flash) {
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 150);
      }

      const filterCSS =
        filterMode === 'ar' && arFilter?.cssFilter
          ? arFilter.cssFilter
          : getFilterCSS(currentFilter) || undefined;

      const ok = captureVideoFrameWithAR({
        video: videoRef.current,
        canvas: canvasRef.current,
        facingMode,
        filterCSS: safeCamera ? undefined : filterCSS,
        arOverlay: filterMode === 'ar' ? arOverlayRef.current : null,
      });
      if (!ok) {
        toast.error('Camera not ready — wait a moment and try again');
        return;
      }

      canvasRef.current.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `vybe-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        if (mode === 'multi') {
          if (capturedFiles.length >= 10) return;
          setCapturedFiles(prev => [...prev, file]);
          setCapturedPreviews(prev => [...prev, url]);
        } else {
          setCapturedFiles([file]);
          setCapturedPreviews([url]);
          setPhase('compose');
        }
      }, 'image/jpeg', 0.92);
    };

    if (timer > 0) {
      setTimerCountdown(timer);
      let count = timer;
      const interval = setInterval(() => {
        count--;
        if (count <= 0) { clearInterval(interval); setTimerCountdown(null); doCapture(); }
        else setTimerCountdown(count);
      }, 1000);
    } else {
      doCapture();
    }
  }, [flash, facingMode, mode, capturedFiles.length, timer, currentFilter, filterMode, arFilter, safeCamera]);

  // Recording
  const startRecording = useCallback(async () => {
    if (!streamRef.current) return;
    try {
      if (mode === 'video' || mode === 'photo') {
        await attachAudioToStream(streamRef.current);
      }
      triggerHaptic('heavy');
      isRecordingRef.current = true;
      setIsRecording(true);
      recordedChunksRef.current = [];
      const recorder = createCameraMediaRecorder(streamRef.current);
      const mimeType = recorder.mimeType || recordingBlobType();
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const file = new File([blob], `vybe-video-${Date.now()}.${ext}`, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setCapturedFiles([file]);
          setCapturedPreviews([url]);
          setPhase('compose');
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      const startTime = Date.now();
      const updateProgress = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        progressRef.current = Math.min((elapsed / MAX_RECORDING_DURATION) * 100, 100);
        if (progressRef.current >= 100) stopRecording();
        else if (isRecordingRef.current) progressFrameRef.current = requestAnimationFrame(updateProgress);
      };
      progressFrameRef.current = requestAnimationFrame(updateProgress);
      uiUpdateRef.current = setInterval(() => setRecordingProgress(progressRef.current), 100);
    } catch (err) {
      console.warn('[MobileCreateStudio] Recording failed:', err);
      isRecordingRef.current = false;
      setIsRecording(false);
      toast.error('Video recording is not supported on this device');
    }
  }, [mode]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current);
    if (uiUpdateRef.current) clearInterval(uiUpdateRef.current);
    setRecordingProgress(progressRef.current);
    triggerHaptic('light');
  }, []);

  const handleCaptureStart = useCallback(() => {
    isHoldingRef.current = true;
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current && (mode === 'video' || mode === 'photo')) void startRecording();
    }, 300);
  }, [mode, startRecording]);

  const handleCaptureEnd = useCallback(() => {
    isHoldingRef.current = false;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecordingRef.current) stopRecording();
    else takePhoto();
  }, [stopRecording, takePhoto]);

  // Gallery from drawer
  const handleGallerySelect = useCallback((selected: File[]) => {
    if (selected.length === 0) return;
    if (selected.length > 1 && mode !== 'multi') {
      setMode('multi');
      const items = selected.slice(0, 10);
      const urls = items.map(f => URL.createObjectURL(f));
      setCapturedFiles(items);
      setCapturedPreviews(urls);
      setPhase('compose');
    } else if (mode === 'multi') {
      const remaining = 10 - capturedFiles.length;
      const items = selected.slice(0, remaining);
      const urls = items.map(f => URL.createObjectURL(f));
      setCapturedFiles(prev => [...prev, ...items]);
      setCapturedPreviews(prev => [...prev, ...urls]);
    } else {
      const items = selected.slice(0, 1);
      const urls = items.map(f => URL.createObjectURL(f));
      setCapturedFiles(items);
      setCapturedPreviews(urls);
      setPhase('compose');
    }
  }, [mode, capturedFiles.length]);

  // Legacy file input handler (for fileInputRef fallback)
  const handleGalleryPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) handleGallerySelect(selected);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleGallerySelect]);

  const removeMultiItem = useCallback((index: number) => {
    setCapturedPreviews(prev => { URL.revokeObjectURL(prev[index]); return prev.filter((_, i) => i !== index); });
    setCapturedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleModeChange = (newMode: CreateMode) => {
    setMode(newMode);
    if (newMode === 'text') {
      stopCamera();
      setCapturedFiles([]);
      setCapturedPreviews([]);
      setPhase('compose');
    } else if (phase === 'compose' && capturedFiles.length === 0) {
      setPhase('camera');
    }
  };

  const handleMultiDone = () => {
    if (capturedFiles.length > 0) setPhase('compose');
  };

  // Compose phase
  if (phase === 'compose') {
    return (
      <MobilePostComposer
        files={capturedFiles}
        previews={capturedPreviews}
        contentType={composeContentType}
        selectedSound={selectedSound}
        soundStartTime={soundStartTime}
        onBack={() => {
          if (mode !== 'text') {
            capturedPreviews.forEach(p => URL.revokeObjectURL(p));
            setCapturedFiles([]);
            setCapturedPreviews([]);
            setPhase('camera');
          } else {
            onClose();
          }
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <CreateStudioErrorBoundary onClose={onClose}>
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleGalleryPick} className="hidden" />

      {/* Camera viewfinder */}
      <div
        className="flex-1 relative overflow-hidden"
        onTouchMove={handlePinchMove}
        onTouchEnd={handlePinchEnd}
      >
        <div
          className="absolute inset-0 w-full h-full origin-center transition-transform duration-75"
          style={{ transform: previewTransform }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            disablePictureInPicture
            className={cn(
              'w-full h-full object-cover bg-black',
              facingMode === 'user' && 'scale-x-[-1]',
            )}
            style={{
              backgroundColor: '#000',
              filter: videoCssFilter,
            }}
          />

          {filterMode === 'ar' && arFilter && cameraReady && (
            <AROverlayCanvas
              ref={arOverlayRef}
              faces={faces}
              filter={arFilter}
              videoWidth={videoDimensions.width}
              videoHeight={videoDimensions.height}
              mirrored={facingMode === 'user'}
              scanning={arFilterNeedsFace(arFilter) && faces.length === 0}
            />
          )}
        </div>

        {!cameraReady && !cameraBlocked && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <Loader2 className="w-10 h-10 text-white/70 animate-spin" />
          </div>
        )}

        {cameraBlocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/80 px-8 text-center">
            <p className="text-white font-medium mb-2">Camera couldn&apos;t start</p>
            <p className="text-white/60 text-sm mb-4">Tap below to try again. Close other apps using the camera.</p>
            <Button className="rounded-xl" onClick={() => { setCameraBlocked(false); startCamera(); }}>
              Enable camera
            </Button>
          </div>
        )}

        {/* Viewfinder guides */}
        <div className="pointer-events-none absolute inset-0 z-[12]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)]" />
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '33.33% 33.33%',
            }}
          />
        </div>

        <CreateCameraCoach />

        <CameraZoomIndicator zoom={zoomLevel} visible={showZoomIndicator} />

        {/* Shutter flash — white flash + scale bounce */}
        <AnimatePresence>
          {shutterFlash && (
            <motion.div
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 0.97 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 z-50 bg-white pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Selfie flash */}
        <AnimatePresence>
          {showFlash && (
            <motion.div
              initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-50 bg-white pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Timer countdown */}
        <AnimatePresence>
          {timerCountdown !== null && (
            <motion.div
              key={timerCountdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
            >
              <span className="text-white text-8xl font-display font-bold drop-shadow-2xl">{timerCountdown}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording timer */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="absolute top-[calc(var(--sat,0px)+4rem)] left-1/2 -translate-x-1/2 flex items-center gap-2 bg-destructive/80 px-4 py-2 rounded-full z-20"
            >
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2.5 h-2.5 bg-white rounded-full" />
              <span className="text-white font-mono text-sm">
                {Math.floor((progressRef.current / 100 * MAX_RECORDING_DURATION) / 60).toString().padStart(2, '0')}:
                {Math.floor((progressRef.current / 100 * MAX_RECORDING_DURATION) % 60).toString().padStart(2, '0')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sound Controls */}
        <AnimatePresence>
          {selectedSound && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute top-[calc(var(--sat,0px)+5rem)] left-4 right-4 z-20">
              <SoundControls sound={selectedSound} startTime={soundStartTime} onStartTimeChange={setSoundStartTime} onRemoveSound={() => setSelectedSound(null)} compact />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Multi mode thumbnails */}
        {mode === 'multi' && capturedPreviews.length > 0 && (
          <div className="absolute top-[calc(var(--sat,0px)+4rem)] left-0 right-0 z-20 px-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
              {capturedPreviews.map((p, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 border-white/60">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{i + 1}</div>
                  <button onClick={(e) => { e.stopPropagation(); removeMultiItem(i); }} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <span className="text-white/60 text-xs self-center ml-1">{capturedPreviews.length}/10</span>
            </div>
          </div>
        )}
      </div>

      {/* Top Controls */}
      <CameraTopControls
        onClose={onClose}
        flash={flash}
        onFlashToggle={() => setFlash(!flash)}
        onFlipCamera={() => {
          setFacingMode(f => f === 'user' ? 'environment' : 'user');
          zoomRef.current = 1;
          setZoomLevel(1);
        }}
        timer={timer}
        onTimerChange={setTimer}
      />

      {/* Bottom chrome — Snapchat-style stack */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="pointer-events-auto bg-gradient-to-t from-black via-black/85 to-transparent pt-16 pb-safe">
          <CreateFilterModeToggle
            mode={filterMode}
            arSupported={arSupported}
            onChange={(next) => {
              setFilterMode(next);
              if (next === 'ar') {
                clearARDisabledForSession();
                if (!arFilter) {
                  const first = getDefaultARFilter();
                  if (first) setArFilter(first);
                }
              }
            }}
          />

          <div className="mb-1">
            {filterMode === 'ar' && arSupported ? (
              <ARFilterPicker
                currentFilter={arFilter?.id || null}
                onFilterChange={setArFilter}
                isTracking={faces.length > 0}
                isLoading={arLoading}
              />
            ) : (
              <CameraFilterCarousel currentFilter={currentFilter} onFilterChange={setCurrentFilter} />
            )}
          </div>

          <div className="flex items-center justify-center gap-5 px-6 pb-3 pt-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowMusicGallery(true)}
              className={cn(
                'w-[52px] h-[52px] rounded-2xl flex items-center justify-center',
                'bg-white/10 backdrop-blur-xl border border-white/15 touch-manipulation',
                (selectedSound || selectedTrack) && 'border-primary/60 bg-primary/15',
              )}
              aria-label="Add sound"
            >
              <Music2 className="h-6 w-6 text-white" />
            </motion.button>

            <VybeRecordButton
              isRecording={isRecording}
              progress={recordingProgress}
              maxDuration={MAX_RECORDING_DURATION}
              onCaptureStart={handleCaptureStart}
              onCaptureEnd={handleCaptureEnd}
            />

            {mode === 'multi' && capturedFiles.length > 0 ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={handleMultiDone}
                className="w-[52px] h-[52px] rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-lg shadow-primary/40 touch-manipulation"
              >
                Done
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowGalleryDrawer(true)}
                className="w-[52px] h-[52px] rounded-2xl overflow-hidden border-2 border-white/50 touch-manipulation shadow-lg"
                aria-label="Open gallery"
              >
                {capturedPreviews.length > 0 ? (
                  <img src={capturedPreviews[capturedPreviews.length - 1]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/10 backdrop-blur-md">
                    <ImageIcon className="w-6 h-6 text-white/80" />
                  </div>
                )}
              </motion.button>
            )}
          </div>

          <CreateModeSelector currentMode={mode} onModeChange={handleModeChange} />

          <AnimatePresence>
            {!isRecording && timerCountdown === null && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-white/40 text-[10px] tracking-wide pb-2 px-4"
              >
                {mode === 'multi'
                  ? 'Tap shutter · Up to 10 shots'
                  : 'Tap photo · Hold video · Pinch to zoom'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Gallery Drawer */}
      <GalleryDrawer
        open={showGalleryDrawer}
        onClose={() => setShowGalleryDrawer(false)}
        onSelect={handleGallerySelect}
        multiple={mode === 'multi'}
      />

      {/* Music Gallery */}
      <AnimatePresence>
        {showMusicGallery && (
          <Suspense fallback={null}>
            <MusicGallery
              onSelectTrack={(track) => { setSelectedTrack(track); setSelectedSound(null); setShowMusicGallery(false); }}
              onClose={() => setShowMusicGallery(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <Suspense fallback={null}>
        <SoundPicker
          open={showSoundPicker}
          onClose={() => setShowSoundPicker(false)}
          onSelectSound={(sound) => { setSelectedSound(sound); setSelectedTrack(null); }}
          selectedSoundId={selectedSound?.sound_id}
        />
      </Suspense>
    </div>
    </CreateStudioErrorBoundary>
  );
}
