import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface LearningSignals {
  likes30d: number;
  follows30d: number;
  comments30d: number;
  watchMinutes30d: number;
  topInterests: string[];
  topActiveHours: number[];
  recent: { kind: 'like' | 'follow' | 'comment' | 'session'; label: string; at: string }[];
}

export function useLearningSignals() {
  const { user } = useAuth();
  const [data, setData] = useState<LearningSignals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      // fetch profile.id once for comments lookups (uses profile id)
      const { data: prof } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
      const profId = prof?.id || user.id;

      const [likesR, followsR, commentsR, sessionsR, dnaR, recentLikesR, recentFollowsR, recentCommentsR] = await Promise.all([
        supabase.from('likes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id).gte('created_at', since),
        supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', profId).gte('created_at', since),
        supabase.from('screen_time_sessions').select('duration_seconds').eq('user_id', user.id).gte('started_at', since),
        supabase.from('vybe_dna').select('interests,active_hours').eq('user_id', user.id).maybeSingle(),
        supabase.from('likes').select('reaction_type,created_at,post_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
        supabase.from('follows').select('following_id,created_at').eq('follower_id', user.id).order('created_at', { ascending: false }).limit(8),
        supabase.from('comments').select('text,created_at').eq('user_id', profId).order('created_at', { ascending: false }).limit(6),
      ]);

      if (!active) return;
      const watchSec = (sessionsR.data || []).reduce((s, r: any) => s + (r.duration_seconds || 0), 0);
      const recent = [
        ...(recentLikesR.data || []).map((l: any) => ({ kind: 'like' as const, label: `Reacted ${l.reaction_type}`, at: l.created_at })),
        ...(recentFollowsR.data || []).map((f: any) => ({ kind: 'follow' as const, label: 'Followed someone new', at: f.created_at })),
        ...(recentCommentsR.data || []).map((c: any) => ({ kind: 'comment' as const, label: `Commented "${(c.text || '').slice(0, 40)}${(c.text?.length || 0) > 40 ? '…' : ''}"`, at: c.created_at })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 12);

      setData({
        likes30d: likesR.count || 0,
        follows30d: followsR.count || 0,
        comments30d: commentsR.count || 0,
        watchMinutes30d: Math.round(watchSec / 60),
        topInterests: (dnaR.data?.interests || []).slice(0, 8) as string[],
        topActiveHours: (dnaR.data?.active_hours || []) as number[],
        recent,
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  return { data, loading };
}
