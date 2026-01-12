import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Image, Camera, Mic, Smile, MapPin, 
  Clock, Flame, Gift, Sparkles, Zap 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ToyboxItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  color: string;
  action: () => void;
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
}: ToyboxModalProps) {
  const items: ToyboxItem[] = [
    {
      id: 'photo',
      icon: <Image className="h-6 w-6" />,
      label: 'Photo',
      color: 'bg-blue-500',
      action: () => {
        onSelectPhoto?.();
        onOpenChange(false);
      },
    },
    {
      id: 'camera',
      icon: <Camera className="h-6 w-6" />,
      label: 'Camera',
      color: 'bg-purple-500',
      action: () => {
        onSelectCamera?.();
        onOpenChange(false);
      },
    },
    {
      id: 'voice',
      icon: <Mic className="h-6 w-6" />,
      label: 'Voice',
      color: 'bg-red-500',
      action: () => {
        onSelectVoice?.();
        onOpenChange(false);
      },
    },
    {
      id: 'gif',
      icon: <Smile className="h-6 w-6" />,
      label: 'GIF',
      color: 'bg-green-500',
      action: () => {
        onSelectGif?.();
        onOpenChange(false);
      },
    },
    {
      id: 'location',
      icon: <MapPin className="h-6 w-6" />,
      label: 'Location',
      color: 'bg-orange-500',
      action: () => {
        onSelectLocation?.();
        onOpenChange(false);
      },
    },
    {
      id: 'vanish',
      icon: <Flame className="h-6 w-6" />,
      label: 'Vanish',
      color: 'bg-pink-500',
      action: () => {
        onSelectVanish?.();
        onOpenChange(false);
      },
    },
    {
      id: 'schedule',
      icon: <Clock className="h-6 w-6" />,
      label: 'Schedule',
      color: 'bg-cyan-500',
      action: () => {
        onSelectSchedule?.();
        onOpenChange(false);
      },
    },
    {
      id: 'effect',
      icon: <Sparkles className="h-6 w-6" />,
      label: 'Effects',
      color: 'bg-yellow-500',
      action: () => {
        onSelectEffect?.();
        onOpenChange(false);
      },
    },
  ];

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  }, [onOpenChange]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {/* 
        CRITICAL: Fixed positioning independent of scroll/keyboard.
        This modal is absolutely locked to the viewport center.
      */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
        // Let touch events through - don't block scrolling globally
      >
        {/* Modal container - absolutely centered and locked */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          // FIXED: Use fixed positioning with transform centering
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          className="w-[calc(100%-32px)] max-w-sm bg-card rounded-3xl shadow-2xl border border-border overflow-hidden"
          // Stop propagation to prevent closing when clicking inside
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
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Items grid */}
          <div className="p-4">
            <div className="grid grid-cols-4 gap-3">
              {items.map((item, index) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={item.action}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-muted/50 transition-colors active:scale-95"
                >
                  <div className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center text-white",
                    item.color
                  )}>
                    {item.icon}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </span>
                </motion.button>
              ))}
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
