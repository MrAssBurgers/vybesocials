import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/': 'VYBE - The Next Generation Social Platform',
  '/home': 'Home · VYBE',
  '/explore': 'Explore · VYBE',
  '/clips': 'Clips · VYBE',
  '/shorts': 'Clips · VYBE',
  '/messages': 'Messages · VYBE',
  '/notifications': 'Notifications · VYBE',
  '/settings': 'Settings · VYBE',
  '/profile': 'Profile · VYBE',
  '/upload': 'Create Post · VYBE',
  '/market': 'Marketplace · VYBE',
  '/events': 'Events · VYBE',
  '/community': 'Communities · VYBE',
  '/spaces': 'Spaces · VYBE',
  '/watch': 'Watch · VYBE',
  '/feedback': 'Feedback · VYBE',
  '/badges': 'Badges · VYBE',
  '/challenges': 'Challenges · VYBE',
  '/invite-friends': 'Invite Friends · VYBE',
  '/admin': 'Admin Dashboard · VYBE',
  '/business': 'Business Portal · VYBE',
  '/privacy': 'Privacy Policy · VYBE',
  '/terms': 'Terms of Service · VYBE',
  '/guidelines': 'Community Guidelines · VYBE',
  '/cookies': 'Cookie Policy · VYBE',
  '/onboarding': 'Welcome · VYBE',
  '/reset-password': 'Reset Password · VYBE',
  '/marketplace': 'Token Shop · VYBE',
  '/wallet': 'Wallet · VYBE',
  '/vybe-dna': 'VYBE DNA · VYBE',
  '/leaderboard': 'Leaderboard · VYBE',
  '/streaks': 'Streaks · VYBE',
  '/roulette': 'VYBE Roulette · VYBE',
  '/sounds': 'Sounds · VYBE',
  '/creator': 'Creator Dashboard · VYBE',
  '/ads': 'Advertiser Dashboard · VYBE',
  '/roadmap': 'Feature Voting · VYBE',
};

/**
 * Sets document.title based on current route.
 * Supports dynamic routes (e.g. /u/:username → @username · VYBE).
 */
export function usePageTitle(customTitle?: string) {
  const location = useLocation();

  useEffect(() => {
    if (customTitle) {
      document.title = customTitle;
      return;
    }

    const path = location.pathname;

    // Check exact match first
    if (PAGE_TITLES[path]) {
      document.title = PAGE_TITLES[path];
      return;
    }

    // Dynamic route matching
    if (path.startsWith('/u/')) {
      const username = path.split('/u/')[1];
      document.title = `@${username} · VYBE`;
      return;
    }
    if (path.startsWith('/friend/')) {
      const username = path.split('/friend/')[1];
      document.title = `@${username} · Friend · VYBE`;
      return;
    }
    if (path.startsWith('/p/')) {
      document.title = 'Post · VYBE';
      return;
    }
    if (path.startsWith('/messages/')) {
      document.title = 'Chat · VYBE';
      return;
    }
    if (path.startsWith('/watch/')) {
      document.title = 'Watch · VYBE';
      return;
    }
    if (path.startsWith('/business/')) {
      document.title = 'Business · VYBE';
      return;
    }

    // Fallback: find closest parent match
    const segments = path.split('/').filter(Boolean);
    while (segments.length > 0) {
      const parent = '/' + segments.join('/');
      if (PAGE_TITLES[parent]) {
        document.title = PAGE_TITLES[parent];
        return;
      }
      segments.pop();
    }

    document.title = 'VYBE';
  }, [location.pathname, customTitle]);
}
