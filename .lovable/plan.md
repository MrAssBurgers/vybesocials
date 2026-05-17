## Plan: stabilize the DM section on mobile

### What I found
- The hosted backend is healthy.
- The `Bakrix` live account has DM data: 29 memberships, 24 visible conversations, and recent message rows, so this is not an empty-account/database issue.
- The DM screen is doing too much work while rendering: multiple realtime subscriptions, broad query invalidations, online/status/streak polling, and swipe/animation state for every row.
- There are still unscoped invalidations that can refetch the whole conversation list and cause the “no DMs / flicker / lag” behavior.

### Patch scope
1. **Fix DM loading reliability**
   - Harden `useDMConversations` so a failed/partial secondary query does not collapse the entire DM list.
   - Stop returning unstable empty states while cached DM data exists.
   - Scope every DM-list invalidation to `['dm-conversations', profile.id]`.

2. **Stop realtime refetch storms**
   - Update `useGlobalRealtimeMessages` so delete/update events do not invalidate broad `['dm-conversations']` / `['conversations']` keys.
   - Debounce/refine refetches for unknown conversations only.
   - Remove production console spam from the DM query/realtime path.

3. **Reduce mobile row lag**
   - In `ConversationList`, precompute per-conversation row metadata once with `useMemo` instead of doing repeated `.find()` / map lookups inside every render.
   - Pass stable `onClick` / `onTrash` handlers to `ConversationItem` instead of new inline functions per row.
   - Add a memo comparison to `ConversationItem` so typing/status updates do not rerender every DM row unnecessarily.

4. **Trim duplicated DM side effects**
   - Remove or narrow duplicate notification/prefetch invalidations that refresh conversation lists already patched by global realtime.
   - Keep notification sounds/toasts working, but stop them from forcing the DM list to reload.

5. **Verify**
   - Check the DM query path against the live `Bakrix` data assumptions.
   - Run a targeted static check/search for remaining broad DM invalidations.
   - Confirm the final implementation keeps new messages updating instantly without full-list flashing.