import { useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Image, 
  Video, 
  Smile, 
  Mic, 
  MapPin, 
  Sticker, 
  Plus,
  X,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { GifPicker } from './GifPicker';
import { cn } from '@/lib/utils';

interface ToyboxProps {
  onImageSelect: (file: File) => void;
  onVideoSelect: (file: File) => void;
  onGifSelect: (gifUrl: string) => void;
  onVoiceStart: () => void;
  onStickerSelect?: (sticker: string) => void;
  onLocationShare?: () => void;
  isUploading?: boolean;
  disabled?: boolean;
}

const STICKERS = ['😀', '😂', '🥰', '😎', '🔥', '💯', '🎉', '❤️', '👍', '🙌', '💪', '✨'];

export const Toybox = memo(function Toybox({
  onImageSelect,
  onVideoSelect,
  onGifSelect,
  onVoiceStart,
  onStickerSelect,
  onLocationShare,
  isUploading,
  disabled,
}: ToyboxProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
      setIsOpen(false);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [onImageSelect]);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onVideoSelect(file);
      setIsOpen(false);
    }
    if (videoInputRef.current) videoInputRef.current.value = '';
  }, [onVideoSelect]);

  const handleGifSelect = useCallback((gifUrl: string) => {
    onGifSelect(gifUrl);
    setShowGifPicker(false);
    setIsOpen(false);
  }, [onGifSelect]);

  const handleStickerSelect = useCallback((sticker: string) => {
    onStickerSelect?.(sticker);
    setShowStickers(false);
    setIsOpen(false);
  }, [onStickerSelect]);

  const handleVoiceStart = useCallback(() => {
    onVoiceStart();
    setIsOpen(false);
  }, [onVoiceStart]);

  const menuItems = [
    { 
      icon: Image, 
      label: 'Photo', 
      onClick: () => imageInputRef.current?.click(),
      color: 'text-green-500',
    },
    { 
      icon: Video, 
      label: 'Video', 
      onClick: () => videoInputRef.current?.click(),
      color: 'text-blue-500',
    },
    { 
      icon: Smile, 
      label: 'GIF', 
      onClick: () => setShowGifPicker(true),
      color: 'text-purple-500',
    },
    { 
      icon: Sticker, 
      label: 'Stickers', 
      onClick: () => setShowStickers(true),
      color: 'text-yellow-500',
    },
    { 
      icon: Mic, 
      label: 'Voice', 
      onClick: handleVoiceStart,
      color: 'text-red-500',
    },
    ...(onLocationShare ? [{
      icon: MapPin, 
      label: 'Location', 
      onClick: onLocationShare,
      color: 'text-orange-500',
    }] : []),
  ];

  const ToyboxContent = (
    <div className="p-4">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoChange}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {showGifPicker ? (
          <GifPicker
            key="gif-picker"
            onSelect={handleGifSelect}
            onClose={() => setShowGifPicker(false)}
          />
        ) : showStickers ? (
          <motion.div
            key="stickers"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm">Stickers</span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowStickers(false)}
                className="h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {STICKERS.map((sticker) => (
                <motion.button
                  key={sticker}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleStickerSelect(sticker)}
                  className="text-2xl p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {sticker}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-3 gap-3"
          >
            {menuItems.map(({ icon: Icon, label, onClick, color }) => (
              <motion.button
                key={label}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClick}
                disabled={isUploading}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl",
                  "bg-muted/50 hover:bg-muted transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isUploading ? (
                  <Loader2 className={cn("h-6 w-6 animate-spin", color)} />
                ) : (
                  <Icon className={cn("h-6 w-6", color)} />
                )}
                <span className="text-xs font-medium">{label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Use Drawer on mobile, Popover on desktop
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || isUploading}
            className="flex-shrink-0"
          >
            <motion.div
              animate={isOpen ? { rotate: 45 } : { rotate: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Plus className="h-5 w-5" />
            </motion.div>
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mb-4 mt-2" />
          {ToyboxContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || isUploading}
          className="flex-shrink-0"
        >
          <motion.div
            animate={isOpen ? { rotate: 45 } : { rotate: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Plus className="h-5 w-5" />
          </motion.div>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="start" 
        className="w-auto p-0"
        sideOffset={8}
      >
        {ToyboxContent}
      </PopoverContent>
    </Popover>
  );
});
