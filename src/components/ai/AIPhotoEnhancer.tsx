import { useState, memo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Loader2, RotateCcw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { liquidSpring } from '@/motion/liquidConfig';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

const ENHANCE_TYPES = [
  { id: 'auto', label: 'Auto', emoji: '✨' },
  { id: 'vibrant', label: 'Vibrant', emoji: '🌈' },
  { id: 'portrait', label: 'Portrait', emoji: '🤳' },
  { id: 'aesthetic', label: 'Aesthetic', emoji: '🎨' },
  { id: 'hdr', label: 'HDR', emoji: '📸' },
  { id: 'clean', label: 'Clean', emoji: '🧹' },
] as const;

interface AIPhotoEnhancerProps {
  imageFile: File | null;
  onEnhanced: (enhancedDataUrl: string) => void;
}

export const AIPhotoEnhancer = memo(function AIPhotoEnhancer({
  imageFile,
  onEnhanced,
}: AIPhotoEnhancerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('auto');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(50); // 0 = original, 100 = enhanced

  // Build a local URL for the original image to power the before/after slider
  useEffect(() => {
    if (!imageFile) { setOriginalUrl(null); return; }
    const url = URL.createObjectURL(imageFile);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const enhance = useCallback(async (type: string) => {
    if (!imageFile || isLoading) return;
    setIsLoading(true);
    setSelectedType(type);
    triggerHaptic('light');

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-enhance-photo`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: imageFile.type,
            enhanceType: type,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) { toast.error('Too many requests.'); return; }
        if (response.status === 402) { toast.error('AI credits exhausted.'); return; }
        throw new Error('Enhancement failed');
      }

      const data = await response.json();
      if (data.enhancedImage) {
        setPreviewUrl(data.enhancedImage);
        triggerHaptic('success');
      } else {
        toast.error('Enhancement failed');
      }
    } catch (error) {
      console.error('Photo enhance error:', error);
      toast.error('Failed to enhance photo');
    } finally {
      setIsLoading(false);
    }
  }, [imageFile, isLoading]);

  const applyEnhancement = () => {
    if (previewUrl) {
      onEnhanced(previewUrl);
      setPreviewUrl(null);
      setIsOpen(false);
      triggerHaptic('success');
      toast.success('Enhancement applied!');
    }
  };

  if (!imageFile) return null;

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 rounded-full"
      >
        <Wand2 className="h-4 w-4" />
        AI Enhance
      </Button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={liquidSpring}
        className="space-y-3 p-3 rounded-xl bg-muted/30 border border-border/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Enhance</span>
          </div>
          <button onClick={() => { setIsOpen(false); setPreviewUrl(null); }} className="p-1 hover:bg-muted rounded-full">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Enhancement type chips */}
        <div className="flex flex-wrap gap-1.5">
          {ENHANCE_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => enhance(type.id)}
              disabled={isLoading}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                selectedType === type.id && (isLoading || previewUrl)
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/60 text-foreground/80 border border-transparent hover:border-border"
              )}
            >
              {type.emoji} {type.label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-3 justify-center text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Enhancing your photo...
          </motion.div>
        )}

        {/* Before/After slider preview */}
        {previewUrl && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={liquidSpring}
            className="space-y-2"
          >
            <div
              className="relative rounded-lg overflow-hidden border border-border/50 select-none touch-none"
              style={{ aspectRatio: '4 / 3', maxHeight: 280 }}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const update = (clientX: number) => {
                  const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
                  setSliderPos(pct);
                };
                update(e.clientX);
                const move = (ev: PointerEvent) => update(ev.clientX);
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            >
              {/* Original (background) */}
              {originalUrl && (
                <img src={originalUrl} alt="Original" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              )}
              {/* Enhanced (clipped overlay) */}
              <img
                src={previewUrl}
                alt="Enhanced"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                draggable={false}
              />
              {/* Divider */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.5)] pointer-events-none"
                style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                  <div className="flex gap-0.5">
                    <span className="block w-0.5 h-3 bg-foreground/60" />
                    <span className="block w-0.5 h-3 bg-foreground/60" />
                  </div>
                </div>
              </div>
              {/* Labels */}
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold tracking-wide">BEFORE</span>
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-primary/80 text-primary-foreground text-[10px] font-semibold tracking-wide">AFTER</span>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Drag the slider to compare</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => enhance(selectedType)}
                className="flex-1 gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={applyEnhancement}
                className="flex-1 gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                Apply
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
});
