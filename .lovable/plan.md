# Plan: Public "Vybe Home" Marketing Page

A new public page (no login required) styled like discord.com — bold hero, app screenshots, feature showcases, and a "why VYBE is different" narrative that turns visitors into signups.

## Where it lives

- New page: `src/pages/VybeHome.tsx`
- New route: `/vybe-home` (public, added to `AnimatedRoutes.tsx`)
- Linked from current `/` Landing page hero ("See what makes VYBE different →") so we don't disrupt the existing landing/auth flow
- Optional: also linked in footer of Landing, Features, About

(We keep `/` = Landing as-is so signups still work. Vybe Home is the "tour" page.)

## Page structure (top to bottom)

```text
┌─────────────────────────────────────────────┐
│  STICKY NAV: VYBE logo · Features · Safety  │
│              · Blog · [Sign in] [Get VYBE]  │
├─────────────────────────────────────────────┤
│  HERO                                       │
│  "The social app that becomes you."         │
│  Subhead + [Download] [Open Web App]        │
│  Floating phone mockup w/ animated DNA card │
│  Ambient gradient mesh (purple→cyan)        │
├─────────────────────────────────────────────┤
│  SOCIAL PROOF STRIP                         │
│  "Built for your real friends" · stats      │
├─────────────────────────────────────────────┤
│  FEATURE BLOCK 1 — VYBE DNA (hero feature)  │
│  Left: copy + bullets. Right: screenshot.   │
├─────────────────────────────────────────────┤
│  FEATURE BLOCK 2 — Aura & Customization     │
│  Image left, copy right (alternating)       │
├─────────────────────────────────────────────┤
│  FEATURE BLOCK 3 — Friend Map + Bump        │
├─────────────────────────────────────────────┤
│  FEATURE BLOCK 4 — VYBE Snap, Notes, Calls  │
├─────────────────────────────────────────────┤
│  FEATURE GRID (12 mini cards w/ icons)      │
│  Clips · Communities · Marketplace · DNA ·  │
│  Creator Tools · Themes · AI · Stories ·    │
│  Reaction Streaks · Roulette · Locker ·     │
│  Vybe Pass                                  │
├─────────────────────────────────────────────┤
│  COMPARISON: "Why not just use ___?"        │
│  Three columns: Insta / Snap / Discord vs   │
│  VYBE row showing what only VYBE does       │
├─────────────────────────────────────────────┤
│  SAFETY STRIP                               │
│  Vybe Check · parental controls · age gates │
├─────────────────────────────────────────────┤
│  FINAL CTA                                  │
│  Big gradient panel: "Make it yours."       │
│  [Create your VYBE] [Open Web App]          │
├─────────────────────────────────────────────┤
│  FOOTER (reuse existing footer)             │
└─────────────────────────────────────────────┘
```

## Design language (Discord-inspired, VYBE-flavored)

- Dark background `#0B0B10` with large soft radial gradients (purple `#8B5CF6` → cyan `#06B6D4`) blurred behind sections — already on-brand
- Rounded "device frames" around screenshots (phone-shaped svg + soft shadow + subtle parallax on scroll)
- Big display type for section headlines (Space Grotesk via existing `font-display`), small Inter body
- Alternating left/right feature blocks, each ~80vh on desktop, stacked on mobile
- Subtle Framer Motion: fade+rise on scroll-in (`whileInView`, once: true), gentle floating animation on the hero phone, animated gradient bar at top
- Reuse existing glass + button components: `LiquidGlassButton`, `GlassCard`, design tokens from `src/lib/design-system.ts`
- Fully responsive: single column under `md`, two-column from `lg`

## Screenshots

We need 4 hero screenshots + 12 small feature thumbnails. Approach:
1. Use `browser--screenshot` against the running preview at key in-app routes (`/home`, `/vybe-dna`, `/messages`, `/community`, `/profile`, etc.) at a 9:19.5 mobile viewport (390×844)
2. Save them to `public/marketing/` (e.g. `dna.png`, `feed.png`, `messages.png`, `map.png`, `aura.png`, etc.)
3. Reference them in the page via `<img src="/marketing/dna.png">` inside the phone-frame component

If a route requires auth and can't be screenshotted publicly, I'll use a placeholder gradient card with the feature name + icon and we can swap real screenshots in later. I'll list which screenshots succeeded vs. fell back so you can flag any to retry.

## Components to add

- `src/pages/VybeHome.tsx` — the page itself (single file, ~400-500 lines, all sections inline as small components for clarity)
- `src/components/marketing/PhoneFrame.tsx` — reusable phone-shaped wrapper for screenshots
- `src/components/marketing/FeatureRow.tsx` — alternating left/right feature block
- `src/components/marketing/FeatureCard.tsx` — small icon card for the 12-feature grid

## Routing & SEO

- Add `<Route path="/vybe-home" element={<VybeHome />} />` to public block in `AnimatedRoutes.tsx`
- Add `<Helmet>` (already used elsewhere) with title "VYBE — The social app that becomes you", description, og:image
- Add `/vybe-home` to `public/sitemap.xml`
- Add a "Tour" link in the existing Landing hero pointing to `/vybe-home`

## What I won't touch

- `/` Landing page (signup flow stays exactly as-is)
- Auth, DB, RLS, edge functions — pure marketing page, no backend changes
- Existing `Features.tsx` page (Vybe Home is the richer, image-heavy version; we keep Features as the text-only spec page)

## Acceptance

- Visit `/vybe-home` while logged out → loads instantly, no auth redirect
- Hero, 4 feature blocks, 12-card grid, comparison table, final CTA all render
- Real in-app screenshots show in phone frames (or styled fallbacks listed if any failed)
- Mobile (390px), tablet, and desktop all look polished — nothing overlaps, no horizontal scroll
- "Get VYBE" / "Create your VYBE" buttons route to `/` (Landing) where signup happens

Approve and I'll build it end-to-end, capture the screenshots from the live preview, and QA every breakpoint before handing back.