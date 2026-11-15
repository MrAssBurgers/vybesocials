import { useMemo, useState } from 'react';
import { Crown, Gift, Loader2, Search, X, Check, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { createPremiumGift, revokePremiumGift, listPremiumGifts, capturePremiumAccountGuard } from '@/lib/premiumGiftService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
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

interface SearchResult {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  hasPremium: boolean;
}

export function GiftPremiumSection() {
  const { user } = useAuth();
  const { canManageGifts } = usePremiumStatus();
  const session = useReportAccountSession();
  const guard = useMemo(() => capturePremiumAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  return user && canManageGifts && session.uid === user.id ? <GiftPremiumSectionForAccount key={`${user.id}:${session.epoch}`} uid={user.id} epoch={session.epoch} guard={guard} /> : null;
}

function GiftPremiumSectionForAccount({ uid, epoch, guard }: { uid: string; epoch: number; guard: () => void }) {
  const current = () => { try { guard(); return true; } catch { return false; } };
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [gifting, setGifting] = useState(false);

  // Search users
  const { data: results = [], isLoading: searching, error: searchError } = useQuery({
    queryKey: ['gift-premium-search', uid, epoch, search],
    queryFn: async () => {
      if (search.length < 2) return [];
      guard();
      const { data, error } = await db
        .from('profiles')
        .select('id, user_id, username, display_name, avatar_url')
        .neq('user_id', uid)
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .limit(8);

      guard(); if (error) throw error;
      if (!data || data.length === 0) return [];

      // Check which ones already have premium
      const userIds = data.map(d => d.user_id);
      const giftedData = await listPremiumGifts(uid, userIds);
      guard();
      const giftedMap = new Map(giftedData.filter(g => !g.is_expired && g.status !== 'revoked').map(g => [g.user_id, g]));

      return data.map(d => ({
        id: d.id,
        user_id: d.user_id,
        username: d.username,
        display_name: d.display_name,
        avatar_url: d.avatar_url,
        hasPremium: giftedMap.has(d.user_id) && (giftedMap.get(d.user_id)?.is_active || giftedMap.get(d.user_id)?.status === 'pending'),
      }));
    },
    enabled: search.length >= 2,
    staleTime: 10_000,
  });

  // Recent gifts
  const { data: recentGifts = [], error: recentError, refetch: retryRecent } = useQuery({
    queryKey: ['recent-premium-gifts', uid, epoch],
    queryFn: async () => {
      guard();
      const data = (await listPremiumGifts(uid)).filter(g => !g.is_expired && g.status !== 'revoked').slice(0, 5);
      guard();

      if (!data || data.length === 0) return [];

      const userIds = data.map(d => d.user_id);
      const { data: profiles, error } = await db
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);
      if (error) throw error;
      guard();

      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));

      return data.map(g => ({
        ...g,
        username: profileMap.get(g.user_id)?.username || 'Unknown',
        avatar_url: profileMap.get(g.user_id)?.avatar_url,
      }));
    },
  });

  const handleGift = async () => {
    if (!selectedUser || !current()) return;
    setGifting(true);
    try {
      await createPremiumGift(uid, selectedUser.user_id, crypto.randomUUID());
      if (!current()) return;
      toast.success(`Gift ready for @${selectedUser.username} to review in Settings.`);
      setSelectedUser(null);
      setSearch('');
      queryClient.invalidateQueries({ queryKey: ['recent-premium-gifts'] });
      queryClient.invalidateQueries({ queryKey: ['gift-premium-search'] });
    } catch (err: any) {
      if (current()) toast.error(err.message || 'Failed to gift premium');
    } finally {
      if (current()) { setGifting(false); setConfirmOpen(false); }
    }
  };

  const handleRevoke = async (giftId: string, recipientUid: string, username: string) => {
    try {
      guard();
      await revokePremiumGift(uid, recipientUid, giftId);
      if (!current()) return;
      toast.success(`Premium revoked from @${username}`);
      queryClient.invalidateQueries({ queryKey: ['recent-premium-gifts'] });
      queryClient.invalidateQueries({ queryKey: ['db-premium-status'] });
    } catch {
      if (current()) toast.error('Failed to revoke');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="liquid-glass-card p-4 sm:p-5 space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-accent/15 flex items-center justify-center">
          <Gift className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">Gift Premium</h2>
          <p className="text-[11px] text-muted-foreground">Send VYBE Premium to any user for free</p>
        </div>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setSelectedUser(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <AnimatePresence>
          {search.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {searching ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : searchError ? (
                <p role="alert" className="text-xs text-destructive py-3">Could not check gift eligibility. Try searching again.</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.user_id}
                      onClick={() => {
                        if (!r.hasPremium) {
                          setSelectedUser(r);
                          setConfirmOpen(true);
                        }
                      }}
                      disabled={r.hasPremium}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        r.hasPremium
                          ? 'opacity-50 cursor-not-allowed bg-muted/20'
                          : 'hover:bg-accent/50 bg-secondary/20'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {r.avatar_url ? (
                          <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.display_name || r.username}
                        </p>
                        <p className="text-xs text-muted-foreground">@{r.username}</p>
                      </div>
                      {r.hasPremium ? (
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                          <Crown className="h-3 w-3 mr-1" />
                          Premium
                        </Badge>
                      ) : (
                        <Gift className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent Gifts */}
      {recentError && <div role="alert" className="text-sm text-destructive">Gift history is unavailable. <Button variant="link" onClick={() => void retryRecent()}>Retry</Button></div>}
      {recentGifts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Gifts</p>
          <div className="space-y-1.5">
            {recentGifts.map((gift) => (
              <div
                key={gift.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-secondary/20 border border-border/30"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {gift.avatar_url ? (
                    <img src={gift.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">@{gift.username}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {gift.status === 'accepted' ? 'Accepted' : 'Pending acceptance'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    gift.status === 'accepted'
                      ? 'bg-green-500/10 text-green-500 border-green-500/30'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  }`}
                >
                  {gift.status === 'accepted' ? (
                    <><Check className="h-3 w-3 mr-1" /> Active</>
                  ) : (
                    <><Crown className="h-3 w-3 mr-1" /> Pending</>
                  )}
                </Badge>
                <button
                  onClick={() => handleRevoke(gift.id, gift.user_id, gift.username)}
                  className="text-[11px] text-destructive font-medium hover:underline shrink-0 px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Gift Premium
            </AlertDialogTitle>
            <AlertDialogDescription>
              Send a VYBE Premium cosmetic preview to <strong>@{selectedUser?.username}</strong>? They can review and accept it in Settings. Core features are already free for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGift} disabled={gifting}>
              {gifting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
              Send Gift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
