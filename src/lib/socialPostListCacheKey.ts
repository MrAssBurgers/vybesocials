import type { SocialPostSelection } from '@/lib/socialPostListService';

/** Shared by the visible reader and the sign-in warm path. Key order is part of the contract. */
export function socialPostListCacheKey(
  uid: string | undefined,
  epoch: number,
  profileId: string | undefined,
  selection: SocialPostSelection,
  cursor?: string,
) {
  return JSON.stringify(['social-post-list', uid, epoch, profileId, selection, cursor]);
}
