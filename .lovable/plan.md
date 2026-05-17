## What's actually broken (deep scan results)

### 1. Daily Brief — always shows the generating screen
The AI gateway is fine — server logs prove it returns full 4 KB responses every ~7 s. The bug is a **cache-key mismatch** between writer and reader:

- `AIBriefSheet.getCachedBrief()` (line 322) requires `timeSlot === currentSlot`.
- `useBriefPreFetch.prefetchBrief()` writes `{ data, timestamp }` with **no `timeSlot` field**.
- Result: every cached brief written by the background prefetch is rejected and deleted on the very next read → the sheet always falls into the "no cache → fetch with full loading UI" path → user sees `GeneratingScreen` every time.

### 2. Messages — stuck on loading skeleton
`ConversationList` renders the skeleton whenever `useDMConversations().isLoading` is true. That flag is `!data && (conversationsQuery.isLoading || friendsLoading)`. Two real failure modes keep it stuck:

- `useDMConversations` has **no `enabled` guard**. If `profile?.id` is briefly undefined, the query fires immediately, the `if (!profile?.id) return []` branch resolves to a successful `[]`, but the `placeholderData: (prev) => prev` keeps the *previous* undefined data alive across the refetch — and React Query reports the next fetch as `isLoading=true` again. Combined with `friendsLoading`, the skeleton can pin forever when auth is slow.
- If the conversations or members fetch throws (RLS/network), `throw membershipError` runs with `retry: 2` + exponential backoff up to 8 s. While retrying, `isLoading` stays true and `data` stays undefined → skeleton forever, no error UI, no retry button.

## Plan

### A. Daily Brief

**File: `src/hooks/useBriefPreFetch.ts`**
- Add the same `getTimeSlot()` helper used by `AIBriefSheet` (4–10 = morning, 10–16 = lunch/afternoon, 16–24/0–4 = evening) and write the cache as `{ data, timestamp: Date.now(), timeSlot: getTimeSlot() }` so `getCachedBrief()` will accept it.
- Same fix in the `tryServerCache` branch (the server-prewarmed payload).
- Fix the `if (!session) return;` in a `Promise<boolean>` to `return false;` (type safety / clarity).

**File: `src/components/home/AIBriefSheet.tsx`**
- In the `open` effect, if `getCachedBrief()` returns null but `localStorage` has a `vybe_ai_brief_cache` entry from the same day, hydrate it as a soft cache (show it instantly, mark stale, revalidate in background) instead of dumping straight into `GeneratingScreen`. This guarantees that even cross-version cache drift never blocks the user on the spinner.
- When background revalidation completes, smoothly swap content in (no flash, no spinner takeover).

### B. Messages

**File: `src/hooks/useDMConversations.ts`**
- Add `enabled: !!profile?.id` to the `conversationsQuery` so it only runs once auth is ready (matches the existing `useFriends` guard).
- Replace `throw membershipError` / `throw convError` with returning `[]` when there's no prior cache, so a transient RLS/network failure surfaces an empty state instead of pinning React Query in `isLoading=true` through three retries.
- Tighten the returned `isLoading` to `(conversationsQuery.isPending || friendsLoading) && !conversationsQuery.data` — `isPending` is the correct "no data yet" signal in v5; `isLoading` flips true on every background refetch when there's no prior data, which is what's wedging us.

**File: `src/components/chat/ConversationList.tsx`**
- After ~6 s of `isLoading` with no data, render a small "Taking longer than usual — Retry" inline message above the skeleton with a button wired to `refetch()` from `useDMConversations`. This makes the failure mode recoverable instead of a black hole.
- Surface `convError` (already destructured but unused) with a friendly inline error + retry button when present.

**File: `src/pages/Messages.tsx`**
- Keep the `MessagesLoadingSkeleton` for the first-mount frame, but cap it at one paint. The current `setMounted(true)` gate is fine — no change needed beyond the hook-level fixes above.

### Verification
1. Hard refresh → tap Messages → list appears within ~1 s; if backend is slow, the retry affordance shows by 6 s.
2. Open the Daily Brief immediately after app launch (≥ 7 s after first paint) → cached content renders instantly. Open it a second time → still instant. Open it across a slot boundary (e.g. 5:59 → 6:01) → background regeneration fires, toast appears, next open shows the new brief instantly.
3. Confirm via edge function logs that `ai-catch-up` is called once on launch (prefetch) and not again per open within the same slot.

## Out of scope
- Spotify mini-player, video composer crash, post placeholder play button — already shipped in prior turns and not reported regressed.
- Edge function code changes — `ai-catch-up` is healthy per logs.
