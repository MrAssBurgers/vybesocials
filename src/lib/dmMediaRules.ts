import type { ViewMode } from '@/hooks/useMessages';

/** Extended media access modes for DMs (stored on message + optional rules doc). */
export type MediaAccessMode =
  | 'view_once'
  | 'replay_once'
  | 'timed'
  | 'keep'
  | 'permanent'
  | '24h';

export interface MessageMediaRule {
  message_id: string;
  mode: MediaAccessMode;
  max_replays?: number;
  expires_at?: string | null;
  allow_save?: boolean;
  blur_on_capture?: boolean;
}

export function viewModeToMediaMode(viewMode: ViewMode | string): MediaAccessMode {
  switch (viewMode) {
    case 'view_once':
      return 'view_once';
    case '24h':
      return 'timed';
    case 'permanent':
      return 'permanent';
    case 'replay_once':
      return 'replay_once';
    case 'vybe_locked':
      return 'view_once';
    default:
      return 'permanent';
  }
}

export function mediaModeToViewMode(mode: MediaAccessMode): ViewMode {
  switch (mode) {
    case 'view_once':
    case 'replay_once':
      return 'view_once';
    case 'timed':
    case 'keep':
      return '24h';
    case 'permanent':
    default:
      return 'permanent';
  }
}

export function maxReplaysForMode(mode: MediaAccessMode): number {
  if (mode === 'replay_once') return 1;
  if (mode === 'view_once') return 0;
  return Number.POSITIVE_INFINITY;
}

export function expiresAtForMediaMode(
  mode: MediaAccessMode,
  createdAt: Date = new Date(),
): string | null {
  if (mode === '24h' || mode === 'timed') {
    return new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

export const MEDIA_MODE_LABELS: Record<MediaAccessMode, string> = {
  view_once: 'View once',
  replay_once: 'Replay once',
  timed: '24 hours',
  keep: 'Keep in chat',
  permanent: 'Permanent',
  '24h': '24 hours',
};
