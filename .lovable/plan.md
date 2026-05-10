## Mobile Welcome Redesign — Landing page

Scope: `src/pages/Landing.tsx`, the hero block above the auth form (lines ~356–394). Auth form, social buttons, SEO copy below remain untouched. Pure UI/copy change — no business logic, no DB.

### What changes

**1. Replace the small V icon + "Welcome to VYBE" text with the VYBE wordmark logo**
- Remove the standalone `<VYBELogo size="md" showText={false} />` + the `<h1>Welcome to VYBE</h1>`.
- Render a single large gradient `VYBE` wordmark as the hero (using the existing `VYBELogo` component with `showText={true}` and the icon visually hidden — or a dedicated wordmark span reusing the same gradient style already in `VYBELogo.tsx` lines 140–156 to keep brand parity).
- Keep the soft radial glow behind it for depth.
- The `<h1>` becomes the wordmark itself (semantic: wrap the wordmark in an `<h1>` for SEO, with visually-hidden "VYBE" text for screen readers).

**2. Rewrite the tagline + feature list (focused, no mini-apps, no VYBE+ mentions)**

New structure inside the card, under the wordmark:

```
[ VYBE wordmark ]

Your social home for real connection.

• Stories & Clips — share your moments
• Messaging & Calls — DMs, group chats, voice & video
• Communities — find your people
• Friend Map & Discovery — see who's nearby

✨ Coming soon: Marketplace, Events & Meetups,
Video Messages, AI Chatbot & VYBE Agent
```

- Tagline: short, one line, `text-foreground/80`.
- Feature list: 4 rows, each a tiny lucide icon (`Sparkles`/`MessageCircle`/`Users`/`MapPin`) + bold label + thin `text-muted-foreground` description. Compact spacing (gap-2) so it stays above-the-fold on 762×663 mobile.
- "Coming soon" line: single muted line at the bottom with a subtle gradient `Sparkles` icon. No mention of mini-apps or VYBE+ anywhere.

**3. Trim the SEO blurb above the card (lines 358–364)**
- Remove the long "AR filters, music, and AI-powered tools" sentence (which name-drops mini-app territory).
- Replace with a tight one-liner: "The social platform for real connection." + the existing `Learn more about VYBE →` link kept for SEO.

### Visual / styling

- Wordmark size: `text-4xl sm:text-5xl`, same gradient + `gradient-shift` animation already defined in `VYBELogo.tsx`.
- Card stays `liquid-glass-card rounded-2xl`, padding tightened to `p-4 sm:p-5` to fit the new list without pushing the auth form off-screen.
- Feature row icon container: `w-7 h-7 rounded-lg bg-primary/10 text-primary` for a clean, consistent look. All colors via existing semantic tokens (`--primary`, `--accent`, `--muted-foreground`, `--foreground`) — no hardcoded colors.
- Coming-soon line: `text-[11px] text-muted-foreground/80`, centered, italic-free, with a tiny `Sparkles` icon.
- Mobile-first: verify nothing overflows the 400px max-width container on the current 762×663 viewport.

### Out of scope

- Auth form, Google/Apple buttons, forgot-password, age-gate.
- Desktop landing layout above this block (only the card content changes; same content renders on desktop too and improves it).
- Any backend, RLS, or routing changes.
- `AppWelcome.tsx` (different page, post-signin) — not touched.

### Verification

- Load `/` on mobile viewport: wordmark is the visual anchor, 4 feature rows fit, coming-soon line visible, auth form still reachable without excessive scroll.
- No mention of "mini apps" or "VYBE+" in the visible card.
- Light + dark themes both render the gradient wordmark correctly (component already handles this).
