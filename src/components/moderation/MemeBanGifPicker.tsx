import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Link, X, Check, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMemeBanBackgrounds, useAddMemeBanBackground } from '@/hooks/useMemeBanBackgrounds';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MemeBanGifPickerProps {
  selectedGifUrl: string | null;
  onSelectGif: (url: string | null) => void;
}

export const MemeBanGifPicker = ({ selectedGifUrl, onSelectGif }: MemeBanGifPickerProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: backgrounds = [] } = useMemeBanBackgrounds();
  const addBackground = useAddMemeBanBackground();

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes('gif') && !file.type.includes('image')) {
      toast.error('Please upload a GIF or image file');
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `meme-ban-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      // Add to backgrounds library
      await addBackground.mutateAsync({ 
        name: file.name.replace(/\.[^/.]+$/, ''), 
        gifUrl: data.publicUrl 
      });
      
      // Select the newly uploaded GIF
      onSelectGif(data.publicUrl);
      toast.success('GIF uploaded and added to library!');
    } catch (error) {
      toast.error('Upload failed');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  }, [addBackground, onSelectGif]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleAddFromUrl = async () => {
    if (!customUrl.trim()) return;
    
    const urlToUse = customUrl.trim();
    
    // Immediately select the GIF for preview
    onSelectGif(urlToUse);
    setCustomUrl('');
    setShowUrlInput(false);
    
    // Try to add to library in the background (don't block on this)
    try {
      await addBackground.mutateAsync({ 
        name: `Custom GIF ${Date.now()}`, 
        gifUrl: urlToUse 
      });
      toast.success('GIF added to library!');
    } catch (error) {
      // URL will still be used for this ban, just not saved to library
      console.log('Could not save to library (may already exist or no permission):', error);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        Choose Ban GIF (optional)
      </Label>

      {/* Drag & Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
          isDragOver 
            ? "border-orange-500 bg-orange-500/10" 
            : "border-muted-foreground/25 hover:border-orange-500/50 hover:bg-muted/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/gif,image/*"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isUploading}
        />
        
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <Upload className={cn(
                "h-8 w-8 transition-colors",
                isDragOver ? "text-orange-500" : "text-muted-foreground"
              )} />
              <span className="text-sm text-muted-foreground">
                Drop a GIF here or click to upload
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* URL Input Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-xs"
        >
          <Link className="h-3 w-3 mr-1" />
          Paste URL
        </Button>
        {selectedGifUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectGif(null)}
            className="text-xs text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Use Random
          </Button>
        )}
      </div>

      {/* URL Input */}
      <AnimatePresence>
        {showUrlInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex gap-2 overflow-hidden"
          >
            <Input
              placeholder="https://media.tenor.com/..."
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddFromUrl}
              disabled={!customUrl.trim()}
            >
              Use
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing Backgrounds Grid */}
      {backgrounds.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Or pick from library:</Label>
          <ScrollArea className="h-32">
            <div className="grid grid-cols-4 gap-2">
              {backgrounds.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => onSelectGif(selectedGifUrl === bg.gif_url ? null : bg.gif_url)}
                  className={cn(
                    "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                    selectedGifUrl === bg.gif_url
                      ? "border-orange-500 ring-2 ring-orange-500/50"
                      : "border-transparent hover:border-orange-500/50"
                  )}
                >
                  <img
                    src={bg.gif_url}
                    alt={bg.name}
                    className="w-full h-full object-cover"
                  />
                  {selectedGifUrl === bg.gif_url && (
                    <div className="absolute inset-0 bg-orange-500/30 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Preview */}
      {selectedGifUrl && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Preview (will fill screen):</Label>
          <div className="relative rounded-lg overflow-hidden border border-border bg-black max-h-48">
            <img
              src={selectedGifUrl}
              alt="Selected GIF"
              className="w-full h-auto max-h-48 object-contain mx-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                toast.error('Could not load GIF - check the URL');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
