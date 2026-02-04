import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  X, SwitchCamera, Type, Check, 
  Send, Smile, Trash2, Sparkles, AlignCenter, AlignLeft, AlignRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

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
  const [phase, setPhase] = useState<'camera' | 'edit'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [mode, setMode] = useState<'none' | 'text' | 'sticker'>('none');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [currentStyle, setCurrentStyle] = useState<TextStyle>('classic');
  const [currentAlign, setCurrentAlign] = useState<TextAlign>('center');
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  
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
    setPhase('edit');
    stopCamera();
  }, [stopCamera, facingMode]);

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

  // Handle drag for overlays - using percentages
  const handleDrag = useCallback((id: string, info: PanInfo) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    
    setTextOverlays(prev => prev.map(overlay => {
      if (overlay.id !== id) return overlay;
      
      // Calculate new position as percentage
      const deltaXPercent = (info.delta.x / rect.width) * 100;
      const deltaYPercent = (info.delta.y / rect.height) * 100;
      
      const newX = Math.min(95, Math.max(5, overlay.x + deltaXPercent));
      const newY = Math.min(95, Math.max(5, overlay.y + deltaYPercent));
      
      return { ...overlay, x: newX, y: newY };
    }));
  }, []);

  // Remove overlay on double tap
  const handleDoubleTap = (id: string) => {
    haptics.impact();
    setTextOverlays(prev => prev.filter(o => o.id !== id));
  };

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
                
              case 'background':
                const metrics = ctx.measureText(overlay.text);
                const padding = scaledFontSize * 0.4;
                const bgWidth = metrics.width + padding * 2;
                const bgHeight = scaledFontSize * 1.4;
                
                ctx.fillStyle = overlay.color;
                ctx.fillRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);
                
                ctx.fillStyle = overlay.color === '#ffffff' || overlay.color === '#FACC15' ? '#000000' : '#ffffff';
                ctx.fillText(overlay.text, 0, 0);
                break;
                
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
    setCapturedImage(null);
    setPhase('camera');
    setTextOverlays([]);
    setMode('none');
    setIsSending(false);
    setCurrentText('');
    onClose();
  }, [stopCamera, onClose]);

  // Send the vybe
  const handleSend = useCallback(async () => {
    if (!capturedImage || isSending) return;

    setIsSending(true);
    haptics.success();

    try {
      const finalImage = await renderFinalImage();
      onSend(finalImage);
      handleClose();
    } catch (error) {
      console.error('Failed to send vybe:', error);
      // Try sending original image as fallback
      try {
        onSend(capturedImage);
        handleClose();
      } catch {
        setIsSending(false);
      }
    }
  }, [capturedImage, isSending, renderFinalImage, onSend, handleClose]);

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
                <Sparkles className="h-4 w-4 text-white" />
                <span className="text-sm text-white font-bold tracking-wide">VYBE</span>
              </motion.div>
              <Button variant="ghost" size="icon" onClick={handleSwitchCamera} className="text-white bg-black/40 rounded-full backdrop-blur-sm hover:bg-black/60">
                <SwitchCamera className="h-6 w-6" />
              </Button>
            </div>

            {/* Capture button - enhanced */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center safe-area-inset-bottom">
              <motion.button
                onClick={handleCapture}
                className="relative w-20 h-20 rounded-full flex items-center justify-center"
                whileTap={{ scale: 0.9 }}
              >
                {/* Outer ring with gradient */}
                <div className="absolute inset-0 rounded-full border-4 border-white/90 bg-gradient-to-br from-primary/20 to-accent/20 backdrop-blur-sm" />
                {/* Inner button */}
                <motion.div 
                  className="w-16 h-16 rounded-full bg-white shadow-lg"
                  whileTap={{ scale: 0.9 }}
                />
                {/* Pulsing ring effect */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-white/50"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </motion.button>
            </div>

            {/* Vybe streak indicator */}
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
                  <Sparkles className="h-4 w-4 text-white" />
                </motion.div>
                <span className="text-sm text-white font-semibold">Send a VYBE to keep the streak!</span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {phase === 'edit' && capturedImage && (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 relative flex flex-col"
          >
            {/* Captured image with overlays */}
            <div 
              ref={containerRef} 
              className="flex-1 relative overflow-hidden touch-none"
            >
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
              />

              {/* Text Overlays - with style support */}
              {textOverlays.map(overlay => (
                <motion.div
                  key={overlay.id}
                  className={cn(
                    "absolute touch-none select-none cursor-grab active:cursor-grabbing whitespace-pre-wrap max-w-[90%]",
                    draggedId === overlay.id && "z-50"
                  )}
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    x: '-50%',
                    y: '-50%',
                    color: overlay.style === 'background' 
                      ? (overlay.color === '#ffffff' || overlay.color === '#FACC15' ? '#000000' : '#ffffff')
                      : overlay.color,
                    fontSize: overlay.fontSize,
                    fontWeight: 'bold',
                    rotate: overlay.rotation,
                    textAlign: overlay.align,
                    ...getTextStyleCSS(overlay.style, overlay.color),
                  }}
                  drag
                  dragMomentum={false}
                  dragElastic={0}
                  onDragStart={() => setDraggedId(overlay.id)}
                  onDrag={(_, info) => handleDrag(overlay.id, info)}
                  onDragEnd={() => setDraggedId(null)}
                  onDoubleClick={() => handleDoubleTap(overlay.id)}
                  whileTap={{ scale: 1.1 }}
                >
                  {overlay.text}
                </motion.div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent safe-area-inset-top">
              <Button variant="ghost" size="icon" onClick={handleRetake} className="text-white hover:bg-white/20">
                <X className="h-6 w-6" />
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/40 to-accent/40 backdrop-blur-sm">
                <Sparkles className="h-4 w-4 text-white" />
                <span className="text-xs text-white font-bold">VYBE</span>
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
                  "w-full py-4 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2",
                  "bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-all duration-300"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={!isSending ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] } : {}}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              >
                {isSending ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="h-6 w-6 border-3 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Send VYBE
                    <Send className="h-5 w-5" />
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
