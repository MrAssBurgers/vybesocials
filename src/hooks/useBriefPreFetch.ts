import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { fetchDailyBrief } from '@/lib/firebase/briefRpc';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { getBriefTimeSlot } from '@/lib/briefTimeSlot';

const BRIEF_CACHE_KEY = 'vybe_ai_brief_cache';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// Slot boundaries (local time): 6 AM morning, 12 PM lunch, 6 PM dinner
function msUntilNextSlot(): number {
  const now = new Date();
  const slots = [6, 12, 18];
  const next = new Date(now);
  const currentHour = now.getHours();
  const nextHour = slots.find(h => h > currentHour);
  if (nextHour !== undefined) {
    next.setHours(nextHour, 0, 5, 0); // +5s so the server cache is ready
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 5, 0);
  }
  return Math.max(60_000, next.getTime() - now.getTime());
}

function isCacheFresh(): boolean {
  try {
    const cached = localStorage.getItem(BRIEF_CACHE_KEY);
    if (!cached) return false;
    const { timestamp } = JSON.parse(cached);
    return Date.now() - timestamp < CACHE_TTL;
  } catch { return false; }
}

function getSlot() {
  return getBriefTimeSlot();
}

function writeBriefCache(data: unknown) {
  try {
    localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
      timeSlot: getBriefTimeSlot(),
    }));
  } catch { /* ignore */ }
}

async function tryServerCache(userId: string): Promise<boolean> {
  try {
    const slot = getSlot();
    const { data } = await db
      .from('daily_brief_cache')
      .select('payload, generated_at, expires_at')
      .eq('user_id', userId)
      .eq('slot', slot)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (data?.payload) {
      writeBriefCache(data.payload);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

async function prefetchBrief(authUserId?: string, force = false): Promise<boolean> {
  if (!force && isCacheFresh()) return false;

  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return false;

    // Prefer server-pre-warmed cache (zero AI cost, instant)
    if (!force && authUserId && await tryServerCache(authUserId)) return true;

    // Do not call geolocation here — prefetch runs on app open. Location-aware
    // briefs request GPS only when the user opens the brief sheet / enables location.
    const data = await fetchDailyBrief(authUserId || session.user.id, {});
    if (data && typeof data.summary === 'string' && data.summary.trim().length > 0) {
      writeBriefCache(data);
      return true;
    }
  } catch {
    // Silent fail for background prefetch
  }
  return false;
}

export function useBriefPreFetch(userId?: string) {
  const started = useRef(false);

  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;

    // Kick off IMMEDIATELY so the Daily Brief is warm by the time the user taps it.
    prefetchBrief(userId);

    // Schedule regeneration at the next slot boundary (6 AM / 12 PM / 6 PM local).
    // When a slot fires, force a fresh generation and alert the user.
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        const ok = await prefetchBrief(userId, true);
        if (ok) {
          try { haptics.success(); } catch {}
          toast.message('☀️ Your new Daily Brief is ready', {
            description: 'Tap the brief on your home screen to read it.',
          });
        }
        scheduleNext();
      }, msUntilNextSlot());
    };
    scheduleNext();

    return () => { clearTimeout(timeoutId); };
  }, [userId]);
}
