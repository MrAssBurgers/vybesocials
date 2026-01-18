import { TutorialLayoutMode } from '@/hooks/useTutorialLayout';

export interface TutorialStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  // Navigation requirements
  requiresRoute?: string;
  // Action to perform before showing step
  action?: 'openCreateMenu' | 'openVYBEHub' | 'closeMenus';
  // Skip if element not found (optional steps)
  optional?: boolean;
  // Highlight a bottom nav item during this step
  highlightNav?: string;
}

// Mobile/Tablet steps - uses bottom nav
const mobileTabletSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="tutorial-welcome-center"]', // Will be centered, no element
    title: '👋 Welcome to VYBE!',
    description: 'Let\'s take a quick tour! We\'ll show you all the key features to help you get started.',
    position: 'bottom',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'home-nav', // Highlight this nav item
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories & Feed',
    description: 'Your home shows posts from friends and creators. Tap any story circle at the top to watch 24-hour stories!',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="explore-nav"]',
    title: '🔍 Explore',
    description: 'Discover trending content, new creators, and find people to follow. Watch short clips and browse what\'s popular!',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'explore-nav',
  },
  {
    id: 'create-button',
    targetSelector: '[data-tutorial="create-nav"]',
    title: '➕ Create Content',
    description: 'Tap to open the Create Menu. You can upload photos, videos, or use the camera to capture moments!',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'create-nav',
  },
  {
    id: 'create-menu',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '📸 Create Menu',
    description: 'Create Post to upload content, Camera to capture instantly, or tap VYBE Hub for marketplace, events, and communities!',
    position: 'bottom',
    action: 'openCreateMenu',
    highlightNav: 'create-nav',
  },
  {
    id: 'vybe-hub',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '🚀 VYBE Hub',
    description: 'Your one-stop shop! Access Marketplace to buy & sell, Events to see what\'s happening, and Communities for Discord-style servers.',
    position: 'bottom',
    action: 'openVYBEHub',
    highlightNav: 'create-nav',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="messages-nav"]',
    title: '💬 Messages',
    description: 'Chat with friends and groups! You\'ll see typing indicators, read receipts, and a red badge for unread messages.',
    position: 'top',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'messages-nav',
  },
  {
    id: 'settings',
    targetSelector: '[data-tutorial="settings-nav"]',
    title: '⚙️ Settings & Profile',
    description: 'Manage your profile, privacy, notifications, and themes. You can restart this tutorial anytime from Help & Support!',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'settings-nav',
  },
];

// Desktop steps - uses sidebar
const desktopSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '👋 Welcome to VYBE!',
    description: 'Let\'s take a quick tour! We\'ll show you all the key features on the desktop experience.',
    position: 'right',
    requiresRoute: '/home',
    action: 'closeMenus',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories & Feed',
    description: 'Your home shows posts from friends and creators. Click any story circle to watch 24-hour stories!',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="sidebar-explore"]',
    title: '🔍 Explore',
    description: 'Discover trending content, short clips, and find new creators to follow!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="sidebar-messages"]',
    title: '💬 Messages',
    description: 'Chat with friends and groups! You\'ll see typing indicators and a badge shows unread messages.',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'community',
    targetSelector: '[data-tutorial="sidebar-community"]',
    title: '👥 Community',
    description: 'Join Discord-style servers, connect with communities, or create your own server!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'market',
    targetSelector: '[data-tutorial="sidebar-market"]',
    title: '🛍️ Marketplace',
    description: 'Buy and sell items with other VYBE users. List your items or browse what\'s available!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'events',
    targetSelector: '[data-tutorial="sidebar-events"]',
    title: '📅 Events',
    description: 'Discover local and online events, RSVP, and never miss what\'s happening in your community!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'create',
    targetSelector: '[data-tutorial="sidebar-create"]',
    title: '➕ Create Content',
    description: 'Click here to upload photos, videos, or clips to share with your followers! Double-click for admin panel (if you\'re a mod).',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'profile',
    targetSelector: '[data-tutorial="sidebar-profile"]',
    title: '👤 Your Profile',
    description: 'View your profile, check notifications (bell icon), or access settings (gear icon). Everything you need in one place!',
    position: 'right',
    requiresRoute: '/home',
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
