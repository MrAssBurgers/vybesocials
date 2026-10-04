import { useState, useRef, useCallback, useEffect, lazy, Suspense, Component, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { ArFiltersComingSoon } from '@/components/camera/ArFiltersComingSoon';
import { GalleryDrawer } from './GalleryDrawer';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { Sound, useSound } from '@/hooks/useSounds';
import { isCameraSafeMode } from '@/lib/cameraSafeMode';
import { buildRecordingFile, createCameraMediaRecorder, startCameraRecorder } from '@/lib/cameraRecording';
import { acquirePostCameraStream, attachAudioToStream, stopStream } from '@/lib/postCameraStream';
import { useDoubleTapCameraFlip } from '@/hooks/useDoubleTapCameraFlip';
import { resolveVideoContentType } from '@/lib/resolveVideoContentType';
import { useCameraOverlay } from '@/contexts/cameraOverlaySafe';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { toast } from 'sonner';

type PrefillMedia = {
  file?: File;
  url?: string;
  type?: 'photo' | 'video' | string;
};

type UploadLocationState = {
  prefillMedia?: PrefillMedia;
  captureTarget?: string;
  selectedSoundId?: string;
  soundStartTime?: number;
  prefillCaption?: string;
};

async function resolvePrefillMedia(media: PrefillMedia): Promise<{ file: File; url: string } | null> {
  if (media.file instanceof File) {
    return { file: media.file, url: media.url || URL.createObjectURL(media.file) };
  }
  if (!media.url) return null;
  try {
    const res = await fetch(media.url);
    const blob = await res.blob();
    const isVideo = media.type === 'video' || blob.type.startsWith('video/');
    const file = new File(
      [blob],
      `vybe-prefill-${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      { type: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg') },
    );
    return { file, url: media.url.startsWith('blob:') ? media.url : URL.createObjectURL(blob) };
  } catch {
    return null;
  }
}

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
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openCamera } = useCameraOverlay();
  const locationState = (location.state || {}) as UploadLocationState;
  const [soundIdFromNav] = useState(locationState.selectedSoundId || '');
  const [prefillCaption] = useState(locationState.prefillCaption || '');
  const { data: soundFromNav } = useSound(soundIdFromNav);

  const initialPhase =
    searchParams.get('phase') === 'compose' || !!locationState.prefillMedia ? 'compose' : 'camera';

  const [mode, setMode] = useState<CreateMode>('photo');
  const [phase, setPhase] = useState<'camera' | 'compose'>(initialPhase);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [flash, setFlash] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const [capturedPreviews, setCapturedPreviews] = useState<string[]>([]);
  const [composeContentType, setComposeContentType] = useState<'text' | 'post' | 'short' | 'video'>('post');
  const [showFlash, setShowFlash] = useState(false);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(initialSound || null);
  const [prefillLoading, setPrefillLoading] = useState(() => !!locationState.prefillMedia);
  const prefillAppliedRef = useRef(false);
  const [selectedTrack, setSelectedTrack] = useState<any>(null);
  const [showMusicGallery, setShowMusicGallery] = useState(false);
  const [soundStartTime, setSoundStartTime] = useState(Math.max(0, locationState.soundStartTime || 0));
  const [currentFilter, setCurrentFilter] = useState('snap');
  const [timer, setTimer] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [filterMode, setFilterMode] = useState<'color' | 'ar'>('color');
  const [showGalleryDrawer, setShowGalleryDrawer] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const captureEnabled = cameraReady && !cameraBlocked;

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

  // AR face filters are Coming Soon — do not start MediaPipe / overlay tracking.
  const safeCamera = isCameraSafeMode();

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

  // Pinch zoom refs
  const lastPinchDistRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const zoomIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);

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

  const goToCompose = useCallback(() => {
    setPhase('compose');
    setSearchParams({ phase: 'compose' }, { replace: true });
  }, [setSearchParams]);

  const goToCamera = useCallback(() => {
    setPhase('camera');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // Snap / camera handoff + Sounds remix: seed composer once
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const prefill = locationState.prefillMedia;
    if (!prefill) {
      setPrefillLoading(false);
      return;
    }
    prefillAppliedRef.current = true;
    let cancelled = false;
    void (async () => {
      const resolved = await resolvePrefillMedia(prefill);
      if (cancelled) return;
      if (!resolved) {
        toast.error('Could not load captured media');
        setPrefillLoading(false);
        goToCamera();
        navigate(location.pathname, { replace: true, state: {} });
        return;
      }
      setCapturedFiles([resolved.file]);
      setCapturedPreviews([resolved.url]);
      if (locationState.captureTarget === 'clip') {
        setComposeContentType('short');
        setMode('video');
      } else if (resolved.file.type.startsWith('video/')) {
        setMode('video');
      } else {
        setMode('photo');
        setComposeContentType('post');
      }
      setPrefillLoading(false);
      goToCompose();
      navigate(`${location.pathname}?phase=compose`, { replace: true, state: {} });
    })();
    return () => {
      cancelled = true;
    };
  }, [locationState.prefillMedia, locationState.captureTarget, goToCompose, goToCamera, navigate, location.pathname]);

  useEffect(() => {
    if (!soundFromNav || selectedSound?.sound_id === soundFromNav.sound_id) return;
    setSelectedSound(soundFromNav);
  }, [soundFromNav, selectedSound?.sound_id]);

  // Start camera
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
            const el = videoRef.current;
            if (el.videoWidth > 0 && el.videoHeight > 0) {
              setCameraReady(true);
            }
          };
          videoRef.current.play().catch(() => {});
          const el = videoRef.current;
          if (el && el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0) {
            setCameraReady(true);
          }
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
  }, [facingMode, mode]);

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setCameraReady(false);
  }, []);

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
    safeCamera || filterMode === 'ar'
      ? undefined
      : getFilterCSS(currentFilter) || undefined;

  const handlePinchEnd = useCallback(() => { lastPinchDistRef.current = null; }, []);

  const flipCamera = useCallback(() => {
    setFacingMode((f) => (f === 'user' ? 'environment' : 'user'));
    zoomRef.current = 1;
    setZoomLevel(1);
  }, []);

  const onDoubleTapFlip = useDoubleTapCameraFlip(flipCamera);

  const handleViewfinderTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      tapStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleViewfinderTouchEnd = useCallback((e: React.TouchEvent) => {
    handlePinchEnd();
    if (isRecordingRef.current || timerCountdown !== null) return;
    if (e.changedTouches.length === 1 && e.touches.length === 0 && tapStartRef.current) {
      const end = e.changedTouches[0];
      const moved = Math.hypot(
        end.clientX - tapStartRef.current.x,
        end.clientY - tapStartRef.current.y,
      );
      tapStartRef.current = null;
      if (moved < 24) onDoubleTapFlip(e);
      return;
    }
    tapStartRef.current = null;
  }, [handlePinchEnd, onDoubleTapFlip, timerCountdown]);

  // Take photo with shutter animation
  const takePhoto = useCallback(() => {
    const doCapture = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      triggerHaptic('medium');

      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 200);

      if (flash) {
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 150);
      }

      const { captureVideoFrame } = await import('@/lib/cameraCapture');
      const filterCSS = filterMode === 'color' ? getFilterCSS(currentFilter) || undefined : undefined;

      const ok = captureVideoFrame({
        video: videoRef.current,
        canvas: canvasRef.current,
        facingMode,
        filterCSS: safeCamera ? undefined : filterCSS,
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
          goToCompose();
        }
      }, 'image/jpeg', 0.92);
    };

    if (timer > 0) {
      setTimerCountdown(timer);
      let count = timer;
      const interval = setInterval(() => {
        count--;
        if (count <= 0) { clearInterval(interval); setTimerCountdown(null); void doCapture(); }
        else setTimerCountdown(count);
      }, 1000);
    } else {
      void doCapture();
    }
  }, [flash, facingMode, mode, capturedFiles.length, timer, currentFilter, filterMode, safeCamera, goToCompose]);

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
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const { blob, file } = buildRecordingFile(
          recordedChunksRef.current,
          recorder,
          `vybe-video-${Date.now()}`,
        );
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setCapturedFiles([file]);
          setCapturedPreviews([url]);
          goToCompose();
        }
      };
      startCameraRecorder(recorder);
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
  }, [mode, goToCompose]);

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
      goToCompose();
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
      goToCompose();
    }
  }, [mode, capturedFiles.length, goToCompose]);

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
    // [iOS/Android shared] Story uses snap camera → story destination, not feed composer
    if (newMode === 'story') {
      onClose();
      void openSnapCamera(openCamera, { source: 'create', defaultDestination: 'story' });
      return;
    }
    setMode(newMode);
    if (newMode === 'text') {
      stopCamera();
      setCapturedFiles([]);
      setCapturedPreviews([]);
      setComposeContentType('text');
      goToCompose();
    } else if (phase === 'compose' && capturedFiles.length === 0) {
      goToCamera();
    }
  };

  const handleMultiDone = () => {
    if (capturedFiles.length > 0) goToCompose();
  };

  // Prefill still resolving — avoid flashing empty camera/composer
  if (prefillLoading) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white/70 animate-spin" />
      </div>
    );
  }

  // Compose phase
  if (phase === 'compose') {
    return (
      <MobilePostComposer
        initialCaption={prefillCaption}
        files={capturedFiles}
        previews={capturedPreviews}
        contentType={mode === 'text' ? 'text' : composeContentType}
        selectedSound={selectedSound}
        soundStartTime={soundStartTime}
        onBack={() => {
          if (mode !== 'text') {
            capturedPreviews.forEach(p => URL.revokeObjectURL(p));
            setCapturedFiles([]);
            setCapturedPreviews([]);
            goToCamera();
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
        onTouchStart={handleViewfinderTouchStart}
        onTouchMove={handlePinchMove}
        onTouchEnd={handleViewfinderTouchEnd}
        onDoubleClick={(e) => onDoubleTapFlip(e)}
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

        {/* Soft vignette only — cleaner studio look */}
        <div className="pointer-events-none absolute inset-0 z-[12]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.4)_100%)]" />
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
        onFlipCamera={flipCamera}
        timer={timer}
        onTimerChange={setTimer}
        disabled={!captureEnabled}
      />

      {/* Bottom chrome — YouTube-Studio–inspired stack */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
        <div className="pointer-events-auto bg-gradient-to-t from-black via-black/90 to-transparent pt-14 pb-safe">
          <fieldset disabled={!captureEnabled} className={cn(!captureEnabled && 'pointer-events-none opacity-40')}>
          <CreateFilterModeToggle
            mode={filterMode}
            onChange={setFilterMode}
          />

          <div className="mb-2 px-3">
            {filterMode === 'ar' ? (
              <ArFiltersComingSoon compact />
            ) : (
              <CameraFilterCarousel currentFilter={currentFilter} onFilterChange={setCurrentFilter} />
            )}
          </div>
          </fieldset>

          <div className="flex items-center justify-center gap-6 px-6 pb-2 pt-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowMusicGallery(true)}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                'border border-white/20 bg-white/10 touch-manipulation',
                (selectedSound || selectedTrack) && 'border-white/50 bg-white/20',
              )}
              aria-label="Browse music previews"
            >
              <Music2 className="h-5 w-5 text-white" />
            </motion.button>

            <VybeRecordButton
              isRecording={isRecording}
              progress={recordingProgress}
              maxDuration={MAX_RECORDING_DURATION}
              onCaptureStart={handleCaptureStart}
              onCaptureEnd={handleCaptureEnd}
              disabled={!captureEnabled}
            />

            {mode === 'multi' && capturedFiles.length > 0 ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={handleMultiDone}
                disabled={!captureEnabled}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold text-black touch-manipulation"
              >
                Done
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => setShowGalleryDrawer(true)}
                disabled={!captureEnabled}
                className="h-12 w-12 overflow-hidden rounded-full border border-white/35 touch-manipulation"
                aria-label="Upload from gallery"
              >
                {capturedPreviews.length > 0 ? (
                  <img src={capturedPreviews[capturedPreviews.length - 1]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/10">
                    <ImageIcon className="h-5 w-5 text-white/85" />
                  </div>
                )}
              </motion.button>
            )}
          </div>

          <fieldset disabled={!captureEnabled} className={cn(!captureEnabled && 'pointer-events-none opacity-40')}>
          <CreateModeSelector currentMode={mode} onModeChange={handleModeChange} />

          <AnimatePresence>
            {!isRecording && timerCountdown === null && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 pb-2 text-center text-[10px] tracking-wide text-white/40"
              >
                {mode === 'multi'
                  ? 'Tap shutter · Up to 10 shots'
                  : 'Tap for photo · Hold for video · Pinch to zoom'}
              </motion.p>
            )}
          </AnimatePresence>
          </fieldset>
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
