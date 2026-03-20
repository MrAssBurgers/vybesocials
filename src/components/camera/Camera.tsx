import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Zap, ZapOff, Image, Music, Timer, Sparkles, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CameraFilterCarousel, PRESET_FILTERS, getFilterCSS } from './CameraFilterCarousel';
import { CameraEditor } from './CameraEditor';
import { CameraShareSheet } from './CameraShareSheet';
import { CameraSafetyGate } from './CameraSafetyGate';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { SafetyResult } from '@/hooks/useContentSafety';

interface CameraProps {
  onClose: () => void;
}

type CameraState = 'capture' | 'edit' | 'share' | 'scanning';
type CaptureMode = 'photo' | 'video' | 'story';

const CAPTURE_MODES: { id: CaptureMode; label: string }[] = [
  { id: 'video', label: 'VIDEO' },
  { id: 'photo', label: 'PHOTO' },
  { id: 'story', label: 'STORY' },
];

export function Camera({ onClose }: CameraProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<CameraState>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flash, setFlash] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('normal');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'photo' | 'video'; file?: File } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showLenses, setShowLenses] = useState(false);
  const [filterName, setFilterName] = useState('');

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
    } catch (err) {
      console.error('Failed to start camera:', err);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [startCamera]);

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
      ctx.filter = getFilterCSS(currentFilter) || 'none';
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

  const handleCaptureStart = () => {
    if (captureMode === 'video' || captureMode === 'story') {
      startRecording();
    } else {
      // photo: tap = photo, hold = video
      holdTimerRef.current = setTimeout(() => startRecording(), 300);
    }
  };

  const handleCaptureEnd = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecording) stopRecording();
    else if (captureMode === 'photo') takePhoto();
  };

  const handleFilterSwipe = (direction: number) => {
    const currentIndex = PRESET_FILTERS.findIndex(f => f.id === currentFilter);
    const newIndex = Math.max(0, Math.min(PRESET_FILTERS.length - 1, currentIndex + direction));
    if (newIndex !== currentIndex) {
      triggerHaptic('light');
      handleFilterChange(PRESET_FILTERS[newIndex].id);
    }
  };

  const handleScanComplete = (result: SafetyResult) => {
    if (result === 'blocked') { setCapturedMedia(null); setState('capture'); }
    else setState('share');
  };

  // Recording progress for ring animation (0-1)
  const recordingProgress = Math.min(recordingDuration / 60, 1);
  const ringCircumference = 2 * Math.PI * 38;

  if (state === 'edit' && capturedMedia) {
    return <CameraEditor mediaUrl={capturedMedia.url} mediaType={capturedMedia.type} filter={currentFilter} onSave={() => setState('scanning')} onCancel={() => { setCapturedMedia(null); setState('capture'); }} />;
  }
  if (state === 'scanning' && capturedMedia?.file) {
    return <CameraSafetyGate file={capturedMedia.file} mediaType={capturedMedia.type} onResult={handleScanComplete} onCancel={() => setState('edit')} />;
  }
  if (state === 'share' && capturedMedia) {
    return <CameraShareSheet mediaUrl={capturedMedia.url} mediaType={capturedMedia.type} onClose={() => setState('edit')} onComplete={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col select-none">
      {/* Full-bleed viewfinder */}
      <div
        className="absolute inset-0"
        onTouchStart={(e) => {
          const touch = e.touches[0];
          const startX = touch.clientX;
          const handleTouchEnd = (endE: TouchEvent) => {
            const diff = endE.changedTouches[0].clientX - startX;
            if (Math.abs(diff) > 50) handleFilterSwipe(diff > 0 ? -1 : 1);
            document.removeEventListener('touchend', handleTouchEnd);
          };
          document.addEventListener('touchend', handleTouchEnd);
        }}
      >
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className={cn("w-full h-full object-cover", facingMode === 'user' && "scale-x-[-1]")}
          style={{ filter: getFilterCSS(currentFilter) }}
        />
      </div>

      {/* ─── TOP BAR (Snapchat-style) ─── */}
      <div className="absolute top-0 left-0 right-0 z-10 safe-area-inset-top">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          {/* Close */}
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
            <X className="h-5 w-5 text-white" strokeWidth={2.5} />
          </button>

          {/* Center: Recording timer or nothing */}
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

          {/* Right side icons - stacked vertically like Snapchat */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setFlash(!flash)} className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
              {flash ? <Zap className="h-4.5 w-4.5 text-yellow-400" fill="currentColor" /> : <ZapOff className="h-4.5 w-4.5 text-white" />}
            </button>
          </div>
        </div>
      </div>

      {/* ─── RIGHT SIDE TOOLS (Snapchat vertical strip) ─── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3">
        <button onClick={toggleCamera} className="w-11 h-11 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
          <RefreshCw className="h-5 w-5 text-white" />
        </button>
        <button className="w-11 h-11 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
          <Timer className="h-5 w-5 text-white" />
        </button>
        <button className="w-11 h-11 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center active:scale-90 transition-transform">
          <Music className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* ─── FILTER NAME TOAST (appears on swipe) ─── */}
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
        {/* Lens / Filter carousel */}
        <AnimatePresence>
          {showLenses && (
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
          {/* Left: Gallery thumbnail */}
          <button className="w-12 h-12 rounded-xl border-2 border-white/30 overflow-hidden bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform mb-2">
            <Image className="h-5 w-5 text-white/70" />
          </button>

          {/* Center: Capture button with recording ring */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* Animated recording ring */}
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

          {/* Right: Chat shortcut */}
          <button
            onClick={() => navigate('/messages')}
            className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center active:scale-90 transition-transform mb-2"
          >
            <MessageCircle className="h-5 w-5 text-white/70" />
          </button>
        </div>

        {/* ─── MODE TABS + LENS TOGGLE ─── */}
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

          {/* Lens bar - bottom-most */}
          <div className="flex items-center justify-center pb-3">
            <button
              onClick={() => { triggerHaptic('light'); setShowLenses(!showLenses); }}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all",
                showLenses
                  ? "bg-primary/20 text-primary backdrop-blur-md"
                  : "bg-white/10 text-white/60 backdrop-blur-sm"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {showLenses ? 'Hide Lenses' : 'Lenses & Filters'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
