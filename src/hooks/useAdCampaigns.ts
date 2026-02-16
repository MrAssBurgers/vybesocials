import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface AdCampaign {
  id: string;
  advertiser_id: string;
  business_id: string | null;
  name: string;
  status: string;
  placement: string;
  daily_budget: number;
  total_budget: number | null;
  bid_amount_cpm: number;
  spent: number;
  headline: string;
  body_text: string | null;
  media_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  target_interests: string[] | null;
  impressions: number;
  clicks: number;
  ctr: number;
  effective_cpm: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface AdDailyStat {
  stat_date: string;
  impressions: number;
  clicks: number;
  spent: number;
  cpm: number;
  ctr: number;
}

export function useMyAdCampaigns() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  return useQuery({
    queryKey: ['ad-campaigns', profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('advertiser_id', profileId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AdCampaign[];
    },
    enabled: !!profileId,
  });
}

export function useAdCampaignStats(campaignId: string | null) {
  return useQuery({
    queryKey: ['ad-campaign-stats', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_daily_stats')
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('stat_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as AdDailyStat[]).reverse();
    },
    enabled: !!campaignId,
  });
}

export function useCreateAdCampaign() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const profileId = profile?.id;

  return useMutation({
    mutationFn: async (campaign: {
      name: string;
      headline: string;
      body_text?: string;
      media_url?: string;
      cta_text?: string;
      cta_url?: string;
      placement?: string;
      daily_budget: number;
      total_budget?: number;
      bid_amount_cpm: number;
      target_interests?: string[];
      business_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .insert({
          ...campaign,
          advertiser_id: profileId!,
          status: 'pending_review' as any,
          placement: (campaign.placement || 'feed_inline') as any,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      toast.success('Campaign submitted for review');
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useUpdateCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('ad_campaigns')
        .update({ status: status as any, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      toast.success('Campaign updated');
    },
  });
}

/** Serve a winning ad for a placement */
export function useWinningAd(placement: string) {
  const { profile } = useAuth();
  const profileId = profile?.id;
  return useQuery({
    queryKey: ['winning-ad', placement],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_winning_ad', {
        p_placement: placement as any,
        p_viewer_id: profileId || null,
      });
      if (error) throw error;
      return data?.[0] || null;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Log an impression or click */
export function useRecordImpression() {
  return useMutation({
    mutationFn: async ({ campaignId, clicked }: { campaignId: string; clicked?: boolean }) => {
      const { error } = await supabase.rpc('record_ad_impression', {
        p_campaign_id: campaignId,
        p_viewer_id: null,
        p_clicked: clicked || false,
      });
      if (error) throw error;
    },
  });
}
