

# VYBE Platform — Full System Audit & Blow-Up Blueprint

After deeply reviewing every page, component, hook, and feature in this codebase, here is everything I believe needs to be fixed, perfected, tweaked, and added to make VYBE the next dominant social platform.

---

## PHASE 1: CRITICAL FIXES (Things that are broken or incomplete)

### 1. Unified Search Page
There is NO dedicated search/discovery page for finding **people**. Explore only searches content. Add a `/search` page with tabs: People, Posts, Sounds, Communities, Events, Hashtags — with instant typeahead results. This is table stakes for any social platform.

### 2. Stories Reliability
StoriesBar exists but Stories are buried inside the Home widget system. Stories need to be:
- Always visible at the top of Home (not toggle-able via widget config)
- Support text-on-color stories (like Instagram's "Create" mode)
- Add story reactions (emoji quick-react that the poster sees)
- Add story reply-to-DM flow

### 3. Notifications Page — Grouped & Actionable
Current notifications are a flat list. Group them:
- "5 people liked your post" (collapsed, expandable)
- Friend request cards with mutual friend count
- Missed call cards with "Call Back" button
- Use compact time formatting (1m, 2h, 3d) matching the DM list

### 4. Profile Page Polish
- Add a "Share Profile" button (deep link / QR code)
- Show VYBE DNA summary inline (Creative/Social/Activity bars)
- Show streak count with top friends
- Add highlight reels (pinned stories collections, like Instagram Highlights)

---

## PHASE 2: UX PERFECTION (Making every screen feel premium)

### 5. Gesture Navigation Everywhere
- Swipe right to go back on every page (iOS-style)
- Swipe down to dismiss modals/sheets
- Long-press on any post for quick actions (save, share, report, not interested)
- Double-tap to like (already may exist for posts, ensure it works on clips too)

### 6. Haptic Feedback Consistency
The `haptics` utility exists but isn't used uniformly. Add haptic feedback to:
- Every button press, tab switch, pull-to-refresh
- Like/unlike, follow/unfollow
- Story progression taps
- Send message

### 7. Loading States — Zero Skeleton Flash
Current approach is good (invisible fallbacks) but some pages still flash skeletons. Ensure:
- Home feed shows cached data instantly, never a spinner
- Profile pages show the header immediately with content loading below
- Messages list never shows empty state if conversations exist in cache

### 8. Dark/Light Mode Transitions
ThemeTransitionProvider exists. Ensure the transition is a smooth cross-fade (not a jarring flash) when switching themes, especially for custom VYBE themes.

---

## PHASE 3: MISSING VIRAL FEATURES

### 9. Dedicated Search/Discovery Page
As mentioned — this is the single biggest missing feature. Every major platform has it. Without it, users can't find friends organically.

### 10. Status Updates (Snapchat-style)
Let users set a text/emoji status that shows:
- Next to their name in the conversation list
- On their profile
- In the friends list
Examples: "📚 Studying", "🎮