import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Eye, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReceiverImageFilterProps {
  imageUrl: string;
  flagReason: string;
  canToggleOff: boolean; // false for under-13
  onReveal: () => void;
  onKeepBlocked: () => void;
  onDisableFilter?: () => void;
}

export const ReceiverImageFilter = memo(function ReceiverImageFilter({
  imageUrl,
  flagReason,
  canToggleOff,
  onReveal,
  onKeepBlocked,
  onDisableFilter,
}: ReceiverImageFilterProps) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <img
        src={imageUrl}
        alt="Revealed image"
        className="rounded-xl max-w-full max-h-52 sm:max-h-64 object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-xl overflow-hidden max-w-[220px]"
    >
      {/* Blurred background */}
      <div className="relative w-full h-40 sm:h-48">
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover blur-[30px] scale-110 brightness-50"
        />
        {/* Overlay content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
          <div className="p-2 rounded-full bg-destructive/20 backdrop-blur-sm">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-white">Content Filtered</p>
            <p className="text-[10px] text-white/70 mt-0.5">
              Flagged: {flagReason}
            </p>
          </div>
          
          <div className="flex gap-2 mt-1">
            {canToggleOff && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => {
                  setRevealed(true);
                  onReveal();
                }}
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={onKeepBlocked}
            >
              Keep blocked
            </Button>
          </div>

          {canToggleOff && onDisableFilter && (
            <button
              onClick={onDisableFilter}
              className="text-[9px] text-white/50 hover:text-white/80 transition-colors flex items-center gap-1 mt-1"
            >
              <ShieldOff className="h-2.5 w-2.5" />
              Turn off filter
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});
