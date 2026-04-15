

## Profile "About Me" & Lifestyle Details System

A new section on the profile that shows personal details (MBTI, height, age, fav food, music taste) and what the user is currently listening to or watching. This data feeds into VYBE DNA for better matching.

---

### 1. Database: New `user_about` Table

Create a new table `public.user_about` to store lifestyle/personal details separately from the profiles table (keeps PII isolated):

```sql
CREATE TABLE public.user_about (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  mbti TEXT,                          -- e.g. 'INFJ'
  height TEXT,                        -- e.g. '5'11"' or '180cm'
  favorite_food TEXT,                 -- free text
  music_genres TEXT[] DEFAULT '{}',   -- ['Hip Hop', 'R&B']
  streaming_services TEXT[] DEFAULT '{}', -- ['Netflix', 'Hulu']
  now_listening_title TEXT,           -- current song title
  now_listening_artist TEXT,          -- current artist
  now_listening_cover_url TEXT,       -- album art URL
  now_listening_service TEXT,         -- 'apple_music' | 'spotify'
  now_watching_title TEXT,            -- what they're watching
  now_watching_service TEXT,          -- 'Netflix', 'Disney+', etc.
  now_watching_cover_url TEXT,        -- show poster
  show_age BOOLEAN DEFAULT false,     -- opt-in to show age from DOB
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_about ENABLE ROW LEVEL SECURITY;

-- Everyone can view (public profile data)
CREATE POLICY "Anyone can view user about" ON public.user_about
  FOR SELECT TO authenticated USING (true);

-- Owner can manage their own
CREATE POLICY "Users can manage own about" ON public.user_about
  FOR ALL TO authenticated
  USING (user_id = current_profile_id())
  WITH CHECK (user_id = current_profile_id());
```

---

### 2. Profile UI: New `ProfileAboutDetails` Component

A clean card below the bio showing personal details in a grid of mini-cards/pills:

- **Age** (calculated from DOB if `show_age` is true) — shows "19" with a cake icon
- **MBTI** — shows personality type like "INFJ" with a brain icon, color-coded by type
- **Height** — shows with a ruler icon
- **Fav Food** — with a fork icon
- **Music Genres** — colored pills
- **Now Listening** — mini card with album art, song title, artist, and a subtle equalizer animation (Apple Music / Spotify icon)
- **Now Watching** — mini card with show poster, title, and streaming service logo

Design: Glass card with 2-column grid for stats, full-width cards for Now Listening/Watching. Staggered entrance animations.

**File**: `src/components/profile/ProfileAboutDetails.tsx` (new)

---

### 3. Settings: "About Me" Edit Section

Add a new section in Settings after the existing Edit Profile form where users can fill in their about details:

- MBTI selector (dropdown of 16 types)
- Height input (text)
- Favorite food input (text)
- Music genres multi-select (preset list + custom)
- Toggle to show age
- "Now Listening" and "Now Watching" manual input fields (title, artist/service, cover URL)
- Save button with the same liquid-glass styling

**File**: `src/components/settings/AboutMeSection.tsx` (new)
**File**: `src/components/settings/ProfileSection.tsx` (add link/integration)

---

### 4. Hook: `useUserAbout`

Fetch and mutate the `user_about` row for any user. Used by both the profile display and settings edit form.

**File**: `src/hooks/useUserAbout.ts` (new)

---

### 5. DNA Integration: Feed About Data Into Matching

Update `useSimilarDNAUsers` to factor in `user_about` data (MBTI match, music genre overlap, streaming service overlap) as additional similarity dimensions beyond just personality vectors. This makes "Similar DNA Matches" much more meaningful.

**File**: `src/hooks/useSimilarDNAUsers.ts` (modify similarity calculation)

---

### 6. Profile Page Integration

Add `<ProfileAboutDetails>` between `<ProfileAboutMe>` and `<ProfileVibeBoard>` on the profile page.

**File**: `src/pages/Profile.tsx` (add import + component)

---

### Technical Summary

**New files** (3):
1. `src/components/profile/ProfileAboutDetails.tsx` — Visual display card
2. `src/components/settings/AboutMeSection.tsx` — Edit form
3. `src/hooks/useUserAbout.ts` — Data hook

**Modified files** (3):
1. `src/pages/Profile.tsx` — Add AboutDetails component
2. `src/components/settings/ProfileSection.tsx` — Link to About Me section
3. `src/hooks/useSimilarDNAUsers.ts` — Enhanced matching with about data

**Database**: 1 migration creating `user_about` table with RLS

