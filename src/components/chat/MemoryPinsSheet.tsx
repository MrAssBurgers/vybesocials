import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { 
  Pin, 
  Heart,
  X,
} from 'lucide-react';
import { useMessagePins } from '@/hooks/useDMSettings';
import { Message } from '@/hooks/useMessages';
import { formatDistanceToNow } from 'date-fns';

interface MemoryPinsSheetProps {
  conversationId: string;
  messages: Message[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryPinsSheet({ conversationId, messages, open, onOpenChange }: MemoryPinsSheetProps) {
  const { pins, unpinMessage } = useMessagePins(conversationId);

  const pinnedMessages = pins.map(pin => {
    const message = messages.find(m => m.id === pin.message_id);
    return { ...pin, message };
  }).filter(p => p.message);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            Memory Pins
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Your private collection of special moments 💕
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {pinnedMessages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No pinned memories yet</p>
              <p className="text-xs mt-1">Long-press any message to pin it!</p>
            </div>
          ) : (
            <AnimatePresence>
              {pinnedMessages.map((pin) => (
                <motion.div
                  key={pin.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="relative p-3 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-start gap-2">
                    <Pin className="h-4 w-4 text-pink-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      {pin.label && (
                        <p className="text-xs text-pink-500 font-medium mb-1">
                          {pin.label}
                        </p>
                      )}
                      <p className="text-sm">
                        {pin.message?.content || (pin.message?.media_type === 'image' ? '📷 Photo' : '🎤 Voice')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(pin.message!.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => unpinMessage(pin.message_id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
