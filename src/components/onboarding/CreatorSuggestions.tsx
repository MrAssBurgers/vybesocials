import { motion } from 'framer-motion';
import { Shield, Check, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { FounderBadge, getFounderTier } from '@/components/badges/FounderBadge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useState } from 'react';

interface CreatorSuggestionsProps {
  interests: string[];
  following: string[];
  onChange: (following: string[]) => void;
}

function useFounderClaimStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['founder-claim-status', user?.id],
    queryFn: async () => {
      // Get config
      const { data: config } = await db
        .from('growth_config')
        .select('value')
        .eq('key', 'founding_program')
        .maybeSingle();

      const val = config?.value as Record<string, any> | null;
      const maxSlots = val?.max_slots ?? 1000;
      const badgeId = val?.badge_id;
      const isActive = val?.is_active ?? false;

      // Count claimed
      let claimedSlots = 0;
      if (badgeId) {
        const { count } = await db
          .from('user_badges')
          .select('*', { count: 'exact', head: true })
          .eq('badge_id', badgeId);
        claimedSlots = count || 0;
      }

      // Check if current user already has it
      let userHasBadge = false;
      if (user?.id && badgeId) {
        const { data } = await db
          .from('user_badges')
          .select('id')
          .eq('user_id', user.id)
          .eq('badge_id', badgeId)
          .maybeSingle();
        userHasBadge = !!data;
      }

      return {
        maxSlots,
        claimedSlots,
        remainingSlots: Math.max(0, maxSlots - claimedSlots),
        isActive,
        userHasBadge,
        badgeId,
        userPosition: userHasBadge ? claimedSlots : null,
      };
    },
    staleTime: 1000 * 30,
  });
}

export function CreatorSuggestions({ following, onChange }: CreatorSuggestionsProps) {
  const { user } = useAuth();
  const { data: status, isLoading, refetch } = useFounderClaimStatus();
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async () => {
    if (!user?.id || !status?.badgeId || status.userHasBadge) return;
    
    setClaiming(true);
    try {
      // Try to insert the badge - the DB constraint will prevent duplicates
      const { error } = await db
        .from('user_badges')
        .insert({
          user_id: user.id,
          badge_id: status.badgeId,
          badge_type: 'special',
          badge_name: 'Founding Member',
        });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }

      toast.success('Founder badge claimed! You are in!');
      onChange([...following, 'founder-claimed']);
      await refetch();
    } catch (err) {
      console.error('Claim error:', err);
      toast.error('Failed to claim badge. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const percentClaimed = status ? (status.claimedSlots / status.maxSlots) * 100 : 0;
  const isClaimed = status?.userHasBadge || following.includes('founder-claimed');
  // Slots are only gone if we have confirmed data AND remaining is 0 AND user hasn't claimed
  const slotsGone = status ? (status.remainingSlots <= 0 && !isClaimed) : false;

  // Determine user's tier based on position
  const userTier = status?.userPosition ? getFounderTier(status.userPosition) : 'founder';

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold gradient-text">Claim Your Founder Badge</h2>
          <p className="text-muted-foreground mt-2">Loading...</p>
        </div>
        <div className="h-64 bg-card rounded-2xl border border-border animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">Claim Your Founder Badge</h2>
        <p className="text-muted-foreground mt-2">
          {slotsGone
            ? 'All founder slots have been claimed'
            : 'Limited to the first 1,000 users — forever'}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6 text-center space-y-5"
      >
        {/* Badge showcase */}
        <div className="flex flex-col items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          >
            <FounderBadge
              tier={userTier || 'founder'}
              size="showcase"
              showTooltip={false}
              locked={slotsGone}
            />
          </motion.div>

          <div>
            <h3 className="text-lg font-bold">VYBE Founder</h3>
            <p className="text-xs text-muted-foreground">Permanent • Non-removable • Limited edition</p>
          </div>
        </div>

        {/* Tier breakdown */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { tier: 'legendary' as const, label: 'Legendary', range: 'First 100', slots: 100 },
            { tier: 'elite' as const, label: 'Elite', range: 'First 500', slots: 500 },
            { tier: 'founder' as const, label: 'Founder', range: 'First 1,000', slots: 1000 },
          ].map(t => (
            <div
              key={t.tier}
              className={`rounded-xl p-2.5 border ${
                (status?.claimedSlots || 0) < t.slots
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/30'
              }`}
            >
              <FounderBadge tier={t.tier} size="md" showTooltip={false} className="mx-auto" />
              <p className="text-[11px] font-semibold mt-1.5">{t.label}</p>
              <p className="text-[10px] text-muted-foreground">{t.range}</p>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3 w-3" />
              {status?.claimedSlots || 0} claimed
            </span>
            <span className="text-muted-foreground">
              {status?.remainingSlots || 0} remaining
            </span>
          </div>
          <Progress value={percentClaimed} className="h-2" />
        </div>

        {/* Claim button */}
        {isClaimed ? (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/20"
          >
            <Check className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">Badge Claimed!</span>
          </motion.div>
        ) : slotsGone ? (
          <div className="py-3 rounded-xl bg-muted/50 text-muted-foreground text-sm font-medium">
            All slots filled — Founder badge is closed forever
          </div>
        ) : (
          <Button
            size="lg"
            onClick={handleClaim}
            disabled={claiming}
            className="w-full gradient-animated text-base gap-2"
          >
            {claiming ? (
              'Claiming...'
            ) : (
              <>
                <Shield className="h-5 w-5" />
                Claim Your Founder Badge
                <Sparkles className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </motion.div>

      <p className="text-center text-xs text-muted-foreground">
        This badge appears next to your name everywhere — forever
      </p>
    </div>
  );
}
