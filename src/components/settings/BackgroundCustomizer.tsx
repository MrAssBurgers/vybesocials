import { useState, useRef, useCallback, useEffect } from 'react';
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
  Zap,
  AlertCircle,
  Pipette
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';

interface ExtractedColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

interface BackgroundCustomizerProps {
  currentBackground?: string;
  backgroundOpacity: number;
  backgroundBlur: number;
  onBackgroundChange: (url: string | null) => void;
  onOpacityChange: (opacity: number) => void;
  onBlurChange: (blur: number) => void;
  onColorsExtracted?: (colors: ExtractedColors) => void;
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

// Accepted image types
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Color extraction utilities
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function extractColorsFromImage(imageUrl: string): Promise<ExtractedColors> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Sample at a reasonable size
      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const pixels = imageData.data;

      // Collect color buckets
      const colorBuckets: Map<string, { r: number; g: number; b: number; count: number }> = new Map();

      for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.floor(pixels[i] / 32) * 32;
        const g = Math.floor(pixels[i + 1] / 32) * 32;
        const b = Math.floor(pixels[i + 2] / 32) * 32;
        const key = `${r}-${g}-${b}`;
        
        const existing = colorBuckets.get(key);
        if (existing) {
          existing.count++;
          existing.r = (existing.r + pixels[i]) / 2;
          existing.g = (existing.g + pixels[i + 1]) / 2;
          existing.b = (existing.b + pixels[i + 2]) / 2;
        } else {
          colorBuckets.set(key, { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], count: 1 });
        }
      }

      // Sort by count and get top colors, then add HSL values
      const sortedColors = Array.from(colorBuckets.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(c => {
          const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
          return { ...c, h, s, l };
        });

      // Find vibrant colors (higher saturation) for primary/accent
      const vibrantColors = sortedColors
        .filter(c => c.s > 20) // Filter out grays
        .sort((a, b) => b.s - a.s);

      // Find dark colors for background
      const darkColors = sortedColors
        .filter(c => c.l < 40)
        .sort((a, b) => a.l - b.l);

      // Extract colors - all now have h, s, l properties
      const primary = vibrantColors[0] || sortedColors[0];
      const secondary = vibrantColors[1] || sortedColors[1] || primary;
      const accent = vibrantColors[2] || vibrantColors[0] || sortedColors[2] || primary;
      const background = darkColors[0] || sortedColors[sortedColors.length - 1];

      // Safely get HSL values with defaults
      const getHsl = (color: typeof primary | undefined, defaults: [number, number, number]): [number, number, number] => {
        if (!color) return defaults;
        return [color.h, color.s, color.l];
      };

      const primaryHsl = getHsl(primary, [330, 100, 60]);
      const secondaryHsl = getHsl(secondary, [240, 10, 12]);
      const accentHsl = getHsl(accent, [185, 100, 50]);
      const bgHsl = getHsl(background, [240, 10, 4]);

      resolve({
        primary: `${primaryHsl[0]} ${primaryHsl[1]}% ${Math.min(70, Math.max(40, primaryHsl[2]))}%`,
        secondary: `${secondaryHsl[0]} ${Math.max(10, secondaryHsl[1])}% ${secondaryHsl[2]}%`,
        accent: `${accentHsl[0]} ${Math.min(100, accentHsl[1] + 20)}% ${Math.min(70, Math.max(40, accentHsl[2]))}%`,
        background: `${bgHsl[0]} ${Math.min(30, bgHsl[1])}% ${Math.min(10, bgHsl[2])}%`,
      });
    };

    img.onerror = () => reject(new Error('Failed to load image for color extraction'));
    img.src = imageUrl;
  });
}

