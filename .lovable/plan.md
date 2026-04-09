

## DM System Revamp — Snapchat-Perfect Messaging

This revamp addresses the remaining bugs and upgrades the DM experience to match Snapchat's messaging standards.

### 1. Fix the 409 friend_requests error on app load

The `AutoFriendDrop` component on the Home page fires `useSendFriendRequest` which hits the unique constraint. The `useSendFriendRequest` hook already handles `23505` gracefully (line 330), but the error still surfaces in the network console because the HTTP 409 happens before the JS catch. Fix: add an `onError` handler that silences `23505` errors and also add a pre-check in `AutoFriendDrop` to skip users who already have a pending/accepted request.

### 2. Remove the "encrypted" label from chat header

Line 1287-1288 in `ChatView.tsx` still shows a green lock icon with "encrypted" text. Remove this and replace with just the `LivePresenceBar` — clean like Snapchat where you only see online/typing/last seen.

### 3. Fix VYBE Snap display — the actual image issue

The storage policy migration was created but the core problem persists: when `signedUrlCache` fails to sign (returns the original URL as fallback for failed entries via `isFailedUrl`), the VybeViewer treats it as a valid URL, tries to load a raw storage URL, gets a 403, and shows "Media not available."

Fix the `useFastSignedUrl` hook: when a URL is marked as `failed` in cache, return `null` instead of the original URL so the viewer shows the loading state and retries. Also add a retry mechanism in VybeViewer — if the signed URL fails on first try, wait 2 seconds and retry once (the policy might not have propagated yet).

### 4. Snapchat-style conversation list status indicators

Replace the current text-based preview in `ConversationContent` with Snapchat's iconic status system:
- **Red arrow** (sent snap) / **Red square** (received snap) for VYBE messages  
- **Blue arrow** (sent chat) / **Blue square** (received chat) for text messages
- **Purple arrow/square** for audio/voice messages
- Show "Delivered", "Opened", "Received" as status text instead of message preview content
- Show relative time (1m, 5m, 2h, 1d) instead of "5 minutes ago"

### 5. Snapchat-style chat header — minimal and clean

Simplify the chat header:
- Avatar + Name + online dot only (no lock, no "encrypted")
- Streak flame next to name if active
- Call buttons on the right
- Typing/presence shown inline below name

### 6. Snapchat-style message input — camera-first

Reorganize the input bar:
- Camera icon on the left (prominent, primary color) — opens VYBE camera
- Text input in center with rounded pill shape
- When empty: show mic button on right
- When typing: show send button on right  
- Remove the view mode button from the default view (move to long-press/menu)
- Remove the toybox button clutter — consolidate into a single "+" menu

### 7. Compact time formatting in conversation list

Replace `formatDistanceToNow` with compact format: "1m", "5m", "2h", "3d", "1w" — matching Snapchat's style.

---

### Technical details

**Files to modify:**
- `src/components/chat/ChatView.tsx` — Remove "encrypted" label, simplify header, restructure input area
- `src/components/chat/ConversationList.tsx` — Snapchat status indicators, compact time, cleaner preview text
- `src/components/chat/VybeViewer.tsx` — Add retry logic for signed URL failures
- `src/hooks/useFastSignedUrl.ts` — Don't return failed URLs as valid
- `src/lib/signedUrlCache.ts` — Add `isFailedUrl` export for viewer to check
- `src/components/friends/AutoFriendDrop.tsx` — Silence 409 errors
- `src/hooks/useFriends.ts` — Silence the 23505 error in `onError` callback

**No database changes needed** — the storage policy migration from the last change should handle access. The fixes are purely frontend.

