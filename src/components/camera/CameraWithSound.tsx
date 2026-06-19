import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Zap, ZapOff, Image, Music2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CameraFilters, CAMERA_FILTERS, getFilterCSS } from './CameraFilters';
import { CameraEditor } from './CameraEditor';
import { CameraShareSheet } from './CameraShareSheet';
import { SoundPicker } from '@/components/sounds/SoundPicker';
import { SoundControls } from '@/components/sounds/SoundControls';
import { triggerHaptic } from '@/lib/haptics';
import { navVisibility } from '@/lib/navVisibility';
import { Sound } from '@/hooks/useSounds';

interface CameraProps {
  onClose: () => void;
  initialSound?: Sound | null;
}

type CameraState = 'capture' | 'edit' | 'share';

export function Camera({ onClose, initialSound }: CameraProps) {
  const [state, setState] = useState<CameraState>('capture');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [flash, setFlash] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('normal');
  const [isRecording, setIsRecording] = useState(false);
  const [capturedMedia, setCapturedMedia] = useState<{ url: string; type: 'photo' | 'video'; file?: File; soundId?: string; soundStartTime?: number } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [selectedSound, setSelectedSound] = useState<Sound | null>(initialSound || null);
  const [soundStartTime, setSoundStartTime] = useState(0);
  
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
    return () => {
      navVisibility.forceShow();
    };
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [startCamera]);

  // Toggle camera facing
  const toggleCamera = () => {
    triggerHaptic('light');
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Take photo
  const takePhoto = () => {
    if (!videoRef.current) return;
    triggerHaptic('medium');

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Apply filter
      ctx.filter = getFilterCSS(currentFilter) || 'none';
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Create both dataUrl and File for scanning
      canvas.toBlob((blob) => {
        if (blob) {
          const dataUrl = URL.createObjectURL(blob);
          const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
          setCapturedMedia({ 
            url: dataUrl, 
            type: 'photo', 
            file,
            soundId: selectedSound?.sound_id,
            soundStartTime
          });
          setState('edit');
        }
      }, 'image/jpeg', 0.9);
    }
  };

  // Start recording
  const startRecording = () => {
    if (!streamRef.current) return;
    triggerHaptic('heavy');
    
    recordedChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const file = new File([blob], 'camera-video.webm', { type: 'video/webm' });
      setCapturedMedia({ 
        url, 
        type: 'video', 
        file,
        soundId: selectedSound?.sound_id,
        soundStartTime
      });
      setState('edit');
    };

    mediaRecorder.start(100);
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingDuration(0);

    // RAF for duration tracking with 1s UI updates
    const recordingStartTime = Date.now();
    const updateDuration = () => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      progressRef.current = elapsed;
      
      if (elapsed >= 60) {
        stopRecording();
      } else {
        progressFrameRef.current = requestAnimationFrame(updateDuration);
      }
    };
    progressFrameRef.current = requestAnimationFrame(updateDuration);
    
    // UI update every second
    recordingIntervalRef.current = setInterval(() => {
      setRecordingDuration(progressRef.current);
    }, 1000);
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (progressFrameRef.current) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(false);
    setRecordingDuration(progressRef.current); // Final sync
    triggerHaptic('light');
  };

  // Handle capture button
  const handleCaptureStart = () => {
    holdTimerRef.current = setTimeout(() => {
      startRecording();
    }, 300);
  };

  const handleCaptureEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    if (isRecording) {
      stopRecording();
    } else {
      takePhoto();
    }
  };

  // Filter swipe handling
  const handleFilterSwipe = (direction: number) => {
    const currentIndex = CAMERA_FILTERS.findIndex(f => f.id === currentFilter);
    const newIndex = Math.max(0, Math.min(CAMERA_FILTERS.length - 1, currentIndex + direction));
    if (newIndex !== currentIndex) {
      triggerHaptic('light');
      setCurrentFilter(CAMERA_FILTERS[newIndex].id);
    }
  };


  // Sound handling
  const handleSoundSelect = (sound: Sound) => {
    setSelectedSound(sound);
    setSoundStartTime(0);
  };

  const handleRemoveSound = () => {
    setSelectedSound(null);
    setSoundStartTime(0);
  };

  // Render based on state
  if (state === 'edit' && capturedMedia) {
    return (
      <CameraEditor
        mediaUrl={capturedMedia.url}
        mediaType={capturedMedia.type}
        filter={currentFilter}
        soundId={capturedMedia.soundId}
        soundStartTime={capturedMedia.soundStartTime}
        onSave={() => setState('share')}
        onCancel={() => {
          setCapturedMedia(null);
          setState('capture');
        }}
      />
    );
  }

  if (state === 'share' && capturedMedia) {
    return (
      <CameraShareSheet
        mediaUrl={capturedMedia.url}
        mediaType={capturedMedia.type}
        mediaFile={capturedMedia.file}
        soundId={capturedMedia.soundId}
        soundStartTime={capturedMedia.soundStartTime}
        onClose={() => {
          setState('edit');
        }}
        onComplete={onClose}
      />
    );
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
            const endX = endE.changedTouches[0].clientX;
            const diff = endX - startX;
            if (Math.abs(diff) > 50) {
              handleFilterSwipe(diff > 0 ? -1 : 1);
            }
            document.removeEventListener('touchend', handleTouchEnd);
          };
          document.addEventListener('touchend', handleTouchEnd);
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          disablePictureInPicture
          className={cn(
            "w-full h-full object-cover bg-black",
            facingMode === 'user' && "scale-x-[-1]"
          )}
          style={{ backgroundColor: '#000', filter: getFilterCSS(currentFilter) }}
        />

        {/* Flash overlay */}
        {flash && (
          <div className="absolute inset-0 bg-white/10 pointer-events-none" />
        )}

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-500/80 px-4 py-2 rounded-full"
            >
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="w-3 h-3 bg-white rounded-full"
              />
              <span className="text-white font-mono text-sm">
                {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
                {(recordingDuration % 60).toString().padStart(2, '0')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Controls */}
      <div
        className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent"
        style={{ paddingTop: 'calc(var(--sat, 0px) + 1rem)' }}
      >
        <Button variant="ghost" size="icon-round" onClick={onClose} className="text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm">
          <X className="h-6 w-6" strokeWidth={2.5} />
        </Button>
        
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setFlash(!flash)}
            className="text-white"
          >
            {flash ? <Zap className="h-5 w-5 text-yellow-400" /> : <ZapOff className="h-5 w-5" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleCamera}
            className="text-white"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Sound Controls */}
      <AnimatePresence>
        {selectedSound && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-20 left-4 right-4"
          >
            <SoundControls
              sound={selectedSound}
              startTime={soundStartTime}
              onStartTimeChange={setSoundStartTime}
              onRemoveSound={handleRemoveSound}
              compact
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 pb-safe bg-gradient-to-t from-black/80 to-transparent">
        {/* Filters */}
        <div className="mb-4">
          <CameraFilters 
            currentFilter={currentFilter}
            onFilterChange={setCurrentFilter}
          />
        </div>

        {/* Capture Button */}
        <div className="flex items-center justify-center gap-8 pb-6">
          {/* Sound picker button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowSoundPicker(true)}
            className={cn(
              "text-white w-12 h-12",
              selectedSound && "text-primary"
            )}
          >
            <Music2 className="h-6 w-6" />
          </Button>

          {/* Capture */}
          <motion.button
            onPointerDown={handleCaptureStart}
            onPointerUp={handleCaptureEnd}
            onPointerLeave={handleCaptureEnd}
            className={cn(
              "w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-colors",
              isRecording && "border-red-500"
            )}
            whileTap={{ scale: 0.9 }}
          >
            <motion.div
              animate={isRecording ? { scale: 0.6, borderRadius: '8px' } : { scale: 1, borderRadius: '50%' }}
              className={cn(
                "w-16 h-16 bg-white",
                isRecording && "bg-red-500"
              )}
            />
          </motion.button>

          {/* Gallery shortcut */}
          <Button variant="ghost" size="icon" className="text-white w-12 h-12">
            <Image className="h-6 w-6" />
          </Button>
        </div>

        {/* Hint text */}
        <p className="text-center text-white/60 text-sm pb-4">
          Tap for photo • Hold for video
          {selectedSound && " • Sound will sync with video"}
        </p>
      </div>

      {/* Sound Picker */}
      <SoundPicker
        open={showSoundPicker}
        onClose={() => setShowSoundPicker(false)}
        onSelectSound={handleSoundSelect}
        selectedSoundId={selectedSound?.sound_id}
      />
    </div>
  );
}