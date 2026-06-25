import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, SwitchCamera, Type, Check, 
  Send, Smile, Trash2, AlignCenter, AlignLeft, AlignRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useDoubleTapCameraFlip } from '@/hooks/useDoubleTapCameraFlip';
import { SnapOverlayDraggable } from '@/components/camera/SnapOverlayDraggable';

/** @deprecated Legacy DM snap camera — use VybeSnapCamera + VybeSnapEditor for all entry points. */
// Snapchat-style text styles
type TextStyle = 'classic' | 'glow' | 'outline' | 'background' | 'neon';
type TextAlign = 'left' | 'center' | 'right';

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  rotation: number;
  style: TextStyle;
  align: TextAlign;
  backgroundColor?: string;
}

interface VybeCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (imageDataUrl: string) => void;
}

const VYBE_COLORS = ['#ffffff', '#000000', '#8B5CF6', '#D946EF', '#F97316', '#10B981', '#3B82F6', '#EC4899', '#14B8A6', '#FACC15'];
const STICKERS = ['✨', '💜', '🔥', '💯', '⚡', '🎉', '💖', '🙌', '🌟', '💫', '🎵', '🦋'];
const TEXT_STYLES: { id: TextStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'glow', label: 'Glow' },
  { id: 'outline', label: 'Outline' },
  { id: 'background', label: 'Box' },
  { id: 'neon', label: 'Neon' },
];

