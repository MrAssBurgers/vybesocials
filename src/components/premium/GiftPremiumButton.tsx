import { useState } from 'react';
import { Gift, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useAuth } from '@/lib/auth';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createPremiumGift, listPremiumGifts, revokePremiumGift, isPremiumAccountCurrent } from '@/lib/premiumGiftService';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface GiftPremiumButtonProps { targetUserId: string; targetUsername: string }
export function GiftPremiumButton(props: GiftPremiumButtonProps) {
  const { canManageGifts } = usePremiumStatus();
  const { user } = useAuth();
  return canManageGifts && user && props.targetUserId !== user.id
    ? <AccountGiftButton key={`${user.id}:${props.targetUserId}`} {...props} uid={user.id} /> : null;
}
function AccountGiftButton({ targetUserId, targetUsername, uid }: GiftPremiumButtonProps & { uid: string }) {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryKey = ['gifted-premium-check', uid, targetUserId];
  const { data: existingGift, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => (await listPremiumGifts(uid, [targetUserId])).find(g => !g.is_expired && g.status !== 'revoked') || null,
  });
  const handleChange = async () => {
    if (loading || !isPremiumAccountCurrent(uid)) return;
    setLoading(true);
    try {
      if (existingGift) await revokePremiumGift(uid, targetUserId, existingGift.id);
      else await createPremiumGift(uid, targetUserId, crypto.randomUUID());
      if (!isPremiumAccountCurrent(uid)) return;
      toast.success(existingGift ? `Gift revoked from @${targetUsername}` : `Gift ready for @${targetUsername} to review in Settings.`);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['recent-premium-gifts', uid] });
    } catch (err) {
      if (isPremiumAccountCurrent(uid)) toast.error(err instanceof Error ? err.message : 'Could not update this gift.');
    } finally { setLoading(false); setShowConfirm(false); }
  };
  if (error) return <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry gift status</Button>;
  return <>
    <Button variant="outline" size="sm" onClick={() => setShowConfirm(true)} disabled={loading || isLoading} className="gap-1.5">
      {loading || isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : existingGift ? <X className="h-3.5 w-3.5" /> : <Gift className="h-3.5 w-3.5" />}
      {existingGift ? (existingGift.status === 'pending' ? 'Revoke pending gift' : 'Revoke Premium') : 'Gift Premium'}
    </Button>
    <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{existingGift ? 'Revoke gift' : 'Gift Premium'}</AlertDialogTitle>
          <AlertDialogDescription>
            {existingGift ? `Revoke the gift for @${targetUsername}?` : `Give @${targetUsername} a Premium cosmetic preview? They can accept it in Settings. Core features remain free for everyone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleChange} disabled={loading}>{existingGift ? 'Revoke gift' : 'Send gift'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
