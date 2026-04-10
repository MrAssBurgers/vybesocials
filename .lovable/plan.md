

## Fix: Explore Bar Gap + Announcement Cutoff + Dismiss Behavior

### Problem 1: Explore Tab Bar Gap
The tab bar wrapper has `pt-[env(safe-area-inset-top)]` on the outer div and then `py-1` on the inner motion div. On iPad where safe-area-inset-top is 0, the `py-1` still creates a visible gap above the tab bar.

**Fix in `src/pages/Explore.tsx`:**
- Remove `py-1` from the motion.div wrapper around ExploreTabBar
- Add `mt-1` only inside the tab bar or use a minimal top offset so the bar sits flush at the top

### Problem 2: Announcement Modal Cutoff
The open letter modal uses `fixed inset-x-4 top-1/2 -translate-y-1/2` with no max-height or scroll. Long announcements (like the release notes in the screenshot) get cut off at the bottom, especially on shorter viewports.

**Fix in `src/components/announcements/AnnouncementModal.tsx`:**
- Add `max-h-[85vh]` to the modal container
- Make the content area scrollable with `overflow-y-auto` 
- Ensure the header and footer stay pinned (flex column layout with the middle section scrolling)

### Problem 3: Dismiss = Permanent + Show in Notifications
Currently dismissing already inserts into `dismissed_announcements` so it won't reappear — that part works. But the user wants dismissed announcements to still appear in the Notifications page as a "Recent Announcements" section.

**Changes:**
- **`src/components/announcements/AnnouncementModal.tsx`**: When user dismisses (X or Dismiss button), the announcement disappears permanently from the home screen (already works via `dismissed_announcements` table)
- **`src/pages/Notifications.tsx`**: Add a pinned "Announcements" section at the top of the notifications list that shows the most recent announcements (fetched separately from the `announcements` table, not filtered by dismissed status). This gives users a place to re-read announcements they closed. Show the latest 3-5 announcements with title, timestamp, and a tap-to-expand inline view.
- **`src/hooks/useAnnouncements.ts`**: Add a new `useRecentAnnouncements` hook that fetches active announcements without filtering by dismissed status (for the notifications page).

### Files to Change

| File | Change |
|------|--------|
| `src/pages/Explore.tsx` | Remove inner padding causing tab bar gap |
| `src/components/announcements/AnnouncementModal.tsx` | Add max-height + scrollable content area |
| `src/pages/Notifications.tsx` | Add "Recent Announcements" section at top |
| `src/hooks/useAnnouncements.ts` | Add `useRecentAnnouncements` hook |

