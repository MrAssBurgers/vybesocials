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
  Pipette,
  Trash2,
  Pencil,
  FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import {
  useUserBackgrounds,
  useAddBackground,
  useSetActiveBackground,
  useDeleteBackground,
  useRenameBackground,
  useClearActiveBackground,
  UserBackground,
} from '@/hooks/useUserBackgrounds';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ColorMatchPrompt } from './ColorMatchPrompt';

export interface ExtractedColors {
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

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Color extraction utilities
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
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
      if (!ctx) { reject(new Error('Could not get canvas context')); return; }

      const sampleSize = 100;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      const pixels = imageData.data;
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

      const sortedColors = Array.from(colorBuckets.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(c => ({ ...c, ...(() => { const [h, s, l] = rgbToHsl(c.r, c.g, c.b); return { h, s, l }; })() }));

      const vibrantColors = sortedColors.filter(c => c.s > 20).sort((a, b) => b.s - a.s);
      const darkColors = sortedColors.filter(c => c.l < 40).sort((a, b) => a.l - b.l);

      const primary = vibrantColors[0] || sortedColors[0];
      const secondary = vibrantColors[1] || sortedColors[1] || primary;
      const accent = vibrantColors[2] || vibrantColors[0] || sortedColors[2] || primary;
      const background = darkColors[0] || sortedColors[sortedColors.length - 1];

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extractedColors, setExtractedColors] = useState<ExtractedColors | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  
  // Color match prompt state - shows after new background is added
  const [showColorMatchPrompt, setShowColorMatchPrompt] = useState(false);
  const [pendingExtractedColors, setPendingExtractedColors] = useState<ExtractedColors | null>(null);
  
