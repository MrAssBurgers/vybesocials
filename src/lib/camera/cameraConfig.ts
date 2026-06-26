export type CameraMode = 'photo' | 'video' | 'story' | 'snap' | 'clip' | 'post';

export type CaptureTarget =
  | 'story'
  | 'dm'
  | 'hub'
  | 'snap'
  | 'post'
  | 'clip'
  | 'profile'
  | 'memory';

export const CAMERA_CONFIG = {
  maxVideoLengthSec: 60,
  snapMaxVideoLengthSec: 30,
  defaultMode: 'photo' as CameraMode,
  preloadOnHover: true,
  loadingShimmerMs: 300,
  storyAspectRatio: '9:16' as const,
  snapAspectRatio: '9:16' as const,
  clipAspectRatio: '9:16' as const,
  enabledTools: {
    flash: true,
    flip: true,
    timer: true,
    grid: true,
    zoom: true,
    filters: true,
    text: true,
    draw: true,
    stickers: true,
    music: true,
    gallery: true,
  },
  compression: {
    photoQuality: 0.92,
    videoBitrate: 2_500_000,
  },
} as const;

export const MODE_CAROUSEL: { id: CameraMode; label: string }[] = [
  { id: 'video', label: 'VIDEO' },
  { id: 'photo', label: 'PHOTO' },
  { id: 'story', label: 'STORY' },
];

export function defaultModeForTarget(target: CaptureTarget): CameraMode {
  if (target === 'story') return 'story';
  if (target === 'clip') return 'video';
  if (target === 'dm' || target === 'snap') return 'photo';
  return 'photo';
}
