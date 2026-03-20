import { TutorialLayoutMode } from '@/hooks/useTutorialLayout';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  requiresRoute?: string;
  action?: 'openCreateMenu' | 'openVYBEHub' | 'closeMenus' | 'navigateToSettings' | 'navigateToThemes';
  optional?: boolean;
  highlightNav?: string;
  category?: 'social' | 'content' | 'communication' | 'discovery' | 'customization';
}

// Mobile/Tablet — 6 simple steps
const mobileTabletSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="tutorial-welcome-center"]',
    title: '👋 Welcome to VYBE!',
    description: 'Your social universe — posts, DMs, communities, a token shop, and more. Let\'s show you around!',
    position: 'bottom',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="feed-area"]',
    title: '📱 Your Feed',
    description: '"For You" shows trending posts. "Global" shows everything. Double-tap to like, bookmark to save.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'create-button',
    targetSelector: '[data-tutorial="create-nav"]',
    title: '➕ Create & Discover',
    description: 'Tap to post photos/videos. Double-tap for the Hub — communities, marketplace, and events.',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'create-nav',
    category: 'content',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="messages-nav"]',
    title: '💬 Messages',
    description: 'Chat 1-on-1 or in groups with read receipts, voice messages, reactions, and video calls.',
    position: 'top',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'messages-nav',
    category: 'communication',
  },
  {
    id: 'profile',
    targetSelector: '[data-tutorial="profile-nav"]',
    title: '👤 Your Profile & Locker',
    description: 'Edit your bio, avatar, and badges. Open your Locker to equip cosmetics from the Token Shop.',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'profile-nav',
    category: 'social',
  },
  {
    id: 'complete',
    targetSelector: '[data-tutorial="tutorial-welcome-center"]',
    title: '🎉 You\'re All Set!',
    description: 'Check your Daily Brief for personalized updates, earn tokens through challenges, and explore Communities. Replay this from Settings → Help!',
    position: 'bottom',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
];

// Desktop — 6 simple steps
const desktopSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '👋 Welcome to VYBE!',
    description: 'Your social universe — posts, DMs, communities, a token shop, and more. Let\'s show you around!',
    position: 'right',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="feed-area"]',
    title: '📱 Your Feed',
    description: '"For You" shows trending posts. "Global" shows everything. Double-click to like, bookmark to save.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="sidebar-explore"]',
    title: '🔍 Explore',
    description: 'Search for people, posts, and trending content. AI recommendations improve as you use the app.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="sidebar-messages"]',
    title: '💬 Messages',
    description: 'Chat 1-on-1 or in groups with read receipts, voice messages, reactions, and video calls.',
    position: 'right',
    requiresRoute: '/home',
    category: 'communication',
  },
  {
    id: 'profile',
    targetSelector: '[data-tutorial="sidebar-profile"]',
    title: '👤 Your Profile & Locker',
    description: 'Edit your bio, avatar, and badges. Open your Locker to equip cosmetics from the Token Shop.',
    position: 'right',
    requiresRoute: '/home',
    category: 'social',
  },
  {
    id: 'complete',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '🎉 You\'re Ready!',
    description: 'Check your Daily Brief for personalized updates, earn tokens through challenges, and explore Communities. Replay this from Settings → Help!',
    position: 'right',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
];

export function getStepsForLayout(layout: TutorialLayoutMode): TutorialStep[] {
  switch (layout) {
    case 'desktop':
      return desktopSteps;
    case 'tablet':
    case 'mobile':
    default:
      return mobileTabletSteps;
  }
}

export function getLayoutLabel(layout: TutorialLayoutMode): string {
  switch (layout) {
    case 'desktop': return '💻 Desktop';
    case 'tablet': return '📱 Tablet';
    case 'mobile': return '📱 Mobile';
    default: return '📱 Mobile';
  }
}

export function getCategoryIcon(category?: TutorialStep['category']): string {
  switch (category) {
    case 'social': return '👥';
    case 'content': return '📸';
    case 'communication': return '💬';
    case 'discovery': return '🔍';
    case 'customization': return '🎨';
    default: return '✨';
  }
}
