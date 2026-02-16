import { motion } from 'framer-motion';
import { Shield, Sparkles } from 'lucide-react';
import { useFoundingStatus } from '@/hooks/useGrowth';
import { Progress } from '@/components/ui/progress';

export function FoundingCountdown() {
  const { data: status, isLoading } = useFoundingStatus();

  if (isLoading || !status) return null;

  const percentClaimed = (status.claimedSlots / status.maxSlots) * 100;

  // Don't show if program is over and user isn't a founder
  if (!status.isActive && !status.userIsFounder) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card rounded-2xl p-5 space-y-3 border border-primary/20"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm flex items-center gap-1.5">
            🏛️ Founding Member
            {status.userIsFounder && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                YOU
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {status.isActive
              ? `Only ${status.remainingSlots} spots left of ${status.maxSlots}`
              : 'Program closed — forever limited'}
          </p>
        </div>
        {status.isActive && (
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="h-5 w-5 text-primary" />
          </motion.div>
        )}
      </div>

      <div className="space-y-1">
        <Progress value={percentClaimed} className="h-1.5" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{status.claimedSlots} claimed</span>
          <span>{status.maxSlots} total</span>
        </div>
      </div>
    </motion.div>
  );
}
