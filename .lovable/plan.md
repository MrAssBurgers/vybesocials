

## Multi-Issue Fix Plan (Prioritized Phases)

This is a very large set of requests. To keep things manageable and shippable, I'm breaking it into 3 phases. This plan covers **Phase 1** (the most impactful/broken items). Phases 2 and 3 can follow after.

---

### Phase 1: Critical Fixes (This Implementation)

#### 1. Profile HoverCard always visible (not clipped when post is near bottom)
The `HoverCardContent` uses `side="top"` which hides it above the viewport when posts are low on the page.

**Fix in `UserProfileHoverCard.tsx`**:
- Add `collisionPadding={16}` and `side="top"` with `avoidCollisions={true}` (Radix default but be explicit)
- Add `sticky="always"` to keep it in viewport -- Radix will auto-flip to bottom when top is clipped

#### 2. VybeMap desktop -- no map tiles showing
The Leaflet container likely has zero height on desktop. The map wrapper and AppLayout need explicit height propagation.

**Fix in `FriendMap.tsx`**:
- Ensure the AppLayout wrapper passes `fullWidth` and the inner div uses `relative h-full w-full` not just `absolute inset-0`
- Add a `min-h-screen` fallback on the outer container
- Add explicit `height: 100%` style to the map div for Leaflet

#### 3. Post reactions (non-thumbs-up emoji not persisting)
The `handleReaction` in `PostCard.tsx` / `ShortCard.tsx` likely only handles `'like'` type. Other reaction types (😂, 😮, etc.) need to be stored in the `post_reactions` table with the correct `reaction_type`.

**Fix**: Trace the `handleReaction` → `toggleReaction` flow in PostCard/ShortCard to ensure all `ReactionType` values are properly inserted/toggled in the database. Each reaction type should influence the algorithm weight differently (e.g., 😂 = humor affinity, ❤️ = appreciation, 🔥 = trending boost).

#### 4. Local feed -- 25-mile radius filtering + location permission
Currently `useLocalFeed` just fetches the generic trending feed and client-side sorts by tags. No actual distance filtering.

**Fix**:
- Create a new RPC `get_local_posts` that accepts `p_lat`, `p_lng`, `p_radius_miles` and filters posts by author location (from `user_locations` table) within radius using Haversine formula
- In `useLocalFeed.ts`, call this RPC instead of `get_posts_with_counts` when location is available
- Add a location permission prompt component that requests `navigator.geolocation` with a user-friendly UI explaining why location is needed for the Local tab

#### 5. Logout clears custom background
When a user logs out, the custom background persists on the login screen.

**Fix in auth logout handler**: Call `document.body.style.backgroundImage = ''` and reset CSS variables on logout.

#### 6. Daily Brief -- cache per time window, show next regeneration time
Currently regenerates every time the sheet opens.

**Fix in `AIBriefSheet.tsx`**:
- Cache the brief in localStorage with a key like `vybe-daily-brief-{userId}-{timeSlot}` where timeSlot is `morning` (6am-12pm), `afternoon` (12pm-6pm), `evening` (6pm-6am)
- Only call the AI if the cached brief doesn't match the current time slot
- Show "Next update at {time}" text at the bottom of the brief
- Schedule a notification via the existing notification system when the next time slot starts

---

### Phase 2 (Next Implementation)
- VYBE AI Designer perfecting
- Onboarding designer lag fix (reduce animations, defer heavy renders)
- VYBE DNA scroll lag (virtualize the list, reduce re-renders)
- Widget customization with + icon and smooth add animation
- Platform connections (Apple account linking in Settings)

### Phase 3 (Following Implementation)
- Birthday system (crown on avatar, cake icon, DM notification like Snapchat)
- Age-based restriction enforcement with birthday triggers
- Parental controls (4-digit PIN, mandatory for under-13, content filtering)
- Screen time tracking system
- Daily brief push notifications

---

### Files Modified (Phase 1)
- `src/components/ui/UserProfileHoverCard.tsx` -- collision padding for always-visible hover
- `src/pages/FriendMap.tsx` -- desktop map height fix
- `src/components/posts/PostCard.tsx` -- multi-reaction persistence
- `src/components/posts/ShortCard.tsx` -- multi-reaction persistence
- `src/hooks/useLocalFeed.ts` -- 25-mile radius + location prompt
- `src/components/home/AIBriefSheet.tsx` -- time-based caching + next update display
- `src/lib/auth.ts` or logout handler -- clear background on logout
- New DB migration for `get_local_posts` RPC

