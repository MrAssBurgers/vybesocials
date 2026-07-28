import { isGeneratedUsername } from '@/lib/username';

const RETURN_PATH_KEY = 'vybe.auth.return_path';
const LEGACY_ADD_FRIEND_KEY = 'addFriendReturnUrl';

/** Store a post-login redirect (friend links, QR deep links, etc.). */
export function stashAuthReturnPath(path: string): void {
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    /* ignore */
  }
}

/** Read and clear the stored return path. */
export function consumeAuthReturnPath(): string | null {
  try {
    const legacy = sessionStorage.getItem(LEGACY_ADD_FRIEND_KEY);
    if (legacy) {
      sessionStorage.removeItem(LEGACY_ADD_FRIEND_KEY);
      return legacy;
    }
    const path = sessionStorage.getItem(RETURN_PATH_KEY);
    if (path) sessionStorage.removeItem(RETURN_PATH_KEY);
    return path;
  } catch {
    return null;
  }
}

/** Post-login destination (consumes any stashed deep link). */
export function getPostLoginPath(fallback = '/home'): string {
  return consumeAuthReturnPath() || fallback;
}

type PostLoginProfile = {
  onboarding_completed?: boolean | null;
  username?: string | null;
} | null | undefined;

/** Sync post-login route — never await profile fetch (avoids infinite spinner). */
export function resolvePostLoginDestination(profile: PostLoginProfile): string {
  if (!profile || profile.onboarding_completed !== true || isGeneratedUsername(profile.username)) {
    return '/onboarding';
  }
  return getPostLoginPath('/home');
}
