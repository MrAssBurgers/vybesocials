import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ZapOff, Image, Music, Timer, Sparkles, MessageCircle, SlidersHorizontal, Grid3X3, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CameraFilterCarousel, PRESET_FILTERS, getFilterCSS } from './CameraFilterCarousel';
import { CameraEditor } from './CameraEditor';
import { CameraShareSheet } from './CameraShareSheet';
import { CameraStoryPostSheet } from './CameraStoryPostSheet';
import { VybeRecordButton } from './VybeRecordButton';
import { CameraZoomIndicator } from './CameraZoom';
import { CameraTopControls } from './CameraTopControls';
import { GalleryDrawer } from '@/components/create/GalleryDrawer';
import { SoundPicker } from '@/components/sounds/SoundPicker';
import { Sound } from '@/hooks/useSounds';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { toast } from 'sonner';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import { captureVideoFrame } from '@/lib/cameraCapture';
import { useDoubleTapCameraFlip } from '@/hooks/useDoubleTapCameraFlip';
import { buildRecordingFile, createCameraMediaRecorder, startCameraRecorder } from '@/lib/cameraRecording';
import { acquirePostCameraStream, attachAudioToStream, stopStream } from '@/lib/postCameraStream';
import { bakeCameraEdits, bakedCameraFileName, type CameraDrawPath, type CameraTextOverlay } from '@/lib/bakeCameraEdits';
import type { CameraMode, CaptureTarget } from '@/lib/camera/cameraConfig';
import { maxRecordingSec, modesForTarget } from '@/lib/camera/cameraConfig';
import { useCameraGestures } from '@/hooks/useCameraGestures';
import { Button } from '@/components/ui/button';
import type { CameraLaunchContext } from '@/lib/camera/cameraLaunchContext';
import { SnapCaptureFlow } from './SnapCaptureFlow';

const MusicGallery = lazy(() =>
  import('@/components/music/MusicGallery').then((m) => ({ default: m.MusicGallery })),
);

interface CameraProps {
  onClose: () => void;
  /** Show a back arrow instead of X (e.g. when launched from story creator) */
  showBackArrow?: boolean;
  /** When provided, bypasses share sheet and returns captured media directly */
  onCapture?: (media: { file: File; url: string; type: 'photo' | 'video' }) => void;
  /** DM / VybeSnap — send media URL directly after capture/edit */
  onSend?: (mediaUrl: string, isVideo: boolean) => void;
  directSend?: boolean;
  initialStream?: MediaStream | null;
  streamPromise?: Promise<MediaStream | null>;
  captureTarget?: CaptureTarget;
  defaultMode?: CameraMode;
  /**
   * Snapchat-style capture → edit → send flow. When present, every capture
   * opens the SnapEditor (with recipient chip / Send To / background send)
   * instead of the legacy onSend/onCapture short-circuits.
   */
  launchContext?: CameraLaunchContext;
}

type CameraState = 'capture' | 'edit' | 'share' | 'story-post';
type CaptureMode = CameraMode;

function isVideoCaptureMode(mode: CaptureMode): boolean {
  return mode === 'video' || mode === 'story' || mode === 'clip';
}

function isStoryFastPath(target: CaptureTarget, mode: CaptureMode): boolean {
  return target === 'story' || mode === 'story';
}

