/**
 * SafetyFilterRequestButton — Toybox option for toggling AI safety filter.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { ShieldOff, Shield, ChevronRight, Lock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SafetyFilterRequestButtonProps {
  isSafetyDisabled: boolean;
  hasPendingRequest: boolean;
  isUnder13: boolean;
  isRequester: boolean;
  onRequestDisable: () => void;
  onReEnable: () => void;
}

export const SafetyFilterRequestButton = memo(function SafetyFilterRequestButton({
  isSafetyDisabled,
  hasPendingRequest,
  isUnder13,
  isRequester,
  onRequestDisable,
  onReEnable,
}: SafetyFilterRequestButtonProps) {
  const handleClick = () => {
    if (isUnder13) return;
    if (isSafetyDisabled) {
      onReEnable();
    } else if (!hasPendingRequest) {
      onRequestDisable();
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      disabled={isUnder13}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-left",
        isUnder13 && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className={cn(
        "p-2 rounded-lg bg-background relative",
        isSafetyDisabled ? "text-amber-500" : "text-emerald-500"
      )}>
        {isSafetyDisabled ? (
          <ShieldOff className="h-5 w-5" />
        ) : (
          <Shield className="h-5 w-5" />
        )}
        {isUnder13 && (
          <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-2 w-2 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">
          {isSafetyDisabled ? 'Re-enable AI Filter' : 'Disable AI Filter'}
        </p>
        <p className="text-xs text-muted-foreground">
          {isUnder13 
            ? 'Locked for your age group 🔒'
            : hasPendingRequest
              ? (isRequester ? 'Waiting for response...' : 'Request pending')
              : isSafetyDisabled
                ? 'AI filters are off for this chat'
                : 'Both users must agree ⚡'
          }
        </p>
      </div>
      {!isUnder13 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </motion.button>
  );
});
