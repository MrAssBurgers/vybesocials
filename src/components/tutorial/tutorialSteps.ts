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
    description: 'Your all-in-one social universe! This quick tour covers every feature so you know exactly where everything is. Let\'s go!',
    position: 'bottom',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'home-nav',
    category: 'social',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories',
    description: 'Share photos, videos, or text that disappear after 24 hours. Tap any circle to watch, tap yours to add. You can set stories to "Close Friends Only" for private sharing.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'content',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="feed-area"]',
    title: '📱 Your Feed',
    description: 'Two feeds in one: "For You" shows trending posts from everyone, "Following" shows only people you follow. Double-tap any post to like it, tap the bookmark icon to save for later.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="explore-nav"]',
    title: '🔍 Explore & Discover',
    description: 'Search for people, posts, hashtags, and trending content. Browse categories, discover new creators, and find viral clips. Our AI learns your taste over time!',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'explore-nav',
    category: 'discovery',
  },
  {
    id: 'create-button',
    targetSelector: '[data-tutorial="create-nav"]',
    title: '➕ Create Content',
    description: 'Your creative hub! Tap once to see creation options, double-tap for the VYBE Hub with marketplace, events, and communities.',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'create-nav',
    category: 'content',
  },
  {
    id: 'create-menu',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '📸 Create Menu',
    description: '"Create Post" to upload photos & videos with captions, filters, and tags. "Camera" for instant captures. Posts can be liked, commented on, shared, and bookmarked by others.',
    position: 'bottom',
    action: 'openCreateMenu',
    highlightNav: 'create-nav',
    category: 'content',
  },
  {
    id: 'vybe-hub',
    targetSelector: '.liquid-glass.rounded-3xl',
    title: '🚀 VYBE Hub',
    description: '🛍️ Marketplace: Buy & sell items with built-in payments. 📅 Events: Create & join meetups, parties, and hangouts with RSVP. 👥 Communities: Group servers with text channels, voice rooms, and roles.',
    position: 'bottom',
    action: 'openVYBEHub',
    highlightNav: 'create-nav',
    category: 'discovery',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="messages-nav"]',
    title: '💬 Messages',
    description: 'Full-featured chat: 1-on-1 and group DMs, read receipts, typing indicators, voice messages, GIFs, reactions, file sharing, and video/voice calls. Red badge = unread messages!',
    position: 'top',
    requiresRoute: '/home',
    action: 'closeMenus',
    highlightNav: 'messages-nav',
    category: 'communication',
  },
  {
    id: 'notifications',
    targetSelector: '[data-tutorial="notifications-badge"]',
    title: '🔔 Notifications',
    description: 'All your activity in one place: likes, comments, follows, friend requests, mentions, and announcements. The red badge shows your unread count. Customize what you get in Settings.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'profile',
    targetSelector: '[data-tutorial="profile-nav"]',
    title: '👤 Your Profile',
    description: 'View your posts, followers, following, and badges. Edit your display name, bio, avatar, and link. Your unique @username is your identity across VYBE. Access Settings from here too!',
    position: 'top',
    requiresRoute: '/home',
    highlightNav: 'profile-nav',
    category: 'social',
  },
  {
    id: 'complete',
    targetSelector: '[data-tutorial="tutorial-welcome-center"]',
    title: '🎉 You\'re All Set!',
    description: 'Pro tips: Long-press posts for more options, shake your phone to find nearby friends with FriendDrop, and check your daily challenges to earn XP & badges. Replay this tour anytime from Settings → Help!',
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
    description: 'Your all-in-one social universe on desktop! This tour shows you every feature so you know exactly where everything is. Click "Next" to start.',
    position: 'right',
    requiresRoute: '/home',
    action: 'closeMenus',
    category: 'social',
  },
  {
    id: 'stories',
    targetSelector: '[data-tutorial="stories"]',
    title: '✨ Stories',
    description: 'Share 24-hour stories with photos, videos, or text. Click any circle to watch, click yours to add new content. Set stories to "Close Friends Only" for private sharing.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'content',
  },
  {
    id: 'feed',
    targetSelector: '[data-tutorial="feed-area"]',
    title: '📱 Your Feed',
    description: '"For You" shows trending posts from everyone, "Following" shows only people you follow. Double-click to like, hover for quick actions, bookmark to save posts for later.',
    position: 'bottom',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'explore',
    targetSelector: '[data-tutorial="sidebar-explore"]',
    title: '🔍 Explore',
    description: 'Search for people, posts, hashtags, and trending content. Browse categories, discover creators, and find viral clips. AI recommendations improve as you use the app.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'messages',
    targetSelector: '[data-tutorial="sidebar-messages"]',
    title: '💬 Messages',
    description: 'Full-featured chat: 1-on-1 and group DMs, read receipts, typing indicators, voice messages, GIFs, reactions, file sharing, and HD video/voice calls.',
    position: 'right',
    requiresRoute: '/home',
    category: 'communication',
  },
  {
    id: 'community',
    targetSelector: '[data-tutorial="sidebar-community"]',
    title: '👥 Communities',
    description: 'Join or create community servers with text channels, voice rooms, custom roles, and permissions. Invite friends and build your own community with moderation tools.',
    position: 'right',
    requiresRoute: '/home',
    category: 'social',
  },
  {
    id: 'market',
    targetSelector: '[data-tutorial="sidebar-market"]',
    title: '🛍️ Marketplace',
    description: 'Buy and sell within the VYBE community. List items with photos and pricing, browse categories, chat with sellers, and complete transactions securely.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'events',
    targetSelector: '[data-tutorial="sidebar-events"]',
    title: '📅 Events',
    description: 'Discover and create meetups, parties, and online events. RSVP, invite friends, and get reminders. See what\'s happening near you or globally.',
    position: 'right',
    requiresRoute: '/home',
    category: 'discovery',
  },
  {
    id: 'create',
    targetSelector: '[data-tutorial="sidebar-create"]',
    title: '➕ Create Content',
    description: 'Upload photos, videos, and clips to share with your followers. Add captions, tags, and filters. Posts can be liked, commented on, shared, and bookmarked.',
    position: 'right',
    requiresRoute: '/home',
    category: 'content',
  },
  {
    id: 'notifications',
    targetSelector: '[data-tutorial="sidebar-notifications"]',
    title: '🔔 Notifications',
    description: 'All activity at a glance: likes, comments, follows, friend requests, mentions, and announcements. Customize notification preferences in Settings.',
    position: 'right',
    requiresRoute: '/home',
    optional: true,
    category: 'social',
  },
  {
    id: 'profile',
    targetSelector: '[data-tutorial="sidebar-profile"]',
    title: '👤 Your Profile',
    description: 'View and edit your profile: display name, bio, avatar, link, and badges. See your posts, followers, and following. Your @username is your unique identity on VYBE.',
    position: 'right',
    requiresRoute: '/home',
    category: 'social',
  },
  {
    id: 'themes',
    targetSelector: '[data-tutorial="sidebar-settings"]',
    title: '🎨 Settings & Themes',
    description: 'Customize everything: themes, colors, sounds, haptics, privacy, and notifications. Design your own theme or browse the Theme Marketplace. Dark mode, custom fonts, and more!',
    position: 'right',
    requiresRoute: '/home',
    optional: true,
    category: 'customization',
  },
  {
    id: 'complete',
    targetSelector: '[data-tutorial="sidebar-home"]',
    title: '🎉 You\'re Ready!',
    description: 'Pro tips: Use keyboard shortcuts (? to see all), right-click for context menus, check daily challenges for XP & badges, and visit Settings → Help to replay this tour anytime.',
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
