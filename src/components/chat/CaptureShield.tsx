import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { blackoutChatScreenNow } from '@/lib/chatScreenShield';

interface CaptureShieldProps {
  captured: boolean;
  showBadge?: boolean;
}

/**
 * Screenshot protection for media viewers — full black frame on capture attempt.
 */
export function CaptureShield({ captured, showBadge = true }: CaptureShieldProps) {
  useEffect(() => {
    if (captured) blackoutChatScreenNow();
  }, [captured]);

  return (
    <>
      <AnimatePresence>
        {captured && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 pointer-events-none z-[100] bg-black"
          />
        )}
      </AnimatePresence>

      {showBadge && (
        <div className="absolute top-3 right-14 z-30">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-1.5 rounded-full bg-black/40 backdrop-blur-sm">
                  <Shield className="h-4 w-4 text-white/70" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Screenshots blocked in chat
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </>
  );
}
