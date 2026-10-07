import { readAdmittedPage, writeAdmittedPage } from '@/lib/admittedReadCache';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { socialPostListCacheKey } from '@/lib/socialPostListCacheKey';
import { readSocialPostList } from '@/lib/socialPostListService';

/** Start the signed-in member's own profile grid during sign-in.
 * The deployed list callable is the wait. A finished page is the same admitted
 * lease the profile screen already trusts, so the grid can paint before the
 * next refresh. Another account never receives this page. */
export function warmOwnProfilePosts(uid: string, profileId: string) {
  const session = reportAccountSnapshot();
  if (!uid || !profileId || session.uid !== uid) return;
  const selection = { scope: 'profile' as const, targetId: profileId };
  const cacheKey = socialPostListCacheKey(uid, session.epoch, profileId, selection);
  if (readAdmittedPage(cacheKey)) return;
  const epoch = session.epoch;
  const guard = () => {
    const current = reportAccountSnapshot();
    if (current.uid !== uid || current.epoch !== epoch) {
      throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
    }
  };
  void readSocialPostList({
    scope: 'profile',
    targetId: profileId,
    expectedOwnerUid: uid,
    expectedProfileId: profileId,
  }, guard, false).then(page => {
    const current = reportAccountSnapshot();
    if (current.uid !== uid || current.epoch !== epoch) return;
    writeAdmittedPage(cacheKey, { pages: [page], pageParams: [undefined] }, page.leaseUntil);
  }).catch(() => {
    /* The profile screen still reads on its own. */
  });
}
