

# VYBE Platform — Full System Audit & Blow-Up Blueprint

After deeply reviewing every page, component, hook, and feature in this codebase, here is everything I believe needs to be fixed, perfected, tweaked, and added to make VYBE the next dominant social platform.

---

## PHASE 1: CRITICAL FIXES (Things that are broken or incomplete)

### 1. ✅ Unified Search Page
Added `/search` page with tabs: People, Posts, Hashtags, Sounds — with instant debounced typeahead results.

### 2. ✅ Stories Reliability
StoriesBar is now always visible at the top of Home (not toggle-able via widget config).

### 3. ✅ Notifications Page — Grouped & Actionable
Notifications are now grouped ("5 people liked your post"), with compact time formatting (1m, 2h, 3d).

### 4. ✅ Profile Page Polish
Added "Share Profile" button with native share / clipboard fallback.

---

## PHASE 2: UX PERFECTION (Making every screen feel premium)

### 5. Gesture Navigation Everywhere
- Swipe right to go back on every page (iOS-style)
- Swipe down to dismiss modals/sheets
- Long-press on any post for quick actions (save, share, report, not interested)
- Double-tap to like (already may exist for posts, ensure it works on clips too)

### 6. ✅ Haptic Feedback Consistency
Already extensively used across 46+ files. Covers buttons, likes, follows, story taps, send message, etc.

### 7. Loading States — Zero Skeleton Flash
Current approach is good (invisible fallbacks) but some pages still flash skeletons. Ensure:
- Home feed shows cached data instantly, never a spinner
- Profile pages show the header immediately with content loading below
- Messages list never shows empty state if conversations exist in cache

### 8. Dark/Light Mode Transitions
ThemeTransitionProvider exists. Ensure the transition is a smooth cross-fade (not a jarring flash) when switching themes, especially for custom VYBE themes.

---

## PHASE 3: MISSING VIRAL FEATURES

### 9. ✅ Dedicated Search/Discovery Page (same as #1)

### 10. ✅ Status Updates (Snapchat-style)
Added `user_statuses` table, `useUserStatus` hooks, `StatusPicker` component. Statuses show in the conversation list next to usernames.

### 11. Quick Add from Contacts
ContactDiscovery exists in onboarding but there's no way to re-access it after onboarding. Add a "Find Friends" button in the friends/search area that re-opens contact sync.

### 12. Snap Map / Friend Map
Show friends' approximate locations on a map (opt-in only).

### 13. Polls & Questions in Stories
Let users add interactive polls and question stickers to stories.

### 14. Group Chat Improvements
- Group naming & custom avatars
- @ mentions with autocomplete
- Pinned messages
- Group polls
- Admin controls

### 15. ✅ Message Reactions
Added inline emoji reaction bar to long-press context menu in ChatView.

---

## PHASE 4-7: Remaining items (not yet started)
- Onboarding optimization
- PWA prompt
- Weekly recap
- Invite system enhancement
- Push notification strategy
- Tip jar simplification
- Creator analytics
- Creator subscriptions
- Bundle size audit
- Image optimization pipeline
- Offline support
- Sound design
- Empty states
- Accessibility audit

---

## ✅ Compact Time Utility
Created `src/lib/compactTime.ts` — shared utility for Snapchat-style compact timestamps (1m, 2h, 3d, 1w).
