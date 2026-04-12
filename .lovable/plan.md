

## Fix Story Bugs, Remove Excess Toasts, Duplicate NFC, Quick Add in DMs, and Login

### Changes

**1. Remove duplicate NFC button (`src/pages/NewMessage.tsx`)**
Delete line 339 — the second `<NFCFriendShare variant="icon" />`.

**2. Fix Google OAuth login (`src/pages/Landing.tsx`)**
Change `redirect_uri` from `window.location.origin` to `${window.location.origin}/auth/callback` so the OAuth callback is handled correctly.

**3. Fix Camera → Story integration (`src/components/stories/StoryCreator.tsx` + `src/components/camera/Camera.tsx`)**
- Add an `onCapture` prop to `Camera` — when provided, bypasses the share sheet and returns the captured media (file + URL + type) directly to the caller.
- In `StoryCreator`, pass `onCapture` to `Camera` so captured media flows into `selectedFile` / `preview` / `mediaInfo` and the user lands on the story preview screen.

**4. Remove excessive toast notifications**
- `src/hooks/useDailyLogin.ts` — Remove the `toast.success` calls for XP granted on daily login (lines 60-63).
- `src/hooks/useLoginStreak.ts` — Remove the `toast.warning` for streak expiring soon (lines 91-95).
- `src/components/vybepass/RewardNotificationProvider.tsx` — Remove `toast.info`, `toast.success`, and `toast.error` inside the `onEquipReward` handler (the modal itself is sufficient feedback).
- `src/components/friends/NFCFriendShare.tsx` — Remove `toast.success` for "Added as friend" and "Friend request sent" (keep error toasts since those are important).

**5. Add Snapchat-style Quick Add to DM list (`src/components/chat/ConversationList.tsx`)**
- At the bottom of the conversation list (after `RecommendedFriendsSection`), add a horizontal scrolling "Quick Add" row with Snapchat-style cards: avatar on top, name below, blue "Add" button — matching the existing `MutualFriendsQuickAdd` component style but displayed horizontally beneath conversations.

### Files to modify
- `src/pages/NewMessage.tsx` — remove duplicate NFC
- `src/pages/Landing.tsx` — fix OAuth redirect
- `src/components/camera/Camera.tsx` — add `onCapture` prop
- `src/components/stories/StoryCreator.tsx` — wire camera capture to story preview
- `src/hooks/useDailyLogin.ts` — remove toast
- `src/hooks/useLoginStreak.ts` — remove toast
- `src/components/vybepass/RewardNotificationProvider.tsx` — remove toasts
- `src/components/friends/NFCFriendShare.tsx` — remove success toasts
- `src/components/chat/ConversationList.tsx` — add Quick Add section

