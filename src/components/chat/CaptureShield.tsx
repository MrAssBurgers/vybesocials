import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CaptureShieldProps {
  captured: boolean;
  showBadge?: boolean;
}

/**
 * Shield icon + red flash overlay for media viewers when capture is detected
 */
export function CaptureShield({ captured, showBadge = true }: CaptureShieldProps) {
  return (
    <>
      {/* Red flash overlay on capture */}
      <AnimatePresence>
        {captured && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ duration: 0.6, times: [0, 0.2, 1] }}
            className="absolute inset-0 pointer-events-none z-50 border-4 border-red-500/60 rounded-lg"
            style={{ boxShadow: 'inset 0 0 40px rgba(239, 68, 68, 0.3)' }}
          />
        )}
      </AnimatePresence>

      {/* Shield badge */}
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
                Screenshots notify the sender
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </>
  );
}
