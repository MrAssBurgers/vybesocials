

## Redesign Friend Link + Fix Quick Add Recommendations

### Problem 1: Friend Link UI
The current Friend Link is an 895-line cyberpunk-themed monolith that mixes QR code scanning and NFC into one cluttered view. You want a clean, modern two-tab layout separating QR and NFC.

### Problem 2: Quick Add not showing recommendations
The current `RecommendedFriendsSection` in the Chat page uses `useSuggestedFriends()` which ONLY returns friends-of-friends. If you have no friends yet (or few), it returns nothing. The `MutualFriendsQuickAdd` component has a fallback to interest/general suggestions but isn't being used in the conversation list. Quick Add also needs to match Snapchat's exact layout: vertical list rows with avatar, name, mutual info, blue "+" Add button, and X dismiss.

### Plan

**1. Rewrite `AutoFriendDrop.tsx` with tabbed layout**
- Replace the entire 895-line file with a clean, modern component (~400 lines)
- Two tabs using the existing `Tabs` component: "QR Code" and "NFC"
- **QR Tab**: Shows your QR code prominently at top with avatar overlay, camera scanner below with corner brackets, clean white/themed card design
- **NFC Tab**: Clean illustration/animation of two phones tapping together, status text ("Hold phones together"), uses existing `useNativeFriendDrop` hook for native NFC, falls back to the existing `useFriendDropSync` proximity system
- Keep all existing found/exchanging/success phase flows but with clean modern styling (drop cyberpunk fonts, HUD text, scan beams)
- Remove the floating "FRIEND LINK" pill from home screen — open via explicit navigation instead
- Keep the swing-to-activate gesture

**2. Fix Quick Add to always show recommendations (Snapchat-exact)**
- Update `RecommendedFriendsSection` in `ConversationList.tsx` to use BOTH data sources: `useSuggestedFriends()` (mutual-based) AND the general `useSuggestedUsers()` fallback from `MutualFriendsQuickAdd`
- Match Snapchat's Quick Add layout exactly:
  - Section header: "Quick Add" with "More" link
  - Vertical list of rows (not horizontal cards)
  - Each row: 44px avatar | Name + "@username" or "X mutual friends" subtitle | blue "Add" button + X dismiss
  - Rows animate out on add/dismiss
  - Show up to 8 suggestions, combining mutual friends first then general users

**3. Extract shared suggestion hook**
- Create `src/hooks/useQuickAddSuggestions.ts` that merges mutual friend suggestions with interest-based fallback suggestions, deduplicates, and filters dismissed users — single source of truth for both Quick Add locations

### Technical Details

Files modified:
- **`src/components/friends/AutoFriendDrop.tsx`** — Full rewrite with tabbed QR/NFC UI
- **`src/components/chat/ConversationList.tsx`** — Update `RecommendedFriendsSection` to use merged suggestions and match Snapchat layout exactly
- **`src/hooks/useQuickAddSuggestions.ts`** — New hook combining both suggestion sources

Files unchanged:
- All existing hooks (`useFriendDropSync`, `useNativeFriendDrop`, `useSwingDetection`, `useSendFriendRequest`) stay as-is
- `useFriendsOfFriends.ts` stays as-is
- QR generation logic stays the same (external API)