export function SnapCamera({ isOpen, onClose, onSend }: VybeCameraProps) {
  const [phase, setPhase] = useState<'camera' | 'edit' | 'sending'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mode, setMode] = useState<'none' | 'text' | 'sticker'>('none');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [currentStyle, setCurrentStyle] = useState<TextStyle>('classic');
  const [currentAlign, setCurrentAlign] = useState<TextAlign>('center');
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [sendingStatus, setSendingStatus] = useState<'uploading' | 'scanning' | 'sending' | 'done' | 'error'>('uploading');
  
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const uiUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const MAX_RECORDING_DURATION = 10000; // 10 seconds max

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16/9 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera error:', error);
    }
  }, [facingMode]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Initialize camera when opened
  useEffect(() => {
    if (isOpen && phase === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, phase, startCamera, stopCamera]);

  // Switch camera
  const handleSwitchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const onDoubleTapFlip = useDoubleTapCameraFlip(() => {
    haptics.impact();
    handleSwitchCamera();
  });

  // Flash effect state
  const [showFlash, setShowFlash] = useState(false);

  // Capture photo with flash effect - crops to match the visible preview
  // IMPORTANT: Mirror the capture for front camera so it matches what user sees
  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    haptics.success();
    
    // Show flash effect
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get the visible area dimensions (what the user sees with object-fit: cover)
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = video.clientWidth / video.clientHeight;
    
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    
    // Calculate the crop to match object-fit: cover behavior
    if (videoAspect > containerAspect) {
      // Video is wider - crop sides
      sw = video.videoHeight * containerAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      // Video is taller - crop top/bottom
      sh = video.videoWidth / containerAspect;
      sy = (video.videoHeight - sh) / 2;
    }
    
    // Set canvas to match container aspect ratio for best quality
    const outputWidth = Math.min(1920, sw);
    const outputHeight = Math.round(outputWidth / containerAspect);
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    
    // For front camera: draw to temp canvas first, then mirror to main canvas
    // This ensures the captured image matches exactly what user sees in the preview
    if (facingMode === 'user') {
      // Create temp canvas to draw raw video
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outputWidth;
      tempCanvas.height = outputHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        // Draw the cropped portion to temp canvas
        tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
        // Now mirror and draw to main canvas
        ctx.translate(outputWidth, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    } else {
      // Back camera: draw directly without mirroring
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    }

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(imageDataUrl);
    setIsVideoMode(false);
    setPhase('edit');
    stopCamera();
  }, [stopCamera, facingMode]);

  // Stop video recording - goes to edit phase for review before sending
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
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
    isRecordingRef.current = false;
    setRecordingProgress(0);
    haptics.success();
  }, []);

  // Start video recording
  const startRecording = useCallback(async () => {
    if (!streamRef.current) return;
    
    haptics.impact();
    setIsRecording(true);
    isRecordingRef.current = true;
    setRecordingProgress(0);
    recordedChunksRef.current = [];
    
    try {
      // Get audio stream and combine with video
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = audioStream;
      const combinedStream = new MediaStream([
        ...streamRef.current.getVideoTracks(),
        ...audioStream.getAudioTracks()
      ]);
      
      // Check supported mimeTypes
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';
      
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const videoUrl = URL.createObjectURL(blob);
        
        // Stop audio tracks
        audioStreamRef.current?.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
        
        // Go to edit phase so user can review/add text before sending
        setCapturedVideo(videoUrl);
        setIsVideoMode(true);
        setPhase('edit');
        stopCamera();
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      
      // RAF for smooth 60fps progress tracking
      const recordingStartTime = Date.now();
      const updateProgress = () => {
        const elapsed = Date.now() - recordingStartTime;
        const progress = Math.min((elapsed / MAX_RECORDING_DURATION) * 100, 100);
        progressRef.current = progress;
        
        if (elapsed >= MAX_RECORDING_DURATION) {
          stopRecording();
        } else {
          progressFrameRef.current = requestAnimationFrame(updateProgress);
        }
      };
      progressFrameRef.current = requestAnimationFrame(updateProgress);
      
      // UI update at 10fps for React state
      uiUpdateRef.current = setInterval(() => {
        setRecordingProgress(progressRef.current);
      }, 100);
      
    } catch (error) {
      console.error('[SnapCamera] Failed to start recording:', error);
      setIsRecording(false);
      // Fallback to photo if audio fails
      handleCapture();
    }
  }, [stopCamera, stopRecording, handleCapture, onSend, onClose]);

  // Handle capture button press - tap for photo, hold for video
  const handleCaptureStart = useCallback(() => {
    isHoldingRef.current = true;
    
    // Start hold timer - if held for 300ms, start recording
    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        startRecording();
      }
    }, 300);
  }, [startRecording]);

  // Handle capture button release - use ref to avoid stale closure
  const handleCaptureEnd = useCallback(() => {
    isHoldingRef.current = false;
    
    // Clear hold timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    // Use ref instead of state to avoid stale closure
    if (isRecordingRef.current) {
      // Was recording - stop it and go to edit phase
      stopRecording();
    } else {
      // Quick tap - take photo
      handleCapture();
    }
  }, [stopRecording, handleCapture]);

  // Add text overlay - Snapchat style
  const addText = () => {
    if (!currentText.trim()) return;
    haptics.impact();
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: currentText,
      x: 50,
      y: 40,
      color: currentColor,
      fontSize: 32,
      rotation: 0,
      style: currentStyle,
      align: currentAlign,
      backgroundColor: currentStyle === 'background' ? currentColor : undefined,
    }]);
    setCurrentText('');
    setIsTextInputOpen(false);
  };

  // Add sticker
  const addSticker = (emoji: string) => {
    haptics.impact();
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: emoji,
      x: 50,
      y: 50,
      color: '#ffffff',
      fontSize: 56,
      rotation: 0,
      style: 'classic' as TextStyle,
      align: 'center' as TextAlign,
    }]);
  };

  // Open text input (Snapchat-style full screen)
  const openTextInput = () => {
    setIsTextInputOpen(true);
    setMode('text');
    setTimeout(() => textInputRef.current?.focus(), 100);
  };

  // Get text style CSS
  const getTextStyleCSS = (style: TextStyle, color: string): React.CSSProperties => {
    switch (style) {
      case 'glow':
        return {
          textShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}, 0 0 40px ${color}`,
        };
      case 'outline':
        return {
          WebkitTextStroke: '2px black',
          textShadow: 'none',
        };
      case 'background':
        return {
          backgroundColor: color,
          color: color === '#ffffff' || color === '#FACC15' ? '#000000' : '#ffffff',
          padding: '8px 16px',
          borderRadius: '8px',
          textShadow: 'none',
        };
      case 'neon':
        return {
          textShadow: `0 0 5px #fff, 0 0 10px #fff, 0 0 15px ${color}, 0 0 20px ${color}, 0 0 35px ${color}`,
          color: '#fff',
        };
      case 'classic':
      default:
        return {
          textShadow: '2px 2px 8px rgba(0,0,0,0.8), -1px -1px 4px rgba(0,0,0,0.5)',
        };
    }
  };

  // Remove overlay on double tap
  const handleDoubleTap = (id: string) => {
    haptics.impact();
    setTextOverlays(prev => prev.filter(o => o.id !== id));
  };

  const handleOverlayDragEnd = useCallback((id: string, x: number, y: number, deleted?: boolean) => {
    if (deleted) {
      setTextOverlays(prev => prev.filter(o => o.id !== id));
      return;
    }
    setTextOverlays(prev => prev.map(o => (o.id !== id ? o : { ...o, x, y })));
  }, []);

  // Clear all
  const clearAll = () => {
    haptics.impact();
    setTextOverlays([]);
  };

  // Render final image with overlays - supports all text styles
  const renderFinalImage = useCallback(async (): Promise<string> => {
    if (!capturedImage) throw new Error('No image captured');

    // If no overlays, just return the captured image directly
    if (textOverlays.length === 0) {
      return capturedImage;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context failed'));
            return;
          }

          ctx.drawImage(img, 0, 0);

          textOverlays.forEach(overlay => {
            ctx.save();
            const x = (overlay.x / 100) * img.width;
            const y = (overlay.y / 100) * img.height;
            const scaledFontSize = overlay.fontSize * (img.width / 400);
            
            ctx.translate(x, y);
            ctx.rotate((overlay.rotation * Math.PI) / 180);
            
            ctx.font = `bold ${scaledFontSize}px sans-serif`;
            ctx.textAlign = overlay.align || 'center';
            ctx.textBaseline = 'middle';
            
            // Apply style-specific rendering
            switch (overlay.style) {
              case 'glow':
                ctx.shadowColor = overlay.color;
                ctx.shadowBlur = 20;
                ctx.fillStyle = overlay.color;
                ctx.fillText(overlay.text, 0, 0);
                ctx.fillText(overlay.text, 0, 0); // Double draw for stronger glow
                break;
                
              case 'outline':
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.fillStyle = overlay.color;
                ctx.strokeText(overlay.text, 0, 0);
                ctx.fillText(overlay.text, 0, 0);
                break;
                
              case 'background': {
                const metrics = ctx.measureText(overlay.text);
                const padding = scaledFontSize * 0.4;
                const bgWidth = metrics.width + padding * 2;
                const bgHeight = scaledFontSize * 1.4;
                
                ctx.fillStyle = overlay.color;
                ctx.fillRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);
                
                ctx.fillStyle = overlay.color === '#ffffff' || overlay.color === '#FACC15' ? '#000000' : '#ffffff';
                ctx.fillText(overlay.text, 0, 0);
                break;
              }

              case 'neon':
                ctx.shadowColor = overlay.color;
                ctx.shadowBlur = 15;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(overlay.text, 0, 0);
                ctx.fillText(overlay.text, 0, 0);
                break;
                
              case 'classic':
              default:
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = overlay.color;
                ctx.fillText(overlay.text, 0, 0);
                break;
            }
            
            ctx.restore();
          });

          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = (e) => {
        console.error('Image load error:', e);
        // Fallback: return original image without overlays
        resolve(capturedImage);
      };
      
      img.src = capturedImage;
    });
  }, [capturedImage, textOverlays]);

  // Close and reset
  const handleClose = useCallback(() => {
    stopCamera();
    stopRecording();
    setCapturedImage(null);
    setCapturedVideo(null);
    setIsVideoMode(false);
    setPhase('camera');
    setTextOverlays([]);
    setMode('none');
    setIsSending(false);
    setCurrentText('');
    onClose();
  }, [stopCamera, stopRecording, onClose]);

  // Send the vybe (image or video)
  const handleSend = useCallback(async () => {
    if ((!capturedImage && !capturedVideo) || isSending) return;

    setIsSending(true);
    haptics.success();

    try {
      if (isVideoMode && capturedVideo) {
        // Send video directly (no overlay support for video yet)
        onSend(capturedVideo);
        handleClose();
      } else if (capturedImage) {
        const finalImage = await renderFinalImage();
        onSend(finalImage);
        handleClose();
      }
    } catch (error) {
      console.error('Failed to send vybe:', error);
      // Try sending original as fallback
      try {
        if (isVideoMode && capturedVideo) {
          onSend(capturedVideo);
        } else if (capturedImage) {
          onSend(capturedImage);
        }
        handleClose();
      } catch {
        setIsSending(false);
      }
    }
  }, [capturedImage, capturedVideo, isVideoMode, isSending, renderFinalImage, onSend, handleClose]);

  // Retake photo/video
  const handleRetake = () => {
    setCapturedImage(null);
    setCapturedVideo(null);
    setIsVideoMode(false);
    setTextOverlays([]);
    setMode('none');
    setPhase('camera');
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
    >
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence mode="wait">
        {phase === 'camera' && (
          <motion.div
            key="camera"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 relative"
            onDoubleClick={(e) => onDoubleTapFlip(e)}
            onTouchEnd={(e) => {
              if (e.changedTouches.length === 1 && e.touches.length === 0) onDoubleTapFlip(e);
            }}
          >
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              style={{ 
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
              }}
              playsInline
              muted
              autoPlay
            />

            {/* Flash effect overlay */}
            <AnimatePresence>
              {showFlash && (
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-50 bg-white pointer-events-none"
                />
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between safe-area-inset-top bg-gradient-to-b from-black/50 to-transparent">
              <Button variant="ghost" size="icon" onClick={handleClose} className="text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60">
                <X className="h-6 w-6" />
              </Button>
              <motion.div 
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/40 to-accent/40 backdrop-blur-md border border-white/30"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
              >
                <VybeMiniIcon size={18} showSparkles />
                <VybeWordmark size="sm" />
              </motion.div>
              <Button variant="ghost" size="icon" onClick={handleSwitchCamera} className="text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60">
                <SwitchCamera className="h-6 w-6" />
              </Button>
            </div>

            {/* Capture button - tap for photo, hold for video */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center safe-area-inset-bottom">
              <motion.button
                onPointerDown={handleCaptureStart}
                onPointerUp={handleCaptureEnd}
                onPointerCancel={handleCaptureEnd}
                onPointerLeave={handleCaptureEnd}
                className="relative w-20 h-20 rounded-full flex items-center justify-center touch-none"
              >
                {/* Outer ring with theme gradient - Snapchat-style recording ring */}
                <div 
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: isRecording 
                      ? `conic-gradient(
                          hsl(var(--primary)) 0deg,
                          hsl(var(--accent)) 90deg,
                          hsl(var(--primary)) 180deg,
                          hsl(var(--accent)) 270deg,
                          hsl(var(--primary)) 360deg
                        )`
                      : 'transparent',
                    padding: isRecording ? '4px' : '0',
                    WebkitMask: isRecording ? 'none' : undefined,
                  }}
                >
                  {/* Inner mask for ring effect when recording */}
                  {isRecording && (
                    <div className="w-full h-full rounded-full bg-black" />
                  )}
                </div>
                
                {/* Static outer ring when not recording */}
                {!isRecording && (
                  <div className="absolute inset-0 rounded-full border-4 border-white/90" />
                )}
                
                {/* Snapchat-style progressive fill ring - starts empty, fills as you hold */}
                {isRecording && (
                  <svg 
                    className="absolute inset-[-6px] w-[calc(100%+12px)] h-[calc(100%+12px)]"
                    style={{ transform: 'rotate(-90deg)' }}
                  >
                    {/* Background ring (subtle gray track) */}
                    <circle
                      cx="50%"
                      cy="50%"
                      r="42"
                      fill="none"
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="6"
                    />
                    {/* Progress ring - fills progressively */}
                    <circle
                      cx="50%"
                      cy="50%"
                      r="42"
                      fill="none"
                      stroke="url(#snapProgressGradient)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="264"
                      strokeDashoffset={264 - (recordingProgress / 100) * 264}
                      style={{ transition: 'stroke-dashoffset 50ms linear' }}
                    />
                    {/* Gradient definition */}
                    <defs>
                      <linearGradient id="snapProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="hsl(var(--primary))" />
                        <stop offset="50%" stopColor="hsl(var(--accent))" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" />
                      </linearGradient>
                    </defs>
                  </svg>
                )}
                
                {/* Inner button - changes to red square when recording */}
                <motion.div 
                  className={cn(
                    "shadow-lg z-10",
                    isRecording 
                      ? "w-7 h-7 rounded-md bg-red-500" 
                      : "w-16 h-16 rounded-full bg-white"
                  )}
                  initial={false}
                  animate={isRecording ? { scale: 1 } : { scale: 1 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                />
                
                {/* Pulsing ring effect - only when not recording */}
                {!isRecording && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-white/40"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </motion.button>
            </div>
            
            {/* Recording indicator */}
            <AnimatePresence>
              {isRecording && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-36 left-0 right-0 flex justify-center"
                >
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/80 backdrop-blur-sm">
                    <motion.div 
                      className="w-2 h-2 rounded-full bg-white"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                    <span className="text-sm text-white font-semibold">Recording...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Vybe streak indicator - hide when recording */}
            {!isRecording && (
              <div className="absolute bottom-36 left-0 right-0 flex justify-center px-4">
                <motion.div 
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary/50 to-accent/50 backdrop-blur-xl border border-white/30 shadow-lg"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, type: 'spring' }}
                >
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <VybeMiniIcon size={18} showSparkles />
                  </motion.div>
                  <span className="text-sm text-white font-semibold">Tap for photo, hold for video</span>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}

        {phase === 'edit' && (capturedImage || capturedVideo) && (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 relative flex flex-col"
          >
            {/* Captured media with overlays */}
            <div 
              ref={containerRef} 
              className="flex-1 relative overflow-hidden touch-none"
            >
              {isVideoMode && capturedVideo ? (
                <video
                  key={capturedVideo}
                  src={capturedVideo}
                  className="w-full h-full object-cover pointer-events-none select-none"
                  autoPlay
                  loop
                  playsInline
                  controls={false}
                  onError={(e) => console.error('[SnapCamera] Video playback error:', e)}
                />
              ) : capturedImage ? (
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              ) : null}

              {/* Text Overlays - with style support */}
              {textOverlays.map(overlay => (
                <SnapOverlayDraggable
                  key={overlay.id}
                  id={overlay.id}
                  x={overlay.x}
                  y={overlay.y}
                  mode="free"
                  containerRef={containerRef}
                  onDraggingChange={setDraggedId}
                  onDragEnd={handleOverlayDragEnd}
                  className={cn(
                    'whitespace-pre-wrap max-w-[90%]',
                    draggedId === overlay.id && 'z-50',
                  )}
                  style={{
                    color: overlay.style === 'background'
                      ? (overlay.color === '#ffffff' || overlay.color === '#FACC15' ? '#000000' : '#ffffff')
                      : overlay.color,
                    fontSize: overlay.fontSize,
                    fontWeight: 'bold',
                    textAlign: overlay.align,
                    ...getTextStyleCSS(overlay.style, overlay.color),
                  }}
                >
                  <span onDoubleClick={() => handleDoubleTap(overlay.id)}>{overlay.text}</span>
                </SnapOverlayDraggable>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent safe-area-inset-top">
              <Button variant="ghost" size="icon" onClick={handleRetake} className="text-white hover:bg-white/20">
                <X className="h-6 w-6" />
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/40 to-accent/40 backdrop-blur-sm">
                <VybeMiniIcon size={16} showSparkles />
                <VybeWordmark size="xs" />
              </div>
              <div className="flex gap-2">
                {textOverlays.length > 0 && (
                  <Button variant="ghost" size="icon" onClick={clearAll} className="text-white hover:bg-white/20">
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Snapchat-style Full Screen Text Input */}
            <AnimatePresence>
              {isTextInputOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex flex-col"
                >
                  {/* Text Input Header */}
                  <div className="flex items-center justify-between p-4 safe-area-inset-top">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { setIsTextInputOpen(false); setMode('none'); }}
                      className="text-white"
                    >
                      Cancel
                    </Button>
                    <div className="flex items-center gap-2">
                      {/* Alignment toggle */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCurrentAlign(prev => 
                          prev === 'left' ? 'center' : prev === 'center' ? 'right' : 'left'
                        )}
                        className="text-white h-10 w-10"
                      >
                        {currentAlign === 'left' && <AlignLeft className="h-5 w-5" />}
                        {currentAlign === 'center' && <AlignCenter className="h-5 w-5" />}
                        {currentAlign === 'right' && <AlignRight className="h-5 w-5" />}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addText}
                      disabled={!currentText.trim()}
                      className="text-white font-semibold"
                    >
                      Done
                    </Button>
                  </div>

                  {/* Text Style Selector */}
                  <div className="px-4 pb-3">
                    <div className="flex gap-2 justify-center overflow-x-auto py-2 scrollbar-hide">
                      {TEXT_STYLES.map(style => (
                        <button
                          key={style.id}
                          onClick={() => setCurrentStyle(style.id)}
                          className={cn(
                            "px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                            currentStyle === style.id 
                              ? "bg-white text-black" 
                              : "bg-white/20 text-white hover:bg-white/30"
                          )}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Main Text Input Area */}
                  <div className="flex-1 flex items-center justify-center px-6">
                    <textarea
                      ref={textInputRef}
                      value={currentText}
                      onChange={(e) => setCurrentText(e.target.value)}
                      placeholder="Type something..."
                      className={cn(
                        "w-full bg-transparent border-none outline-none resize-none font-bold",
                        "placeholder:text-white/40 text-3xl leading-tight",
                        currentAlign === 'left' && "text-left",
                        currentAlign === 'center' && "text-center",
                        currentAlign === 'right' && "text-right"
                      )}
                      style={{
                        color: currentStyle === 'background' 
                          ? (currentColor === '#ffffff' || currentColor === '#FACC15' ? '#000000' : '#ffffff')
                          : currentColor,
                        ...getTextStyleCSS(currentStyle, currentColor),
                        maxHeight: '40vh',
                      }}
                      rows={3}
                      autoFocus
                    />
                  </div>

                  {/* Color Picker */}
                  <div className="px-4 pb-8 safe-area-inset-bottom">
                    <div className="flex gap-3 justify-center py-3 overflow-x-auto scrollbar-hide">
                      {VYBE_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setCurrentColor(color)}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all duration-200 flex-shrink-0",
                            currentColor === color 
                              ? "scale-125 border-white ring-2 ring-white/50" 
                              : "border-white/30 hover:scale-110"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tools Bar - only show when text input is closed */}
            {!isTextInputOpen && (
              <div className="absolute bottom-28 left-0 right-0 px-4 z-20">
                <AnimatePresence mode="wait">
                  {mode === 'sticker' && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="flex gap-3 overflow-x-auto py-3 px-2 scrollbar-hide bg-black/40 backdrop-blur-sm rounded-2xl"
                    >
                      {STICKERS.map(sticker => (
                        <motion.button
                          key={sticker}
                          onClick={() => addSticker(sticker)}
                          className="text-4xl p-1 flex-shrink-0"
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          {sticker}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Mode Buttons */}
                <div className="flex justify-center gap-4 mt-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openTextInput}
                    className="rounded-full h-12 w-12 text-white bg-black/40 backdrop-blur-sm hover:bg-black/60"
                  >
                    <Type className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={mode === 'sticker' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setMode(mode === 'sticker' ? 'none' : 'sticker')}
                    className={cn(
                      "rounded-full h-12 w-12 transition-all",
                      mode === 'sticker' ? "bg-gradient-to-r from-primary to-accent" : "text-white bg-black/40 backdrop-blur-sm hover:bg-black/60"
                    )}
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </div>
                
                {/* Tip */}
                {textOverlays.length > 0 && mode === 'none' && (
                  <motion.p 
                    className="text-center text-xs text-white/60 mt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    Double-tap to remove • Drag to move
                  </motion.p>
                )}
              </div>
            )}

            {/* Send Button */}
            <div className="absolute bottom-4 left-4 right-4 safe-area-inset-bottom">
              <motion.button
                onClick={handleSend}
                disabled={isSending}
                className={cn(
                  "relative overflow-hidden w-full py-4 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-all duration-300"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {!isSending && (
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      backgroundSize: '200% 100%',
                      backgroundImage: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 12.5%, hsl(var(--primary)) 25%, hsl(var(--accent)) 37.5%, hsl(var(--primary)) 50%, hsl(var(--accent)) 62.5%, hsl(var(--primary)) 75%, hsl(var(--accent)) 87.5%, hsl(var(--primary)) 100%)'
                    }}
                    animate={{ backgroundPosition: ['0% 50%', '-100% 50%'] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {isSending ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="h-6 w-6 border-3 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <>
                      <VybeMiniIcon size={20} showSparkles />
                      Send VYBE
                      <Send className="h-5 w-5" />
                    </>
                  )}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Sending Phase - Auto-send video feedback */}
        {phase === 'sending' && (
          <motion.div
            key="sending"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex flex-col items-center justify-center bg-black"
          >
            <motion.div 
              className="relative w-32 h-32 flex items-center justify-center"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              {/* Animated gradient ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(
                    from 0deg,
                    hsl(var(--primary)) 0%,
                    hsl(var(--accent)) 25%,
                    hsl(var(--primary)) 50%,
                    hsl(var(--accent)) 75%,
                    hsl(var(--primary)) 100%
                  )`,
                  WebkitMask: 'radial-gradient(circle, transparent 52px, black 52px)',
                  mask: 'radial-gradient(circle, transparent 52px, black 52px)',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              />
              
              {/* Inner circle with icon */}
              <div className="absolute inset-3 rounded-full bg-black flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  <VybeMiniIcon size={40} showSparkles />
                </motion.div>
              </div>
            </motion.div>
            
            <motion.p
              className="text-white font-semibold text-lg mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Sending VYBE...
            </motion.p>
            
            <motion.p
              className="text-white/60 text-sm mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              🎬 Video sent!
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
