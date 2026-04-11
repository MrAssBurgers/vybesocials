/**
 * SafetyFilterRequest — In-chat popup for accepting/declining AI filter disable requests.
 */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SafetyFilterRequestProps {
  visible: boolean;
  requesterName: string;
  isGroupChat?: boolean;
  isUnder13: boolean;
  onAccept: () => void;
  onDecline: () => void;
  isLoading?: boolean;
}

export const SafetyFilterRequest = memo(function SafetyFilterRequest({
  visible,
  requesterName,
  isGroupChat,
  isUnder13,
  onAccept,
  onDecline,
  isLoading,
}: SafetyFilterRequestProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="mx-4 my-2 p-4 rounded-2xl bg-card border border-border shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10">
              <ShieldOff className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                AI Filter Request
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium text-foreground">{requesterName}</span>
                {' '}wants to disable AI content filters for this {isGroupChat ? 'group' : 'chat'}.
              </p>

              {isUnder13 ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                  <Shield className="h-3.5 w-3.5" />
                  <span>AI filters are always on for your account</span>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-muted-foreground">
                      Disabling filters means you may see content that could be inappropriate or explicit. You can re-enable filters at any time.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs flex-1"
                      onClick={onDecline}
                      disabled={isLoading}
                    >
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={onAccept}
                      disabled={isLoading}
                    >
                      Accept
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
