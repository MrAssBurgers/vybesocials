import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Gift, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { acceptPremiumGift, capturePremiumAccountGuard } from '@/lib/premiumGiftService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

interface PremiumGiftNotificationProps { giftId: string; gifterUsername: string; onDismiss: () => void }
/** Opened only by the recipient's Review gift button in Settings. */
export function PremiumGiftNotification(props: PremiumGiftNotificationProps) {
  const { user } = useAuth();
  const session = useReportAccountSession();
  const guard = useMemo(() => capturePremiumAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  return user && session.uid === user.id ? <AccountGiftReview key={`${user.id}:${session.epoch}:${props.giftId}`} {...props} uid={user.id} guard={guard} /> : null;
}
function AccountGiftReview({ giftId, gifterUsername, onDismiss, uid, guard }: PremiumGiftNotificationProps & { uid: string; guard: () => void }) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const current = () => { try { guard(); return true; } catch { return false; } };
  const handleAccept = async () => {
    if (accepting || !current()) return;
    setAccepting(true);
    try {
      await acceptPremiumGift(uid, giftId);
      if (!current()) return;
      setAccepted(true);
      void queryClient.invalidateQueries({ queryKey: ['db-premium-status', uid] });
    } catch (err) {
      if (current()) toast.error(err instanceof Error ? err.message : 'Could not accept this gift.');
    } finally { if (current()) setAccepting(false); }
  };
  const dismiss = () => {
    if (accepting) return;
    if (!current()) return;
    void queryClient.invalidateQueries({ queryKey: ['pending-premium-gift', uid] });
    onDismiss();
  };
  return <Dialog open onOpenChange={open => { if (!open) dismiss(); }}>
    <DialogContent className="max-w-sm rounded-3xl text-center">
      <motion.div initial={reducedMotion ? false : { scale: 0.85 }} animate={{ scale: 1 }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        {accepted ? <Check className="h-8 w-8" /> : <Gift className="h-8 w-8" />}
      </motion.div>
      <DialogHeader>
        <DialogTitle>{accepted ? 'Gift accepted' : 'A Premium gift for you'}</DialogTitle>
        <DialogDescription>{accepted ? 'Your Premium cosmetic preview is ready. Core features remain free for everyone.' : `@${gifterUsername} sent you a Premium cosmetic preview. Accept it whenever you are ready.`}</DialogDescription>
      </DialogHeader>
      {accepted ? <Button onClick={dismiss}>Done</Button> : <>
        <Button onClick={handleAccept} disabled={accepting}>{accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Accept gift</Button>
        <Button variant="ghost" onClick={dismiss} disabled={accepting}>Maybe later</Button>
      </>}
    </DialogContent>
  </Dialog>;
}
