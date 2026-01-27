import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Wand2, 
  Image as ImageIcon, 
  X, 
  Check, 
  Loader2,
  Sparkles,
  Palette,
  Mountain,
  Moon,
  Waves,
  Flame,
  Snowflake,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';

interface BackgroundCustomizerProps {
  currentBackground?: string;
  backgroundOpacity: number;
  backgroundBlur: number;
  onBackgroundChange: (url: string | null) => void;
  onOpacityChange: (opacity: number) => void;
  onBlurChange: (blur: number) => void;
}

const AI_BACKGROUND_STYLES = [
  { id: 'neon', label: 'Neon Glow', icon: Zap, prompt: 'Abstract neon gradient background with vibrant pink, purple, and cyan colors, dark atmosphere, glowing lights, futuristic vibe' },
  { id: 'nature', label: 'Nature', icon: Mountain, prompt: 'Beautiful nature landscape background, sunset colors, mountains or ocean, serene and peaceful atmosphere' },
  { id: 'minimal', label: 'Minimal', icon: Palette, prompt: 'Clean minimal gradient background, soft pastel colors, subtle texture, modern aesthetic' },
  { id: 'cosmic', label: 'Cosmic', icon: Moon, prompt: 'Deep space cosmic background, galaxies, nebulas, stars, dark purple and blue tones, ethereal' },
  { id: 'aurora', label: 'Aurora', icon: Waves, prompt: 'Northern lights aurora borealis background, vibrant greens and purples, night sky, magical' },
  { id: 'fire', label: 'Fire', icon: Flame, prompt: 'Abstract fire and ember background, warm orange and red tones, dynamic flowing flames, dramatic' },
  { id: 'ice', label: 'Ice', icon: Snowflake, prompt: 'Frozen ice crystal background, cool blue and white tones, geometric frost patterns, crystalline' },
  { id: 'abstract', label: 'Abstract', icon: Sparkles, prompt: 'Abstract fluid art background, swirling colors, liquid marble effect, artistic and unique' },
];

export function BackgroundCustomizer({
  currentBackground,
  backgroundOpacity,
  backgroundBlur,
  onBackgroundChange,
  onOpacityChange,
  onBlurChange,
}: BackgroundCustomizerProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setIsUploading(true);

    try {
      // Create unique filename
      const ext = file.name.split('.').pop();
      const fileName = `backgrounds/${user?.id}/${Date.now()}.${ext}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      onBackgroundChange(publicUrl);
      toast.success('Background uploaded!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload background');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [user?.id, onBackgroundChange]);

  const handleGenerateBackground = useCallback(async (prompt: string, styleId?: string) => {
    if (!prompt.trim()) {
      toast.error('Please enter a description or select a style');
      return;
    }

    setIsGenerating(true);
    setSelectedStyle(styleId || null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-background', {
        body: { prompt, style: styleId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.imageUrl) {
        setPreviewUrl(data.imageUrl);
        toast.success('Background generated! Click to apply.');
      } else {
        throw new Error('No image generated');
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      if (error.message?.includes('Rate limit')) {
        toast.error('Too many requests. Please wait a moment.');
      } else if (error.message?.includes('credits')) {
        toast.error('AI credits exhausted.');
      } else {
        toast.error('Failed to generate background');
      }
    } finally {
      setIsGenerating(false);
      setSelectedStyle(null);
    }
  }, []);

  const applyPreviewBackground = useCallback(() => {
    if (previewUrl) {
      onBackgroundChange(previewUrl);
      setPreviewUrl(null);
      toast.success('Background applied!');
    }
  }, [previewUrl, onBackgroundChange]);

  const removeBackground = useCallback(() => {
    onBackgroundChange(null);
    setPreviewUrl(null);
    toast.success('Background removed');
  }, [onBackgroundChange]);

  return (
    <div className="space-y-6">
      {/* Current Background Preview */}
      <div className="relative">
        <Label className="text-sm font-medium mb-3 block">Background</Label>
        
        <div className="relative h-32 rounded-xl overflow-hidden border border-border bg-muted/30">
          {(currentBackground || previewUrl) ? (
            <>
              <img
                src={previewUrl || currentBackground}
                alt="Background preview"
                className="w-full h-full object-cover"
                style={{
                  opacity: backgroundOpacity / 100,
                  filter: `blur(${backgroundBlur}px)`,
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              
              {/* Preview badge */}
              {previewUrl && (
                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <span className="px-2 py-1 bg-primary/90 text-primary-foreground text-xs rounded-full font-medium">
                    Preview
                  </span>
                </div>
              )}
              
              {/* Actions */}
              <div className="absolute top-2 right-2 flex gap-2">
                {previewUrl && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                    onClick={applyPreviewBackground}
                  >
                    <Check className="h-4 w-4 text-primary" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                  onClick={removeBackground}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-50" />
            </div>
          )}
        </div>
      </div>

      {/* Upload & Generate Options */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="h-auto py-4 flex flex-col gap-2"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          <span className="text-xs">Upload Image</span>
        </Button>

        <Button
          variant="outline"
          onClick={() => handleGenerateBackground(customPrompt || 'beautiful abstract gradient')}
          disabled={isGenerating}
          className="h-auto py-4 flex flex-col gap-2"
        >
          {isGenerating && !selectedStyle ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Wand2 className="h-5 w-5" />
          )}
          <span className="text-xs">AI Generate</span>
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Custom AI Prompt */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Custom AI Prompt</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Describe your ideal background..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="flex-1"
            disabled={isGenerating}
          />
          <Button
            size="icon"
            onClick={() => handleGenerateBackground(customPrompt)}
            disabled={!customPrompt.trim() || isGenerating}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Style Buttons */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Quick Styles</Label>
        <div className="grid grid-cols-4 gap-2">
          {AI_BACKGROUND_STYLES.map((style) => {
            const Icon = style.icon;
            const isLoading = isGenerating && selectedStyle === style.id;
            
            return (
              <button
                key={style.id}
                onClick={() => handleGenerateBackground(style.prompt, style.id)}
                disabled={isGenerating}
                className={cn(
                  "p-3 rounded-xl border text-center transition-all duration-200",
                  "hover:border-primary/50 hover:bg-primary/5",
                  "active:scale-95 disabled:opacity-50",
                  isLoading && "border-primary bg-primary/10"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mx-auto animate-spin" />
                ) : (
                  <Icon className="h-4 w-4 mx-auto text-muted-foreground" />
                )}
                <p className="text-[10px] mt-1 text-muted-foreground truncate">{style.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Opacity & Blur Controls */}
      <AnimatePresence>
        {currentBackground && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Opacity</Label>
                <span className="text-xs font-mono text-muted-foreground">{backgroundOpacity}%</span>
              </div>
              <Slider
                value={[backgroundOpacity]}
                onValueChange={([val]) => onOpacityChange(val)}
                min={10}
                max={100}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Blur</Label>
                <span className="text-xs font-mono text-muted-foreground">{backgroundBlur}px</span>
              </div>
              <Slider
                value={[backgroundBlur]}
                onValueChange={([val]) => onBlurChange(val)}
                min={0}
                max={20}
                step={1}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
