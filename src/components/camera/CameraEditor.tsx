import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Type, Smile, Pencil, Check, Undo, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getFilterCSS } from './CameraFilters';

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
}

interface DrawPath {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface CameraEditorProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  filter: string;
  soundId?: string;
  soundStartTime?: number;
  onSave: (editedMedia: { url: string; overlays: TextOverlay[]; drawings: DrawPath[] }) => void;
  onCancel: () => void;
}

const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d92'];

const STICKERS = ['😀', '😍', '🔥', '💯', '✨', '🎉', '❤️', '👍', '🙌', '💪', '🎵', '🌟'];

export function CameraEditor({ mediaUrl, mediaType, filter, onSave, onCancel }: CameraEditorProps) {
  const [mode, setMode] = useState<'none' | 'text' | 'sticker' | 'draw'>('none');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [drawings, setDrawings] = useState<DrawPath[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing logic
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

  const removeOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
  };

  const undoDrawing = () => {
    setDrawings(prev => prev.slice(0, -1));
  };

  const clearAll = () => {
    setTextOverlays([]);
    setDrawings([]);
  };

  const handleSave = () => {
    onSave({
      url: mediaUrl,
      overlays: textOverlays,
      drawings: drawings,
    });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-white">
          <X className="h-6 w-6" />
        </Button>
        <div className="flex gap-2">
          {drawings.length > 0 && (
            <Button variant="ghost" size="icon" onClick={undoDrawing} className="text-white">
              <Undo className="h-5 w-5" />
            </Button>
          )}
          {(textOverlays.length > 0 || drawings.length > 0) && (
            <Button variant="ghost" size="icon" onClick={clearAll} className="text-white">
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Media Preview */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {mediaType === 'photo' ? (
          <img 
            src={mediaUrl} 
            alt="Captured" 
            className="w-full h-full object-contain"
            style={{ filter: getFilterCSS(filter) }}
            draggable={false}
          />
        ) : (
          <video 
            src={mediaUrl} 
            className="w-full h-full object-contain"
            style={{ filter: getFilterCSS(filter) }}
            autoPlay 
            loop 
            muted 
            playsInline
          />
        )}

        {/* Drawings SVG Overlay */}
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
            }}
            onClick={() => mode === 'none' && removeOverlay(overlay.id)}
            whileTap={{ scale: 1.1 }}
          >
            {overlay.text}
          </motion.div>
        ))}
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
                placeholder="Type something..."
                className="flex-1 bg-black/50 border-white/20 text-white placeholder:text-white/50"
                autoFocus
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

          {(mode === 'text' || mode === 'draw') && (
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
          <Button
            variant={mode === 'draw' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setMode(mode === 'draw' ? 'none' : 'draw')}
            className={cn("rounded-full", mode !== 'draw' && "text-white")}
          >
            <Pencil className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Save Button */}
      <div className="absolute bottom-4 left-0 right-0 px-4">
        <Button onClick={handleSave} className="w-full gradient-animated text-white font-semibold py-6 rounded-2xl">
          Continue
        </Button>
      </div>
    </div>
  );
}
