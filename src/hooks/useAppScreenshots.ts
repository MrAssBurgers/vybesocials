import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AppScreenshot {
  id: string;
  screen_key: string;
  title: string;
  subtitle: string | null;
  feature_tag: string | null;
  raw_url: string | null;
  device_url: string | null;
  marketing_url: string | null;
  width: number | null;
  height: number | null;
  display_order: number;
  placement: string[];
}

let cache: AppScreenshot[] | null = null;
let inflight: Promise<AppScreenshot[]> | null = null;

async function fetchScreenshots(): Promise<AppScreenshot[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = supabase
    .from('app_screenshots')
    .select('*')
    .order('display_order', { ascending: true })
    .then(({ data }) => {
      cache = (data ?? []) as AppScreenshot[];
      inflight = null;
      return cache;
    });
  return inflight;
}

/**
 * Public read of the marketing screenshot catalog.
 * Used by VybeHome + Features to render real app shots, falling back to
 * bundled assets when the catalog is empty or rows have no image URL yet.
 */
export function useAppScreenshots(placement?: 'hero' | 'features' | 'store') {
  const [shots, setShots] = useState<AppScreenshot[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    fetchScreenshots().then((all) => {
      if (!alive) return;
      setShots(placement ? all.filter((s) => s.placement?.includes(placement)) : all);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [placement]);

  const byKey = (key: string) => shots.find((s) => s.screen_key === key);

  return { shots, loading, byKey };
}
