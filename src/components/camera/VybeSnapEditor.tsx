import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import {
  X, Type, Smile, Pencil, Check, Undo, Trash2,
  Download, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { getRecentMessageUsers } from '@/lib/recentMessageUsers';

type TextStyle = 'classic' | 'glow' | 'outline' | 'background' | 'neon';

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
  '#F97316', '#10B981', '#FACC15', '#14B8A6', '#EF4444',
  '#6366F1', '#D946EF', '#0EA5E9', '#F43F5E',
];

const STICKERS = [
  '✨', '💜', '🔥', '💯', '⚡', '🎉', '💖', '🙌',
  '🌟', '💫', '🎵', '🦋', '👀', '😍', '🤩', '😂',
  '🥺', '💀', '🫶', '❤️‍🔥', '🥵', '😈', '🤯', '🫠',
];

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
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [dragTrashVisible, setDragTrashVisible] = useState(false);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  const [colorPickerY, setColorPickerY] = useState(0.5);
  const [showSendSheet, setShowSendSheet] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const colorBarRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isTextInputOpen) setTimeout(() => textInputRef.current?.focus(), 150);
  }, [isTextInputOpen]);

  const getColorFromY = (y: number): string => {
    const idx = Math.floor(y * (VYBE_COLORS.length - 1));
    return VYBE_COLORS[Math.max(0, Math.min(VYBE_COLORS.length - 1, idx))];
  };

  const handleColorBarTouch = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const bar = colorBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setColorPickerY(y);
    setCurrentColor(getColorFromY(y));
  }, []);

  const getTextStyleCSS = (style: TextStyle, color: string): React.CSSProperties => {
    switch (style) {
      case 'glow':
        return { textShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}` };
      case 'outline':
        return { WebkitTextStroke: '2px black', textShadow: 'none' };
      case 'background':
        return {
          backgroundColor: color,
          color: color === '#ffffff' || color === '#FACC15' ? '#000000' : '#ffffff',
          padding: '6px 14px',
          borderRadius: '8px',
          textShadow: 'none',
        };
      case 'neon':
        return {
          textShadow: `0 0 5px #fff, 0 0 10px #fff, 0 0 15px ${color}, 0 0 20px ${color}`,
          color: '#fff',
        };
      default:
        return { textShadow: '2px 2px 8px rgba(0,0,0,0.8)' };
    }
  };

  const addText = () => {
    if (!currentText.trim()) return;
    haptics.impact();
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: currentText,
      x: 50, y: 50,
      color: currentColor,
      fontSize: 17,
      rotation: 0, scale: 1,
      style: currentStyle,
    }]);
    setCurrentText('');
    setIsTextInputOpen(false);
    setMode('none');
  };

  const addSticker = (emoji: string) => {
    haptics.impact();
    setTextOverlays(prev => [...prev, {
      id: crypto.randomUUID(),
      text: emoji,
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
      color: '#ffffff',
      fontSize: 56,
      rotation: 0, scale: 1,
      style: 'classic',
    }]);
  };

  // Drawing
  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'draw') return;
    setIsDrawing(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurrentPath([{
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || mode !== 'draw') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCurrentPath(prev => [...prev, {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }]);
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

  // Drag overlay (vertical only)
  const handleDrag = useCallback((id: string, info: PanInfo) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTextOverlays(prev => prev.map(o => o.id !== id ? o : ({
      ...o,
      y: Math.min(95, Math.max(5, o.y + (info.delta.y / rect.height) * 100)),
    })));
    const threshold = rect.bottom - rect.height * 0.15;
    setDragOverTrash(info.point.y > threshold);
  }, []);

  const handleDragStart = useCallback(() => setDragTrashVisible(true), []);
  const handleDragEnd = useCallback((id: string) => {
    if (dragOverTrash) {
      haptics.impact();
      setTextOverlays(prev => prev.filter(o => o.id !== id));
    }
    setDragTrashVisible(false);
    setDragOverTrash(false);
  }, [dragOverTrash]);

  const undoDrawing = () => { haptics.impact(); setDrawings(prev => prev.slice(0, -1)); };
  const clearAll = () => { haptics.impact(); setTextOverlays([]); setDrawings([]); };

  // Tap-anywhere → opens text input (when no other mode active)
  const handleMediaTap = (e: React.MouseEvent) => {
    if (mode === 'draw' || isDrawing || isTextInputOpen || mode === 'sticker') return;
    e.stopPropagation();
    setMode('text');
    setIsTextInputOpen(true);
    haptics.impact();
  };

  const renderOverlaysToCanvas = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    drawings.forEach(path => {
      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width * (w / 400);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      path.points.forEach((point, i) => {
        const x = (point.x / 100) * w;
        const y = (point.y / 100) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    textOverlays.forEach(overlay => {
      ctx.save();
      const yPos = (overlay.y / 100) * h;
      const scaledFontSize = overlay.fontSize * (w / 400) * overlay.scale;
      const barHeight = scaledFontSize * 2.2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      const radius = barHeight * 0.3;
      const barY = yPos - barHeight / 2;
      ctx.moveTo(radius, barY);
      ctx.lineTo(w - radius, barY);
      ctx.quadraticCurveTo(w, barY, w, barY + radius);
      ctx.lineTo(w, barY + barHeight - radius);
      ctx.quadraticCurveTo(w, barY + barHeight, w - radius, barY + barHeight);
      ctx.lineTo(radius, barY + barHeight);
      ctx.quadraticCurveTo(0, barY + barHeight, 0, barY + barHeight - radius);
      ctx.lineTo(0, barY + radius);
      ctx.quadraticCurveTo(0, barY, radius, barY);
      ctx.closePath();
      ctx.fill();

      ctx.font = `600 ${scaledFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = overlay.color;
      if (overlay.style === 'glow' || overlay.style === 'neon') {
        ctx.shadowColor = overlay.color; ctx.shadowBlur = 20;
      }
      ctx.fillText(overlay.text, w / 2, yPos);
      ctx.restore();
    });
  };

  const handleSave = useCallback(async () => {
    haptics.success();
    if (mediaType === 'video') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      renderOverlaysToCanvas(ctx, img.width, img.height);
      const link = document.createElement('a');
      link.download = `vybe-snap-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.click();
    };
    img.src = mediaUrl;
  }, [mediaUrl, mediaType, textOverlays, drawings]);

  const handleSend = useCallback(async () => {
    haptics.success();
    setShowSendSheet(false);
    if (mediaType === 'video') { onSend(mediaUrl); return; }
    if (textOverlays.length === 0 && drawings.length === 0) {
      onSend(mediaUrl); return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { onSend(mediaUrl); return; }
      ctx.drawImage(img, 0, 0);
      renderOverlaysToCanvas(ctx, img.width, img.height);
      onSend(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => onSend(mediaUrl);
    img.src = mediaUrl;
  }, [mediaUrl, mediaType, textOverlays, drawings, onSend]);

  const hasContent = textOverlays.length > 0 || drawings.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
    >
      {/* Media preview */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleMediaTap}
      >
        {mediaType === 'photo' ? (
          <img src={mediaUrl} alt="Captured" className="w-full h-full object-contain" draggable={false} />
        ) : (
          <video ref={videoRef} src={mediaUrl} className="w-full h-full object-contain" autoPlay loop muted={false} playsInline />
        )}

        {/* Drawings */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {drawings.map(path => (
            <polyline
              key={path.id}
              points={path.points.map(p => `${p.x}%,${p.y}%`).join(' ')}
              fill="none" stroke={path.color} strokeWidth={path.width}
              strokeLinecap="round" strokeLinejoin="round"
            />
          ))}
          {currentPath.length > 1 && (
            <polyline
              points={currentPath.map(p => `${p.x}%,${p.y}%`).join(' ')}
              fill="none" stroke={currentColor} strokeWidth={4}
              strokeLinecap="round" strokeLinejoin="round"
            />
          )}
        </svg>

        {/* Text/sticker overlays */}
        {textOverlays.map(overlay => (
          <motion.div
            key={overlay.id}
            drag="y"
            dragMomentum={false}
            dragConstraints={containerRef}
            onDragStart={handleDragStart}
            onDrag={(_, info) => handleDrag(overlay.id, info)}
            onDragEnd={() => handleDragEnd(overlay.id)}
            className="absolute left-0 right-0 cursor-move select-none flex items-center justify-center"
            style={{
              top: `${overlay.y}%`,
              transform: 'translateY(-50%)',
              background: overlay.fontSize > 30 ? 'transparent' : 'rgba(0, 0, 0, 0.55)',
              padding: overlay.fontSize > 30 ? 0 : '6px 14px',
            }}
            whileTap={{ scale: 1.01 }}
          >
            <span
              className="text-center whitespace-pre-wrap break-words font-medium"
              style={{
                color: overlay.color,
                fontSize: overlay.fontSize,
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
                maxWidth: '92%',
                ...getTextStyleCSS(overlay.style, overlay.color),
              }}
            >
              {overlay.text}
            </span>
          </motion.div>
        ))}

        {/* Drag-to-trash zone */}
        <AnimatePresence>
          {dragTrashVisible && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                'absolute bottom-0 left-0 right-0 h-[15%] flex items-center justify-center transition-colors duration-200',
                dragOverTrash ? 'bg-red-500/50' : 'bg-black/30'
              )}
            >
              <Trash2 className={cn(
                'h-8 w-8 transition-all duration-200',
                dragOverTrash ? 'text-white scale-125' : 'text-white/70'
              )} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Top bar: X left, Save + minor right ── */}
      <div className="absolute top-0 left-0 right-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 pt-3">
          <button
            onClick={onCancel}
            className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Back to camera"
          >
            <X className="h-7 w-7 text-white drop-shadow-md" strokeWidth={2.25} />
          </button>

          <div className="flex gap-2">
            {drawings.length > 0 && (
              <button
                onClick={undoDrawing}
                className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Undo"
              >
                <Undo className="h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />
              </button>
            )}
            {hasContent && (
              <button
                onClick={clearAll}
                className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Clear"
              >
                <Trash2 className="h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />
              </button>
            )}
            {mediaType === 'photo' && (
              <button
                onClick={handleSave}
                className="w-10 h-10 flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Save"
              >
                <Download className="h-6 w-6 text-white drop-shadow-md" strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Right tool rail (IG-Stories style, bare glyphs) ── */}
      <AnimatePresence>
        {!isTextInputOpen && mode !== 'sticker' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-4"
          >
            <ToolGlyph
              active={mode === 'text'}
              onClick={() => { setMode('text'); setIsTextInputOpen(true); haptics.impact(); }}
              ariaLabel="Add text"
            >
              <Type className="h-5 w-5" strokeWidth={2.5} />
            </ToolGlyph>

            <ToolGlyph
              active={false}
              onClick={() => { setMode('sticker'); haptics.impact(); }}
              ariaLabel="Stickers"
            >
              <Smile className="h-5 w-5" strokeWidth={2.5} />
            </ToolGlyph>

            <ToolGlyph
              active={mode === 'draw'}
              onClick={() => { setMode(mode === 'draw' ? 'none' : 'draw'); haptics.impact(); }}
              ariaLabel="Draw"
            >
              <Pencil className="h-5 w-5" strokeWidth={2.5} />
            </ToolGlyph>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Color picker (when drawing) ── */}
      <AnimatePresence>
        {mode === 'draw' && !isTextInputOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-16 top-1/2 -translate-y-1/2 z-30"
          >
            <div
              ref={colorBarRef}
              className="w-6 h-48 rounded-full overflow-hidden relative cursor-pointer"
              style={{ background: `linear-gradient(to bottom, ${VYBE_COLORS.join(', ')})` }}
              onMouseDown={handleColorBarTouch}
              onMouseMove={(e) => { if (e.buttons === 1) handleColorBarTouch(e); }}
              onTouchStart={handleColorBarTouch}
              onTouchMove={handleColorBarTouch}
            >
              <div
                className="absolute left-1/2 w-7 h-7 rounded-full border-[3px] border-white shadow-lg pointer-events-none"
                style={{
                  top: `${colorPickerY * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: currentColor,
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Centered text input (frosted) ── */}
      <AnimatePresence>
        {isTextInputOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                if (currentText.trim()) addText();
                else { setIsTextInputOpen(false); setMode('none'); }
              }
            }}
          >
            <div className="absolute inset-0 bg-black/40" />

            {/* Style pills */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="relative z-10 flex gap-2 mb-4 overflow-x-auto px-4 scrollbar-hide"
            >
              {TEXT_STYLES.map(style => (
                <button
                  key={style.id}
                  onClick={() => setCurrentStyle(style.id)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap',
                    currentStyle === style.id
                      ? 'bg-white text-black scale-105'
                      : 'bg-white/10 text-white/80'
                  )}
                >
                  {style.label}
                </button>
              ))}
            </motion.div>

            {/* Input bar */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0.8 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative z-10 w-full px-4"
            >
              <div
                className="rounded-2xl px-5 py-4 flex items-center gap-3 border border-white/15 bg-white/10"
                style={{ backdropFilter: 'blur(20px) saturate(1.5)', WebkitBackdropFilter: 'blur(20px) saturate(1.5)' }}
              >
                <textarea
                  ref={textInputRef}
                  value={currentText}
                  onChange={(e) => setCurrentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addText(); } }}
                  placeholder="Type something…"
                  rows={1}
                  className="flex-1 bg-transparent text-xl font-semibold placeholder:text-white/30 focus:outline-none text-center resize-none overflow-hidden"
                  style={{
                    color: currentColor,
                    ...getTextStyleCSS(currentStyle, currentColor),
                    minHeight: '32px',
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />
                <button
                  onClick={addText}
                  className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                >
                  <Check className="h-5 w-5 text-black" strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>

            {/* Color picker */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
            >
              <div
                ref={colorBarRef}
                className="w-6 h-52 rounded-full overflow-hidden relative cursor-pointer"
                style={{ background: `linear-gradient(to bottom, ${VYBE_COLORS.join(', ')})` }}
                onMouseDown={handleColorBarTouch}
                onMouseMove={(e) => { if (e.buttons === 1) handleColorBarTouch(e); }}
                onTouchStart={handleColorBarTouch}
                onTouchMove={handleColorBarTouch}
              >
                <div
                  className="absolute left-1/2 w-7 h-7 rounded-full border-[3px] border-white shadow-lg pointer-events-none"
                  style={{
                    top: `${colorPickerY * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: currentColor,
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticker grid ── */}
      <AnimatePresence>
        {mode === 'sticker' && !isTextInputOpen && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="absolute bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur-xl rounded-t-3xl pb-safe"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-white/60 text-sm font-medium">Stickers</span>
              <button
                onClick={() => { setMode('none'); haptics.impact(); }}
                className="w-8 h-8 flex items-center justify-center"
              >
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1 px-3 pb-6 max-h-56 overflow-y-auto scrollbar-hide">
              {STICKERS.map((sticker, i) => (
                <button
                  key={i}
                  onClick={() => addSticker(sticker)}
                  className="text-3xl p-2 rounded-xl hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center"
                >
                  {sticker}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom: single Send-To pill ── */}
      <AnimatePresence>
        {!isTextInputOpen && mode !== 'sticker' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-0 left-0 right-0 z-20 pb-safe pointer-events-none"
          >
            <div className="flex items-center justify-end pr-4 pb-5 pointer-events-auto">
              <button
                onClick={() => { haptics.impact(); setShowSendSheet(true); }}
                className="h-12 pl-5 pr-4 rounded-full bg-white text-black flex items-center gap-2 font-semibold text-sm active:scale-95 transition-transform shadow-lg"
              >
                Send to
                <span className="h-8 w-8 rounded-full bg-black flex items-center justify-center">
                  <Send className="h-4 w-4 text-white ml-[1px]" />
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Send sheet ── */}
      <Sheet open={showSendSheet} onOpenChange={setShowSendSheet}>
        <SheetContent
          side="bottom"
          className="bg-black/95 backdrop-blur-xl border-white/10 rounded-t-3xl text-white pb-safe max-h-[60vh]"
        >
          <SheetTitle className="text-white text-base font-semibold mb-3">Send to</SheetTitle>
          <SendToList onPick={handleSend} />
          <button
            onClick={handleSend}
            className="w-full mt-4 h-12 rounded-full bg-white text-black font-semibold text-sm active:scale-95 transition-transform"
          >
            Send to current chat
          </button>
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}

function ToolGlyph({ active, onClick, ariaLabel, children }: {
  active: boolean; onClick: () => void; ariaLabel: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90',
        active ? 'bg-white text-black' : 'bg-black/40 text-white'
      )}
    >
      {children}
    </button>
  );
}

function SendToList({ onPick }: { onPick: () => void }) {
  const [recents, setRecents] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);
  useEffect(() => {
    try {
      const users = getRecentMessageUsers();
      setRecents(users.slice(0, 12).map((u: any) => ({
        id: u.id,
        name: u.username || u.display_name || '?',
        avatar: u.avatar_url,
      })));
    } catch {/* noop */}
  }, []);

  if (recents.length === 0) {
    return (
      <p className="text-white/50 text-sm py-6 text-center">No recent chats</p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3 py-2">
      {recents.map(user => (
        <button
          key={user.id}
          onClick={() => { haptics.impact(); onPick(); }}
          className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
        >
          <div className="w-14 h-14 rounded-full overflow-hidden bg-white/10">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                {user.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-[11px] text-white/80 font-medium truncate max-w-[64px]">{user.name}</span>
        </button>
      ))}
    </div>
  );
}
