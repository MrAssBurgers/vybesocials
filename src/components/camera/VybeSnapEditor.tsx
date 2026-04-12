import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  X, Type, Smile, Pencil, Check, Undo, Trash2, 
  Send, AlignCenter, AlignLeft, AlignRight, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

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
  scale: number;
  style: TextStyle;
  align: TextAlign;
}

interface DrawPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface VybeSnapEditorProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  onSend: (mediaUrl: string) => void;
  onCancel: () => void;
}

const VYBE_COLORS = [
  '#ffffff', '#000000', '#3B82F6', '#8B5CF6', '#EC4899', 
  '#F97316', '#10B981', '#FACC15', '#14B8A6', '#EF4444'
];

const STICKERS = ['✨', '💜', '🔥', '💯', '⚡', '🎉', '💖', '🙌', '🌟', '💫', '🎵', '🦋', '👀', '😍', '🤩'];

const TEXT_STYLES: { id: TextStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'glow', label: 'Glow' },
  { id: 'outline', label: 'Outline' },
  { id: 'background', label: 'Box' },
  { id: 'neon', label: 'Neon' },
];

export function VybeSnapEditor({ mediaUrl, mediaType, onSend, onCancel }: VybeSnapEditorProps) {
  const [mode, setMode] = useState<'none' | 'text' | 'sticker' | 'draw'>('none');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [drawings, setDrawings] = useState<DrawPath[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [currentStyle, setCurrentStyle] = useState<TextStyle>('classic');
  const [currentAlign, setCurrentAlign] = useState<TextAlign>('center');
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Focus text input when opening
  useEffect(() => {
    if (isTextInputOpen) {
      setTimeout(() => textInputRef.current?.focus(), 100);
    }
  }, [isTextInputOpen]);

  // Get text style CSS
  const getTextStyleCSS = (style: TextStyle, color: string): React.CSSProperties => {
    switch (style) {
      case 'glow':
        return {
          textShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}`,
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
          textShadow: `0 0 5px #fff, 0 0 10px #fff, 0 0 15px ${color}, 0 0 20px ${color}`,
          color: '#fff',
        };
      default:
        return {
          textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
        };
    }
  };

  // Add text overlay
  const addText = () => {
    if (!currentText.trim()) return;
    haptics.impact();
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: currentText,
      x: 50,
      y: 40,
      color: currentColor,
      fontSize: 28,
      rotation: 0,
      scale: 1,
      style: currentStyle,
      align: currentAlign,
    }]);
    setCurrentText('');
    setIsTextInputOpen(false);
    setMode('none');
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
      scale: 1,
      style: 'classic',
      align: 'center',
    }]);
  };

  // Drawing handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'draw') return;
    setIsDrawing(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCurrentPath([{ x, y }]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCurrentPath(prev => [...prev, { x, y }]);
  };

  const handlePointerUp = () => {
    if (!isDrawing || mode !== 'draw') return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setDrawings(prev => [...prev, {
        id: crypto.randomUUID(),
        points: currentPath,
        color: currentColor,
        width: 4,
      }]);
    }
    setCurrentPath([]);
  };

  // Overlay drag handler
  const handleDrag = useCallback((id: string, info: PanInfo) => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    setTextOverlays(prev => prev.map(overlay => {
      if (overlay.id !== id) return overlay;
      
      const deltaXPercent = (info.delta.x / rect.width) * 100;
      const deltaYPercent = (info.delta.y / rect.height) * 100;
      
      return {
        ...overlay,
        x: Math.min(95, Math.max(5, overlay.x + deltaXPercent)),
        y: Math.min(95, Math.max(5, overlay.y + deltaYPercent)),
      };
    }));
  }, []);

  // Delete overlay
  const deleteOverlay = (id: string) => {
    haptics.impact();
    setTextOverlays(prev => prev.filter(o => o.id !== id));
    setSelectedOverlayId(null);
  };

  // Undo drawing
  const undoDrawing = () => {
    haptics.impact();
    setDrawings(prev => prev.slice(0, -1));
  };

  // Clear all
  const clearAll = () => {
    haptics.impact();
    setTextOverlays([]);
    setDrawings([]);
  };

  // Render final media with overlays
  const handleSend = useCallback(async () => {
    haptics.success();
    
    if (mediaType === 'video') {
      // For video, just send URL (overlays would need server-side processing)
      onSend(mediaUrl);
      return;
    }
    
    // For photos, render overlays to canvas
    if (textOverlays.length === 0 && drawings.length === 0) {
      onSend(mediaUrl);
      return;
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onSend(mediaUrl);
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      
      // Draw paths
      drawings.forEach(path => {
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.width * (img.width / 400);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        path.points.forEach((point, i) => {
          const x = (point.x / 100) * img.width;
          const y = (point.y / 100) * img.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      
      // Draw text overlays
      textOverlays.forEach(overlay => {
        ctx.save();
        const x = (overlay.x / 100) * img.width;
        const y = (overlay.y / 100) * img.height;
        const scaledFontSize = overlay.fontSize * (img.width / 400) * overlay.scale;
        
        ctx.translate(x, y);
        ctx.rotate((overlay.rotation * Math.PI) / 180);
        
        ctx.font = `bold ${scaledFontSize}px sans-serif`;
        ctx.textAlign = overlay.align;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = overlay.color;
        
        // Apply style effects
        if (overlay.style === 'glow' || overlay.style === 'neon') {
          ctx.shadowColor = overlay.color;
          ctx.shadowBlur = 20;
        } else if (overlay.style === 'background') {
          const metrics = ctx.measureText(overlay.text);
          const padding = scaledFontSize * 0.3;
          ctx.fillStyle = overlay.color;
          ctx.fillRect(
            -metrics.width / 2 - padding,
            -scaledFontSize / 2 - padding / 2,
            metrics.width + padding * 2,
            scaledFontSize + padding
          );
          ctx.fillStyle = overlay.color === '#ffffff' || overlay.color === '#FACC15' ? '#000' : '#fff';
        } else if (overlay.style === 'outline') {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.strokeText(overlay.text, 0, 0);
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
        }
        
        ctx.fillText(overlay.text, 0, 0);
        ctx.restore();
      });
      
      onSend(canvas.toDataURL('image/jpeg', 0.92));
    };
    
    img.onerror = () => onSend(mediaUrl);
    img.src = mediaUrl;
  }, [mediaUrl, mediaType, textOverlays, drawings, onSend]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between safe-area-inset-top bg-gradient-to-b from-black/70 to-transparent">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onCancel}
          className="text-white bg-black/40 rounded-full backdrop-blur-sm"
        >
          <X className="h-6 w-6" />
        </Button>
        
        <div className="flex gap-2">
          {drawings.length > 0 && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={undoDrawing}
              className="text-white bg-black/40 rounded-full backdrop-blur-sm"
            >
              <Undo className="h-5 w-5" />
            </Button>
          )}
          {(textOverlays.length > 0 || drawings.length > 0) && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={clearAll}
              className="text-white bg-black/40 rounded-full backdrop-blur-sm"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Media preview with overlays */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={(e) => {
          // Tap-to-text: open frosted glass text input when tapping the media area
          if (mode === 'none' && !isDrawing && textOverlays.length === 0 && !selectedOverlayId) {
            e.stopPropagation();
            setMode('text');
            setIsTextInputOpen(true);
            haptics.impact();
          }
        }}
      >
        {mediaType === 'photo' ? (
          <img 
            src={mediaUrl} 
            alt="Captured" 
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <video 
            ref={videoRef}
            src={mediaUrl} 
            className="w-full h-full object-contain"
            autoPlay 
            loop 
            muted={false}
            playsInline
          />
        )}
        
        {/* Drawings SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {drawings.map(path => (
            <polyline
              key={path.id}
              points={path.points.map(p => `${p.x}%,${p.y}%`).join(' ')}
              fill="none"
              stroke={path.color}
              strokeWidth={path.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath.length > 1 && (
            <polyline
              points={currentPath.map(p => `${p.x}%,${p.y}%`).join(' ')}
              fill="none"
              stroke={currentColor}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
        
        {/* Text overlays */}
        {textOverlays.map(overlay => (
          <motion.div
            key={overlay.id}
            drag
            dragMomentum={false}
            onDrag={(_, info) => handleDrag(overlay.id, info)}
            onDoubleClick={() => deleteOverlay(overlay.id)}
            onClick={() => setSelectedOverlayId(overlay.id === selectedOverlayId ? null : overlay.id)}
            className={cn(
              "absolute cursor-move select-none whitespace-nowrap font-bold",
              selectedOverlayId === overlay.id && "ring-2 ring-primary ring-offset-2 ring-offset-transparent"
            )}
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg) scale(${overlay.scale})`,
              color: overlay.style === 'background' ? undefined : overlay.color,
              fontSize: overlay.fontSize,
              ...getTextStyleCSS(overlay.style, overlay.color),
            }}
            whileTap={{ scale: 1.05 }}
          >
            {overlay.text}
          </motion.div>
        ))}
      </div>
      
      {/* Tools panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-safe bg-gradient-to-t from-black/90 via-black/70 to-transparent">
        <AnimatePresence mode="wait">
          {/* Text input overlay */}
          {isTextInputOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-4 pb-4 space-y-4"
            >
              {/* Style selector */}
              <div className="flex justify-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {TEXT_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setCurrentStyle(style.id)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all",
                      currentStyle === style.id
                        ? "bg-white text-black"
                        : "bg-white/20 text-white backdrop-blur-sm"
                    )}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              
              {/* Alignment */}
              <div className="flex justify-center gap-2">
                {(['left', 'center', 'right'] as TextAlign[]).map(align => (
                  <button
                    key={align}
                    onClick={() => setCurrentAlign(align)}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      currentAlign === align ? "bg-white text-black" : "bg-white/20 text-white"
                    )}
                  >
                    {align === 'left' && <AlignLeft className="h-5 w-5" />}
                    {align === 'center' && <AlignCenter className="h-5 w-5" />}
                    {align === 'right' && <AlignRight className="h-5 w-5" />}
                  </button>
                ))}
              </div>
              
              {/* Text input */}
              <div className="flex gap-2">
                <textarea
                  ref={textInputRef}
                  value={currentText}
                  onChange={(e) => setCurrentText(e.target.value)}
                  placeholder="Type something..."
                  className="flex-1 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-3 text-white placeholder:text-white/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                />
                <Button 
                  onClick={addText} 
                  size="icon" 
                  className="h-auto bg-gradient-to-r from-primary to-accent rounded-2xl"
                >
                  <Check className="h-6 w-6" />
                </Button>
              </div>
            </motion.div>
          )}
          
          {/* Stickers panel */}
          {mode === 'sticker' && !isTextInputOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-4 pb-4"
            >
              <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
                {STICKERS.map(sticker => (
                  <button
                    key={sticker}
                    onClick={() => addSticker(sticker)}
                    className="text-4xl p-2 hover:scale-125 transition-transform flex-shrink-0"
                  >
                    {sticker}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          
          {/* Color picker (for text and draw modes) */}
          {(mode === 'text' || mode === 'draw') && !isTextInputOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-4 pb-4"
            >
              <div className="flex justify-center gap-3">
                {VYBE_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setCurrentColor(color)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-transform",
                      currentColor === color 
                        ? "scale-125 border-white shadow-lg" 
                        : "border-white/30"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Tool buttons & Send */}
        <div className="px-4 pb-6 flex items-center justify-between">
          <div className="flex gap-3">
            <Button
              variant={mode === 'text' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => {
                if (mode === 'text') {
                  setMode('none');
                  setIsTextInputOpen(false);
                } else {
                  setMode('text');
                  setIsTextInputOpen(true);
                }
              }}
              className={cn(
                "rounded-full",
                mode !== 'text' && "text-white bg-black/40 backdrop-blur-sm"
              )}
            >
              <Type className="h-5 w-5" />
            </Button>
            
            <Button
              variant={mode === 'sticker' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setMode(mode === 'sticker' ? 'none' : 'sticker')}
              className={cn(
                "rounded-full",
                mode !== 'sticker' && "text-white bg-black/40 backdrop-blur-sm"
              )}
            >
              <Smile className="h-5 w-5" />
            </Button>
            
            <Button
              variant={mode === 'draw' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setMode(mode === 'draw' ? 'none' : 'draw')}
              className={cn(
                "rounded-full",
                mode !== 'draw' && "text-white bg-black/40 backdrop-blur-sm"
              )}
            >
              <Pencil className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Send button */}
          <motion.button
            onClick={handleSend}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold shadow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="h-5 w-5" />
            <span>Send</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
