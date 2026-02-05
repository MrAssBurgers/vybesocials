
# Fix VYBE Snap Sending Issues

## Root Causes Identified

After thorough investigation, I found **two key issues** causing VYBE snaps to fail:

### Issue 1: Messages Not Being Inserted (Critical)
- Storage uploads **work correctly** - files are being created in `chat-media` bucket with proper paths (`profile.user_id/...`)
- However, **no messages from today (Feb 5) exist in the database**
- The DB shows messages from Feb 4, but uploads from today have no corresponding message records
- This means the message INSERT is failing silently somewhere in the code flow

### Issue 2: Possible Error Swallowing
- The catch block at line 890 logs to console but the user may not notice the toast
- The optimistic UI shows the message, but if the insert fails, it stays marked as `_failed` without clear visual feedback

## Investigation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Storage Upload Paths | ✅ Fixed | Now using `profile.user_id` correctly |
| Storage RLS Policy | ✅ Working | Files being uploaded successfully |
| Message Trigger (notify_message_recipients) | ✅ Fixed | Returns early if settings NULL, exception-wrapped |
| Other Triggers (challenges, streaks) | ✅ Checked | All SECURITY DEFINER, shouldn't fail |
| Messages Table | ❓ Suspect | No new rows despite successful uploads |

## Proposed Fixes

### A) Add Better Error Logging & Toast Feedback
Currently, errors are logged to console but users may not see them. We need:
1. More prominent error toasts that stay visible longer
2. Log specific error details to help debug

### B) Fix Potential Race Condition in Video Path
In `handleVybeSend`, the video blob fetch + safety scan + upload flow could have timing issues. The code:
```typescript
const response = await fetch(mediaDataUrl); // Fetching blob URL
const videoBlob = await response.blob();
```
If `mediaDataUrl` (a blob URL) is revoked too early or the fetch fails, the entire chain breaks.

### C) Add Retry Logic with Exponential Backoff
Message inserts can fail transiently. Add retry logic.

### D) Verify RLS Policy Execution
Test that the INSERT policy is passing by checking the subquery logic.

## Implementation Plan

### Step 1: Add Defensive Checks in handleVybeSend
```typescript
// Before insert, verify mediaUrl is valid
if (!mediaUrl || mediaUrl.includes('undefined')) {
  throw new Error('Media upload failed - URL is invalid');
}
```

### Step 2: Add Explicit Error Handling for Each Phase
Split the try/catch into phases with specific error messages:
- Phase 1: Blob fetch
- Phase 2: Safety scan  
- Phase 3: Storage upload
- Phase 4: Database insert

### Step 3: Add Better Visual Feedback for Failed Messages
Create a visible "failed to send" indicator with retry button.

### Step 4: Verify Database Insert Works
Add a test that the RLS policy allows the insert before assuming success.

## Files to Modify

1. **`src/components/chat/ChatView.tsx`**
   - Add phase-specific error handling in `handleVybeSend`
   - Add defensive URL validation before DB insert
   - Add retry mechanism for failed inserts
   - Improve toast feedback (duration, action buttons)

2. **`src/components/chat/MessageBubble.tsx`** (if exists)
   - Add visual indicator for `_failed` messages
   - Add tap-to-retry functionality

## Technical Details

### Current Flow (with failure point)
```text
1. User taps Send in VybeSnapEditor
2. handleVybeSend called with mediaDataUrl (blob URL)
3. Optimistic message added to cache ✅
4. Toast shows "Sending VYBE..." ✅
5. Fetch blob from URL ⚠️ (Can fail if URL invalid)
6. Safety scan (with timeout) ✅
7. Upload to storage ✅ (Files exist in bucket)
8. Get public URL ⚠️ (Could be undefined?)
9. INSERT into messages ❌ (Failing silently)
10. Replace optimistic with real message ❌ (Never happens)
```

### Proposed Flow
```text
1. User taps Send in VybeSnapEditor
2. handleVybeSend with validation checks
3. Phase-wrapped try/catch for each step
4. Explicit URL validation before INSERT
5. Retry logic for transient failures
6. Clear visual feedback on failure
```

## Expected Outcome
After implementation:
- VYBE snaps will send reliably
- Users will see clear error messages if something fails
- Failed messages will be visually distinct with retry option
- Console logs will help diagnose any remaining issues
