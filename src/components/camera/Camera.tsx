import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Zap, ZapOff, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

export function Camera({ onClose }: CameraProps) {
  const [state, setState] = useState<CameraState>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flash, setFlash] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('normal');
  const [isRecording, setIsRecording] = useState(false);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'photo' | 'video'; file?: File } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);

  // Hide bottom nav when camera is open
  useEffect(() => {
    navVisibility.setInCommunityChat(true);
    return () => { navVisibility.forceShow(); };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
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

  const handleCaptureStart = () => { holdTimerRef.current = setTimeout(() => startRecording(), 300); };
  const handleCaptureEnd = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecording) stopRecording(); else takePhoto();
  };

  const handleFilterSwipe = (direction: number) => {
    const currentIndex = PRESET_FILTERS.findIndex(f => f.id === currentFilter);
    const newIndex = Math.max(0, Math.min(PRESET_FILTERS.length - 1, currentIndex + direction));
    if (newIndex !== currentIndex) { triggerHaptic('light'); setCurrentFilter(PRESET_FILTERS[newIndex].id); }
  };

  const handleScanComplete = (result: SafetyResult) => {
    if (result === 'blocked') { setCapturedMedia(null); setState('capture'); } 
    else setState('share');
  };

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
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Camera View */}
      <div 
        className="flex-1 relative overflow-hidden"
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

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-destructive/90 px-3 py-1.5 rounded-full backdrop-blur-sm"
            >
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-white rounded-full" />
              <span className="text-white font-mono text-xs">
                {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Controls - Minimal */}
      <div className="absolute top-0 left-0 right-0 safe-area-inset-top px-3 pt-3 pb-8 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm">
          <X className="h-5 w-5" strokeWidth={2.5} />
        </Button>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => setFlash(!flash)} className="text-white h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm">
            {flash ? <Zap className="h-4 w-4 text-yellow-400" /> : <ZapOff className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleCamera} className="text-white h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bottom Controls - Compact */}
      <div className="absolute bottom-0 left-0 right-0 pb-safe bg-gradient-to-t from-black/70 via-black/40 to-transparent">
        {/* Filter toggle + current filter name */}
        <div className="flex justify-center mb-3">
          <button 
            onClick={() => { triggerHaptic('light'); setShowFilters(!showFilters); }}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm",
              showFilters ? "bg-white/20 text-white" : "bg-black/30 text-white/70"
            )}
          >
            {currentFilter === 'normal' ? '✨ Filters' : `✨ ${PRESET_FILTERS.find(f => f.id === currentFilter)?.name}`}
          </button>
        </div>

        {/* Collapsible filter carousel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }} 
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-2"
            >
              <CameraFilterCarousel currentFilter={currentFilter} onFilterChange={setCurrentFilter} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Capture Button Row */}
        <div className="flex items-center justify-center gap-10 pb-5">
          <Button variant="ghost" size="icon" className="text-white/70 w-10 h-10">
            <Image className="h-5 w-5" />
          </Button>

          <motion.button
            onPointerDown={handleCaptureStart}
            onPointerUp={handleCaptureEnd}
            onPointerLeave={handleCaptureEnd}
            className={cn(
              "w-[72px] h-[72px] rounded-full border-[3px] border-white/90 flex items-center justify-center transition-colors",
              isRecording && "border-destructive"
            )}
            whileTap={{ scale: 0.92 }}
          >
            <motion.div
              animate={isRecording ? { scale: 0.5, borderRadius: '8px' } : { scale: 1, borderRadius: '50%' }}
              className={cn("w-[60px] h-[60px] bg-white", isRecording && "bg-destructive")}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            />
          </motion.button>

          <div className="w-10 h-10" />
        </div>

        <p className="text-center text-white/40 text-[11px] pb-3">
          Tap photo · Hold video
        </p>
      </div>
    </div>
  );
}
