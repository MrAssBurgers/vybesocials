import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageFilterEditorProps {
  imageUrl: string;
  isVideo?: boolean;
  onApply: (filteredFile: File) => void;
  onCancel: () => void;
}

const FILTERS = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.4) contrast(1.1)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.25) saturate(1.3) brightness(1.05)' },
  { id: 'cool', label: 'Cool', css: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.1)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(0.9) brightness(1.1)' },
  { id: 'dramatic', label: 'Drama', css: 'contrast(1.4) saturate(0.8) brightness(0.95)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
  { id: 'bright', label: 'Bright', css: 'brightness(1.2) contrast(1.05)' },
];

export function ImageFilterEditor({ imageUrl, isVideo, onApply, onCancel }: ImageFilterEditorProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [selected, setSelected] = useState('none');

  useEffect(() => {
    if (isVideo) { setImgLoaded(true); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = imageUrl;
  }, [imageUrl, isVideo]);

  const currentFilter = FILTERS.find(f => f.id === selected) || FILTERS[0];

  const handleApply = useCallback(() => {
    if (isVideo) {
      // For video, we apply the CSS filter via metadata stored in the file name
      // The parent will store the filter info
      const blob = new Blob([], { type: 'application/json' });
      const file = new File([blob], `filter:${selected}`, { type: 'application/json' });
      onApply(file);
      return;
    }

    if (!imgRef.current) return;
    const img = imgRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = currentFilter.css;
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(blob => {
      if (blob) {
        onApply(new File([blob], `filtered-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      }
    }, 'image/jpeg', 0.92);
  }, [selected, currentFilter, isVideo, onApply]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'hsl(var(--background) / 0.95)' }}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
        <span className="text-sm font-bold text-foreground">Filters</span>
        <button onClick={handleApply} className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors">
          <Check className="w-4 h-4" /> Apply
        </button>
      </div>

      {/* Preview */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        {imgLoaded && (
          isVideo ? (
            <video src={imageUrl} className="max-w-full max-h-full object-contain rounded-xl" style={{ filter: currentFilter.css }} controls muted playsInline />
          ) : (
            <img src={imageUrl} alt="" className="max-w-full max-h-full object-contain rounded-xl transition-all duration-200"
              style={{ filter: currentFilter.css }} />
          )
        )}
      </div>

      {/* Filter presets */}
      <div className="border-t border-border/50 flex-shrink-0 py-4">
        <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setSelected(f.id)}
              className={cn("flex-shrink-0 flex flex-col items-center gap-1.5 transition-all")}>
              <div className={cn("w-16 h-16 rounded-xl overflow-hidden border-2 transition-all",
                selected === f.id ? "border-primary ring-2 ring-primary/20" : "border-border")}>
                {isVideo ? (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-[8px] text-muted-foreground" style={{ filter: f.css }}>
                    VID
                  </div>
                ) : (
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" style={{ filter: f.css }} />
                )}
              </div>
              <span className={cn("text-[10px] font-medium", selected === f.id ? "text-primary" : "text-muted-foreground")}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
