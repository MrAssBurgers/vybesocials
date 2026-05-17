import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Zap, ZapOff, Image, Music, Timer, Sparkles, MessageCircle, SlidersHorizontal, Grid3X3, Wand2, Sun, Contrast } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CameraFilterCarousel, PRESET_FILTERS, getFilterCSS } from './CameraFilterCarousel';
import { CameraEditor } from './CameraEditor';
import { CameraShareSheet } from './CameraShareSheet';
import { SoundPicker } from '@/components/sounds/SoundPicker';
import { Sound } from '@/hooks/useSounds';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { toast } from 'sonner';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';

interface CameraProps {
  onClose: () => void;
  /** Show a back arrow instead of X (e.g. when launched from story creator) */
  showBackArrow?: boolean;
  /** When provided, bypasses share sheet and returns captured media directly */
  onCapture?: (media: { file: File; url: string; type: 'photo' | 'video' }) => void;
}

type CameraState = 'capture' | 'edit' | 'share';
type CaptureMode = 'photo' | 'video' | 'story';

const CAPTURE_MODES: { id: CaptureMode; label: string }[] = [
  { id: 'video', label: 'VIDEO' },
  { id: 'photo', label: 'PHOTO' },
  { id: 'story', label: 'STORY' },
];

export function Camera({ onClose, showBackArrow = false, onCapture }: CameraProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<CameraState>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flash, setFlash] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('normal');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
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
  const [selectedSound, setSelectedSound] = useState<Sound | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const filterNameTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    navVisibility.setInCommunityChat(true);
    return () => { navVisibility.forceShow(); };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

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
    }
  }, [facingMode, flash]);

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

  const showFilterNameBriefly = (name: string) => {
    setFilterName(name);
    if (filterNameTimerRef.current) clearTimeout(filterNameTimerRef.current);
    filterNameTimerRef.current = setTimeout(() => setFilterName(''), 1200);
  };

  const handleFilterChange = (filterId: string) => {
    setCurrentFilter(filterId);
    const filter = PRESET_FILTERS.find(f => f.id === filterId);
    if (filter && filter.id !== 'normal') showFilterNameBriefly(filter.name);
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    triggerHaptic('medium');
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const filterCSS = getFilterCSS(currentFilter) || 'none';
      const brightnessStr = brightness !== 100 ? ` brightness(${brightness / 100})` : '';
      ctx.filter = filterCSS + brightnessStr;
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const dataUrl = URL.createObjectURL(blob);
          const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
          setCapturedMedia({ url: dataUrl, type: 'photo', file });
          setState('edit');
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    triggerHaptic('heavy');
    recordedChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const file = new File([blob], 'camera-video.webm', { type: mimeType });
      setCapturedMedia({ url, type: 'video', file });
      setState('edit');
    };
    mediaRecorder.start(100);
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingDuration(0);
    const recordingStartTime = Date.now();
    const updateDuration = () => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      progressRef.current = elapsed;
      if (elapsed >= 60) stopRecording();
      else progressFrameRef.current = requestAnimationFrame(updateDuration);
    };
    progressFrameRef.current = requestAnimationFrame(updateDuration);
    recordingIntervalRef.current = setInterval(() => { setRecordingDuration(progressRef.current); }, 1000);
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
    if (captureMode === 'video' || captureMode === 'story') {
      startRecording();
    } else {
      takePhoto();
    }
  };

  const handleCaptureStart = () => {
    if (timerSeconds > 0 && !isRecording) {
      handleTimerCapture();
      return;
    }
    if (captureMode === 'video' || captureMode === 'story') {
      startRecording();
    } else {
      holdTimerRef.current = setTimeout(() => startRecording(), 300);
    }
  };

  const handleCaptureEnd = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecording) stopRecording();
    else if (captureMode === 'photo' && timerSeconds === 0 && !isSwiping) takePhoto();
  };

  const handleFilterSwipe = (direction: number) => {
    const currentIndex = PRESET_FILTERS.findIndex(f => f.id === currentFilter);
    const newIndex = Math.max(0, Math.min(PRESET_FILTERS.length - 1, currentIndex + direction));
    if (newIndex !== currentIndex) {
      triggerHaptic('light');
      handleFilterChange(PRESET_FILTERS[newIndex].id);
    }
  };


  const cycleTimer = () => {
    const options = [0, 3, 5, 10];
    const currentIdx = options.indexOf(timerSeconds);
    const next = options[(currentIdx + 1) % options.length];
    setTimerSeconds(next);
    triggerHaptic('light');
    toast(`Timer: ${next === 0 ? 'Off' : `${next}s`}`, { duration: 1000 });
  };

  const recordingProgress = Math.min(recordingDuration / 60, 1);
  const ringCircumference = 2 * Math.PI * 38;
  const combinedFilter = `${getFilterCSS(currentFilter) || 'none'} brightness(${brightness / 100})`;

  if (state === 'edit' && capturedMedia) {
    return (
      <FullscreenPortal>
        <CameraEditor mediaUrl={capturedMedia.url} mediaType={capturedMedia.type} filter={currentFilter} onSave={() => {
          if (onCapture && capturedMedia.file) {
            onCapture({ file: capturedMedia.file, url: capturedMedia.url, type: capturedMedia.type });
            return;
          }
          setState('share');
        }} onCancel={() => { 
          setCapturedMedia(null); 
          setState('capture');
          // Restart camera after returning from editor
          setTimeout(() => startCamera(), 100);
        }} />
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
        onTouchStart={(e) => {
          // Only handle swipes on the viewfinder itself, not on buttons
          if ((e.target as HTMLElement).closest('button')) return;
          const touch = e.touches[0];
          const startX = touch.clientX;
          const startY = touch.clientY;
          let locked: 'none' | 'horizontal' | 'vertical' = 'none';
          setIsSwiping(false);
          const handleTouchMove = (moveE: TouchEvent) => {
            const dx = Math.abs(moveE.touches[0].clientX - startX);
            const dy = Math.abs(moveE.touches[0].clientY - startY);
            if (locked === 'none' && (dx > 10 || dy > 10)) {
              locked = dx > dy ? 'horizontal' : 'vertical';
            }
            if (locked === 'horizontal' && dx > 20) setIsSwiping(true);
          };
          const handleTouchEnd = (endE: TouchEvent) => {
            const diff = endE.changedTouches[0].clientX - startX;
            if (locked === 'horizontal' && Math.abs(diff) > 50) {
              handleFilterSwipe(diff > 0 ? -1 : 1);
            }
            setIsSwiping(false);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
          };
          document.addEventListener('touchmove', handleTouchMove, { passive: true });
          document.addEventListener('touchend', handleTouchEnd);
        }}
      >
        <video
          ref={videoRef}
          autoPlay playsInline muted
          controls={false}
          disablePictureInPicture
          className={cn("w-full h-full object-cover bg-black", facingMode === 'user' && "scale-x-[-1]")}
          style={{ backgroundColor: '#000', filter: combinedFilter }}
        />

        {/* Grid overlay */}
        {gridEnabled && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
          </div>
        )}
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

      {/* ─── TOP BAR ─── Snapchat style */}
      <div className="absolute top-0 left-0 right-0 z-10 safe-area-inset-top">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
            {showBackArrow ? (
              <span className="text-white"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></span>
            ) : (
              <X className="h-5 w-5 text-white" strokeWidth={2.5} />
            )}
          </button>

          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2 bg-destructive/80 px-3 py-1 rounded-full backdrop-blur-sm"
              >
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-white rounded-full" />
                <span className="text-white font-mono text-xs font-medium">
                  {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-1.5">
            <button onClick={toggleCamera} className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
              <RefreshCw className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── RIGHT SIDE TOOLS ─── Snapchat style with labels */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3">
        <button onClick={() => setFlash(!flash)} className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm",
            flash ? "bg-yellow-400/30" : "bg-black/40"
          )}>
            {flash ? <Zap className="h-4.5 w-4.5 text-yellow-400" fill="currentColor" /> : <ZapOff className="h-4.5 w-4.5 text-white" />}
          </div>
          <span className="text-[9px] text-white/70 font-medium">Flash</span>
        </button>
        
        <button 
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          onClick={() => { triggerHaptic('light'); setShowSoundPicker(true); }}
        >
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm",
            selectedSound ? "bg-primary/40" : "bg-black/40"
          )}>
            <Music className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-[9px] text-white/70 font-medium">Sounds</span>
        </button>

        <button 
          onClick={cycleTimer}
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm relative">
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
            "w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm",
            gridEnabled ? "bg-white/30" : "bg-black/40"
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
          <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
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
          <button className="w-12 h-12 rounded-xl border-2 border-white/30 overflow-hidden bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform mb-2">
            <Image className="h-5 w-5 text-white/70" />
          </button>

          {/* Center: Capture button */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {isRecording && (
                <svg className="absolute -inset-1.5 w-[84px] h-[84px] -rotate-90" viewBox="0 0 84 84">
                  <circle cx="42" cy="42" r="38" fill="none" stroke="white" strokeWidth="3" opacity="0.15" />
                  <motion.circle
                    cx="42" cy="42" r="38"
                    fill="none"
                    stroke="hsl(var(--destructive))"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringCircumference * (1 - recordingProgress)}
                    initial={{ strokeDashoffset: ringCircumference }}
                    animate={{ strokeDashoffset: ringCircumference * (1 - recordingProgress) }}
                  />
                </svg>
              )}
              <motion.button
                onPointerDown={handleCaptureStart}
                onPointerUp={handleCaptureEnd}
                onPointerLeave={handleCaptureEnd}
                className={cn(
                  "w-[72px] h-[72px] rounded-full border-[4px] flex items-center justify-center",
                  isRecording ? "border-destructive/60" : "border-white"
                )}
                style={{ touchAction: 'manipulation' }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <motion.div
                  animate={isRecording
                    ? { width: 28, height: 28, borderRadius: 6 }
                    : { width: 58, height: 58, borderRadius: 29 }
                  }
                  className={cn(isRecording ? "bg-destructive" : "bg-white")}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                />
              </motion.button>
            </div>
          </div>

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
            {CAPTURE_MODES.map((mode) => (
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
            <button
              onClick={() => { triggerHaptic('light'); toast.info('AR Lenses coming soon!'); }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium bg-white/10 text-white/60 backdrop-blur-sm"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Lenses
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
      </div>
    </FullscreenPortal>
  );
}
