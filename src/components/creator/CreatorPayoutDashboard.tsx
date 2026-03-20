import { useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, ArrowUpRight, Loader2, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCreatorConnectStatus, useCreatorConnectOnboard, useProcessCreatorPayout } from '@/hooks/useCreatorConnect';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function CreatorPayoutDashboard() {
  const { profile } = useAuth();
  const { data: connectStatus, isLoading: statusLoading } = useCreatorConnectStatus();
  const { startOnboarding, isLoading: onboardLoading } = useCreatorConnectOnboard();
  const { processPayout, isLoading: payoutLoading } = useProcessCreatorPayout();
  const [payoutAmount, setPayoutAmount] = useState('');

  // Fetch creator earnings data
  const { data: creatorData } = useQuery({
    queryKey: ['creator-earnings', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('id, pending_payout, total_earnings, stripe_connect_account_id, stripe_onboarding_complete')
        .eq('user_id', profile?.user_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 30_000,
  });

  // Fetch recent payouts
  const { data: recentPayouts = [] } = useQuery({
    queryKey: ['creator-payouts', creatorData?.id],
    queryFn: async () => {
      if (!creatorData?.id) return [];
      const { data, error } = await supabase
        .from('creator_payouts')
        .select('*')
        .eq('creator_id', creatorData.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!creatorData?.id,
  });

  const pendingBalance = creatorData?.pending_payout ?? 0;
  const totalEarned = creatorData?.total_earnings ?? 0;
  const isConnected = connectStatus?.connected && connectStatus?.onboarding_complete;

  const handlePayout = async () => {
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount > pendingBalance) {
      toast.error('Amount exceeds your balance');
      return;
    }
    const success = await processPayout(amount);
    if (success) {
      setPayoutAmount('');
    }
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="p-4 bg-card/80 border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Available</span>
            </div>
            <p className="text-xl font-bold text-foreground">${pendingBalance.toFixed(2)}</p>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-4 bg-card/80 border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Earned</span>
            </div>
            <p className="text-xl font-bold text-foreground">${totalEarned.toFixed(2)}</p>
          </Card>
        </motion.div>
      </div>

      {/* Stripe Connect Status */}
      {!isConnected ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="p-5 bg-card/80 border-border/50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Set Up Payouts</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect your bank account to receive creator earnings. Powered by Stripe for secure, fast transfers.
                </p>
                <Button
                  onClick={startOnboarding}
                  disabled={onboardLoading}
                  className="mt-3 gap-2"
                  size="sm"
                >
                  {onboardLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  Connect Bank Account
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Connected badge */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">Payouts connected</span>
          </motion.div>

          {/* Payout section */}
          {pendingBalance > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="p-4 bg-card/80 border-border/50">
                <h3 className="font-semibold text-sm mb-3">Request Payout</h3>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="1"
                      max={pendingBalance}
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder={pendingBalance.toFixed(2)}
                      className="pl-7"
                    />
                  </div>
                  <Button
                    onClick={handlePayout}
                    disabled={payoutLoading || !payoutAmount}
                    className="gap-1.5"
                  >
                    {payoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    Withdraw
                  </Button>
                </div>
                <button
                  onClick={() => setPayoutAmount(pendingBalance.toFixed(2))}
                  className="text-[10px] text-primary mt-1.5 hover:underline"
                >
                  Withdraw all (${pendingBalance.toFixed(2)})
                </button>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* Recent Payouts */}
      {recentPayouts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h3 className="font-semibold text-sm mb-2 px-1">Recent Payouts</h3>
          <div className="space-y-1.5">
            {recentPayouts.map((payout: any) => (
              <Card key={payout.id} className="p-3 bg-card/60 border-border/30 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">${payout.amount.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(payout.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  payout.status === 'completed' && "bg-emerald-500/15 text-emerald-400",
                  payout.status === 'processing' && "bg-amber-500/15 text-amber-400",
                  payout.status === 'failed' && "bg-destructive/15 text-destructive",
                )}>
                  {payout.status}
                </span>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
