import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ZapOff, SwitchCamera, Image as ImageIcon, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeRecordButton } from '@/components/camera/VybeRecordButton';
import { CreateModeSelector, type CreateMode } from './CreateModeSelector';
import { MobilePostComposer } from './MobilePostComposer';
import { SoundPicker } from '@/components/sounds/SoundPicker';
import { SoundControls } from '@/components/sounds/SoundControls';
import { MusicGallery } from '@/components/music/MusicGallery';
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
  const [selectedTrack, setSelectedTrack] = useState<any>(null); // For licensed music tracks
  const [showMusicGallery, setShowMusicGallery] = useState(false);
  const [soundStartTime, setSoundStartTime] = useState(0);

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

  // Hide nav
  useEffect(() => {
    navVisibility.setInCommunityChat(true);
    return () => { navVisibility.forceShow(); };
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('[MobileCreateStudio] Camera error:', err);
    }
  }, [facingMode, mode]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (phase === 'camera' && mode !== 'text') {
      startCamera();
    }
    return () => stopCamera();
  }, [phase, startCamera, stopCamera, mode]);

  // Take photo
  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    triggerHaptic('medium');

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

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
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
  }, [flash, facingMode, mode, capturedFiles.length]);

  // Start recording
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    triggerHaptic('heavy');
    isRecordingRef.current = true;
    setIsRecording(true);
    recordedChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
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
      if (progressRef.current >= 100) {
        stopRecording();
      } else if (isRecordingRef.current) {
        progressFrameRef.current = requestAnimationFrame(updateProgress);
      }
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

  // Capture handlers
  const handleCaptureStart = useCallback(() => {
    isHoldingRef.current = true;
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current && (mode === 'video' || mode === 'photo')) {
        startRecording();
      }
    }, 300);
  }, [mode, startRecording]);

  const handleCaptureEnd = useCallback(() => {
    isHoldingRef.current = false;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      takePhoto();
    }
  }, [stopRecording, takePhoto]);

  // Gallery picker
  const handleGalleryPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    if (mode === 'multi') {
      // In multi mode, ADD to existing items
      const remaining = 10 - capturedFiles.length;
      const items = selected.slice(0, remaining);
      const urls = items.map(f => URL.createObjectURL(f));
      setCapturedFiles(prev => [...prev, ...items]);
      setCapturedPreviews(prev => [...prev, ...urls]);
      // Stay in camera mode so user can add more
    } else {
      const items = selected.slice(0, 1);
      const urls = items.map(f => URL.createObjectURL(f));
      setCapturedFiles(items);
      setCapturedPreviews(urls);
      setPhase('compose');
    }
    // Reset input so the same file(s) can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [mode, capturedFiles.length]);

  // Remove a captured item in multi mode
  const removeMultiItem = useCallback((index: number) => {
    setCapturedPreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setCapturedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Mode change
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

  // Multi mode: go to compose
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
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple={mode === 'multi'} onChange={handleGalleryPick} className="hidden" />

      {/* Camera View */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "w-full h-full object-cover",
            facingMode === 'user' && "scale-x-[-1]"
          )}
        />

        {/* Flash overlay */}
        <AnimatePresence>
          {showFlash && (
            <motion.div
              initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-50 bg-white pointer-events-none"
            />
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute top-20 left-4 right-4 z-20"
            >
              <SoundControls
                sound={selectedSound}
                startTime={soundStartTime}
                onStartTimeChange={setSoundStartTime}
                onRemoveSound={() => setSelectedSound(null)}
                compact
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Multi mode thumbnail strip */}
        {mode === 'multi' && capturedPreviews.length > 0 && (
          <div className="absolute top-16 left-0 right-0 z-20 px-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
              {capturedPreviews.map((p, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 border-white/60">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeMultiItem(i); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
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
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent z-30">
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full">
          <X className="h-6 w-6" strokeWidth={2.5} />
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => setFlash(!flash)} className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full">
            {flash ? <Zap className="h-5 w-5 text-yellow-400" /> : <ZapOff className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { triggerHaptic('light'); setFacingMode(f => f === 'user' ? 'environment' : 'user'); }} className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full">
            <SwitchCamera className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-safe bg-gradient-to-t from-black/80 via-black/40 to-transparent z-30">
        {/* Mode selector */}
        <div className="mb-4">
          <CreateModeSelector currentMode={mode} onModeChange={handleModeChange} />
        </div>

        {/* Capture area */}
        <div className="flex items-center justify-center gap-6 pb-4">
          {/* Sound picker */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowSoundPicker(true)}
            className={cn(
              "text-white w-12 h-12 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-xl",
              selectedSound && "text-primary border-2 border-primary/50"
            )}
          >
            <Music2 className="h-5 w-5" />
          </Button>

          {/* Gallery */}
          <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white/40">
            {capturedPreviews.length > 0 ? (
              <img src={capturedPreviews[capturedPreviews.length - 1]} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10">
                <ImageIcon className="w-5 h-5 text-white/70" />
              </div>
            )}
          </button>

          {/* Capture Button */}
          <VybeRecordButton
            isRecording={isRecording}
            progress={recordingProgress}
            maxDuration={MAX_RECORDING_DURATION}
            onCaptureStart={handleCaptureStart}
            onCaptureEnd={handleCaptureEnd}
          />

          {/* Multi done / spacer */}
          {mode === 'multi' && capturedFiles.length > 0 ? (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleMultiDone}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-lg shadow-primary/30"
            >
              Done
            </motion.button>
          ) : (
            <div className="w-12 h-12" />
          )}
        </div>

        {/* Hint */}
        <AnimatePresence>
          {!isRecording && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center text-white/50 text-xs pb-4"
            >
              {mode === 'multi' ? 'Tap to capture · Add up to 10' : 'Tap for photo · Hold for video'}
              {selectedSound && ' · Sound will sync with video'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Sound Picker */}
      <SoundPicker
        open={showSoundPicker}
        onClose={() => setShowSoundPicker(false)}
        onSelectSound={setSelectedSound}
        selectedSoundId={selectedSound?.sound_id}
      />
    </div>
  );
}
