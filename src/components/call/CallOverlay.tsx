import { useCallOverlay } from './CallOverlayContext';
import { X, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export function CallOverlay() {
  const { state, closeCall } = useCallOverlay();

  return (
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                {state.callType === 'video' ? (
                  <Video className="w-5 h-5 text-primary" />
                ) : (
                  <Phone className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {state.callType === 'video' ? 'Video Call' : 'Audio Call'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Connecting...
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeCall}
              className="rounded-full hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Call content placeholder - Daily iframe will go here */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                {state.callType === 'video' ? (
                  <Video className="w-12 h-12 text-primary" />
                ) : (
                  <Phone className="w-12 h-12 text-primary" />
                )}
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">
                  Call Ready
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Room: {state.roomName}
                </p>
              </div>
            </div>
          </div>

          {/* Footer controls placeholder */}
          <div className="p-6 flex justify-center">
            <Button
              variant="destructive"
              size="lg"
              onClick={closeCall}
              className="rounded-full px-8"
            >
              <Phone className="w-5 h-5 mr-2 rotate-[135deg]" />
              End Call
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
