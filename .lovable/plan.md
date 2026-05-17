## Problem

When you tap DMs the chat screen renders correctly (header, search, filters, Add Note, VYBE-AI row) but the conversation list is empty and shows "No conversations yet" — even though your account (`mrassburgers`) has **16 active 1:1 conversations** in the database (2 trashed, 0 hidden, 14 should be visible).

This means `useDMConversations` is returning `[]` on the client even though the rows exist. RLS policies look correct (`current_profile_id()` resolves your profile id, and your 16 `conversation_members` rows all use that id), so the breakage is somewhere in the client query itself — most likely:

- the embedded join `members:conversation_members(...profile:profiles(...))` silently failing/erroring,
- or the query returning an empty array because of an error that is being swallowed by `placeholderData: (prev) => prev` and the "only show skeleton when truly empty" guard,
- or `profile.id` not being ready the first render and the cache never repopulating.

## Fix Plan

### 1. Make the failure visible (diagnose before patching)

In `src/hooks/useDMConversations.ts`:
- Replace the silent `throw` with `console.error('[DM]', ...)` for both the `conversation_members` query and the embedded `conversations` query, and also log how many rows came back at each step.
- Surface `convError` to the UI debug log that already exists in `ConversationList` so we can see exactly which step is returning empty when this reproduces.

### 2. Stop trusting the embedded join

The single big query that does `conversations → members → profiles` is the most fragile piece. Split it into:

1. `conversation_members` for the current user → list of conversation ids (already done).
2. `conversations` by id list (no embed).
3. `conversation_members` for those conversation ids (all members, flat).
4. `profiles` for all member user_ids in one `.in('id', ...)` call.

Then stitch them together in JS. This removes the PostgREST embed (which is what most commonly returns empty/partial results when one nested table's RLS hiccups) and guarantees we return every conversation the user is a member of.

### 3. Render cached conversations immediately

- Set `refetchOnMount: 'always'` so opening DMs always re-pulls in the background instead of relying on a 30s stale window.
- Keep `placeholderData: prev` so the list never blanks, but only show the "No conversations yet" empty state when `conversationsQuery.isFetched && conversationsQuery.data?.length === 0`. Right now the empty-state can fire while the query is mid-flight on cold cache.

### 4. Gate the query on `profile.id` correctly

Confirm `useAuth().profile?.id` is populated before `useDMConversations` runs (it currently is via `enabled`), and invalidate `['dm-conversations']` whenever the profile id flips from undefined → defined so the first successful auth always triggers a fresh fetch.

### 5. Verify in DB after deploy

Re-check that `select count(*) from conversations c join conversation_members cm on cm.conversation_id=c.id where cm.user_id='<your profile id>'` still returns 16, then confirm the client logs from step 1 show all 16 making it through each of the new split queries.

## Files to touch

- `src/hooks/useDMConversations.ts` — split query, add logging, fix empty-state gating.
- `src/components/chat/ConversationList.tsx` — only render the empty state when the query has actually finished with zero results; surface `convError` in the existing dev log.

No DB migrations or RLS changes needed — the data is already there and the policies already allow you to see it. This is purely a client query/UI bug.
