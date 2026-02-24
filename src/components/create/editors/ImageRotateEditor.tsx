import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Check, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageRotateEditorProps {
  imageUrl: string;
  onApply: (rotatedFile: File) => void;
  onCancel: () => void;
}

export function ImageRotateEditor({ imageUrl, onApply, onCancel }: ImageRotateEditorProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = imageUrl;
  }, [imageUrl]);

  const handleApply = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const isRotated90 = rotation === 90 || rotation === 270;
    const cw = isRotated90 ? img.height : img.width;
    const ch = isRotated90 ? img.width : img.height;

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    canvas.toBlob(blob => {
      if (blob) {
        onApply(new File([blob], `rotated-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      }
    }, 'image/jpeg', 0.92);
  }, [rotation, flipH, flipV, onApply]);

  const transform = `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'hsl(var(--background) / 0.95)' }}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
        <span className="text-sm font-bold text-foreground">Rotate & Flip</span>
        <button onClick={handleApply} className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors">
          <Check className="w-4 h-4" /> Apply
        </button>
      </div>

      {/* Preview */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        {imgLoaded && (
          <img src={imageUrl} alt="" className="max-w-full max-h-full object-contain transition-transform duration-300 rounded-xl"
            style={{ transform }} />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-4 border-t border-border/50 flex-shrink-0">
        <button onClick={() => setRotation((rotation + 90) % 360)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground text-xs font-medium hover:bg-accent transition-colors">
          <RotateCw className="w-4 h-4" /> Rotate 90°
        </button>
        <button onClick={() => setFlipH(!flipH)}
          className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors",
            flipH ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent")}>
          <FlipHorizontal className="w-4 h-4" /> Flip H
        </button>
        <button onClick={() => setFlipV(!flipV)}
          className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors",
            flipV ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent")}>
          <FlipVertical className="w-4 h-4" /> Flip V
        </button>
      </div>
    </div>
  );
}
