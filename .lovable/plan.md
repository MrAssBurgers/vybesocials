# /vybe-home image fixes

Goal: every picture on the marketing home page is correct, unique, on-brand, and visibly centered inside its phone frame. No mismatched screenshots, no off-center crops, no low-quality avatars.

## What's wrong today

1. **Aura section** still uses a static PNG of the home feed — the copy talks about drag/drop themes & bento blocks, so the image lies.
2. **Snap · Notes · Calls section** still uses a static PNG of the challenges screen — the copy is about snaps/calls/notes.
3. **People avatars** use `i.pravatar.cc/240?img=…` — inconsistent lighting/style, occasionally fails to load, looks unprofessional.
4. **ChatPhone scene image** (`SCENES.couch` from Unsplash) often crops awkwardly and the URL pattern is fragile.
5. **App-mock phones** (FeedPhone, MapPhone, DNAPhone, FriendLinkPhone, ChatPhone) — content is correct but several inner blocks aren't visually centered (e.g., DNA archetype card overlaps, Map weather pill drifts off-edge at certain widths, Chat input sits below the bottom nav). User explicitly asked to "recenter them."

## Plan

### 1. Replace the two static PNG screenshots with bespoke React mocks

Add two new mock-phone components alongside the existing five, then swap them in:

- **`AuraPhone`** → used in the Aura `<FeatureRow>`
  - Mirrors the real Aura customizer: profile header, draggable Bento grid (3 blocks with grab handles + jiggle outline), theme color row (5 swatches with one active ring), motion preset chips, "Save Aura" gradient button. Live aura background = subtle conic gradient behind blocks.
- **`SnapPhone`** → used in the Snap · Notes · Calls `<FeatureRow>`
  - Top: incoming-call card (avatar, "Calling…", green/red SlideToAnswer pill).
  - Middle: floating GIF note bubble with reaction streak flame.
  - Bottom: disappearing snap thumbnail with 24h countdown ring.
  - Uses only inline SVG / divs — no external images.

After this, **delete the now-unused imports**: `phoneHomeImg`, `phoneMapImg`, `phoneChallengesImg`, and the `PhoneShot` helper.

### 2. Recenter & polish the existing 5 mock phones

Audit each mock phone for off-center / clipped content at the fixed `260×563` frame size:

- **FeedPhone** — center the greeting row, equalize quick-action grid gaps, ensure tabs row doesn't get clipped by the bottom nav (add `pb-` matching nav height).
- **MapPhone** — constrain the weather pill to `flex-1 min-w-0 truncate`, center the avatar pin cluster, pull the bottom nav above the layers FAB.
- **DNAPhone** — re-stack the orbit + archetype card with `gap-2` instead of negative margins so they don't overlap; center the VYBE-7F2A chip under the orbit, not floating.
- **FriendLinkPhone** — center the QR card with proper top offset (currently `top-[108px]` on a 563px frame leaves it slightly high); move the username chip into the same flex column so it can never drift.
- **ChatPhone** — fix the message-input z-index so it sits *above* the bottom nav (or move nav below input), and recenter the typing indicator.

All mocks share a `<PhoneFrame>` already; this work is purely inside each component, no API changes.

### 3. Replace people photos with consistent, professional avatars

- Generate **7 portrait avatars** (one per `PEOPLE` entry: maya, jordan, leo, sky, mia, kai, ren) using the image generator at a uniform style: studio-lit, neutral background, head-and-shoulders, diverse, ages 18–28, consistent color grading to match the dark VYBE palette. Save as `src/assets/avatars/{name}.jpg` and import.
- Update the `PEOPLE` map to point at the new local imports — pravatar URLs deleted entirely.

### 4. Replace the ChatPhone scene photo

- Generate **one** square in-app "Snap"-style photo (two friends laughing, warm rim light, vertical 4:5 crop) → `src/assets/scenes/snap-couch.jpg`, replace `SCENES.couch`. Delete the other 3 unused `SCENES` URLs (rooftop / picnic / cafe) since they're not referenced.

### 5. Hero phones — final centering check

The 3 hero phones float with `absolute` positioning. Add an outer wrapper with explicit `width/height` matching the 3 phones' bounding box so they don't drift on intermediate desktop widths (1024–1280px). Keep the existing y-bobbing motion.

## Out of scope

- Copy changes, headline rewrites, comparison table edits, testimonials text.
- Any backend / RLS / auth work.
- Routing / SEO meta beyond what's already there.

## Verification

After implementation, screenshot `/vybe-home` at 1440×900 and at 390×844, then crop each phone individually and confirm:
- No two phones show the same content.
- Every phone's content is fully visible and centered inside the frame (no clipped header/footer, no overlapping blocks).
- All 7 avatars look like one consistent set.
- No `pravatar.cc` or `unsplash.com` URLs remain in `src/pages/VybeHome.tsx`.
