import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Camera, SwitchCamera, Type, Check, 
  Send, Smile, Pencil, Undo, Trash2, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
}

interface SnapCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (imageDataUrl: string) => void;
}

const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d92'];
const STICKERS = ['😀', '😍', '🔥', '💯', '✨', '🎉', '❤️', '👍', '🙌', '💪', '🎵', '🌟'];

export function SnapCamera({ isOpen, onClose, onSend }: SnapCameraProps) {
  const [phase, setPhase] = useState<'camera' | 'edit'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [mode, setMode] = useState<'none' | 'text' | 'sticker' | 'draw'>('none');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [isSending, setIsSending] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 }
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

  // Capture photo
  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    haptics.impact();
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame
    ctx.drawImage(video, 0, 0);

    // Get the image data URL
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageDataUrl);
    setPhase('edit');
    stopCamera();
  }, [stopCamera]);

  // Add text overlay
  const addText = () => {
    if (!currentText.trim()) return;
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: currentText,
      x: 50,
      y: 50,
      color: currentColor,
      fontSize: 24,
    }]);
    setCurrentText('');
    setMode('none');
  };

  // Add sticker
  const addSticker = (emoji: string) => {
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: emoji,
      x: 50,
      y: 50,
      color: '#ffffff',
      fontSize: 48,
    }]);
  };

  // Remove overlay
  const removeOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
  };

  // Clear all
  const clearAll = () => {
    setTextOverlays([]);
  };

  // Render final image with overlays
  const renderFinalImage = useCallback(async (): Promise<string> => {
    if (!capturedImage) throw new Error('No image captured');

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context failed'));
          return;
        }

        // Draw base image
        ctx.drawImage(img, 0, 0);

        // Draw text overlays
        textOverlays.forEach(overlay => {
          ctx.save();
          ctx.font = `bold ${overlay.fontSize * (img.width / 400)}px sans-serif`;
          ctx.fillStyle = overlay.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          
          const x = (overlay.x / 100) * img.width;
          const y = (overlay.y / 100) * img.height;
          ctx.fillText(overlay.text, x, y);
          ctx.restore();
        });

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = capturedImage;
    });
  }, [capturedImage, textOverlays]);

  // Send the snap
  const handleSend = async () => {
    if (!capturedImage || isSending) return;

    setIsSending(true);
    haptics.success();

    try {
      const finalImage = await renderFinalImage();
      onSend(finalImage);
      handleClose();
    } catch (error) {
      console.error('Failed to send snap:', error);
      setIsSending(false);
    }
  };

  // Close and reset
  const handleClose = useCallback(() => {
    stopCamera();
    setCapturedImage(null);
    setPhase('camera');
    setTextOverlays([]);
    setMode('none');
    setIsSending(false);
    onClose();
  }, [stopCamera, onClose]);

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
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
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence mode="wait">
        {phase === 'camera' && (
          <motion.div
            key="camera"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 relative"
          >
            {/* Camera preview */}
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={handleClose} className="text-white bg-black/30 rounded-full">
                <X className="h-6 w-6" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSwitchCamera} className="text-white bg-black/30 rounded-full">
                <SwitchCamera className="h-6 w-6" />
              </Button>
            </div>

            {/* Capture button */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center">
              <motion.button
                onClick={handleCapture}
                className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm flex items-center justify-center"
                whileTap={{ scale: 0.9 }}
              >
                <div className="w-16 h-16 rounded-full bg-white" />
              </motion.button>
            </div>

            {/* Snap indicator */}
            <div className="absolute bottom-32 left-0 right-0 flex justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/30">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary font-medium">Snap to start streak!</span>
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'edit' && capturedImage && (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 relative"
          >
            {/* Captured image */}
            <div ref={containerRef} className="flex-1 h-full relative">
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-contain"
                draggable={false}
              />

              {/* Text Overlays */}
              {textOverlays.map(overlay => (
                <motion.div
                  key={overlay.id}
                  drag
                  dragMomentum={false}
                  className="absolute cursor-move select-none"
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    transform: 'translate(-50%, -50%)',
                    color: overlay.color,
                    fontSize: overlay.fontSize,
                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                    fontWeight: 'bold',
                  }}
                  onDragEnd={(_, info) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) {
                      const newX = Math.min(95, Math.max(5, ((info.point.x - rect.left) / rect.width) * 100));
                      const newY = Math.min(95, Math.max(5, ((info.point.y - rect.top) / rect.height) * 100));
                      setTextOverlays(prev => prev.map(o => 
                        o.id === overlay.id ? { ...o, x: newX, y: newY } : o
                      ));
                    }
                  }}
                  onClick={() => mode === 'none' && removeOverlay(overlay.id)}
                  whileTap={{ scale: 1.1 }}
                >
                  {overlay.text}
                </motion.div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
              <Button variant="ghost" size="icon" onClick={handleRetake} className="text-white">
                <X className="h-6 w-6" />
              </Button>
              <div className="flex gap-2">
                {textOverlays.length > 0 && (
                  <Button variant="ghost" size="icon" onClick={clearAll} className="text-white">
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Tools Bar */}
            <div className="absolute bottom-24 left-0 right-0 px-4">
              <AnimatePresence mode="wait">
                {mode === 'text' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="flex gap-2 mb-4"
                  >
                    <Input
                      value={currentText}
                      onChange={(e) => setCurrentText(e.target.value)}
                      placeholder="Add text..."
                      className="flex-1 bg-black/50 border-white/20 text-white placeholder:text-white/50"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && addText()}
                    />
                    <Button onClick={addText} size="icon" className="bg-primary">
                      <Check className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}

                {mode === 'sticker' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="flex gap-2 overflow-x-auto py-2 mb-4 scrollbar-hide"
                  >
                    {STICKERS.map(sticker => (
                      <button
                        key={sticker}
                        onClick={() => addSticker(sticker)}
                        className="text-3xl p-2 hover:scale-125 transition-transform"
                      >
                        {sticker}
                      </button>
                    ))}
                  </motion.div>
                )}

                {mode === 'text' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="flex gap-2 justify-center mb-4"
                  >
                    {COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setCurrentColor(color)}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 transition-transform",
                          currentColor === color ? "scale-125 border-white" : "border-white/30"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mode Buttons */}
              <div className="flex justify-center gap-4">
                <Button
                  variant={mode === 'text' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setMode(mode === 'text' ? 'none' : 'text')}
                  className={cn("rounded-full", mode !== 'text' && "text-white")}
                >
                  <Type className="h-5 w-5" />
                </Button>
                <Button
                  variant={mode === 'sticker' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setMode(mode === 'sticker' ? 'none' : 'sticker')}
                  className={cn("rounded-full", mode !== 'sticker' && "text-white")}
                >
                  <Smile className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Send Button */}
            <div className="absolute bottom-4 left-0 right-0 px-4">
              <Button 
                onClick={handleSend} 
                disabled={isSending}
                className="w-full bg-gradient-to-r from-primary to-accent text-white font-semibold py-6 rounded-2xl gap-2"
              >
                {isSending ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send Snap
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
