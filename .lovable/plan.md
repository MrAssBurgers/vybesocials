## Plan

### 1. Stabilize DM loading and sending
- Fix remaining profile/Auth ID mismatches in DM hidden/trash filtering so conversations are not accidentally hidden or filtered incorrectly.
- Make message send confirmation update the local cache without forcing full message/conversation refetches that cause lag and flicker.
- Make the global realtime handler ignore unrelated message events earlier and patch only the current user’s conversations.
- Keep optimistic sends, but replace temp messages cleanly and only refetch when the conversation is genuinely missing from cache.

### 2. Fix realtime coverage for DMs
- Ensure DM-related realtime tables are published where needed, especially `conversation_members` for read/unread cross-device sync and `auth_challenges` for login approval prompts.
- Keep RLS scoped to real members only; do not make DMs public.
- Avoid broad invalidations from read-state sync so opening DMs on one device doesn’t make the list reload/flicker on another.

### 3. Make login approval notify and resolve instantly
- Update the login approval flow so creating an approval request sends a push notification to the trusted devices.
- Extend the push notification type support for security/login approval payloads.
- Subscribe the approving device to realtime approval rows and keep the existing polling fallback.
- When approve/deny is tapped, update the row immediately; the waiting device should react through realtime first and polling as backup.

### 4. Validate the live behavior
- Check backend health and recent logs again after changes.
- Verify DM queries can read/write for the active profile path.
- Verify the login approval edge function can create/poll/respond cleanly and that push dispatch no longer rejects the security notification type.

## Technical details
- Files likely touched: `src/hooks/useDMConversations.ts`, `src/hooks/useInstantSend.ts`, `src/hooks/useGlobalRealtimeMessages.ts`, `src/hooks/useMessageNotifications.ts`, `src/lib/pushNotifications.ts`, `src/components/auth/LoginApprovalSheet.tsx`, `src/components/auth/LoginGateModal.tsx`, and `supabase/functions/auth-login-approval/index.ts` / `supabase/functions/auth-2fa-preauth/index.ts`.
- A database migration may be needed to add realtime publication for `conversation_members` and `auth_challenges` if not already enabled on live.