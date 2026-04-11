

## Fix Calling, Sticker Saving, and Call UI Issues

### Issues Found

**1. Sticker saving fails — RLS mismatch**
The `user_stickers` table uses `auth.uid()` in its RLS policy (`user_id = auth.uid()`), and the hook correctly uses `profile.user_id` (the auth UUID). However, the previous security migration may have broken the storage signed URL flow for sticker images. The `chat-media` storage bucket policies were hardened, potentially blocking access to images needed for stickers. Additionally, the sticker save itself should work, but the image URLs being saved may be raw storage paths that fail when the signed URL can't be generated.

**Action**: Verify the storage SELECT policy allows reading chat-media for conversation members. Add error logging to `useAddSticker` to surface the actual failure. Ensure the `image_url` being saved is a valid storage path.

**2. Calling fails every time — P2P timeout**
The P2P calling flow inserts into the `calls` table using `profile.id` (profiles table UUID) as `caller_id`. The RLS policy checks `caller_id = public.current_profile_id()`, which maps `auth.uid()` to `profiles.id`. This should work. The likely failure point is the P2P signaling — the 15-second join timeout fires before the other user connects. On iPad specifically, `getUserMedia` can fail silently or the Supabase Realtime broadcast channel may not connect properly.

**Action**: 
- Increase the P2P join timeout from 15s to 30s
- Add better error handling and toast messages during P2P connection
- Ensure the P2P `connect()` method doesn't silently fail on iPad Safari
- Add a retry mechanism before giving up

**3. Call connecting UI is cut off and transparent**
The main call overlay (line 877-886) has a solid dark gradient background, which should work. But the **connecting state** for audio calls shows just an avatar with "Connecting..." text over the gradient — this looks fine. The issue is likely on **iPad** where the overlay height doesn't account for safe areas, and the footer controls get cut off at the bottom.

The "transparent background" issue is likely during the `creating` or `joining` phase — the overlay is visible (`isVisible = state.phase !== 'idle'`) but the solid background gradient may not render properly on iPad due to the `isolation: 'isolate'` CSS property or safe area insets.

**Action**:
- Add `env(safe-area-inset-top/bottom)` padding to the call overlay
- Change the background from inline gradient to a frosted glass style with `backdrop-filter: blur(40px)` over a dark base
- Ensure the footer controls have proper bottom padding for iPad (`pb-[calc(40px+env(safe-area-inset-bottom))]`)
- Make the connecting state UI more polished with a frosted glass card

### Technical Changes

**File: `src/components/call/GlobalCallOverlay.tsx`**
- Line 878-885: Replace inline gradient background with frosted glass: solid dark base color + `backdrop-filter: blur(40px) saturate(150%)` + safe area insets
- Line 1147: Update footer padding from `pb-10` to `pb-[calc(2.5rem+env(safe-area-inset-bottom))]`
- Line 1042-1101: Add `pt-[env(safe-area-inset-top)]` to header area

**File: `src/lib/p2pConnection.ts`**
- Add better error handling in `connect()` to catch and report `getUserMedia` failures explicitly
- Add a console log before the timeout fires so we can debug

**File: `src/hooks/useStickers.ts`**
- Add console error logging in the mutation error handler to surface the real failure reason
- Verify the image URL format before inserting

**File: `src/components/call/GlobalCallOverlay.tsx` (connecting UI)**
- Lines 1104-1120: Enhance the connecting overlay with a frosted glass card instead of transparent bg
- Lines 988-1039: Improve the audio call connecting state with a frosted glass container

