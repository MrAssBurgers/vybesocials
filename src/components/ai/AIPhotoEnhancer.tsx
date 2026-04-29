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

        {/* Preview & Apply */}
        {previewUrl && !isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={liquidSpring}
            className="space-y-2"
          >
            <div className="rounded-lg overflow-hidden border border-border/50">
              <img src={previewUrl} alt="Enhanced preview" className="w-full object-cover max-h-48" />
            </div>
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
