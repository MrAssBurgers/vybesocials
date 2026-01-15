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
}

// Mobile/Tablet steps - uses bottom nav
const mobileTabletSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="home-nav"]',
    title: '👋 Welcome to VYBE!',
    description: 'Let\'s take a quick tour of the app. We\'ll show you all the key features to get you started!',
    position: 'top',
    requiresRoute: '/home',
    action: 'closeMenus',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="home-nav"]',
    title: '🏠 Home Feed',
    description: 'This is your home! View posts, photos, and videos from friends and creators you follow. Tap to always come back here.',
    position: 'top',
    requiresRoute: '/home',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories',
    description: 'Stories disappear after 24 hours! Tap on any avatar to view someone\'s story, or tap yours to create one.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
  },
  {
    id: 'clips',
    targetSelector: '[data-tutorial="clips-nav"]',
    title: '🎬 Short Clips',
    description: 'Watch short-form videos here! Swipe up/down to browse, tap to mute/unmute, and hold to pause.',
    position: 'top',
    requiresRoute: '/home',
  },
  {
    id: 'create-button',
    targetSelector: '[data-tutorial="create-nav"]',
    title: '➕ Create Content',
    description: 'Tap this button to open the Create Menu. You can upload posts, use the camera, or access the VYBE Hub!',
    position: 'top',
    requiresRoute: '/home',
  },
  {
    id: 'create-menu',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '📸 Create Menu',
    description: 'From here you can: Create Post (upload photos/videos), Camera (capture moments instantly), or open the VYBE Hub for more options!',
    position: 'bottom',
    action: 'openCreateMenu',
  },
  {
    id: 'vybe-hub',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '🚀 VYBE Hub',
    description: 'The VYBE Hub is your quick access to: Marketplace (buy & sell), Community Events (discover what\'s happening), and Communities (Discord-style servers)!',
    position: 'bottom',
    action: 'openVYBEHub',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="messages-nav"]',
    title: '💬 Messages',
    description: 'Chat with friends and groups here! You\'ll see typing indicators and when someone is in the chat. Red badge shows unread messages.',
    position: 'top',
    requiresRoute: '/home',
    action: 'closeMenus',
  },
  {
    id: 'settings',
    targetSelector: '[data-tutorial="settings-nav"]',
    title: '⚙️ Settings',
    description: 'Manage your profile, privacy settings, notifications, and app preferences here. You can also restart this tutorial anytime from Help & Support!',
    position: 'top',
    requiresRoute: '/home',
  },
];

// Desktop steps - uses sidebar
const desktopSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '👋 Welcome to VYBE!',
    description: 'Let\'s take a quick tour of the app. We\'ll show you all the key features to get you started!',
    position: 'right',
    requiresRoute: '/home',
    action: 'closeMenus',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '🏠 Home Feed',
    description: 'This is your home! View posts, photos, and videos from friends and creators you follow. Click to always come back here.',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories',
    description: 'Stories disappear after 24 hours! Click on any avatar to view someone\'s story, or click yours to create one.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
  },
  {
    id: 'clips',
    targetSelector: '[data-tutorial="sidebar-clips"]',
    title: '🎬 Short Clips',
    description: 'Watch short-form videos here! Use arrow keys or scroll to browse, click to mute/unmute.',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="sidebar-explore"]',
    title: '🔍 Explore',
    description: 'Discover new content, trending posts, and find new creators to follow!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="sidebar-messages"]',
    title: '💬 Messages',
    description: 'Chat with friends and groups here! You\'ll see typing indicators and when someone is in the chat. Red badge shows unread messages.',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'community',
    targetSelector: '[data-tutorial="sidebar-community"]',
    title: '👥 Community',
    description: 'Join Discord-style servers and connect with communities that share your interests. Create your own server or join existing ones!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'notifications',
    targetSelector: '[data-tutorial="sidebar-notifications"]',
    title: '🔔 Notifications',
    description: 'See who liked your posts, new followers, comments, and important updates. Red badge shows unread notifications.',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'settings',
    targetSelector: '[data-tutorial="sidebar-settings"]',
    title: '⚙️ Settings',
    description: 'Manage your profile, privacy settings, notifications, and app preferences here. You can also restart this tutorial anytime!',
    position: 'right',
    requiresRoute: '/home',
  },
  {
    id: 'create',
    targetSelector: '[data-tutorial="sidebar-create"]',
    title: '➕ Create Content',
    description: 'Click here to upload photos, videos, or clips to share with your followers!',
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
