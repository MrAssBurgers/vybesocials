## Goal
Make `/vybe-home` (`src/pages/VybeHome.tsx`) honest. Right now it mixes the real live member count (good) with **fabricated stats, fake testimonials with quotes from invented people, and unverifiable marketing numbers**. We'll remove or rewrite anything that is not actually true.

## What's false today (what we'll change)

### 1. Testimonials section — REMOVE entirely
The three quote cards are 100% fabricated:
- "Maya R. · Brooklyn" — fake person, fake quote
- "Jordan W. · Austin" — fake person, fake quote
- "Ren X. · Los Angeles" — fake person, fake quote

These are AI-generated avatars with invented identities and quotes. With only 208 real profiles and no opt-in testimonials, we can't show these. **Delete the entire "Real people / Built for actual humans" section.**

### 2. Social-proof stat strip — REWRITE to facts only
Current row makes 4 claims, only 1 is verifiable:
- `120+ Features in one app` — arbitrary, unverified → **remove**
- `∞ Theme combinations` — gimmicky → **remove**
- `<200ms Message delivery` — never measured → **remove**
- `24/7 AI safety scanning` — true → **keep**

Replace with 3 things we can actually back:
- **Live member count** (already pulled from `usePublicUserCount` — real number from `profiles`)
- **AI safety scanning · 24/7** (Vybe Check runs on every upload — true)
- **End-to-end encrypted messages** (matches `mem://technical/security/message-encryption-and-privacy-standard`)

### 3. Hero hairline claims — TRIM
- `<1s call connect time` bullet under "Snap · Notes · Calls" → **remove** (no measurement)
- `Free forever` checkmark → **keep** (matches usePremiumStatus comment "everyone-free")
- `No ads in DMs` → **keep** (true — ads are not in DMs)
- `AI-powered safety` → **keep**

### 4. Comparison table — TIGHTEN
Some rows are opinionated/wrong:
- `Creator payouts (60-70%)` shows Instagram=true → **flip Instagram to false** (Instagram does not pay 60-70%; only VYBE does per `mem://features/identity/creator-partnership-program`)
- `Communities & spaces` shows Discord=true → keep
- `Disappearing snaps` shows Snap=true → keep
- Everything else stays (the "nobody else does this" rows are accurate for Instagram/Snap/Discord)

### 5. Hero avatar cluster + phone-mockup avatars — LEAVE AS-IS
The 4-avatar cluster next to "X early members" and the avatars inside the phone screenshots are clearly **illustrative UI mockups** (same as Apple's marketing pages). They aren't presented as named real users on the marketing surface, so they stay. The previously-fabricated names (`@maya.rae`, `Maya R.` etc.) only appeared as quoted "real people" in testimonials, which we're deleting in step 1.

### 6. Phone-mockup numbers — LEAVE AS-IS
Numbers inside the phone frames (`Lvl 49`, `2,013 XP`, `14d streak`, `12,840 · #3 in Brooklyn`, `142 saved`, weather `73°F`) are part of the UI screenshot mockup, the same way every app's marketing site shows a sample screen. Not represented as platform-wide stats. Keep.

## Files touched
- `src/pages/VybeHome.tsx` — the only file changing.

## Out of scope
- No backend, RLS, hooks, or routing changes.
- No design-system / token changes — only deletions and small text edits.
- Other marketing pages (`/features`, `/about`, `/safety`) untouched unless you ask.

## Verification
After edit, scroll `/vybe-home` end-to-end and confirm:
- No testimonial cards with names + quotes
- Social-proof strip shows only the live member count, 24/7 safety, E2E encryption
- No `<1s call connect time` bullet
- Comparison table shows ❌ for Instagram on creator-payouts row
- Live member count still renders (e.g. "208 early members") from real DB
