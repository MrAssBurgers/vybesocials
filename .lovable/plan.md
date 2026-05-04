## Goal

Make the marketing page (`/vybe-home`) phones look **identical** to the real app — not hand-drawn approximations. Pull the live signup count from the database instead of the fake "12,000+ in early access".

## Approach

### 1. Use the real app's UI primitives, not hand-rolled clones
Currently `VybeHome.tsx` re-implements `DNAPhone`, `FeedPhone`, `MapPhone`, `ChatPhone` from scratch with custom Tailwind. They drift from the real screens (real app uses tokens like `bg-background`, `text-foreground`, real `Avatar`, `Card`, sticky headers w/ specific paddings).

I'll replace each phone mockup with **a slim, reusable preview component that imports the actual real components** wrapped in a fake-data provider:

- `DNAPhonePreview` — uses real `DNAOrb`, `PersonalityArchetype`, `DNATraitBars`, `DNAColorPalette` from `src/components/dna/*` with a hardcoded `dna` prop (no hook calls). Same sticky header markup as `VybeDNA.tsx` (back arrow + "VYBE DNA / Evolves with your activity" + Share icon, `bg-background/80 backdrop-blur-xl border-b border-border/30`).
- `FeedPhonePreview` — reuses real story-ring + post-card layout. Header is the real `VYBE` wordmark + Search/Bell/Avatar row, tab pills For You/Following/Global/Local exactly like `Home.tsx`. Renders a static `Post`-shaped object through the real `PostCard` component (or a thin wrapper if `PostCard` requires too many providers — I'll check first and fall back to a pixel-faithful copy that uses the real `Avatar`, `Card`, and Tailwind tokens).
- `MapPhonePreview` — copies the actual `FriendMap` header (`MapPin` + "Friend Map" + nearby pill) and the bump bottom-sheet card markup verbatim, wrapped over a CSS map background (the real map uses Mapbox which we can't render in a tiny preview, so a stylized grid is acceptable — but pin avatars, status emojis, and the bottom card use the real component classes).
- `ChatPhonePreview` — mirrors `ChatView.tsx`'s header, message bubbles, reactions chip, snap card, and composer using the real Tailwind classes from that file.

All previews render inside the existing `PhoneFrame` (260px wide, 9:19.5, `#0B0B10` border) with the real iOS-style status bar and the real `BottomNav` markup (5 tabs, gradient center button) copied from `src/components/layout/BottomNav.tsx` so spacing/sizing matches exactly.

### 2. Screenshot-cropped looking assets

- **Avatars**: keep the Pravatar URLs but render them through the real `Avatar`/`AvatarImage` component with the same ring + size classes used in the app (e.g. `h-10 w-10 ring-2 ring-primary/20`).
- **Post media / chat snap**: keep current Unsplash group photos but constrain them with the real post card's `aspect-square` + `object-cover` and the same overlay gradient used in `ChatMediaBubble.tsx`.
- **Icons**: switch any custom SVG/emoji shortcuts to the exact `lucide-react` icons the real screens use (already mostly correct — will audit each header).

### 3. Live user count (no fake "12,000+")

Replace the hardcoded "12,000+ in early access" pill in the hero with a small hook:

```ts
// src/hooks/usePublicUserCount.ts
export function usePublicUserCount() {
  return useQuery({
    queryKey: ['public-user-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

Render: `"{count} early members"` (with the green pulse dot). Today this would show **145**. While loading, show "Joining a small, growing crew" so we never lie. The 4-up stat strip ("120+ Features / ∞ Themes / <200ms / 24/7") stays — those aren't user-count claims.

### 4. Files touched

- `src/pages/VybeHome.tsx` — replace the four `*Phone` components with the new previews, swap the hero pill for the live counter.
- `src/hooks/usePublicUserCount.ts` — new.
- (If the real `PostCard` is import-safe without auth/providers) no other files. Otherwise I'll create `src/components/marketing/previews/{Dna,Feed,Map,Chat}PhonePreview.tsx` that re-use the lowest-level real subcomponents (`Avatar`, `DNAOrb`, `PersonalityArchetype`, etc.) plus pixel-faithful header/composer markup pulled directly from `VybeDNA.tsx`, `Home.tsx`, `FriendMap.tsx`, `ChatView.tsx`.

### 5. Out of scope

- No changes to login/signup, routing, or the scroll fix (already shipped).
- No changes to the real app screens themselves.

## Result

Each mockup phone will look like a real screenshot of the running app (real components, real spacing, real header bars, real bottom nav), only the people/handles/photos are fake. The hero shows the **actual** signup count from the database.
