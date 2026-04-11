

## Plan: Smart Emoji Memory, Recent-Person-First Sharing, and Adaptive Learning

### 1. Frequent Reaction Emoji Memory

**Problem:** Reaction emojis in the long-press menu are static. They should learn which emojis you use most and reorder automatically.

**Solution:** Create `src/lib/frequentEmojis.ts` — a localStorage-backed tracker that records each emoji reaction tap. The context menu's emoji row (currently hardcoded `QUICK_EMOJIS` in `WordReactions.tsx` and the inline reactions in `ChatView.tsx`) will read from this store and display the user's top 6 most-used emojis instead of a fixed list. Falls back to defaults until enough data is collected.

| File | Change |
|------|--------|
| `src/lib/frequentEmojis.ts` | **New** — `recordEmoji(emoji)`, `getTopEmojis(count)` with localStorage persistence |
| `src/components/chat/ChatView.tsx` | Import `getTopEmojis` and use it for the reaction emoji row in the context menu; call `recordEmoji` when a reaction is tapped |

### 2. Recent/Pinned Person First When Sharing Clips/Videos

**Problem:** When sharing a clip or video to DMs, the share sheet doesn't prioritize who you talk to most. It should show pinned conversations first, then most recent, and learn from usage.

**Solution:** Enhance the existing `recentMessageUsers.ts` system. When the share sheet (`CameraShareSheet.tsx`) shows the DM option, add a person picker that queries conversations sorted by: pinned first → most recently messaged. Also create `src/lib/shareRecency.ts` to track which users you share TO most, and blend that with the pinned/recent data.

| File | Change |
|------|--------|
| `src/lib/shareRecency.ts` | **New** — `recordShareTo(userId)`, `getShareRankedUsers()` with localStorage |
| `src/components/camera/CameraShareSheet.tsx` | When "DM" is selected, show a person picker row with avatars sorted by share frequency → pinned → recent |

### 3. Adaptive Learning Integration

**Problem:** The existing `useUserAdaptation.ts` hook already tracks communication style but doesn't feed into emoji or share ranking.

**Solution:** Wire `recordEmoji` calls into the adaptation hook's `learnFromMessage` flow. When a user reacts, the emoji preference updates. When they share, the share target updates. This makes the system continuously learn without any extra user action.

| File | Change |
|------|--------|
| `src/hooks/useUserAdaptation.ts` | Add `recordEmojiPreference` and `recordShareTarget` methods that delegate to the new localStorage stores |

### Files Summary

| File | Change |
|------|--------|
| `src/lib/frequentEmojis.ts` | **New** — emoji frequency tracker (localStorage) |
| `src/lib/shareRecency.ts` | **New** — share target recency/frequency tracker (localStorage) |
| `src/components/chat/ChatView.tsx` | Use frequent emojis in context menu reaction row; record emoji taps |
| `src/components/camera/CameraShareSheet.tsx` | Add person picker sorted by share frequency + pinned + recent |
| `src/hooks/useUserAdaptation.ts` | Wire in emoji and share tracking |

