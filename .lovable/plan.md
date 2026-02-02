
# Push Notifications and Tab Badge Enhancement Plan

## Overview
This plan implements three key improvements to the notification system:

1. **Reliable Push Notifications** - Ensure push notifications work on all devices (mobile, tablet, desktop browsers)
2. **Clean & Fresh Mobile/Tablet Notification UI** - Modernize the notifications experience on touch devices  
3. **Discord/Snapchat-style Tab Notifications** - Show unread count in browser tab title (like "(3) VYBE")

---

## Current System Analysis

### What's Already Working
- Service worker (`public/sw.js`) handles push notifications
- Web Push subscription via `usePushNotifications.ts`
- Real-time message notifications via `useMessageNotifications.ts`
- Native browser notifications when page is hidden
- Unread counts in bottom nav and sidebars

### Gaps Identified
- **No VAPID_PRIVATE_KEY** - The push notification edge function can't send encrypted pushes without the private key
- **No tab title updates** - Browser tabs don't show unread counts like Discord/Snapchat
- **Notifications page could be more polished** - Mobile experience needs refresh with modern styling
- **Push edge function needs Web Push protocol** - Currently using basic fetch, needs proper encryption

---

## Implementation Plan

### Phase 1: Tab Title Notification Badge (Browser/Desktop)
Create a new hook that updates the document title with unread counts - exactly like Discord and Snapchat.

**New file:** `src/hooks/useTabNotificationBadge.ts`
- Monitors total unread count (messages + notifications)
- Updates `document.title` dynamically:
  - No unreads: `VYBE`
  - With unreads: `(5) VYBE` 
  - Flashing effect when new message arrives (optional)
- Works on all browsers (Chrome, Firefox, Safari, Edge)
- Respects user's current page context

**Integration in `App.tsx`:**
- Add the hook to run globally
- Combine message + notification counts

### Phase 2: Improved Push Notification Reliability

**Edge Function Enhancement:** `supabase/functions/send-push-notification/index.ts`
- Install web-push compatible library for proper VAPID signing
- Handle different subscription formats (web, iOS Safari, Android)
- Add retry logic for failed deliveries
- Clean up expired/invalid tokens automatically

**Service Worker Improvements:** `public/sw.js`
- Better handling of different notification types
- iOS-specific handling (Safari has different behavior)
- Improved action buttons for mobile
- Better vibration patterns for urgency levels

**Frontend Improvements:**
- Enhanced `PushNotificationPrompt.tsx` with device-specific messaging
- Better permission handling for iOS Safari
- Auto-retry subscription if it expires

### Phase 3: Clean & Fresh Mobile/Tablet Notification UI

**Redesigned Notifications Page:** `src/pages/Notifications.tsx`
- Modern card design with liquid glass styling
- Larger touch targets for mobile (min 48px)
- Swipe actions for quick dismiss/mark read
- Pull-to-refresh functionality
- Empty state with friendly illustrations
- Smooth animations with Framer Motion
- Better avatar/icon sizing for tablets

**Mobile Header Enhancement:** `src/components/layout/MobileHeader.tsx`
- Animated notification bell with pulse effect
- Improved badge positioning for notched devices
- Better touch feedback

---

## Technical Details

### Tab Badge Implementation
```
// Pattern used by Discord/Snapchat
const originalTitle = "VYBE";
const unreadTotal = unreadMessages + unreadNotifications;

if (unreadTotal > 0) {
  document.title = `(${unreadTotal > 99 ? "99+" : unreadTotal}) ${originalTitle}`;
} else {
  document.title = originalTitle;
}
```

### Push Notification Flow Improvement
```
Current:  User → Subscribe → Store token → Edge function (fails without encryption)
Improved: User → Subscribe → Store token → Edge function with web-push library → Delivery
```

### Notification UI Hierarchy (Mobile/Tablet)
- Pinned notifications (if any)
- Unread notifications (sorted by time)
- Read notifications (dimmed, sorted by time)
- Each card: Avatar (48px) + Icon badge + Text + Time + Action buttons

---

## Files to Create
1. `src/hooks/useTabNotificationBadge.ts` - Tab title badge logic

## Files to Modify
1. `src/App.tsx` - Add tab badge hook
2. `src/pages/Notifications.tsx` - Refreshed mobile/tablet UI
3. `src/components/layout/MobileHeader.tsx` - Enhanced notification indicator
4. `src/components/notifications/PushNotificationPrompt.tsx` - Device-specific improvements
5. `public/sw.js` - Enhanced service worker handling
6. `supabase/functions/send-push-notification/index.ts` - Improved push delivery
7. `src/hooks/usePushNotifications.ts` - Better subscription management
8. `src/hooks/useMessageNotifications.ts` - Trigger tab badge updates

---

## Expected Behavior After Implementation

**On Mobile/Tablet:**
- Clean, modern notification cards with smooth animations
- Easy-to-tap buttons (48px+ touch targets)
- Push notifications arrive reliably
- Pull-to-refresh support
- Swipe gestures for quick actions

**On Desktop/Browser:**
- Tab shows "(3) VYBE" when there are unreads
- Count updates in real-time as messages arrive
- Count clears when user reads messages
- Works across all tabs if multiple VYBE tabs are open

**Push Notifications:**
- Work reliably on Chrome, Firefox, Safari, Edge
- Work on iOS Safari (with limitations)
- Work on Android Chrome
- Show action buttons where supported
- Auto-cleanup of expired subscriptions
