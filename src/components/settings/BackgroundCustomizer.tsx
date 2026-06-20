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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
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
import { useAppBackgroundSafe } from '@/components/layout/AppBackground';
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
    // Firebase Storage URLs need bucket CORS for canvas reads — skip crossOrigin there.
    let isFirebaseStorage = false;
    try {
      isFirebaseStorage = new URL(imageUrl, window.location.origin).hostname.includes('firebasestorage.googleapis.com');
    } catch {
      /* ignore */
    }
    if (!isFirebaseStorage) {
      img.crossOrigin = 'anonymous';
    }
    
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
  
  // Get AppBackground context for immediate visual updates
  const appBackground = useAppBackgroundSafe();

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
      const { error: uploadError } = await db.storage
        .from('media')
        .upload(storagePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = db.storage
        .from('media')
        .getPublicUrl(storagePath);

      // Save to database and set as active
      await addBackground.mutateAsync({
        imageUrl: publicUrl,
        name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for name
        storagePath,
        setActive: true,
      });

      // Apply background immediately via AppBackground context
      appBackground?.setBackgroundImage(publicUrl);
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
  }, [userId, validateFile, onBackgroundChange, addBackground, onColorsExtracted, appBackground]);

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
      const { data, error } = await db.functions.invoke('generate-background', {
        body: { prompt, style: styleId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.imageUrl) {
        // Save to library and apply
        await addBackground.mutateAsync({
          imageUrl: data.imageUrl,
          name: styleId ? AI_BACKGROUND_STYLES.find(s => s.id === styleId)?.label : 'AI Generated',
          setActive: true,
        });
        // Apply immediately via AppBackground context
        appBackground?.setBackgroundImage(data.imageUrl);
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
  }, [onBackgroundChange, addBackground, onColorsExtracted, appBackground]);

  const handleSelectBackground = useCallback(async (bg: UserBackground) => {
    await setActiveBackground.mutateAsync(bg.id);
    // Apply immediately via AppBackground context
    appBackground?.setBackgroundImage(bg.image_url);
    onBackgroundChange(bg.image_url);
  }, [setActiveBackground, onBackgroundChange, appBackground]);

  const handleDeleteBackground = useCallback(async () => {
    if (!deleteConfirmId) return;
    const bg = userBackgrounds.find(b => b.id === deleteConfirmId);
    if (!bg) return;

    await deleteBackground.mutateAsync({ id: bg.id, storagePath: bg.storage_path });
    
    // If this was the active background, clear it
    if (bg.is_active) {
      appBackground?.setBackgroundImage(null);
      onBackgroundChange(null);
    }
    setDeleteConfirmId(null);
  }, [deleteConfirmId, userBackgrounds, deleteBackground, onBackgroundChange, appBackground]);

  const handleRenameBackground = useCallback(async (id: string) => {
    if (!editName.trim()) return;
    await renameBackground.mutateAsync({ id, name: editName.trim() });
    setEditingId(null);
    setEditName('');
  }, [editName, renameBackground]);

  const removeBackground = useCallback(async () => {
    // 1. Optimistic: clear body styles + context state instantly
    appBackground?.setBackgroundImage(null);
    appBackground?.setBackgroundOpacity(1);
    appBackground?.setBackgroundBlur(0);
    onOpacityChange(100);
    onBlurChange(0);
    onBackgroundChange(null);
    setExtractedColors(null);
    setPendingExtractedColors(null);
    setImageLoadError(false);

    // 2. Persist
    try {
      await clearActiveBackground.mutateAsync();
      toast.success('Default background restored');
    } catch (e) {
      toast.error('Could not save — applied locally');
    }

    // 3. If a cosmetic theme is still equipped, surface a note
    const equippedTheme = (profile as any)?.equipped_profile_theme;
    if (equippedTheme) {
      toast.message('Cosmetic theme still equipped', {
        description: 'Unequip it in your Locker to fully clear.',
      });
    }
  }, [clearActiveBackground, onBackgroundChange, onOpacityChange, onBlurChange, appBackground, profile]);

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
    <div className="space-y-6 px-1">
      {/* Error banner */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* ────────── 1. Preview card ────────── */}
      <section className="rounded-2xl border bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Current Background</Label>
          {currentBackground && (
            <button
              onClick={removeBackground}
              className="text-xs text-muted-foreground hover:text-foreground active:scale-95 transition flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Reset to default
            </button>
          )}
        </div>

        <div
          className={cn(
            'relative rounded-xl overflow-hidden border bg-muted/30 transition-all',
            'aspect-[16/9] min-h-[140px]',
            isDragging && 'border-primary border-2 bg-primary/5'
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
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  opacity: backgroundOpacity / 100,
                  filter: `blur(${backgroundBlur}px)`,
                }}
                onError={handleImageError}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent pointer-events-none" />
              {isExtracting && (
                <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-foreground/80 bg-background/70 backdrop-blur-sm px-2 py-1 rounded-md">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Extracting colors…
                </span>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground hover:bg-accent/5 transition-colors"
            >
              {isDragging ? (
                <>
                  <Upload className="h-8 w-8 text-primary animate-bounce" />
                  <p className="text-xs mt-2 text-primary">Drop image here</p>
                </>
              ) : (
                <>
                  <ImageIcon className="h-9 w-9 opacity-40" />
                  <p className="text-sm mt-2">Tap to choose an image</p>
                  <p className="text-[10px] opacity-60 mt-0.5">or drag & drop • Max 10MB</p>
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* ────────── 2. Source tabs ────────── */}
      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid grid-cols-3 w-full h-11 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="library" className="rounded-lg text-xs gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Library
          </TabsTrigger>
          <TabsTrigger value="upload" className="rounded-lg text-xs gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="generate" className="rounded-lg text-xs gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Generate
          </TabsTrigger>
        </TabsList>

        {/* Library panel */}
        <TabsContent value="library" className="mt-4">
          <div className="rounded-2xl border bg-card/60 p-4">
            {isLoadingBackgrounds ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : userBackgrounds.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {userBackgrounds.map((bg) => (
                  <div
                    key={bg.id}
                    className={cn(
                      'relative group rounded-lg overflow-hidden border cursor-pointer aspect-video',
                      'transition-all hover:ring-2 hover:ring-primary/50',
                      bg.is_active && 'ring-2 ring-primary'
                    )}
                    onClick={() => handleSelectBackground(bg)}
                  >
                    <img
                      src={bg.image_url}
                      alt={bg.name || 'Background'}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                    />
                    {bg.is_active && (
                      <div className="absolute top-1 left-1">
                        <Check className="h-4 w-4 text-primary bg-background/80 rounded-full p-0.5" />
                      </div>
                    )}
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
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                      <p className="text-[10px] text-white truncate">{bg.name || 'Untitled'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No saved backgrounds yet</p>
                <p className="text-xs mt-1 opacity-70">Upload one or generate with AI</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Upload panel */}
        <TabsContent value="upload" className="mt-4">
          <div className="rounded-2xl border bg-card/60 p-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed cursor-pointer',
                'transition-colors',
                isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/5'
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Uploading…</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-primary" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop an image here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">or tap to browse</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">JPG · PNG · GIF · WebP · Max 10MB</p>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Generate panel */}
        <TabsContent value="generate" className="mt-4">
          <div className="rounded-2xl border bg-card/60 p-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Pick a style</Label>
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
                        'p-2.5 rounded-xl border text-center transition-all',
                        'hover:border-primary/50 hover:bg-primary/5',
                        'active:scale-95 disabled:opacity-50',
                        isLoading && 'border-primary bg-primary/10'
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 mx-auto animate-spin text-primary" />
                      ) : (
                        <Icon className="h-4 w-4 mx-auto text-muted-foreground" />
                      )}
                      <p className="text-[10px] mt-1 truncate">{style.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Or describe your own</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. sunset over the ocean…"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="flex-1"
                  disabled={isGenerating}
                />
                <Button
                  onClick={() => handleGenerateBackground(customPrompt)}
                  disabled={!customPrompt.trim() || isGenerating}
                  className="gap-1.5"
                >
                  {isGenerating && !selectedStyle ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ────────── 3. Adjust (collapsible) ────────── */}
      <AnimatePresence>
        {currentBackground && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <Collapsible className="rounded-2xl border bg-card/60 overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Adjust</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Opacity</Label>
                    <span className="text-xs font-mono text-muted-foreground">{backgroundOpacity}%</span>
                  </div>
                  <Slider
                    value={[backgroundOpacity]}
                    onValueChange={([val]) => {
                      appBackground?.setBackgroundOpacity(val / 100);
                      onOpacityChange(val);
                    }}
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
                    onValueChange={([val]) => {
                      appBackground?.setBackgroundBlur(val);
                      onBlurChange(val);
                    }}
                    min={0}
                    max={20}
                    step={1}
                  />
                </div>

                {extractedColors && onColorsExtracted && (
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <div className="flex items-center gap-2">
                      <Pipette className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium">Match UI to image</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[extractedColors.primary, extractedColors.secondary, extractedColors.accent, extractedColors.background].map((color, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-full border border-border/50"
                          style={{ backgroundColor: `hsl(${color})` }}
                        />
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 text-xs"
                        onClick={handleApplyColors}
                      >
                        <Palette className="h-3 w-3 mr-1" />
                        Apply
                      </Button>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Color Match Prompt Modal */}
      <ColorMatchPrompt
        isOpen={showColorMatchPrompt}
        onClose={() => setShowColorMatchPrompt(false)}
        onMatchColors={handleApplyColorsFromPrompt}
        onKeepColors={handleKeepColors}
        extractedColors={pendingExtractedColors}
      />

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
    </div>
  );
}
