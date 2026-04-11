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
  Loader2,
  ChevronRight,
  Ghost,
  Pin,
  Clock,
  Settings,
  Shield,
  SmilePlus,
  Package,
  Lock,
  Crown
} from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useUserRole } from '@/hooks/useModeration';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
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
import { UpgradeButton } from '@/components/premium/UpgradeButton';
import { cn } from '@/lib/utils';

interface ToyboxProps {
  onImageSelect: (file: File) => void;
  onVideoSelect: (file: File) => void;
  onGifSelect: (gifUrl: string) => void;
  onVoiceStart: () => void;
  onStickerSelect?: (sticker: string) => void;
  onLocationShare?: () => void;
  onEmojiSelect?: (emoji: string) => void;
  isUploading?: boolean;
  disabled?: boolean;
  // New props for DM features
  onOpenVanishThreads?: () => void;
  onOpenMemoryPins?: () => void;
  onOpenScheduleMessage?: () => void;
  onOpenDMSettings?: () => void;
  onOpenAdminPanel?: () => void;
  onOpenVybeCamera?: () => void;
  onCreateOffer?: () => void;
  hasBusinessProfile?: boolean;
  // AI safety filter props
  safetyFilterNode?: React.ReactNode;
}

const STICKERS = ['😀', '😂', '🥰', '😎', '🔥', '💯', '🎉', '❤️', '👍', '🙌', '💪', '✨'];

// Extended emoji list for computer users
const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '🫶', '💑', '💏'],
  'Gestures': ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🙏', '🤝', '👏', '🙌', '👐', '🤲'],
  'Objects': ['🔥', '✨', '💫', '⭐', '🌟', '💥', '💢', '💦', '💨', '🎉', '🎊', '🎁', '🎈', '💯', '💤', '💭', '💬', '🗯️', '💌', '📱', '💻', '🎮', '🎧', '🎤', '📸', '🎬', '📺', '📻', '⏰', '💡', '🔔', '🎵', '🎶'],
  'Animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦄', '🐝', '🦋', '🐌', '🐛', '🐢', '🐍', '🦎', '🦖', '🐙', '🦀', '🐠', '🐳', '🦈'],
  'Food': ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍔', '🍟', '🍕', '🌭', '🍿', '🧁', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '☕', '🧋', '🍺', '🍷', '🥤'],
};

