import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { db, getFirebaseAuth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function useCreatorProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await db
        .from('creator_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useApplyForPartner() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  const isCurrentUser = (uid: string | undefined) => !!uid &&
    currentUserId.current === uid && getFirebaseAuth()?.currentUser?.uid === uid;

  return useMutation({
    onMutate: () => user?.id,
    mutationFn: async () => {
      const uid = user?.id;
      if (!uid) throw new Error('Not authenticated');
      const assertCurrentUser = () => {
        if (!isCurrentUser(uid)) throw new Error('Your account changed. Please try again.');
      };
      assertCurrentUser();
      // Imported profiles may have a different document ID. Do not create a
      // second payment profile, or use upsert (which replaces created_at).
      const { data: matches, error: readError } = await db
        .from('creator_profiles')
        .select('id, user_id, is_approved')
        .eq('user_id', uid)
        .limit(2);
      assertCurrentUser();
      if (readError) throw readError;
      if (!Array.isArray(matches) || matches.length > 1) {
        throw new Error('Your creator profile needs review. Please contact support.');
      }
      const now = new Date().toISOString();
      const application = { applied_at: now, updated_at: now };
      const existing = matches[0];
      if (existing) {
        if (typeof existing.id !== 'string' || !existing.id || existing.user_id !== uid) {
          throw new Error('Your creator profile needs review. Please contact support.');
        }
        // Older Connect rows omit this field. Make those applications visible
        // to the pending queue without resetting an existing staff decision.
        const updates = Object.prototype.hasOwnProperty.call(existing, 'is_approved')
          ? application : { ...application, is_approved: false };
        const { data, error } = await db.from('creator_profiles')
          .update(updates).eq('id', existing.id).eq('user_id', uid);
        assertCurrentUser();
        if (error) throw error;
        if (!Array.isArray(data) || data.length !== 1) {
          throw new Error('Your creator profile changed. Please try again.');
        }
        return { ...existing, ...updates, user_id: uid };
      }
      const created = { id: uid, user_id: uid, is_approved: false, ...application };
      const { error } = await db.from('creator_profiles').insert(created);
      assertCurrentUser();
      if (error) throw error;
      return created;
    },
    onSuccess: (data) => {
      if (!isCurrentUser(data.user_id)) return;
      qc.invalidateQueries({ queryKey: ['creator-profile', data.user_id] });
      toast.success('Application submitted! We\'ll review it shortly.');
    },
    onError: (_error, _variables, uid) => {
      if (isCurrentUser(uid)) toast.error('Failed to apply. Try again.');
    },
  });
}

export function useCreatorEarnings(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-earnings', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await db
        .from('creator_earnings')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });
}

export function useCreatorDailyStats(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-daily-stats', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await db
        .from('creator_daily_stats')
        .select('*')
        .eq('creator_id', creatorId)
        .order('stat_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });
}

export function useCreatorPayouts(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-payouts', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await db
        .from('creator_payouts')
        .select('*')
        .eq('creator_id', creatorId)
        .order('requested_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });
}

export function useRequestPayout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ creatorId, amount }: { creatorId: string; amount: number }) => {
      const { data, error } = await db
        .from('creator_payouts')
        .insert({ creator_id: creatorId, amount })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-payouts'] });
      qc.invalidateQueries({ queryKey: ['creator-profile'] });
      toast.success('Payout requested!');
    },
    onError: () => toast.error('Failed to request payout.'),
  });
}
