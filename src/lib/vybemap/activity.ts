import type { ActivityType } from './types';

const MPS_TO_MPH = 2.23694;

export function detectActivity(speedMps: number | null | undefined, status?: string | null): ActivityType {
  const s = speedMps ?? 0;
  if (status?.includes('✈️') || status?.includes('Traveling')) return 'traveling';
  if (status?.includes('🚗') || status?.includes('Driving')) return 'driving';
  if (status?.includes('🚶') || status?.includes('Walking')) return 'walking';
  if (s > 55) return 'flying';
  if (s > 25) return 'traveling';
  if (s > 8) return 'driving';
  if (s > 3) return 'cycling';
  if (s > 1.8) return 'running';
  if (s > 0.6) return 'walking';
  return 'stationary';
}

export function activityMeta(type: ActivityType): { icon: string; label: string; color: string } {
  switch (type) {
    case 'walking': return { icon: '🚶', label: 'Walking', color: 'text-green-300' };
    case 'running': return { icon: '🏃', label: 'Running', color: 'text-lime-300' };
    case 'driving': return { icon: '🚗', label: 'Driving', color: 'text-blue-300' };
    case 'cycling': return { icon: '🚴', label: 'Cycling', color: 'text-cyan-300' };
    case 'flying': return { icon: '✈️', label: 'Flying', color: 'text-violet-300' };
    case 'traveling': return { icon: '🌍', label: 'Traveling', color: 'text-indigo-300' };
    default: return { icon: '📍', label: 'Stationary', color: 'text-white/50' };
  }
}

export function speedMph(speedMps: number | null | undefined): string | null {
  if (speedMps == null || speedMps < 0.3) return null;
  return `${Math.round(speedMps * MPS_TO_MPH)} mph`;
}
