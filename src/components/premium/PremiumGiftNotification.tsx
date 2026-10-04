import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Gift, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { acceptPremiumGift, isPremiumAccountCurrent } from '@/lib/premiumGiftService';

interface PremiumGiftNotificationProps { giftId: string; gifterUsername: string; onDismiss: () => void }
/** Opened only by the recipient's Review gift button in Settings. */
export function PremiumGiftNotification(props: PremiumGiftNotificationProps) {
  const { user } = useAuth();
  return user ? <AccountGiftReview key={`${user.id}:${props.giftId}`} {...props} uid={user.id} /> : null;
}
function AccountGiftReview({ giftId, gifterUsername, onDismiss, uid }: PremiumGiftNotificationProps & { uid: string }) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const handleAccept = async () => {
    if (accepting || !isPremiumAccountCurrent(uid)) return;
    setAccepting(true);
    try {
      await acceptPremiumGift(uid, giftId);
      if (!isPremiumAccountCurrent(uid)) return;
      setAccepted(true);
      void queryClient.invalidateQueries({ queryKey: ['db-premium-status', uid] });
    } catch (err) {
      if (isPremiumAccountCurrent(uid)) toast.error(err instanceof Error ? err.message : 'Could not accept this gift.');
    } finally { setAccepting(false); }
  };
  const dismiss = () => {
    if (accepting) return;
    if (isPremiumAccountCurrent(uid)) void queryClient.invalidateQueries({ queryKey: ['pending-premium-gift', uid] });
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