export function BackgroundCustomizer({
  currentBackground,
  backgroundOpacity,
  backgroundBlur,
  onBackgroundChange,
  onOpacityChange,
  onBlurChange,
  onColorsExtracted,
}: BackgroundCustomizerProps) {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extractedColors, setExtractedColors] = useState<ExtractedColors | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [applyColorsToTheme, setApplyColorsToTheme] = useState(false);

  // Get the correct user identifier (profile.id or user.id)
  const userId = profile?.id || user?.id;

  // Clear error after 5 seconds
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [uploadError]);

  // Extract colors when background changes
  const handleColorExtraction = useCallback(async (imageUrl: string) => {
    setIsExtracting(true);
    try {
      const colors = await extractColorsFromImage(imageUrl);
      setExtractedColors(colors);
      console.log('[ColorExtraction] Extracted colors:', colors);
    } catch (error) {
      console.error('[ColorExtraction] Failed:', error);
      setExtractedColors(null);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  // Auto-extract colors when background is set
  useEffect(() => {
    if (currentBackground) {
      handleColorExtraction(currentBackground);
    } else {
      setExtractedColors(null);
    }
  }, [currentBackground, handleColorExtraction]);

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported format. Please use: JPG, PNG, GIF, WebP, SVG, or BMP`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is 10MB (yours: ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    }
    return null;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    if (!userId) {
      setUploadError('Please sign in to upload backgrounds');
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      toast.error(validationError);
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Create unique filename with timestamp
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `backgrounds/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

      console.log('[BackgroundUpload] Uploading to:', fileName);

      // Upload to Supabase storage (media bucket is public)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file, { 
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('[BackgroundUpload] Upload error:', uploadError);
        throw uploadError;
      }

      console.log('[BackgroundUpload] Upload success:', uploadData);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      console.log('[BackgroundUpload] Public URL:', publicUrl);

      // Apply immediately as background
      onBackgroundChange(publicUrl);
      toast.success('Background set! Toggle below to match theme colors.');
    } catch (error: any) {
      console.error('[BackgroundUpload] Error:', error);
      const message = error.message || 'Failed to upload background';
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [userId, validateFile, onBackgroundChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }, [uploadFile]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  }, [uploadFile]);

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
        // Auto-apply generated background
        onBackgroundChange(data.imageUrl);
        setPreviewUrl(null);
        toast.success('Background generated and applied!');
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
  }, [onBackgroundChange]);

  const applyPreviewBackground = useCallback(() => {
    if (previewUrl) {
      onBackgroundChange(previewUrl);
      setPreviewUrl(null);
      toast.success('Background applied! Click Save to keep it.');
    }
  }, [previewUrl, onBackgroundChange]);

  const removeBackground = useCallback(() => {
    onBackgroundChange(null);
    setPreviewUrl(null);
    setExtractedColors(null);
    setApplyColorsToTheme(false);
    toast.success('Background removed');
  }, [onBackgroundChange]);

  // Handle applying extracted colors to theme
  const handleApplyColors = useCallback(() => {
    if (extractedColors && onColorsExtracted) {
      onColorsExtracted(extractedColors);
      toast.success('Theme colors updated to match your background!');
    }
  }, [extractedColors, onColorsExtracted]);

  // Toggle for auto-applying colors
  const handleToggleApplyColors = useCallback((checked: boolean) => {
    setApplyColorsToTheme(checked);
    if (checked && extractedColors && onColorsExtracted) {
      onColorsExtracted(extractedColors);
      toast.success('Theme colors matched to background!');
    }
  }, [extractedColors, onColorsExtracted]);

  return (
    <div className="space-y-6">
      {/* Error Message */}
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{uploadError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Background Preview */}
      <div className="relative">
        <Label className="text-sm font-medium mb-3 block">Background</Label>
        
        {/* Preview with responsive sizing */}
        <div 
          className={cn(
            "relative rounded-xl overflow-hidden border bg-muted/30 transition-all duration-200",
            "min-h-[120px] sm:min-h-[140px] aspect-[16/9]",
            isDragging && "border-primary border-2 bg-primary/5"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {(currentBackground || previewUrl) ? (
            <>
              {/* Background image with responsive object-fit */}
              <img
                src={previewUrl || currentBackground}
                alt="Background preview"
                className="absolute inset-0 w-full h-full object-cover object-center"
                style={{
                  opacity: backgroundOpacity / 100,
                  filter: `blur(${backgroundBlur}px)`,
                }}
                onError={(e) => {
                  console.error('[BackgroundPreview] Image failed to load');
                  e.currentTarget.style.display = 'none';
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
              
              {/* Color extraction indicator */}
              {isExtracting && (
                <div className="absolute bottom-2 left-2">
                  <span className="flex items-center gap-1 text-[10px] text-foreground/70 bg-background/60 backdrop-blur-sm px-2 py-1 rounded-md">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extracting colors...
                  </span>
                </div>
              )}
            </>
          ) : (
            <div 
              className={cn(
                "flex flex-col items-center justify-center h-full text-muted-foreground cursor-pointer",
                "hover:bg-accent/5 transition-colors min-h-[120px]"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              {isDragging ? (
                <>
                  <Upload className="h-8 w-8 text-primary animate-bounce" />
                  <p className="text-xs mt-2 text-primary">Drop to upload</p>
                </>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 opacity-50" />
                  <p className="text-xs mt-2">Drag & drop or click to upload</p>
                  <p className="text-[10px] opacity-60">JPG, PNG, GIF, WebP • Max 10MB</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Color Matching Option - Shows when background is set */}
      <AnimatePresence>
        {currentBackground && extractedColors && onColorsExtracted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl border bg-card/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pipette className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Match Theme Colors</span>
                </div>
                <Switch
                  checked={applyColorsToTheme}
                  onCheckedChange={handleToggleApplyColors}
                />
              </div>
              
              <p className="text-xs text-muted-foreground">
                Automatically update UI colors to match your background image
              </p>
              
              {/* Color preview swatches */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Detected:</span>
                <div className="flex gap-1">
                  <div 
                    className="w-6 h-6 rounded-full border border-border/50"
                    style={{ backgroundColor: `hsl(${extractedColors.primary})` }}
                    title="Primary"
                  />
                  <div 
                    className="w-6 h-6 rounded-full border border-border/50"
                    style={{ backgroundColor: `hsl(${extractedColors.secondary})` }}
                    title="Secondary"
                  />
                  <div 
                    className="w-6 h-6 rounded-full border border-border/50"
                    style={{ backgroundColor: `hsl(${extractedColors.accent})` }}
                    title="Accent"
                  />
                  <div 
                    className="w-6 h-6 rounded-full border border-border/50"
                    style={{ backgroundColor: `hsl(${extractedColors.background})` }}
                    title="Background"
                  />
                </div>
              </div>

              {!applyColorsToTheme && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleApplyColors}
                >
                  <Palette className="h-4 w-4 mr-2" />
                  Apply Colors Now
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload & Generate Options */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || !userId}
          className="h-auto py-4 flex flex-col gap-2"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          <span className="text-xs">{isUploading ? 'Uploading...' : 'Upload Image'}</span>
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
        accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,image/*"
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