export function Camera({
  onClose,
  showBackArrow = false,
  onCapture,
  initialStream = null,
  streamPromise,
  captureTarget = 'hub',
  defaultMode = 'photo',
  onSend,
  directSend = false,
  launchContext,
}: CameraProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<CameraState>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [flash, setFlash] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('snap');
  const [captureMode, setCaptureMode] = useState<CaptureMode>(defaultMode);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'photo' | 'video'; file?: File } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [showMusicGallery, setShowMusicGallery] = useState(false);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(null);
  const [isBaking, setIsBaking] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);

  const modeTabs = modesForTarget(captureTarget);
  const maxRecSec = maxRecordingSec(captureMode, captureTarget);
  const recordingProgressPct = Math.min((recordingDuration / maxRecSec) * 100, 100);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const filterNameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const consumedInitialStream = useRef(false);
  const consumedStreamPromise = useRef(false);

  useEffect(() => {
    navVisibility.setInCommunityChat(true);
    return () => { navVisibility.forceShow(); };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setPermissionDenied(false);
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraReady(false);

      let stream: MediaStream | null = null;
      if (initialStream && !consumedInitialStream.current) {
        stream = initialStream;
        consumedInitialStream.current = true;
      } else if (streamPromise && !consumedStreamPromise.current) {
        consumedStreamPromise.current = true;
        stream = await streamPromise;
      } else {
        stream = await acquirePostCameraStream(facingMode);
      }
      if (!stream) {
        setPermissionDenied(true);
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setCameraReady(true);
        };
        await videoRef.current.play().catch(() => {});
        if (videoRef.current.readyState >= 2) setCameraReady(true);
      }

      // Apply torch for rear camera
      if (flash && facingMode === 'environment') {
        const videoTrack = stream.getVideoTracks()[0];
        try {
          const capabilities = videoTrack.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
          if (capabilities?.torch) {
            await videoTrack.applyConstraints({ advanced: [{ torch: true } as any] } as any);
          }
        } catch {}
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
      setPermissionDenied(true);
    }
  }, [facingMode, flash, initialStream, streamPromise]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [startCamera]);

  // Toggle torch when flash changes (for rear camera)
  useEffect(() => {
    if (!streamRef.current || facingMode === 'user') return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const capabilities = videoTrack.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      if (capabilities?.torch) {
        videoTrack.applyConstraints({ advanced: [{ torch: flash } as any] } as any).catch(() => {});
      }
    } catch {}
  }, [flash, facingMode]);

  const toggleCamera = () => {
    triggerHaptic('light');
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const onDoubleTapFlip = useDoubleTapCameraFlip(toggleCamera);

  const openGallery = useCallback(() => setShowGallery(true), []);

  const handleGallerySelect = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);
    setCapturedMedia({ url, type: isVideo ? 'video' : 'photo', file });
    setState('edit');
  }, []);

  const showFilterNameBriefly = (name: string) => {
    setFilterName(name);
    if (filterNameTimerRef.current) clearTimeout(filterNameTimerRef.current);
    filterNameTimerRef.current = setTimeout(() => setFilterName(''), 1200);
  };

  const finalizeCapture = useCallback(
    (media: { url: string; type: 'photo' | 'video'; file: File }) => {
      // Snap flow: capture always opens the editor immediately — no direct
      // send, no confirmation screen.
      if (launchContext) {
        setCapturedMedia(media);
        setState('edit');
        return;
      }
      if (onCapture) {
        onCapture(media);
        return;
      }
      if (onSend && (directSend || captureTarget === 'dm' || captureTarget === 'snap')) {
        onSend(media.url, media.type === 'video');
        onClose();
        return;
      }
      setCapturedMedia(media);
      setState('edit');
    },
    [captureTarget, directSend, launchContext, onCapture, onClose, onSend],
  );

  const handleFilterChange = (filterId: string) => {
    setCurrentFilter(filterId);
    const filter = PRESET_FILTERS.find(f => f.id === filterId);
    if (filter && filter.id !== 'normal') showFilterNameBriefly(filter.name);
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    triggerHaptic('medium');
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      setShutterFlash(true);
      window.setTimeout(() => setShutterFlash(false), 180);
    }
    const canvas = document.createElement('canvas');
    const filterCSS = getFilterCSS(currentFilter) || undefined;
    const brightnessStr = brightness !== 100 ? ` brightness(${brightness / 100})` : '';
    const ok = captureVideoFrame({
      video: videoRef.current,
      canvas,
      facingMode,
      filterCSS: filterCSS ? filterCSS + brightnessStr : brightnessStr.trim() || undefined,
    });
    if (!ok) {
      toast.error('Camera not ready — wait a moment and try again');
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) {
        const dataUrl = URL.createObjectURL(blob);
        const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
        finalizeCapture({ url: dataUrl, type: 'photo', file });
      }
    }, 'image/jpeg', 0.9);
  };

  const startRecording = async () => {
    if (!streamRef.current) return;
    try {
      await attachAudioToStream(streamRef.current);
      triggerHaptic('heavy');
      recordedChunksRef.current = [];
      const recorder = createCameraMediaRecorder(streamRef.current);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const { blob, file } = buildRecordingFile(
          recordedChunksRef.current,
          recorder,
          'camera-video',
        );
        if (blob.size <= 0) {
          toast.error('Recording failed — try again');
          return;
        }
        const url = URL.createObjectURL(blob);
        finalizeCapture({ url, type: 'video', file });
      };
      startCameraRecorder(recorder);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);
      const recordingStartTime = Date.now();
      const updateDuration = () => {
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        progressRef.current = elapsed;
        if (elapsed >= maxRecSec) stopRecording();
        else progressFrameRef.current = requestAnimationFrame(updateDuration);
      };
      progressFrameRef.current = requestAnimationFrame(updateDuration);
      // ~10fps UI ticks — 1s interval made the timer + ring feel stuttered.
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(progressRef.current);
      }, 100);
    } catch (err) {
      console.warn('[Camera] Recording failed:', err);
      toast.error('Video recording is not supported on this device');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (progressFrameRef.current) cancelAnimationFrame(progressFrameRef.current);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecording(false);
    setRecordingDuration(progressRef.current);
    triggerHaptic('light');
  };

  const handleTimerCapture = () => {
    if (timerSeconds === 0) {
      handleCaptureImmediate();
      return;
    }
    setTimerCountdown(timerSeconds);
    let remaining = timerSeconds;
    const interval = setInterval(() => {
      remaining--;
      setTimerCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setTimerCountdown(null);
        handleCaptureImmediate();
      }
    }, 1000);
  };

  const handleCaptureImmediate = () => {
    if (isVideoCaptureMode(captureMode)) {
      void startRecording();
    } else {
      takePhoto();
    }
  };

  const handleCaptureStart = () => {
    if (timerSeconds > 0 && !isRecording) {
      handleTimerCapture();
      return;
    }
    if (isVideoCaptureMode(captureMode)) {
      void startRecording();
    } else {
      holdTimerRef.current = setTimeout(() => void startRecording(), 300);
    }
  };

  const handleCaptureEnd = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecording) stopRecording();
    else if ((captureMode === 'photo' || captureMode === 'snap') && timerSeconds === 0) takePhoto();
  };

  const handleFilterSwipe = (direction: number) => {
    const currentIndex = PRESET_FILTERS.findIndex(f => f.id === currentFilter);
    const newIndex = Math.max(0, Math.min(PRESET_FILTERS.length - 1, currentIndex + direction));
    if (newIndex !== currentIndex) {
      triggerHaptic('light');
      handleFilterChange(PRESET_FILTERS[newIndex].id);
    }
  };

  const {
    focusPoint,
    displayZoom,
    showZoom,
    onViewfinderTouchStart,
    onViewfinderClick,
    onViewfinderDoubleClick,
  } = useCameraGestures({
    videoRef,
    streamRef,
    onClose,
    onOpenGallery: openGallery,
    onOpenMemories: openGallery,
    onFilterSwipe: (direction) => handleFilterSwipe(direction),
    onDoubleTapFlip,
    disabled: isRecording || timerCountdown !== null,
  });


  const cycleTimer = () => {
    const options = [0, 3, 5, 10];
    const currentIdx = options.indexOf(timerSeconds);
    const next = options[(currentIdx + 1) % options.length];
    setTimerSeconds(next);
    triggerHaptic('light');
    toast(`Timer: ${next === 0 ? 'Off' : `${next}s`}`, { duration: 1000 });
  };

  const combinedFilter = `${getFilterCSS(currentFilter) || 'none'} brightness(${brightness / 100})`;

  if (state === 'edit' && capturedMedia && launchContext) {
    return (
      <FullscreenPortal>
        <SnapCaptureFlow
          media={{
            url: capturedMedia.url,
            type: capturedMedia.type,
            file: capturedMedia.file as File,
          }}
          filter={currentFilter}
          durationSec={capturedMedia.type === 'video' ? recordingDuration || null : null}
          launchContext={launchContext}
          onRetake={() => {
            if (capturedMedia?.url.startsWith('blob:')) {
              URL.revokeObjectURL(capturedMedia.url);
            }
            setCapturedMedia(null);
            setState('capture');
            setTimeout(() => startCamera(), 100);
          }}
          onClose={onClose}
          onGlobalSendComplete={() => {
            if (capturedMedia?.url.startsWith('blob:')) {
              URL.revokeObjectURL(capturedMedia.url);
            }
            setCapturedMedia(null);
            setState('capture');
          }}
        />
      </FullscreenPortal>
    );
  }
  if (state === 'edit' && capturedMedia) {
    return (
      <FullscreenPortal>
        <CameraEditor
          mediaUrl={capturedMedia.url}
          mediaType={capturedMedia.type}
          filter={currentFilter}
          isSaving={isBaking}
          onSave={async (edited) => {
            if (!capturedMedia.file) return;
            setIsBaking(true);
            try {
              const baked = await bakeCameraEdits(
                capturedMedia.file,
                capturedMedia.type,
                edited.overlays as CameraTextOverlay[],
                edited.drawings as CameraDrawPath[],
                { displayWidth: edited.displayWidth, displayHeight: edited.displayHeight },
              );

              const hadEdits = edited.overlays.length > 0 || edited.drawings.length > 0;
              const mimeType = baked.type || capturedMedia.file.type;
              const fileName = bakedCameraFileName(capturedMedia.type, mimeType);
              const file = baked === capturedMedia.file && !hadEdits
                ? capturedMedia.file
                : new File([baked], fileName, { type: mimeType });

              if (
                hadEdits &&
                capturedMedia.type === 'video' &&
                baked === capturedMedia.file
              ) {
                toast.warning('Video text/stickers could not be embedded — try a photo story', {
                  duration: 3500,
                  id: 'story-video-bake-fail',
                });
              }

              edited.overlays.forEach((o) => {
                if (o.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(o.imageUrl);
              });

              // Never revoke before we have a replacement URL — reused blob URLs
              // break video playback when Object URL is revoked early.
              const needsNewUrl = hadEdits || baked !== capturedMedia.file;
              const url = needsNewUrl ? URL.createObjectURL(file) : capturedMedia.url;
              if (needsNewUrl && capturedMedia.url.startsWith('blob:')) {
                URL.revokeObjectURL(capturedMedia.url);
              }

              const media = { file, url, type: capturedMedia.type };

              if (hadEdits) {
                toast.success(
                  edited.overlays.length > 0
                    ? `Saved ${edited.overlays.length} text/sticker edit${edited.overlays.length === 1 ? '' : 's'} to photo`
                    : 'Saved drawing to photo',
                  { duration: 2000, id: 'story-bake-ok' },
                );
              }

              if (onCapture) {
                onCapture(media);
                return;
              }

              if (onSend && (directSend || captureTarget === 'dm' || captureTarget === 'snap')) {
                onSend(url, capturedMedia.type === 'video');
                onClose();
                return;
              }

              setCapturedMedia(media);
              if (isStoryFastPath(captureTarget, captureMode)) {
                setState('story-post');
              } else {
                setState('share');
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Failed to save edits';
              console.error('[Camera] Failed to bake edits:', err);
              toast.error(msg);
            } finally {
              setIsBaking(false);
            }
          }}
          onCancel={() => {
            setCapturedMedia(null);
            setState('capture');
            setTimeout(() => startCamera(), 100);
          }}
        />
      </FullscreenPortal>
    );
  }
  if (state === 'story-post' && capturedMedia) {
    return (
      <FullscreenPortal>
        <CameraStoryPostSheet
          mediaUrl={capturedMedia.url}
          mediaType={capturedMedia.type}
          mediaFile={capturedMedia.file}
          onClose={() => setState('edit')}
          onComplete={onClose}
        />
      </FullscreenPortal>
    );
  }
  if (state === 'share' && capturedMedia) {
    return (
      <FullscreenPortal>
        <CameraShareSheet mediaUrl={capturedMedia.url} mediaType={capturedMedia.type} mediaFile={capturedMedia.file} onClose={() => setState('edit')} onComplete={onClose} />
      </FullscreenPortal>
    );
  }

  return (
    <FullscreenPortal>
      <div className="fixed inset-0 z-[6000] bg-black flex flex-col select-none overflow-hidden" style={{ touchAction: 'pan-y' }}>
      {/* Full-bleed viewfinder */}
      <div
        className="absolute inset-0"
        onClick={onViewfinderClick}
        onDoubleClick={onViewfinderDoubleClick}
        onTouchStart={onViewfinderTouchStart}
      >
        <video
          ref={videoRef}
          autoPlay playsInline muted
          controls={false}
          disablePictureInPicture
          poster=""
          className={cn(
            'w-full h-full object-cover bg-black',
            facingMode === 'user' && 'scale-x-[-1]',
            !cameraReady && 'opacity-0',
          )}
          style={{ backgroundColor: '#000', filter: combinedFilter, transition: 'opacity 180ms ease-out' }}
        />

        {!cameraReady && !permissionDenied && (
          <div className="absolute inset-0 bg-black flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        )}

        {permissionDenied && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center px-8 text-center">
            <p className="text-white font-semibold text-lg mb-2">Camera unavailable</p>
            <p className="text-white/60 text-sm mb-6">Allow camera access in Settings, then try again.</p>
            <Button variant="outline" className="rounded-xl" onClick={() => void startCamera()}>
              Try again
            </Button>
          </div>
        )}

        {/* Grid overlay */}
        {gridEnabled && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
          </div>
        )}

        <AnimatePresence>
          {focusPoint && (
            <motion.div
              initial={{ opacity: 0, scale: 1.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute z-20 pointer-events-none w-16 h-16 -translate-x-1/2 -translate-y-1/2 border-2 border-yellow-300 rounded-full"
              style={{ left: `${focusPoint.x}%`, top: `${focusPoint.y}%` }}
            />
          )}
        </AnimatePresence>

        <CameraZoomIndicator zoom={displayZoom} visible={showZoom} />

        {/* Shutter flash */}
        <AnimatePresence>
          {shutterFlash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.09 }}
              className="pointer-events-none absolute inset-0 z-40 bg-white"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Timer Countdown Overlay */}
      <AnimatePresence>
        {timerCountdown !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute inset-0 z-30 flex items-center justify-center"
          >
            <span className="text-white text-8xl font-bold drop-shadow-2xl">{timerCountdown}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── TOP BAR — shared glass controls (Create, DM, Story, etc.) ─── */}
      <CameraTopControls
        onClose={onClose}
        flash={flash}
        onFlashToggle={() => {
          triggerHaptic('light');
          setFlash((v) => !v);
        }}
        onFlipCamera={toggleCamera}
        timer={timerSeconds}
        onTimerChange={setTimerSeconds}
        showBackArrow={showBackArrow}
      />

      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-safe left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-destructive/80 px-3 py-1 rounded-full backdrop-blur-sm pointer-events-none"
          >
            <div className="w-2 h-2 bg-white rounded-full opacity-90" style={{ animation: 'vybe-rec-dot 1.2s ease-in-out infinite' }} />
            <span className="text-white font-mono text-xs font-medium tabular-nums">
              {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
              {Math.floor(recordingDuration % 60).toString().padStart(2, '0')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── RIGHT SIDE TOOLS ─── Snapchat style with labels */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3">
        <button onClick={() => setFlash(!flash)} className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/10",
            flash ? "bg-yellow-400/30 border-yellow-400/40" : "bg-black/35"
          )}>
            {flash ? <Zap className="h-4.5 w-4.5 text-yellow-400" fill="currentColor" /> : <ZapOff className="h-4.5 w-4.5 text-white" />}
          </div>
          <span className="text-[9px] text-white/70 font-medium">Flash</span>
        </button>
        
        <button 
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          onClick={() => { triggerHaptic('light'); setShowMusicGallery(true); }}
        >
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/10",
            selectedSound ? "bg-primary/40 border-primary/50" : "bg-black/35"
          )}>
            <Music className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-[9px] text-white/70 font-medium">Sounds</span>
        </button>

        <button 
          onClick={cycleTimer}
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-xl border border-white/10 flex items-center justify-center relative">
            <Timer className="h-4.5 w-4.5 text-white" />
            {timerSeconds > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold bg-primary text-primary-foreground w-3.5 h-3.5 rounded-full flex items-center justify-center">{timerSeconds}</span>
            )}
          </div>
          <span className="text-[9px] text-white/70 font-medium">Timer</span>
        </button>
        
        <button 
          onClick={() => { triggerHaptic('light'); setGridEnabled(!gridEnabled); }}
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
        >
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl border border-white/10",
            gridEnabled ? "bg-white/30 border-white/40" : "bg-black/35"
          )}>
            <Grid3X3 className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-[9px] text-white/70 font-medium">Grid</span>
        </button>

        <button 
          onClick={() => {
            triggerHaptic('light');
            setBrightness(prev => {
              const next = prev >= 130 ? 70 : prev + 15;
              toast(`Brightness: ${next}%`, { duration: 800 });
              return next;
            });
          }} 
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-xl border border-white/10 flex items-center justify-center">
            <Sun className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-[9px] text-white/70 font-medium">HDR</span>
        </button>
      </div>

      {/* ─── FILTER NAME TOAST ─── */}
      <AnimatePresence>
        {filterName && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-black/50 backdrop-blur-md px-5 py-2 rounded-full"
          >
            <span className="text-white text-sm font-semibold">{filterName}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── BOTTOM AREA ─── */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        {/* Filter carousel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="mb-2"
            >
              <CameraFilterCarousel currentFilter={currentFilter} onFilterChange={handleFilterChange} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── CAPTURE ROW ─── */}
        <div className="flex items-end justify-between px-5 pb-3">
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); openGallery(); }}
            className="w-12 h-12 rounded-xl border-2 border-white/30 overflow-hidden bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform mb-2"
          >
            <Image className="h-5 w-5 text-white/70" />
          </button>

          <VybeRecordButton
            isRecording={isRecording}
            progress={recordingProgressPct}
            maxDuration={maxRecSec}
            onCaptureStart={handleCaptureStart}
            onCaptureEnd={handleCaptureEnd}
            disabled={!cameraReady || permissionDenied}
          />

          <button
            onClick={() => navigate('/messages')}
            className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center active:scale-90 transition-transform mb-2"
          >
            <MessageCircle className="h-5 w-5 text-white/70" />
          </button>
        </div>

        {/* ─── MODE TABS + FILTERS TOGGLE ─── */}
        <div className="pb-safe">
          <div className="flex items-center justify-center gap-1 pb-2">
            {modeTabs.map((mode) => (
              <button
                key={mode.id}
                onClick={() => { triggerHaptic('light'); setCaptureMode(mode.id); }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all",
                  captureMode === mode.id
                    ? "bg-white text-black"
                    : "text-white/50"
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Filters bar */}
          <div className="flex items-center justify-center gap-3 pb-3">
            <button
              onClick={() => { triggerHaptic('light'); setShowFilters(!showFilters); }}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all",
                showFilters
                  ? "bg-primary/20 text-primary backdrop-blur-md"
                  : "bg-white/10 text-white/60 backdrop-blur-sm"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Sound Picker */}
      <SoundPicker
        open={showSoundPicker}
        onClose={() => setShowSoundPicker(false)}
        onSelectSound={(sound) => setSelectedSound(sound)}
        selectedSoundId={selectedSound?.sound_id}
      />
      <Suspense fallback={null}>
        {showMusicGallery && (
          <MusicGallery
            onSelectTrack={() => setShowMusicGallery(false)}
            onClose={() => setShowMusicGallery(false)}
          />
        )}
      </Suspense>
      <GalleryDrawer
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onSelect={handleGallerySelect}
        layerZIndex={6050}
      />
      </div>
    </FullscreenPortal>
  );
}
