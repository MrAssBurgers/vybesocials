import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Music2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeRecordButton } from '@/components/camera/VybeRecordButton';
import { CreateModeSelector, type CreateMode } from './CreateModeSelector';
import { MobilePostComposer } from './MobilePostComposer';
import { SoundPicker } from '@/components/sounds/SoundPicker';
import { SoundControls } from '@/components/sounds/SoundControls';
import { MusicGallery } from '@/components/music/MusicGallery';
import { CameraFilterCarousel, getFilterCSS } from '@/components/camera/CameraFilterCarousel';
import { CameraTopControls } from '@/components/camera/CameraTopControls';
import { CameraZoomIndicator } from '@/components/camera/CameraZoom';
import { AROverlayCanvas } from '@/components/camera/AROverlayCanvas';
import { ARFilterPicker } from '@/components/camera/ARFilterPicker';
import { GalleryDrawer } from './GalleryDrawer';
import { useFaceTracking } from '@/hooks/useFaceTracking';
import { ARFilterDef } from '@/lib/arFilters';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { Sound } from '@/hooks/useSounds';

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

  // Face tracking for AR filters
  const { faces, isReady: arReady, isLoading: arLoading, startTracking, stopTracking } = useFaceTracking({
    enabled: filterMode === 'ar',
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

  // Pinch zoom refs
  const lastPinchDistRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const zoomIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    navVisibility.setInCommunityChat(true);
    return () => { navVisibility.forceShow(); };
  }, []);

  // Start camera
  const filterModeRef = useRef(filterMode);
  const arReadyRef = useRef(arReady);
  filterModeRef.current = filterMode;
  arReadyRef.current = arReady;

  const startCamera = useCallback(async () => {
    const tryGetStream = async (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      let stream: MediaStream | null = null;
      const idealConstraints: MediaStreamConstraints = {
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video',
      };
      try {
        stream = await tryGetStream(idealConstraints);
      } catch (firstErr: any) {
        // Common transient cases: NotReadableError ("Could not start video source")
        // happen when the device is briefly busy (preview iframe re-mount, another tab).
        // Wait a tick and retry with looser constraints before surfacing.
        await new Promise(r => setTimeout(r, 350));
        try {
          stream = await tryGetStream({ video: { facingMode }, audio: mode === 'video' });
        } catch (secondErr: any) {
          const name = secondErr?.name || firstErr?.name;
          if (name === 'NotReadableError' || name === 'AbortError') {
            // Silent — camera is in use elsewhere; user can retry.
            console.warn('[MobileCreateStudio] Camera busy, will retry on next mount');
            return;
          }
          throw secondErr;
        }
      }

      if (!stream) return;
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setVideoDimensions({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            });
            if (filterModeRef.current === 'ar' && arReadyRef.current) {
              startTracking(videoRef.current);
            }
          }
        };
      }
      zoomRef.current = 1;
      setZoomLevel(1);
    } catch (err: any) {
      // Swallow ALL camera errors so a failed getUserMedia (audio permission
      // denied when switching to Video mode, device busy, etc.) never crashes
      // the React tree. The UI stays on the camera phase and the user can retry.
      console.warn('[MobileCreateStudio] Camera error (suppressed):', err?.name || err);
    }
  }, [facingMode, mode, startTracking]);


  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    stopTracking();
  }, [stopTracking]);

  useEffect(() => {
    if (filterMode === 'ar' && arReady && videoRef.current && phase === 'camera') {
      startTracking(videoRef.current);
    } else {
      stopTracking();
    }
  }, [filterMode, arReady, phase, startTracking, stopTracking]);

  useEffect(() => {
    if (phase === 'camera' && mode !== 'text') {
      // Always tear the current stream down first so switching modes
      // (e.g. photo → video which adds an audio track) can't collide with
      // an in-flight getUserMedia call and crash the device.
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      const t = setTimeout(() => { startCamera(); }, 120);
      return () => { clearTimeout(t); stopCamera(); };
    }
    return () => stopCamera();
  }, [phase, startCamera, stopCamera, mode]);

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
      if (videoRef.current) {
        const flipTransform = facingMode === 'user' ? ' scaleX(-1)' : '';
        videoRef.current.style.transform = `scale(${newZoom})${flipTransform}`;
      }
      if (zoomIndicatorTimeoutRef.current) clearTimeout(zoomIndicatorTimeoutRef.current);
      zoomIndicatorTimeoutRef.current = setTimeout(() => setShowZoomIndicator(false), 1500);
    }
    lastPinchDistRef.current = dist;
  }, [facingMode]);

  const handlePinchEnd = useCallback(() => { lastPinchDistRef.current = null; }, []);

  // Take photo with shutter animation
  const takePhoto = useCallback(() => {
    const doCapture = () => {
      if (!videoRef.current || !canvasRef.current) return;
      triggerHaptic('medium');

      // Shutter flash animation
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 200);

      if (flash) {
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 150);
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.filter = getFilterCSS(currentFilter) || 'none';
      ctx.drawImage(video, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      canvas.toBlob((blob) => {
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
  }, [flash, facingMode, mode, capturedFiles.length, timer, currentFilter]);

  // Recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    triggerHaptic('heavy');
    isRecordingRef.current = true;
    setIsRecording(true);
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      if (blob.size > 0) {
        const file = new File([blob], `vybe-video-${Date.now()}.webm`, { type: mimeType });
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
  }, []);

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
      if (isHoldingRef.current && (mode === 'video' || mode === 'photo')) startRecording();
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
        contentType={mode === 'text' ? 'text' : mode === 'video' ? (capturedFiles[0]?.type.startsWith('video/') ? 'short' : 'post') : 'post'}
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
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleGalleryPick} className="hidden" />

      {/* Camera viewfinder */}
      <div
        className="flex-1 relative overflow-hidden"
        onTouchMove={handlePinchMove}
        onTouchEnd={handlePinchEnd}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          disablePictureInPicture
          className={cn(
            "w-full h-full object-cover bg-black transition-transform duration-75",
            facingMode === 'user' && "scale-x-[-1]"
          )}
          style={{
            backgroundColor: '#000',
            filter: [getFilterCSS(currentFilter) || '', arFilter?.cssFilter || ''].filter(Boolean).join(' ') || undefined,
          }}
        />

        {/* AR Overlay */}
        {arFilter && faces.length > 0 && (
          <AROverlayCanvas faces={faces} filter={arFilter} videoWidth={videoDimensions.width} videoHeight={videoDimensions.height} mirrored={facingMode === 'user'} />
        )}

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
              className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-destructive/80 px-4 py-2 rounded-full z-20"
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
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute top-20 left-4 right-4 z-20">
              <SoundControls sound={selectedSound} startTime={soundStartTime} onStartTimeChange={setSoundStartTime} onRemoveSound={() => setSelectedSound(null)} compact />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Multi mode thumbnails */}
        {mode === 'multi' && capturedPreviews.length > 0 && (
          <div className="absolute top-16 left-0 right-0 z-20 px-4">
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
          if (videoRef.current) videoRef.current.style.transform = '';
        }}
        timer={timer}
        onTimerChange={setTimer}
      />

      {/* Bottom Controls — Redesigned */}
      <div className="absolute bottom-0 left-0 right-0 pb-safe bg-gradient-to-t from-black/80 via-black/40 to-transparent z-30">
        {/* Mode selector at top of bottom area */}
        <div className="mb-2">
          <CreateModeSelector currentMode={mode} onModeChange={handleModeChange} />
        </div>

        {/* Filter/AR row — collapsed into one row */}
        <div className="mb-3">
          <div className="flex items-center justify-center gap-1 mb-2">
            <button onClick={() => setFilterMode('color')} className={cn("text-[10px] px-3 py-1 rounded-full font-medium transition-all", filterMode === 'color' ? "bg-white/20 text-white" : "text-white/40")}>🎨 Filters</button>
            <button onClick={() => setFilterMode('ar')} className={cn("text-[10px] px-3 py-1 rounded-full font-medium transition-all", filterMode === 'ar' ? "bg-white/20 text-white" : "text-white/40")}>🎭 AR</button>
          </div>
          {filterMode === 'color' ? (
            <CameraFilterCarousel currentFilter={currentFilter} onFilterChange={setCurrentFilter} />
          ) : (
            <ARFilterPicker currentFilter={arFilter?.id || null} onFilterChange={setArFilter} isTracking={faces.length > 0} isLoading={arLoading} />
          )}
        </div>

        {/* Capture area — Clean layout */}
        <div className="flex items-center justify-center gap-6 pb-4">
          {/* Music */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMusicGallery(true)}
            className={cn(
              "text-white w-12 h-12 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-xl",
              (selectedSound || selectedTrack) && "text-primary border-2 border-primary/50"
            )}
          >
            <Music2 className="h-5 w-5" />
          </Button>

          {/* Gallery — swipe-up drawer trigger */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowGalleryDrawer(true)}
            className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white/40"
          >
            {capturedPreviews.length > 0 ? (
              <img src={capturedPreviews[capturedPreviews.length - 1]} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10">
                <ImageIcon className="w-5 h-5 text-white/70" />
              </div>
            )}
          </motion.button>

          {/* Capture Button */}
          <VybeRecordButton
            isRecording={isRecording}
            progress={recordingProgress}
            maxDuration={MAX_RECORDING_DURATION}
            onCaptureStart={handleCaptureStart}
            onCaptureEnd={handleCaptureEnd}
          />

          {/* Multi done */}
          {mode === 'multi' && capturedFiles.length > 0 ? (
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleMultiDone}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-lg shadow-primary/30">
              Done
            </motion.button>
          ) : (
            <div className="w-12 h-12" />
          )}
        </div>

        {/* Hint */}
        <AnimatePresence>
          {!isRecording && timerCountdown === null && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-white/50 text-xs pb-4">
              {mode === 'multi' ? 'Tap to capture · Add up to 10' : 'Tap for photo · Hold for video · Pinch to zoom'}
              {selectedSound && ' · Sound syncs with video'}
            </motion.p>
          )}
        </AnimatePresence>
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
          <MusicGallery
            onSelectTrack={(track) => { setSelectedTrack(track); setSelectedSound(null); setShowMusicGallery(false); }}
            onClose={() => setShowMusicGallery(false)}
          />
        )}
      </AnimatePresence>
      <SoundPicker
        open={showSoundPicker}
        onClose={() => setShowSoundPicker(false)}
        onSelectSound={(sound) => { setSelectedSound(sound); setSelectedTrack(null); }}
        selectedSoundId={selectedSound?.sound_id}
      />
    </div>
  );
}
