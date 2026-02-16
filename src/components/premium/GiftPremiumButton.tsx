import { useState } from 'react';
import { Gift, Crown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface GiftPremiumButtonProps {
  targetUserId: string; // auth user id (profile.user_id)
  targetUsername: string;
}

export function GiftPremiumButton({ targetUserId, targetUsername }: GiftPremiumButtonProps) {
  const { isOwner } = usePremiumStatus();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if target already has gifted premium
  const { data: existingGift } = useQuery({
    queryKey: ['gifted-premium-check', targetUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from('gifted_premium')
        .select('id, is_active')
        .eq('user_id', targetUserId)
        .maybeSingle();
      return data;
    },
    enabled: isOwner && !!targetUserId,
  });

  if (!isOwner || targetUserId === user?.id) return null;

  const hasActiveGift = existingGift?.is_active && existingGift?.id;

  const handleGift = async () => {
    setLoading(true);
    try {
      // Remove any previously revoked gift so we can re-gift
      await supabase
        .from('gifted_premium')
        .delete()
        .eq('user_id', targetUserId)
        .not('revoked_at', 'is', null);

      const { error } = await supabase
        .from('gifted_premium')
        .insert({
          user_id: targetUserId,
          gifted_by: user!.id,
          is_active: false,
          status: 'pending',
        });

      if (error) throw error;

      toast.success(`Premium gift sent to @${targetUsername}! They'll get a popup to accept it 🎁`);
      queryClient.invalidateQueries({ queryKey: ['gifted-premium-check', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['db-premium-status'] });
    } catch (err: any) {
      if (err.code === '23505') {
        toast.error('This user already has gifted premium');
      } else {
        toast.error('Failed to gift premium');
      }
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const handleRevoke = async () => {
    if (!existingGift?.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('gifted_premium')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq('id', existingGift.id);

      if (error) throw error;

      toast.success(`Premium revoked from @${targetUsername}`);
      queryClient.invalidateQueries({ queryKey: ['gifted-premium-check', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['db-premium-status'] });
    } catch {
      toast.error('Failed to revoke premium');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {hasActiveGift ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRevoke}
          disabled={loading}
          className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Revoke Premium
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfirm(true)}
          disabled={loading}
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
          Gift Premium
        </Button>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Gift Premium
            </AlertDialogTitle>
            <AlertDialogDescription>
              Gift free VYBE Premium to <strong>@{targetUsername}</strong>? They'll get all premium features at no cost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGift} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
              Gift Premium
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
