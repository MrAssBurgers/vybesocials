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
  // Feature category for grouping
  category?: 'social' | 'content' | 'communication' | 'discovery' | 'customization';
}

// Mobile/Tablet steps - uses bottom nav
const mobileTabletSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="tutorial-welcome-center"]',
    title: '👋 Welcome to VYBE!',
    description: 'Your new social universe awaits! This quick tour will show you all the amazing features. Tap "Next" to begin your journey.',
    position: 'bottom',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'home-nav',
    category: 'social',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories & Updates',
    description: 'Share 24-hour stories with friends! Tap any story circle to view, or long-press yours to add a new story with photos, videos, or text.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'content',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="feed-area"]',
    title: '📱 Your Personal Feed',
    description: 'Scroll through posts from friends and creators you follow. Double-tap to like, swipe to save, and tap comments to join the conversation!',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="explore-nav"]',
    title: '🔍 Explore & Discover',
    description: 'Find trending content, viral clips, and new creators! Browse by category, search for anything, or let our AI recommend content just for you.',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'explore-nav',
    category: 'discovery',
  },
  {
    id: 'create-button',
    targetSelector: '[data-tutorial="create-nav"]',
    title: '➕ Create & Share',
    description: 'This is your creative hub! Tap to open a world of creation options - from quick photos to polished videos.',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'create-nav',
    category: 'content',
  },
  {
    id: 'create-menu',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '📸 Create Menu',
    description: 'Upload photos & videos with "Create Post", capture moments instantly with "Camera", or explore our powerful VYBE Hub for more!',
    position: 'bottom',
    action: 'openCreateMenu',
    highlightNav: 'create-nav',
    category: 'content',
  },
  {
    id: 'vybe-hub',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '🚀 VYBE Hub',
    description: 'Your all-in-one destination! 🛍️ Marketplace for buying & selling, 📅 Events for meetups & parties, and 👥 Communities for Discord-style servers.',
    position: 'bottom',
    action: 'openVYBEHub',
    highlightNav: 'create-nav',
    category: 'discovery',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="messages-nav"]',
    title: '💬 Messages & Chats',
    description: 'Chat 1-on-1 or in groups! Features include: read receipts, typing indicators, voice messages, GIFs, reactions, and even video calls. Red badge = unread messages!',
    position: 'top',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'messages-nav',
    category: 'communication',
  },
  {
    id: 'notifications',
    targetSelector: '[data-tutorial="notifications-badge"]',
    title: '🔔 Stay Updated',
    description: 'Never miss a moment! Get notified about likes, comments, friend requests, and messages. Customize which notifications you want in Settings.',
    position: 'top',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'settings',
    targetSelector: '[data-tutorial="settings-nav"]',
    title: '⚙️ Settings & Themes',
    description: 'Make VYBE yours! Customize themes, colors, sounds, and privacy settings. Design your own theme or download community creations from our Theme Marketplace!',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'settings-nav',
    category: 'customization',
  },
  {
    id: 'complete',
    targetSelector: '[data-tutorial="tutorial-welcome-center"]',
    title: '🎉 You\'re All Set!',
    description: 'You\'ve got the basics! Pro tips: Shake your phone to find nearby friends with FriendDrop, long-press posts for more options, and check Help in Settings to replay this tour anytime.',
    position: 'bottom',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
];

// Desktop steps - uses sidebar
const desktopSteps: TutorialStep[] = [
  {
    id: 'welcome',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '👋 Welcome to VYBE!',
    description: 'Your new social universe on desktop! This quick tour covers all the powerful features. Click "Next" to explore.',
    position: 'right',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories & Updates',
    description: 'Share 24-hour stories! Click any circle to watch, or click your own to add photos, videos, or text updates.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'content',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="feed-area"]',
    title: '📱 Your Personal Feed',
    description: 'Browse posts from friends and creators. Double-click to like, hover for quick actions, and use keyboard shortcuts for power-user navigation!',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="sidebar-explore"]',
    title: '🔍 Explore',
    description: 'Discover trending content, short clips, and new creators! Our AI recommendations learn your taste over time.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="sidebar-messages"]',
    title: '💬 Messages',
    description: 'Full-featured chat with typing indicators, read receipts, voice messages, GIFs, reactions, and HD video calls!',
    position: 'right',
    requiresRoute: '/home',
    category: 'communication',
  },
  {
    id: 'community',
    targetSelector: '[data-tutorial="sidebar-community"]',
    title: '👥 Communities',
    description: 'Join Discord-style servers with text channels, voice rooms, and custom roles. Create your own community and invite friends!',
    position: 'right',
    requiresRoute: '/home',
    category: 'social',
  },
  {
    id: 'market',
    targetSelector: '[data-tutorial="sidebar-market"]',
    title: '🛍️ Marketplace',
    description: 'Buy and sell with the VYBE community! List items, browse categories, and chat with sellers - all within the app.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'events',
    targetSelector: '[data-tutorial="sidebar-events"]',
    title: '📅 Events',
    description: 'Discover local meetups, online events, and parties! RSVP, invite friends, and never miss what\'s happening.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'create',
    targetSelector: '[data-tutorial="sidebar-create"]',
    title: '➕ Create Content',
    description: 'Upload photos, videos, and clips to share with your followers. Use AI captions for accessibility and reach more people!',
    position: 'right',
    requiresRoute: '/home',
    category: 'content',
  },
  {
    id: 'notifications',
    targetSelector: '[data-tutorial="sidebar-notifications"]',
    title: '🔔 Notifications',
    description: 'Stay updated on likes, comments, friend requests, and messages. Click to see all activity at a glance.',
    position: 'right',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'profile',
    targetSelector: '[data-tutorial="sidebar-profile"]',
    title: '👤 Your Profile',
    description: 'View and edit your profile, check your posts, and manage your followers. Click the gear icon for settings!',
    position: 'right',
    requiresRoute: '/home',
    category: 'social',
  },
  {
    id: 'themes',
    targetSelector: '[data-tutorial="sidebar-settings"]',
    title: '🎨 Themes & Customization',
    description: 'Make VYBE uniquely yours! Design custom themes, browse the Theme Marketplace, or use our Design Builder for pixel-perfect control.',
    position: 'right',
    requiresRoute: '/home',
    optional: true,
    category: 'customization',
  },
  {
    id: 'complete',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '🎉 You\'re Ready!',
    description: 'You\'ve mastered the basics! Pro tips: Use keyboard shortcuts (? to see all), right-click for context menus, and visit Settings → Help to replay this tour.',
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
