import { useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Type, Smile, Pencil, Check, Undo, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getFilterCSS } from './CameraFilters';
import { DraggableOverlay } from './DraggableOverlay';

interface TextOverlay {
  id: string;
  text: string;
  imageUrl?: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  scale: number;
  rotation: number;
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

export function CameraEditor({ mediaUrl, mediaType, filter, soundId, soundStartTime, onSave, onCancel }: CameraEditorProps) {
  const [mode, setMode] = useState<'none' | 'text' | 'sticker' | 'draw'>('none');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [drawings, setDrawings] = useState<DrawPath[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drawing logic — only fires when in draw mode
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
      x: 50, y: 50,
      color: currentColor,
      fontSize: 24, scale: 1, rotation: 0,
    }]);
    setCurrentText('');
    setMode('none');
  };

  const addSticker = (emoji: string) => {
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: emoji,
      x: 50, y: 50,
      color: '#ffffff',
      fontSize: 48, scale: 1, rotation: 0,
    }]);
  };

  const addImageOverlay = (file: File) => {
    const url = URL.createObjectURL(file);
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: '',
      imageUrl: url,
      x: 50, y: 50,
      color: '#ffffff',
      fontSize: 24, scale: 1, rotation: 0,
    }]);
  };

  const handleImagePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      addImageOverlay(file);
    }
    if (e.target) e.target.value = '';
  };

  const updateOverlay = useCallback((id: string, updates: { x?: number; y?: number; scale?: number; rotation?: number }) => {
    setTextOverlays(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const removeOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
  };

  const undoDrawing = () => setDrawings(prev => prev.slice(0, -1));
  const clearAll = () => { setTextOverlays([]); setDrawings([]); };

  const handleSave = () => {
    onSave({ url: mediaUrl, overlays: textOverlays, drawings });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Hidden file input for image overlays */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

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
          <img src={mediaUrl} alt="Captured" className="w-full h-full object-contain" style={{ filter: getFilterCSS(filter) }} draggable={false} />
        ) : (
          <video src={mediaUrl} className="w-full h-full object-contain" style={{ filter: getFilterCSS(filter) }} autoPlay loop muted playsInline />
        )}

        {/* Drawings SVG Overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {drawings.map(path => (
            <polyline key={path.id} points={path.points.map(p => `${p.x}%,${p.y}%`).join(' ')} fill="none" stroke={path.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentPath.length > 1 && (
            <polyline points={currentPath.map(p => `${p.x}%,${p.y}%`).join(' ')} fill="none" stroke={currentColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>

        {/* Text / Sticker / Image Overlays */}
        {textOverlays.map(overlay => (
          <DraggableOverlay
            key={overlay.id}
            id={overlay.id}
            text={overlay.imageUrl ? undefined : overlay.text}
            imageUrl={overlay.imageUrl}
            x={overlay.x}
            y={overlay.y}
            color={overlay.color}
            fontSize={overlay.fontSize}
            scale={overlay.scale}
            rotation={overlay.rotation}
            containerRef={containerRef as React.RefObject<HTMLDivElement>}
            onUpdate={updateOverlay}
            onRemove={removeOverlay}
            canRemove={mode === 'none'}
          />
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
              onPointerDown={e => e.stopPropagation()}
            >
              <Input
                value={currentText}
                onChange={(e) => setCurrentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addText(); }}
                placeholder="Type something..."
                className="flex-1 bg-white/10 backdrop-blur-sm border-white/10 text-white placeholder:text-white/40 rounded-full px-4"
                autoFocus
              />
              <Button onClick={addText} size="icon" className="bg-primary rounded-full">
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
                <button key={sticker} onClick={() => addSticker(sticker)} className="text-3xl p-2 hover:scale-125 transition-transform">
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
                  className={cn("w-8 h-8 rounded-full border-2 transition-transform", currentColor === color ? "scale-125 border-white" : "border-white/30")}
                  style={{ backgroundColor: color }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode Buttons */}
        <div className="flex justify-center gap-4">
          <Button variant={mode === 'text' ? 'default' : 'ghost'} size="icon" onClick={() => setMode(mode === 'text' ? 'none' : 'text')} className={cn("rounded-full", mode !== 'text' && "text-white")}>
            <Type className="h-5 w-5" />
          </Button>
          <Button variant={mode === 'sticker' ? 'default' : 'ghost'} size="icon" onClick={() => setMode(mode === 'sticker' ? 'none' : 'sticker')} className={cn("rounded-full", mode !== 'sticker' && "text-white")}>
            <Smile className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleImagePick} className="rounded-full text-white">
            <ImageIcon className="h-5 w-5" />
          </Button>
          <Button variant={mode === 'draw' ? 'default' : 'ghost'} size="icon" onClick={() => setMode(mode === 'draw' ? 'none' : 'draw')} className={cn("rounded-full", mode !== 'draw' && "text-white")}>
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
