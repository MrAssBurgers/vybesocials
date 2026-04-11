

## Fix 6 Issues + AI Safety Filter Toggle System (DMs and Group Chats)

### 1. Voice Recorder Lock + Send Button
Add vertical drag detection on the mic button. When finger drags up >40px during hold, recording enters "locked" mode -- stays recording after finger release. Show a send button and cancel button in locked mode.

**Files**: `ChatView.tsx` (pointer handlers with vertical tracking), `VoiceRecorder.tsx` (locked state, send/cancel UI)

### 2. Instant DM Delivery via Broadcast
Add Supabase Broadcast alongside DB insert so messages arrive sub-100ms. The existing `postgres_changes` listener serves as authoritative backup.

**Files**: `useInstantSend.ts` (broadcast after insert), `useGlobalRealtimeMessages.ts` (subscribe to broadcast with dedup)

### 3. DMHoldMenu -- Frosted Glass + No Cutoff
Replace solid `bg-[#262626]` with `bg-white/[0.08] backdrop-blur-xl border border-white/[0.12]`. Add `max-h-[70vh] overflow-y-auto` and safe-area padding.

**File**: `DMHoldMenu.tsx`

### 4. Custom Emoji / Sticker Tap Fix
Add `pointer-events-none` to img/overlay elements inside `StickerTile` so clicks always hit the button.

**File**: `StickerPanel.tsx`

### 5. AI Safety Filter Toggle for DMs
Allow users to request disabling the AI content filter for a specific DM. Both users must agree. Flow:
- User taps "Disable AI Filter" in Toybox -> inserts a `pending` request
- Other user sees an in-chat popup to accept or decline
- If accepted, safety scanning is skipped for that conversation
- Either user can re-enable anytime

**Age restriction**: Users 12 and under cannot disable it (locked). Users 13+ see a warning before disabling.

### 6. AI Safety Filter Toggle for Group Chats
Same system extended to groups -- ALL members must accept for the filter to be disabled. If any member declines, filter stays on. The existing `GroupInfoSheet.tsx` toggle becomes the request trigger.

### 7. Sticker Content Rating System (NEW)
When a user saves a sticker, the AI scans the image and labels it with a content rating stored in the `user_stickers` table:
- `safe` -- visible to everyone
- `13+` -- blurred for users 12 and under
- `18+` -- blurred for users under 18, and for anyone with AI filters enabled

When a rated sticker is sent in a chat where the recipient has AI filters on (or is underage), the message shows a **heavily blurred image** with a label like "This content is 18+ and may contain nudity" and a note to disable AI filters to view it. Users 12 and under can NEVER unblur 18+ content.

### Database Changes

**New table: `conversation_safety_overrides`**
```sql
CREATE TABLE conversation_safety_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(conversation_id, status) -- only one active request at a time
);
-- RLS: conversation members only
```

**New table: `conversation_safety_responses`** (for group chats)
```sql
CREATE TABLE conversation_safety_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id UUID REFERENCES conversation_safety_overrides(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('accepted','declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(override_id, user_id)
);
```

**Alter `user_stickers`**: Add `content_rating TEXT DEFAULT 'safe'` column.

**Edge function**: `rate-sticker-content` -- calls Lovable AI (Gemini Flash) to classify a sticker image as safe/13+/18+ when saved.

### New Files
- `src/hooks/useConversationSafety.ts` -- manage override requests, check age, subscribe to realtime
- `src/components/chat/SafetyFilterRequest.tsx` -- in-chat accept/decline popup
- `src/components/chat/SafetyFilterRequestButton.tsx` -- Toybox option
- `supabase/functions/rate-sticker-content/index.ts` -- AI sticker rating

### Modified Files
- `src/components/chat/ChatView.tsx` -- voice lock pointers, broadcast send, show safety request popup, check override before safety gate
- `src/components/chat/VoiceRecorder.tsx` -- locked mode UI
- `src/components/chat/DMHoldMenu.tsx` -- frosted glass + safe area
- `src/components/chat/StickerPanel.tsx` -- pointer-events fix
- `src/components/chat/Toybox.tsx` -- "Disable AI Filter" option
- `src/components/chat/GroupInfoSheet.tsx` -- integrate group safety request flow
- `src/components/chat/ChatMediaBubble.tsx` -- check sticker content rating + recipient age
- `src/hooks/useStickers.ts` -- trigger rating edge function after save
- `src/hooks/useInstantSend.ts` -- broadcast after insert
- `src/hooks/useGlobalRealtimeMessages.ts` -- subscribe to broadcast

