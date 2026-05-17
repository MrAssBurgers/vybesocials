# Why DMs don't arrive instantly on the recipient

## How the pipeline is supposed to work

```
SENDER device                                     RECEIVER device
─────────────                                     ───────────────
useInstantSend.sendText()
  1. optimistic add to local cache  ──────────►   (sender sees it instantly ✅)
  2. INSERT into public.messages    ──┐
  3. supabase.channel("dm-broadcast")  │
       .send(new-message)              │
                                       ▼
                            Supabase Realtime
                                       │
                  ┌────────────────────┴──────────────────┐
                  ▼                                       ▼
        postgres_changes INSERT                    broadcast "new-message"
        on `messages` table                        on dm-broadcast:{convoId}
                  │                                       │
                  ▼                                       ▼
        useGlobalRealtimeMessages         ONLY if receiver currently has
        (always on, App level)            this exact convo OPEN
                  │
                  ▼
        update ['messages', convoId] cache
        update ['dm-conversations', profile.id] cache
        play sound
```

Both paths are wired in code, but each has a real bug that explains the symptoms you saw.

## Bugs found

### 1. The broadcast fast-path doesn't actually deliver (silent failure)

`src/hooks/useInstantSend.ts` lines 209-213 and 285-289:

```ts
const bc = supabase.channel(`dm-broadcast:${conversationId}`);
await bc.send({ type: 'broadcast', event: 'new-message', payload: { message: ... } });
supabase.removeChannel(bc);
```

The channel is created and `send()` is called **without ever calling `.subscribe()`**. In `@supabase/supabase-js` the channel transport isn't open until the join is acked, so this send is dropped on the floor (no error thrown). The receiver's `dm-broadcast:{id}` subscription in `useGlobalRealtimeMessages` (line 358) never receives the payload, so the "open-convo instant delivery" path is dead. Everything falls back on postgres_changes — which has its own issue (#2).

### 2. Receiver's postgres_changes channel listens to ALL inserts, then relies on RLS

`useGlobalRealtimeMessages` subscribes to `INSERT on public.messages` with no `filter`. Realtime then runs the SELECT RLS policy `can_access_message` for each row. That policy calls `current_profile_id()` → `SELECT id FROM profiles WHERE user_id = auth.uid()`. If the receiver's realtime socket hasn't been re-authed with the current JWT (e.g. token refreshed mid-session, or app opened from cold-start with a stale anon socket), `auth.uid()` is NULL and the row is filtered out — no INSERT event reaches the client. This matches "I opened the other account and the message wasn't there".

We can't filter server-side by `sender_id != me` (Realtime filters don't support `neq` reliably for our case) but we CAN explicitly call `supabase.realtime.setAuth(token)` on auth state changes and after `setupChannel()` so the socket is always authenticated.

### 3. "Not online" — receiver was online but sender saw them offline

`useUsersOnlineStatus` (`src/hooks/usePresence.ts:244`) only refreshes via `refetchInterval: 20000` and a per-user channel that the **conversation list doesn't subscribe to** (only `useUserOnlineStatus` does, and only when a specific chat is open). So when you opened the DM list on the sender, you saw a stale snapshot up to 20s old. Combined with the 90s "considered offline" grace, the receiver could be active but rendered as offline for ~25s after they came back.

### 4. New conversations don't appear in the receiver's list until 300ms+ refetch

When the very first message in a brand-new convo arrives, the receiver's `['dm-conversations']` cache doesn't have it. `useGlobalRealtimeMessages` debounces an invalidate by 300ms then refetches. If the realtime event never fires (bug #2) this never happens either. Once #2 is fixed this fallback works; we can also tighten the debounce to 100ms.

## Fix plan

### A. Make broadcast actually subscribe before sending (sender side)

In `useInstantSend.ts`, replace the throwaway-channel pattern with a long-lived per-conversation broadcast channel kept in a `useRef`. Subscribe once, reuse for every send, tear down on unmount.

```ts
const broadcastChannelRef = useRef<RealtimeChannel | null>(null);

// lazy init
const getBroadcastChannel = () => {
  if (!conversationId) return null;
  if (broadcastChannelRef.current) return broadcastChannelRef.current;
  const ch = supabase
    .channel(`dm-broadcast:${conversationId}`, { config: { broadcast: { ack: true, self: false } } })
    .subscribe();
  broadcastChannelRef.current = ch;
  return ch;
};
```

Then in sendText/sendMedia/sendVideo: `await getBroadcastChannel()?.send({ type:'broadcast', event:'new-message', payload:{ message } })`. Cleanup channel on unmount.

### B. Re-auth the realtime socket on every auth change

In `src/lib/auth.tsx` (or wherever `onAuthStateChange` lives), after `supabase.auth.getSession()` and on every `TOKEN_REFRESHED` / `SIGNED_IN` event:

```ts
const { data: { session } } = await supabase.auth.getSession();
if (session?.access_token) supabase.realtime.setAuth(session.access_token);
```

Also call it once inside `useGlobalRealtimeMessages.setupChannel` right before `.subscribe()` so cold-start always has fresh auth.

### C. Make the DM list reflect presence in near-realtime

Add a single global `user_presence` postgres_changes listener (alongside `useGlobalRealtimeMessages`) that patches `['users-presence', ...]` cache directly when any presence row changes for a user in any of the current user's conversations. Drop the 20s refetch interval on `useUsersOnlineStatus` once realtime patches are in.

### D. Tighten the unknown-convo refetch debounce

`scheduleUnknownConvoRefetch` debounce 300 → 100ms. Cheap and makes new threads pop in faster.

## Technical details

**Files to edit**
- `src/hooks/useInstantSend.ts` — long-lived broadcast channel, subscribe before send (fixes #1)
- `src/lib/auth.tsx` (or equivalent auth provider) — call `supabase.realtime.setAuth()` on session/refresh (fixes #2)
- `src/hooks/useGlobalRealtimeMessages.ts` — call `setAuth` before `.subscribe()`; tighten unknown-convo debounce 300→100ms (fixes #2, #4); add presence INSERT/UPDATE listener that patches `['users-presence', ...]` cache (fixes #3)
- `src/hooks/usePresence.ts` — once realtime presence patching is in, drop `refetchInterval` on `useUsersOnlineStatus` to 0 (it becomes purely event-driven)

**No DB migrations needed.** `messages`, `conversations`, and `user_presence` are already in the `supabase_realtime` publication and RLS is correct.

**Diagnostic logs to add (kept behind `import.meta.env.DEV`)**
- `[GlobalRT] subscribe status` already logs `SUBSCRIBED` / `CHANNEL_ERROR`. Add `setAuth applied` to confirm the JWT was attached.
- `[InstantSend] broadcast send ack` to verify the new long-lived channel actually delivered.

## Out of scope (intentionally)

- OneSignal / Despia push delivery — that's a separate flow (covered in `.lovable/plan.md` item #4) and only matters when the receiver has the app **closed**. The "not showing instantly while I was looking" symptom is the in-app realtime path above, which is what this plan fixes.
