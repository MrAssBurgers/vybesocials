import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Check, RectangleHorizontal, Square, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageCropEditorProps {
  imageUrl: string;
  onApply: (croppedFile: File) => void;
  onCancel: () => void;
}

const ASPECT_RATIOS = [
  { label: 'Free', value: null, icon: RectangleHorizontal },
  { label: '1:1', value: 1, icon: Square },
  { label: '4:5', value: 4 / 5, icon: Smartphone },
  { label: '16:9', value: 16 / 9, icon: RectangleHorizontal },
  { label: '9:16', value: 9 / 16, icon: Smartphone },
];

export function ImageCropEditor({ imageUrl, onApply, onCancel }: ImageCropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [dragging, setDragging] = useState<'move' | 'resize' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cx: 0, cy: 0, cw: 0, ch: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0, offX: 0, offY: 0 });

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Calculate display size and initial crop
  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const img = imgRef.current;
    const scale = Math.min(container.width / img.width, container.height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const offX = (container.width - dw) / 2;
    const offY = (container.height - dh) / 2;
    setDisplaySize({ w: dw, h: dh, offX, offY });

    // Default crop: 80% centered
    const margin = 0.1;
    setCrop({ x: margin * dw, y: margin * dh, w: dw * 0.8, h: dh * 0.8 });
  }, [imgLoaded]);

  // Constrain crop to aspect ratio
  useEffect(() => {
    if (aspectRatio === null || crop.w === 0) return;
    const newH = crop.w / aspectRatio;
    const maxH = displaySize.h - crop.y;
    if (newH <= maxH) {
      setCrop(prev => ({ ...prev, h: newH }));
    } else {
      const h = maxH;
      const w = h * aspectRatio;
      setCrop(prev => ({ ...prev, w, h }));
    }
  }, [aspectRatio]);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault();
    setDragging(type);
    setDragStart({ x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h });
  }, [crop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragging === 'move') {
      const nx = Math.max(0, Math.min(dragStart.cx + dx, displaySize.w - crop.w));
      const ny = Math.max(0, Math.min(dragStart.cy + dy, displaySize.h - crop.h));
      setCrop(prev => ({ ...prev, x: nx, y: ny }));
    } else {
      let nw = Math.max(40, dragStart.cw + dx);
      let nh = aspectRatio ? nw / aspectRatio : Math.max(40, dragStart.ch + dy);
      nw = Math.min(nw, displaySize.w - crop.x);
      nh = Math.min(nh, displaySize.h - crop.y);
      if (aspectRatio) nw = nh * aspectRatio;
      setCrop(prev => ({ ...prev, w: nw, h: nh }));
    }
  }, [dragging, dragStart, displaySize, crop, aspectRatio]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  const handleApply = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.width / displaySize.w;
    const scaleY = img.height / displaySize.h;

    const sx = crop.x * scaleX;
    const sy = crop.y * scaleY;
    const sw = crop.w * scaleX;
    const sh = crop.h * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onApply(file);
      }
    }, 'image/jpeg', 0.92);
  }, [crop, displaySize, onApply]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'hsl(var(--background) / 0.95)' }}>
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
        <span className="text-sm font-bold text-foreground">Crop Image</span>
        <button onClick={handleApply} className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors">
          <Check className="w-4 h-4" /> Apply
        </button>
      </div>

      {/* Aspect ratio presets */}
      <div className="flex items-center justify-center gap-2 py-3 border-b border-border/50 flex-shrink-0">
        {ASPECT_RATIOS.map(ar => (
          <button key={ar.label} onClick={() => setAspectRatio(ar.value)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
              aspectRatio === ar.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
            <ar.icon className="w-3 h-3" /> {ar.label}
          </button>
        ))}
      </div>

      {/* Crop area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-crosshair select-none"
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {imgLoaded && imgRef.current && (
          <>
            {/* Dimmed image background */}
            <img src={imageUrl} alt="" className="absolute opacity-30 object-contain"
              style={{ width: displaySize.w, height: displaySize.h, left: displaySize.offX, top: displaySize.offY }} />
            
            {/* Bright cropped area */}
            <div className="absolute overflow-hidden border-2 border-primary"
              style={{
                left: displaySize.offX + crop.x,
                top: displaySize.offY + crop.y,
                width: crop.w,
                height: crop.h,
              }}
              onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
              <img src={imageUrl} alt="" className="absolute object-contain"
                style={{
                  width: displaySize.w, height: displaySize.h,
                  left: -crop.x, top: -crop.y,
                }} />
              {/* Grid lines */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-primary/30" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-primary/30" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-primary/30" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-primary/30" />
              </div>
            </div>

            {/* Resize handle */}
            <div className="absolute w-5 h-5 rounded-full bg-primary border-2 border-primary-foreground cursor-se-resize shadow-lg"
              style={{
                left: displaySize.offX + crop.x + crop.w - 10,
                top: displaySize.offY + crop.y + crop.h - 10,
              }}
              onMouseDown={(e) => handleMouseDown(e, 'resize')} />
          </>
        )}
      </div>
    </div>
  );
}
