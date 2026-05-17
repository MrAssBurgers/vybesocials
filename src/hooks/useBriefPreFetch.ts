import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const BRIEF_CACHE_KEY = 'vybe_ai_brief_cache';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const PREFETCH_INTERVAL = 1000 * 60 * 30; // 30 minutes

function isCacheFresh(): boolean {
  try {
    const cached = localStorage.getItem(BRIEF_CACHE_KEY);
    if (!cached) return false;
    const { timestamp } = JSON.parse(cached);
    return Date.now() - timestamp < CACHE_TTL;
  } catch { return false; }
}

function getSlot(): 'morning' | 'lunch' | 'dinner' {
  const h = new Date().getHours();
  if (h >= 4 && h < 10) return 'morning';
  if (h >= 10 && h < 16) return 'lunch';
  return 'dinner';
}

async function tryServerCache(userId: string): Promise<boolean> {
  try {
    const slot = getSlot();
    const { data } = await supabase
      .from('daily_brief_cache')
      .select('payload, generated_at, expires_at')
      .eq('user_id', userId)
      .eq('slot', slot)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (data?.payload) {
      localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({
        data: data.payload,
        timestamp: new Date(data.generated_at).getTime(),
      }));
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

async function prefetchBrief(authUserId?: string) {
  if (isCacheFresh()) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Prefer server-pre-warmed cache (zero AI cost, instant)
    if (authUserId && await tryServerCache(authUserId)) return;

    // Try to get GPS location (non-blocking)
    let latitude: number | null = null;
    let longitude: number | null = null;
    const locationEnabled = localStorage.getItem('vybe_ai_location') === 'true';

    if (locationEnabled && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, maximumAge: 300000 });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch { /* skip */ }
    }

    const bodyPayload: Record<string, any> = {};
    if (latitude && longitude) {
      bodyPayload.latitude = latitude;
      bodyPayload.longitude = longitude;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-catch-up`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(bodyPayload),
      }
    );

    if (!response.ok) return;

    const data = await response.json();
    if (data && typeof data.summary === 'string' && data.summary.trim().length > 0) {
      localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    }
  } catch {
    // Silent fail for background prefetch
  }
}

export function useBriefPreFetch(userId?: string) {
  const started = useRef(false);

  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;

    // Initial prefetch after a short delay to not block app startup
    const initialTimeout = setTimeout(() => prefetchBrief(), 5000);

    // Periodic refresh
    const interval = setInterval(() => prefetchBrief(), PREFETCH_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userId]);
}
