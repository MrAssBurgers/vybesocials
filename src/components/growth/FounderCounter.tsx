import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

/**
 * Public Founder Badge Counter — shows scarcity to drive urgency.
 * Displays: "X / 1,000 Founder Spots Claimed"
 *
 * Gracefully returns null if growth_config is missing or empty.
 */
export function FounderCounter({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery({
    queryKey: ['founder-counter'],
    queryFn: async () => {
      // Use maybeSingle to avoid 406 when row doesn't exist
      const { data: config, error } = await supabase
        .from('growth_config')
        .select('value')
        .eq('key', 'founding_program')
        .maybeSingle();

      if (error || !config?.value) return null;

      const val = config.value as Record<string, unknown>;
      const badgeId = val.badge_id as string | null;
      const maxSlots = (val.max_slots as number) || 1000;
      const isActive = val.is_active as boolean;

      if (!isActive || !badgeId) return null;

      // Count how many have the founder badge
      const { count } = await supabase
        .from('user_badges')
        .select('id', { count: 'exact', head: true })
        .eq('badge_id', badgeId);

      return {
        claimed: count || 0,
        total: maxSlots,
        isActive,
        remaining: maxSlots - (count || 0),
      };
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  if (!data || !data.isActive) return null;

  const percentage = Math.min(100, (data.claimed / data.total) * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="h-3 w-3 text-primary" />
        <span className="font-medium">{data.remaining.toLocaleString()}</span>
        <span>Founder spots left</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/20 bg-primary/5 p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Founding Member</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.claimed.toLocaleString()} / {data.total.toLocaleString()}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
        />
      </div>
      
      <p className="text-[10px] text-muted-foreground mt-1.5">
        {data.remaining > 0
          ? `Only ${data.remaining.toLocaleString()} spots remaining — invite friends to lock yours in!`
          : 'All spots claimed! Founding Member badge is no longer available.'}
      </p>
    </motion.div>
  );
}
