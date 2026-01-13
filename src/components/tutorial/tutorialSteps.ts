import { TutorialLayoutMode } from '@/hooks/useTutorialLayout';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  // Alternative selectors for different layouts
  mobileSelector?: string;
  desktopSelector?: string;
  tabletSelector?: string;
  // Skip if element not found (optional steps)
  optional?: boolean;
}

// Mobile/Tablet steps - uses bottom nav
const mobileTabletSteps: TutorialStep[] = [
  {
    id: 'feed',
    targetSelector: '[data-tutorial="home-nav"]',
    title: 'Your Feed',
    description: 'This is your feed. Discover posts and clips from friends and trending creators.',
    position: 'top',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: 'Stories',
    description: 'Post stories that disappear after 24 hours. Tap to view friends\' moments!',
    position: 'bottom',
  },
  {
    id: 'clips',
    targetSelector: '[data-tutorial="clips-nav"]',
    title: 'Short Clips',
    description: 'Watch short clips. Tap to unmute, hold to pause.',
    position: 'top',
  },
  {
    id: 'create',
    targetSelector: '[data-tutorial="create-nav"]',
    title: 'Create Content',
    description: 'Tap to upload photos, videos, or clips. Double-tap for quick access to the Hub.',
    position: 'top',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="messages-nav"]',
    title: 'Messages',
    description: 'Chat with friends here. You\'ll see when someone is in the chat or typing.',
    position: 'top',
  },
  {
    id: 'settings',
    targetSelector: '[data-tutorial="settings-nav"]',
    title: 'Settings & Profile',
    description: 'Customize your profile, manage notifications, and adjust your preferences here.',
    position: 'top',
  },
];

// Desktop steps - uses sidebar
const desktopSteps: TutorialStep[] = [
  {
    id: 'feed',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: 'Your Feed',
    description: 'This is your feed. Discover posts and clips from friends and trending creators.',
    position: 'right',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: 'Stories',
    description: 'Post stories that disappear after 24 hours. Tap to view friends\' moments!',
    position: 'bottom',
  },
  {
    id: 'clips',
    targetSelector: '[data-tutorial="sidebar-clips"]',
    title: 'Short Clips',
    description: 'Watch short clips. Tap to unmute, hold to pause.',
    position: 'right',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="sidebar-explore"]',
    title: 'Explore',
    description: 'Discover new content, creators, and trending topics.',
    position: 'right',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="sidebar-messages"]',
    title: 'Messages',
    description: 'Chat with friends here. You\'ll see when someone is in the chat or typing.',
    position: 'right',
  },
  {
    id: 'community',
    targetSelector: '[data-tutorial="sidebar-community"]',
    title: 'Community',
    description: 'Join servers and connect with communities that share your interests.',
    position: 'right',
  },
  {
    id: 'notifications',
    targetSelector: '[data-tutorial="sidebar-notifications"]',
    title: 'Notifications',
    description: 'Control what notifications you receive and stay updated.',
    position: 'right',
  },
  {
    id: 'settings',
    targetSelector: '[data-tutorial="sidebar-settings"]',
    title: 'Settings',
    description: 'Customize your profile, theme, and privacy settings.',
    position: 'right',
  },
  {
    id: 'create',
    targetSelector: '[data-tutorial="sidebar-create"]',
    title: 'Create Content',
    description: 'Upload photos, videos, or clips to share with your followers.',
    position: 'right',
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
    case 'desktop':
      return '💻 Desktop';
    case 'tablet':
      return '📱 Tablet';
    case 'mobile':
      return '📱 Mobile';
    default:
      return '📱 Mobile';
  }
}