  // My Backgrounds state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Hooks for background management
  const { data: userBackgrounds = [], isLoading: isLoadingBackgrounds } = useUserBackgrounds();
  const addBackground = useAddBackground();
  const setActiveBackground = useSetActiveBackground();
  const deleteBackground = useDeleteBackground();
  const renameBackground = useRenameBackground();
  const clearActiveBackground = useClearActiveBackground();

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
    } catch (error) {
      console.error('[ColorExtraction] Failed:', error);
      setExtractedColors(null);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  useEffect(() => {
    if (currentBackground) {
      handleColorExtraction(currentBackground);
      setImageLoadError(false);
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
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `backgrounds/${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(storagePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(storagePath);

      // Save to database and set as active
      await addBackground.mutateAsync({
        imageUrl: publicUrl,
        name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for name
        storagePath,
        setActive: true,
      });

      // Apply background immediately - DO NOT change theme colors
      onBackgroundChange(publicUrl);
      toast.success('Background applied!');
      
      // Extract colors and show prompt to ask if user wants to match
      if (onColorsExtracted) {
        try {
          const colors = await extractColorsFromImage(publicUrl);
          setPendingExtractedColors(colors);
          setShowColorMatchPrompt(true);
        } catch (err) {
          console.error('[ColorExtraction] Failed:', err);
        }
      }
    } catch (error: any) {
      console.error('[BackgroundUpload] Error:', error);
      const message = error.message || 'Failed to upload background';
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [userId, validateFile, onBackgroundChange, addBackground, onColorsExtracted]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

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
    if (file) uploadFile(file);
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
        // Save to library and apply - DO NOT change theme colors
        await addBackground.mutateAsync({
          imageUrl: data.imageUrl,
          name: styleId ? AI_BACKGROUND_STYLES.find(s => s.id === styleId)?.label : 'AI Generated',
          setActive: true,
        });
        onBackgroundChange(data.imageUrl);
        toast.success('Background generated!');
        
        // Extract colors and show prompt to ask if user wants to match
        if (onColorsExtracted) {
          try {
            const colors = await extractColorsFromImage(data.imageUrl);
            setPendingExtractedColors(colors);
            setShowColorMatchPrompt(true);
          } catch (err) {
            console.error('[ColorExtraction] Failed:', err);
          }
        }
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
  }, [onBackgroundChange, addBackground, onColorsExtracted]);

  const handleSelectBackground = useCallback(async (bg: UserBackground) => {
    await setActiveBackground.mutateAsync(bg.id);
    onBackgroundChange(bg.image_url);
  }, [setActiveBackground, onBackgroundChange]);

  const handleDeleteBackground = useCallback(async () => {
    if (!deleteConfirmId) return;
    const bg = userBackgrounds.find(b => b.id === deleteConfirmId);
    if (!bg) return;

    await deleteBackground.mutateAsync({ id: bg.id, storagePath: bg.storage_path });
    
    // If this was the active background, clear it
    if (bg.is_active) {
      onBackgroundChange(null);
    }
    setDeleteConfirmId(null);
  }, [deleteConfirmId, userBackgrounds, deleteBackground, onBackgroundChange]);

  const handleRenameBackground = useCallback(async (id: string) => {
    if (!editName.trim()) return;
    await renameBackground.mutateAsync({ id, name: editName.trim() });
    setEditingId(null);
    setEditName('');
  }, [editName, renameBackground]);

  const removeBackground = useCallback(async () => {
    await clearActiveBackground.mutateAsync();
    onBackgroundChange(null);
    setExtractedColors(null);
    setPendingExtractedColors(null);
    toast.success('Background removed');
  }, [clearActiveBackground, onBackgroundChange]);

  // Handle applying colors from prompt
  const handleApplyColorsFromPrompt = useCallback(() => {
    if (pendingExtractedColors && onColorsExtracted) {
      onColorsExtracted(pendingExtractedColors);
      toast.success('Theme colors updated to match your background!');
    }
  }, [pendingExtractedColors, onColorsExtracted]);

  // Handle keeping current colors
  const handleKeepColors = useCallback(() => {
    // Just close the prompt, don't change colors
    setPendingExtractedColors(null);
  }, []);

  // Handle manual apply colors button
  const handleApplyColors = useCallback(() => {
    if (extractedColors && onColorsExtracted) {
      onColorsExtracted(extractedColors);
      toast.success('Theme colors updated to match your background!');
    }
  }, [extractedColors, onColorsExtracted]);

  const handleImageError = useCallback(() => {
    setImageLoadError(true);
    toast.error('Background image failed to load. Falling back to default.');
    onBackgroundChange(null);
  }, [onBackgroundChange]);

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Current Background Preview */}
      <div className="relative">
        <Label className="text-sm font-medium mb-3 block">Current Background</Label>
        
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
          {currentBackground && !imageLoadError ? (
            <>
              <img
                src={currentBackground}
                alt="Background preview"
                className="absolute inset-0 w-full h-full object-cover object-center"
                style={{
                  opacity: backgroundOpacity / 100,
                  filter: `blur(${backgroundBlur}px)`,
                }}
                onError={handleImageError}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              
              {/* Actions */}
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                  onClick={removeBackground}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
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

      {/* Color Matching Section - Simplified */}
      <AnimatePresence>
        {currentBackground && extractedColors && onColorsExtracted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl border bg-card/50 space-y-3">
              <div className="flex items-center gap-2">
                <Pipette className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Extracted Colors</span>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Colors detected from your background image
              </p>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Palette:</span>
                <div className="flex gap-1">
                  {[extractedColors.primary, extractedColors.secondary, extractedColors.accent, extractedColors.background].map((color, i) => (
                    <div 
                      key={i}
                      className="w-6 h-6 rounded-full border border-border/50"
                      style={{ backgroundColor: `hsl(${color})` }}
                    />
                  ))}
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={handleApplyColors}>
                <Palette className="h-4 w-4 mr-2" />
                Match UI Colors to Background
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Color Match Prompt Modal */}
      <ColorMatchPrompt
        isOpen={showColorMatchPrompt}
        onClose={() => setShowColorMatchPrompt(false)}
        onMatchColors={handleApplyColorsFromPrompt}
        onKeepColors={handleKeepColors}
        extractedColors={pendingExtractedColors}
      />

      {/* My Backgrounds Library */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">My Backgrounds</Label>
          {isLoadingBackgrounds && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        
        {userBackgrounds.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {userBackgrounds.map((bg) => (
              <div
                key={bg.id}
                className={cn(
                  "relative group rounded-lg overflow-hidden border cursor-pointer aspect-video",
                  "transition-all duration-200 hover:ring-2 hover:ring-primary/50",
                  bg.is_active && "ring-2 ring-primary"
                )}
                onClick={() => handleSelectBackground(bg)}
              >
                <img
                  src={bg.image_url}
                  alt={bg.name || 'Background'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
                
                {/* Active badge */}
                {bg.is_active && (
                  <div className="absolute top-1 left-1">
                    <Check className="h-4 w-4 text-primary bg-background/80 rounded-full p-0.5" />
                  </div>
                )}
                
                {/* Hover actions */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(bg.id);
                      setEditName(bg.name || '');
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-white hover:bg-destructive/50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(bg.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                
                {/* Name overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <p className="text-[10px] text-white truncate">{bg.name || 'Untitled'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No saved backgrounds yet</p>
            <p className="text-xs">Upload or generate your first background</p>
          </div>
        )}
      </div>

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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Background?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this background from your library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBackground} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <AlertDialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename Background</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Enter new name..."
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => editingId && handleRenameBackground(editingId)}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Color Match Prompt - shows after adding background */}
      <ColorMatchPrompt
        isOpen={showColorMatchPrompt}
        onClose={() => setShowColorMatchPrompt(false)}
        onMatchColors={handleApplyColorsFromPrompt}
        onKeepColors={handleKeepColors}
        extractedColors={pendingExtractedColors}
      />
    </div>
  );
}
