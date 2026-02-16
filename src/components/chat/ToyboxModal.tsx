import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Image, Camera, Mic, Smile, MapPin, 
  Clock, Flame, Gift, Sparkles, Zap, Crown, Lock, Laugh
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { UpgradeButton } from '@/components/premium/UpgradeButton';

interface ToyboxItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  color: string;
  action: () => void;
  premium?: boolean;
  description?: string;
}

interface ToyboxModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPhoto?: () => void;
  onSelectCamera?: () => void;
  onSelectVoice?: () => void;
  onSelectGif?: () => void;
  onSelectLocation?: () => void;
  onSelectVanish?: () => void;
  onSelectSchedule?: () => void;
  onSelectEffect?: () => void;
  onSelectMemeBan?: () => void;
}

export function ToyboxModal({
  open,
  onOpenChange,
  onSelectPhoto,
  onSelectCamera,
  onSelectVoice,
  onSelectGif,
  onSelectLocation,
  onSelectVanish,
  onSelectSchedule,
  onSelectEffect,
  onSelectMemeBan,
}: ToyboxModalProps) {
  const { isPremium } = usePremiumStatus();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handlePremiumAction = useCallback((action?: () => void) => {
    if (isPremium) {
      action?.();
      onOpenChange(false);
    } else {
      setShowUpgrade(true);
    }
  }, [isPremium, onOpenChange]);

  const items: ToyboxItem[] = [
    {
      id: 'photo',
      icon: <Image className="h-6 w-6" />,
      label: 'Photo',
      color: 'bg-blue-500',
      action: () => { onSelectPhoto?.(); onOpenChange(false); },
    },
    {
      id: 'camera',
      icon: <Camera className="h-6 w-6" />,
      label: 'Camera',
      color: 'bg-purple-500',
      action: () => { onSelectCamera?.(); onOpenChange(false); },
    },
    {
      id: 'gif',
      icon: <Smile className="h-6 w-6" />,
      label: 'GIF',
      color: 'bg-green-500',
      action: () => { onSelectGif?.(); onOpenChange(false); },
    },
    {
      id: 'location',
      icon: <MapPin className="h-6 w-6" />,
      label: 'Location',
      color: 'bg-orange-500',
      action: () => { onSelectLocation?.(); onOpenChange(false); },
    },
    {
      id: 'voice',
      icon: <Mic className="h-6 w-6" />,
      label: 'Voice',
      color: 'bg-red-500',
      premium: true,
      description: 'Send voice messages',
      action: () => handlePremiumAction(onSelectVoice),
    },
    {
      id: 'vanish',
      icon: <Flame className="h-6 w-6" />,
      label: 'Vanish',
      color: 'bg-pink-500',
      premium: true,
      description: 'Self-destructing messages',
      action: () => handlePremiumAction(onSelectVanish),
    },
    {
      id: 'schedule',
      icon: <Clock className="h-6 w-6" />,
      label: 'Schedule',
      color: 'bg-cyan-500',
      premium: true,
      description: 'Schedule messages',
      action: () => handlePremiumAction(onSelectSchedule),
    },
    {
      id: 'effect',
      icon: <Sparkles className="h-6 w-6" />,
      label: 'Effects',
      color: 'bg-yellow-500',
      premium: true,
      description: 'Message effects & animations',
      action: () => handlePremiumAction(onSelectEffect),
    },
    {
      id: 'memeban',
      icon: <Laugh className="h-6 w-6" />,
      label: 'Meme Ban',
      color: 'bg-gradient-to-br from-amber-500 to-orange-600',
      premium: true,
      description: 'Ban users with memes (max 5 min)',
      action: () => handlePremiumAction(onSelectMemeBan),
    },
  ];

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
      setShowUpgrade(false);
    }
  }, [onOpenChange]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          className="w-[calc(100%-32px)] max-w-sm bg-card rounded-3xl shadow-2xl border border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Toybox</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => { onOpenChange(false); setShowUpgrade(false); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Upgrade prompt */}
          <AnimatePresence>
            {showUpgrade && !isPremium && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pt-3 pb-2">
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                    <Crown className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">Premium Feature</p>
                      <p className="text-[10px] text-muted-foreground">Unlock this and 40+ other perks</p>
                    </div>
                    <UpgradeButton label="Upgrade" size="sm" variant="default" className="text-xs h-7 px-3" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Items grid */}
          <div className="p-4">
            <div className="grid grid-cols-4 gap-3">
              {items.map((item, index) => {
                const isLocked = item.premium && !isPremium;
                return (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={item.action}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-muted/50 transition-colors active:scale-95 relative"
                  >
                    <div className={cn(
                      "h-12 w-12 rounded-full flex items-center justify-center text-white relative",
                      item.color,
                      isLocked && "opacity-40 grayscale"
                    )}>
                      {item.icon}
                      {isLocked && (
                        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-muted border border-border flex items-center justify-center shadow-md">
                          <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                        </div>
                      )}
                      {item.premium && isPremium && (
                        <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                          <Crown className="h-2.5 w-2.5 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <span className={cn(
                      "text-xs font-medium",
                      isLocked ? "text-muted-foreground/50" : "text-muted-foreground"
                    )}>
                      {item.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Quick actions footer */}
          <div className="p-4 pt-0">
            <div className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-muted/50">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                Tap an option to add to your message
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