export const Toybox = memo(function Toybox({
  onImageSelect,
  onVideoSelect,
  onGifSelect,
  onVoiceStart,
  onStickerSelect,
  onLocationShare,
  onEmojiSelect,
  isUploading,
  disabled,
  onOpenVanishThreads,
  onOpenMemoryPins,
  onOpenScheduleMessage,
  onOpenDMSettings,
  onOpenAdminPanel,
  onOpenVybeCamera,
  onCreateOffer,
  hasBusinessProfile,
  safetyFilterNode,
}: ToyboxProps) {
  const { data: userRole } = useUserRole();
  const { isPremium } = usePremiumStatus();
  const isModOrAdmin = userRole === 'admin' || userRole === 'moderator';
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');
  const [showDMFeatures, setShowDMFeatures] = useState(false);
  const [showPremiumPrompt, setShowPremiumPrompt] = useState(false);
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

  const handleEmojiSelect = useCallback((emoji: string) => {
    onEmojiSelect?.(emoji);
    setShowEmojis(false);
    setIsOpen(false);
  }, [onEmojiSelect]);

  const handleVoiceStart = useCallback(() => {
    onVoiceStart();
    setIsOpen(false);
  }, [onVoiceStart]);

  const handleDMFeatureClick = useCallback((callback?: () => void) => {
    callback?.();
    setShowDMFeatures(false);
    setIsOpen(false);
  }, []);

  const handleVybeCameraClick = useCallback(() => {
    onOpenVybeCamera?.();
    setIsOpen(false);
  }, [onOpenVybeCamera]);

  const mediaItems = [
    { 
      icon: Image, 
      label: 'Photo', 
      onClick: () => imageInputRef.current?.click(),
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    { 
      icon: Video, 
      label: 'Video', 
      onClick: () => videoInputRef.current?.click(),
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    { 
      icon: Smile, 
      label: 'GIF', 
      onClick: () => setShowGifPicker(true),
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    { 
      icon: Sticker, 
      label: 'Stickers', 
      onClick: () => setShowStickers(true),
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
    },
    // Emoji picker - great for computer users without emoji keyboard
    ...(onEmojiSelect ? [{
      icon: SmilePlus, 
      label: 'Emoji', 
      onClick: () => setShowEmojis(true),
      color: 'text-pink-500',
      bg: 'bg-pink-500/10',
    }] : []),
    { 
      icon: Mic, 
      label: 'Voice', 
      onClick: handleVoiceStart,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    ...(onLocationShare ? [{
      icon: MapPin, 
      label: 'Location', 
      onClick: onLocationShare,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    }] : []),
  ];

  const handlePremiumDMFeature = useCallback((callback?: () => void) => {
    if (isPremium) {
      handleDMFeatureClick(callback);
    } else {
      setShowPremiumPrompt(true);
    }
  }, [isPremium, handleDMFeatureClick]);

  const dmFeatures: { icon: any; label: string; description: string; onClick: () => void; color: string; premium?: boolean }[] = [
    {
      icon: Ghost,
      label: 'Vanish Threads',
      description: 'Messages auto-delete 👻',
      onClick: () => handlePremiumDMFeature(onOpenVanishThreads),
      color: 'text-purple-500',
      premium: true,
    },
    {
      icon: Pin,
      label: 'Memory Pins',
      description: 'Save special moments 💕',
      onClick: () => handleDMFeatureClick(onOpenMemoryPins),
      color: 'text-pink-500',
    },
    {
      icon: Clock,
      label: 'Schedule Message',
      description: 'Send later 📅',
      onClick: () => handlePremiumDMFeature(onOpenScheduleMessage),
      color: 'text-blue-500',
      premium: true,
    },
    {
      icon: Settings,
      label: 'DM Settings',
      description: 'Customize your chat ⚙️',
      onClick: () => handleDMFeatureClick(onOpenDMSettings),
      color: 'text-gray-500',
    },
    // Admin panel - only shown for admins/mods
    ...(isModOrAdmin && onOpenAdminPanel ? [{
      icon: Shield,
      label: 'Admin Panel',
      description: 'Warn, ban, or meme ban 🛡️',
      onClick: () => handleDMFeatureClick(onOpenAdminPanel),
      color: 'text-red-500',
    }] : []),
    // Business offers - only shown for business owners
    ...(hasBusinessProfile && onCreateOffer ? [{
      icon: Package,
      label: 'Send Offer',
      description: 'Send a custom price offer 💰',
      onClick: () => handleDMFeatureClick(onCreateOffer),
      color: 'text-green-500',
    }] : []),
  ];

  const hasDMFeatures = onOpenVanishThreads || onOpenMemoryPins || onOpenScheduleMessage || onOpenDMSettings || (isModOrAdmin && onOpenAdminPanel) || (hasBusinessProfile && onCreateOffer);

  const ToyboxContent = (
    <div className="p-4 max-h-[70vh] overflow-y-auto">
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
        ) : showEmojis ? (
          <motion.div
            key="emojis"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm flex items-center gap-2">
                <SmilePlus className="h-4 w-4 text-pink-500" />
                Emoji
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowEmojis(false)}
                className="h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Category tabs */}
            <div className="flex gap-1 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {(Object.keys(EMOJI_CATEGORIES) as (keyof typeof EMOJI_CATEGORIES)[]).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedEmojiCategory(category)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    selectedEmojiCategory === category 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
              {EMOJI_CATEGORIES[selectedEmojiCategory].map((emoji) => (
                <motion.button
                  key={emoji}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleEmojiSelect(emoji)}
                  className="text-xl p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  {emoji}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : showDMFeatures ? (
          <motion.div
            key="dm-features"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm flex items-center gap-2">
                <VybeMiniIcon size={16} showSparkles />
                DM Features
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowDMFeatures(false)}
                className="h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Premium upgrade prompt */}
            <AnimatePresence>
              {showPremiumPrompt && !isPremium && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 mb-2">
                    <Crown className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">Premium Feature</p>
                      <p className="text-[10px] text-muted-foreground">Unlock this and 40+ perks</p>
                    </div>
                    <UpgradeButton label="Upgrade" size="sm" variant="default" className="text-xs h-7 px-3" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-2">
              {dmFeatures.map(({ icon: Icon, label, description, onClick, color, premium }) => (
                <motion.button
                  key={label}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClick}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left",
                    premium && !isPremium && "opacity-70"
                  )}
                >
                  <div className={cn("p-2 rounded-lg bg-background relative", color)}>
                    <Icon className="h-5 w-5" />
                    {premium && !isPremium && (
                      <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                        <Lock className="h-2 w-2 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      {label}
                      {premium && !isPremium && (
                        <Crown className="h-3 w-3 text-primary" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
            className="space-y-4"
          >
            {/* Media Grid */}
            <div className="grid grid-cols-3 gap-3">
              {mediaItems.map(({ icon: Icon, label, onClick, color, bg }) => (
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
                    <div className={cn("p-2 rounded-lg", bg)}>
                      <Icon className={cn("h-5 w-5", color)} />
                    </div>
                  )}
                  <span className="text-xs font-medium">{label}</span>
                </motion.button>
              ))}
            </div>

            {/* DM Features Toggle */}
            {hasDMFeatures && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowDMFeatures(true)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <VybeMiniIcon size={20} showSparkles />
                  <span className="font-medium text-sm">DM Features</span>
                </div>
                <ChevronRight className="h-4 w-4 text-primary" />
              </motion.button>
            )}
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
            variant="outline"
            size="icon"
            disabled={disabled || isUploading}
            className="flex-shrink-0 border-primary/50 hover:bg-primary/10 hover:border-primary"
          >
            <motion.div
              animate={isOpen ? { rotate: 45 } : { rotate: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <Plus className="h-5 w-5 text-primary" />
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
          variant="outline"
          size="icon"
          disabled={disabled || isUploading}
          className="flex-shrink-0 border-primary/50 hover:bg-primary/10 hover:border-primary"
        >
          <motion.div
            animate={isOpen ? { rotate: 45 } : { rotate: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            <Plus className="h-5 w-5 text-primary" />
          </motion.div>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="start" 
        className="w-80 p-0"
        sideOffset={8}
      >
        {ToyboxContent}
      </PopoverContent>
    </Popover>
  );
});
