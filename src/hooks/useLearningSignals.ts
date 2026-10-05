import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountGuard } from '@/lib/reportModerationService';

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
  const profileId = useAuthProfileId();
  const session = useReportAccountSession();
  const scope = JSON.stringify([user?.id, session.epoch, profileId]);
  const [loadedFor, setLoadedFor] = useState('');
  const [data, setData] = useState<LearningSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user?.id || !profileId || session.uid !== user.id) return;
    let active = true;
    const guard = reportAccountGuard(user.id);
    setLoading(true); setError(null);
    (async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const socialId = profileId;

      const [likesR, followsR, commentsR, sessionsR, dnaR, recentLikesR, recentFollowsR, recentCommentsR] = await Promise.all([
        db.from('likes').select('id', { count: 'exact', head: true }).eq('user_id', socialId).gte('created_at', since),
        db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', socialId).gte('created_at', since),
        db.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', socialId).gte('created_at', since),
        db.from('screen_time_sessions').select('duration_seconds').eq('user_id', user.id).gte('started_at', since),
        db.from('vybe_dna').select('interests,active_hours').eq('user_id', user.id).maybeSingle(),
        db.from('likes').select('reaction_type,created_at,post_id').eq('user_id', socialId).order('created_at', { ascending: false }).limit(8),
        db.from('follows').select('following_id,created_at').eq('follower_id', socialId).order('created_at', { ascending: false }).limit(8),
        db.from('comments').select('text,created_at').eq('user_id', socialId).order('created_at', { ascending: false }).limit(6),
      ]);

      if (!active) return;
      guard();
      if (commentsR.error || recentCommentsR.error) throw commentsR.error || recentCommentsR.error;
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
      setLoadedFor(scope);
    })().catch(reason => {
      if (!active) return;
      try { guard(); } catch { return; }
      setData(null); setLoadedFor(scope); setLoading(false); setError(reason instanceof Error ? reason : new Error('Learning history could not be loaded.'));
    });
    return () => { active = false; };
  }, [user?.id, profileId, session.uid, session.epoch, scope]);

  const current = loadedFor === scope && session.uid === user?.id;
  return { data: current ? data : null, loading: loading || !current, error: current ? error : null };
}
