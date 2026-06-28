/** Bundled VYBE sound effects (public/sounds). */
export const VYBE_SOUNDS = {
  dmReceived: '/sounds/dm-received.wav',
  dmSent: '/sounds/dm-sent.wav',
  postLiked: '/sounds/post-liked.wav',
  sharePost: '/sounds/share-post.wav',
  comment: '/sounds/comment.wav',
  callRing: '/sounds/call-ring.wav',
  vybeNotification: '/sounds/vybe-notification.wav',
} as const;

export type VybeSoundKey = keyof typeof VYBE_SOUNDS;

export const ALL_VYBE_SOUND_URLS = Object.values(VYBE_SOUNDS);
