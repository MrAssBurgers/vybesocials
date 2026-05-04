## Goal

Make `/vybe-home` look genuinely real (not AI-mocked) by swapping flat gradient placeholders for actual photos of fake people and group shots, and apply our **VybeHome scroll fix** pattern to every public marketing/auth page that has the same finger-scroll bug — starting with `/login` and `/signup` (Landing).

## 1. Real fake-people imagery

Add curated Unsplash photo URLs (free CC0, no attribution required for app use) for:

**Avatars (fake people pfps)** — used in stories row, post header, friend map pins, chat header, comparison table, testimonials. We'll use `i.pravatar.cc/300?img=N` with locked seeds so they stay consistent — these are real photos of real models from the Pravatar set, but they are not VYBE users (they're fake "Maya R.", "Jordan W.", "Leo K.", etc.).

Seed map (locked so it never reshuffles):
- `maya.rae` → img=47 · `jordan.w` → img=12 · `leo.k` → img=33 · `sky.m` → img=49 · `mia.z` → img=44 · `kai.t` → img=15

**Post media** — every fake post that currently shows a flat gradient gets a real "group of people chilling" photo from Unsplash:
- Hero feed post: rooftop friends laughing
- Post-detail mock: friends at a sunset picnic
- Story thumbnails: candid group shots, café table, concert crowd
- VYBE Snap card in chat: two friends on a couch laughing

Implementation: a small `FAKE_PEOPLE` and `FAKE_SCENES` constant at the top of `VybeHome.tsx` so all references stay consistent. Wrap each `<img>` in a tiny `<PhotoFill>` helper that does `object-cover`, `loading="lazy"`, blurred placeholder, and gracefully falls back to the existing gradient if the image fails.

**Where current gradients become real photos:**

| Component | Was | Becomes |
|---|---|---|
| `FeedPhone` post body | pink→violet→cyan gradient | Unsplash group-of-friends photo, with the existing aura badge overlaid |
| `FeedPhone` story rings | empty colored circles | Real avatars inside the conic gradient ring |
| `FeedPhone` post header avatar | gradient circle | Pravatar `maya.rae` |
| `MapPhone` friend pins | colored circles with emoji | Small circular real avatars + emoji status badge |
| `MapPhone` "0.4 mi away" card | gradient circle | Pravatar `leo.k` |
| `ChatPhone` header avatar | gradient circle | Pravatar `jordan.w` + green online dot kept |
| `ChatPhone` VYBE Snap card | flat gradient | Real "two friends laughing on a couch" photo |
| Hero "Now in early access" pill | nothing | Add 3 stacked overlapping real avatars next to it for social proof |
| Final CTA section | nothing | Add a faint, low-opacity group photo as background layer behind the radial gradients |

All photos use stable Unsplash photo IDs (e.g. `https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80`) so they don't rotate and we can verify each one looks right.

## 2. New "Real people" testimonial strip

Insert a new section between "Why VYBE" and the Safety strip:

- 3 testimonial cards, each with a real Pravatar headshot, fake handle, fake location, and a short quote
- Centered headline: "Built for actual humans."
- Cards use the same `bg-white/[0.03]` glass treatment as the feature grid for visual consistency

This single section does most of the "make it look real not AI" work because it adds faces.

## 3. Scroll fix — apply the VybeHome pattern everywhere it's broken

The `vybe-home-scroll` style block (`height: 100dvh; overflowY: auto; WebkitOverflowScrolling: touch; overscrollBehaviorY: contain; touchAction: pan-y`) is what fixed the trackpad/finger scrolling for marketing pages. Auth pages have the same bug because they use `min-h-[100dvh]` (which lets content grow past the viewport without constraining a real scroll container).

**Rename the helper** so it's reusable and named after the issue:

- Promote the inline style block in `VybeHome.tsx` to a single shared CSS class **`.page-scroll-fix`** in `src/index.css` (alongside the existing `scroll-mobile-safe` block at line 1037). Document it as: *"VYBE scroll-fix — fixes the bug where users had to drag the scrollbar instead of scrolling with finger/trackpad on full-page marketing/auth screens."*
- Replace the inline style on `VybeHome.tsx` with `className="page-scroll-fix"`.

**Apply `.page-scroll-fix` to:**

1. `src/pages/Landing.tsx` — the `/login` and `/signup` page (line 283 wrapper). Change `min-h-[100dvh] … overflow-y-auto scroll-mobile-safe` → `page-scroll-fix … flex items-start sm:items-center justify-center px-4 py-8`. Keep flex layout for the centered card.
2. Spot-check and apply the same fix to other public pages already reported to have the bug: `src/pages/About.tsx`, `src/pages/Features.tsx`, `src/pages/Safety.tsx`, `src/pages/Blog.tsx`, `src/pages/FAQ.tsx`, `src/pages/Contact.tsx`, `src/pages/Privacy.tsx`, `src/pages/Terms.tsx` — only where the page wrapper currently uses `min-h-screen` / `min-h-[100dvh]` without an inner scroll container.

Authenticated app routes (under `AppLayout`) are NOT touched — they already have their own scroller at line 84/136 of `AppLayout.tsx`.

## 4. Memory

After implementation, save a `mem://technical/ui-interaction/page-scroll-fix` memory:

> "Public/marketing/auth pages outside AppLayout must use `.page-scroll-fix` (height: 100dvh + overflow-y: auto + touch-action: pan-y + WebkitOverflowScrolling). `min-h-[100dvh]` alone causes the 'have-to-drag-the-scrollbar' bug on trackpads and touch."

Add a one-liner to the index referencing it.

## Out of scope

- Real screenshots of the live VYBE app (user said keep current in-browser mockups, just make the people fake/real-looking)
- Any change to native APK behavior — RootGate already routes Capacitor builds straight to Landing
- Stripe / Cloud / DB changes

## Files touched

- `src/pages/VybeHome.tsx` (image swaps + testimonial section + remove inline scroll style)
- `src/pages/Landing.tsx` (apply `page-scroll-fix`)
- `src/index.css` (add `.page-scroll-fix` class)
- `src/pages/About.tsx`, `Features.tsx`, `Safety.tsx`, `Blog.tsx`, `FAQ.tsx`, `Contact.tsx`, `Privacy.tsx`, `Terms.tsx` (wrapper class swap where applicable)
- `mem://technical/ui-interaction/page-scroll-fix` + index update
