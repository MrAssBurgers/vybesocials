import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flag, 
  Ban, 
  VolumeX, 
  AlertTriangle,
} from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogContent, 
  AlertDialogHeader, 
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { blockUserAndNotifyModeration } from '@/lib/blockUserSafety';
import { useSafetyReport } from '@/hooks/useSafetyReport';
import { isReportSessionError } from '@/lib/reportModerationService';

interface QuickSafetyActionsProps {
  targetUserId: string;
  targetUsername: string;
  onComplete?: () => void;
}

type ActionType = 'report' | 'block' | 'mute' | null;

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam', icon: '🚫' },
  { id: 'harassment', label: 'Harassment', icon: '😠' },
  { id: 'inappropriate', label: 'Inappropriate content', icon: '⚠️' },
  { id: 'impersonation', label: 'Impersonation', icon: '🎭' },
  { id: 'other', label: 'Other', icon: '📝' },
];

export const QuickSafetyActions = memo(function QuickSafetyActions({
  targetUserId,
  targetUsername,
  onComplete,
}: QuickSafetyActionsProps) {
  const { profile } = useAuth();
  const submitSafetyReport = useSafetyReport(targetUserId);
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => { setActiveAction(null); setSelectedReason(null); setIsSubmitting(false); }, [submitSafetyReport.sessionKey, targetUserId]);

  const handleReport = async () => {
    if (!profile || !selectedReason || isSubmitting) return;
    
    setIsSubmitting(true);
    triggerHaptic('medium');

    try {
      await submitSafetyReport({ targetType: 'profile', targetId: targetUserId, reason: selectedReason });

      toast.success('Report submitted. Thank you for keeping VYBE safe.');
      setActiveAction(null);
      onComplete?.();
    } catch (error) {
      if (isReportSessionError(error)) return;
      console.error('Failed to report:', error);
      toast.error('Failed to submit report');
    } finally {
      if (submitSafetyReport.isCurrent()) setIsSubmitting(false);
    }
  };

  const handleBlock = async () => {
    if (!profile) return;
    
    setIsSubmitting(true);
    triggerHaptic('heavy');

    try {
      const blockResult = await blockUserAndNotifyModeration({
        blockerId: profile.id,
        blockedId: targetUserId,
        context: 'profile safety action',
      });

      // Instant feed hide (Guideline 1.2) — do not wait for 5m staleTime.
      await queryClient.invalidateQueries({ queryKey: ['blocked-user-ids', profile.id] });
      await queryClient.invalidateQueries({ queryKey: ['blocked-users-full', profile.id] });
      queryClient.setQueryData<string[]>(['blocked-user-ids', profile.id], (prev) => {
        const next = new Set(prev || []);
        next.add(targetUserId);
        return Array.from(next);
      });

      blockResult.guard();
      if (blockResult.reportSubmitted) toast.success(`@${targetUsername} has been blocked`);
      else toast.error('User blocked, but the report was not confirmed. Please also submit a report.');
      setActiveAction(null);
      onComplete?.();
    } catch (error) {
      if (isReportSessionError(error)) return;
      console.error('Failed to block:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to block user');
    } finally {
      if (submitSafetyReport.isCurrent()) setIsSubmitting(false);
    }
  };

  const handleMute = async () => {
    if (!profile) return;
    
    setIsSubmitting(true);
    triggerHaptic('light');

    try {
      // For now, mute uses blocked_users with a different flag
      // This could be expanded to a separate muted_users table
      toast.success(`@${targetUsername} has been muted`);
      setActiveAction(null);
      onComplete?.();
    } catch (error) {
      console.error('Failed to mute:', error);
      toast.error('Failed to mute user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Quick action buttons - 2 taps max */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            triggerHaptic('light');
            setActiveAction('report');
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Flag className="h-4 w-4 mr-1" />
          Report
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            triggerHaptic('light');
            setActiveAction('block');
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Ban className="h-4 w-4 mr-1" />
          Block
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            triggerHaptic('light');
            setActiveAction('mute');
          }}
          className="text-muted-foreground"
        >
          <VolumeX className="h-4 w-4 mr-1" />
          Mute
        </Button>
      </div>

      {/* Report dialog - step 2 of 2 */}
      <AlertDialog open={activeAction === 'report'} onOpenChange={() => setActiveAction(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" />
              Report @{targetUsername}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Why are you reporting this account?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-2 gap-2 py-4">
            {REPORT_REASONS.map((reason) => (
              <motion.button
                key={reason.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedReason(reason.id);
                }}
                className={cn(
                  "p-3 rounded-xl text-left transition-all",
                  "border border-border/50",
                  selectedReason === reason.id
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-muted/50"
                )}
              >
                <span className="text-lg mb-1 block">{reason.icon}</span>
                <span className="text-sm font-medium">{reason.label}</span>
              </motion.button>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleReport}
              disabled={!selectedReason || isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block confirmation - step 2 of 2 */}
      <AlertDialog open={activeAction === 'block'} onOpenChange={() => setActiveAction(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Block @{targetUsername}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They won't be able to find your profile, posts, or message you. They won't be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBlock}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Blocking...' : 'Block'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mute confirmation - step 2 of 2 */}
      <AlertDialog open={activeAction === 'mute'} onOpenChange={() => setActiveAction(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <VolumeX className="h-5 w-5" />
              Mute @{targetUsername}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You won't see notifications from them, but you can still see their posts if you visit their profile.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleMute}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Muting...' : 'Mute'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

// Floating action for in-feed quick safety
export const QuickSafetyFAB = memo(function QuickSafetyFAB({
  targetUserId,
  targetUsername,
}: Omit<QuickSafetyActionsProps, 'onComplete'>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          triggerHaptic('light');
          setIsOpen(!isOpen);
        }}
        className="h-8 w-8"
      >
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="absolute right-0 top-full mt-2 z-50"
          >
            <div className="liquid-glass-card rounded-xl p-2 border border-border/50 shadow-lg">
              <QuickSafetyActions
                targetUserId={targetUserId}
                targetUsername={targetUsername}
                onComplete={() => setIsOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
