

## Plan: Premium "Advanced" VYBE Email Redesign

The existing templates are already on-brand (dark + neon gradient header) but feel basic — flat header, plain text block, single button. I'll level them up to feel like a premium product email (think Linear / Arc / Vercel meets neon Y2K).

### Design upgrades to `_styles.ts`
- **Layered hero header**: gradient base + radial glow overlays + subtle noise grid, "VYBE" wordmark with stronger letter-spacing, animated-feeling 3-dot pill ("● ● ●") above the wordmark for that "live broadcast" vibe.
- **Glow card container**: outer wrapper with neon glow shadow (`box-shadow: 0 0 60px rgba(255,51,153,0.15), 0 30px 80px rgba(0,0,0,0.6)`), thinner inner border, subtle inner top highlight line for depth.
- **Premium CTA button**: gradient + 1px inner highlight border + drop shadow + chevron arrow (›) appended after the label.
- **Section divider**: gradient hairline (`linear-gradient(90deg, transparent, #FF3399, transparent)`) used between hero and body.
- **Meta chip row** (new): small uppercase pills like `SECURE · ENCRYPTED · 5 MIN` under the H1 for that "advanced" feel.
- **Footer upgrade**: 3-column micro-grid (Help · Privacy · Status) above brand line, with neon dot separators.
- **Preheader text** kept (Preview component) — invisible but boosts inbox preview quality.

### Per-template refinements (each gets its own personality while sharing the system)
1. **`signup.tsx`** — Hero says "Activate your VYBE", swap CTA to "Activate Account ›", add a 3-step progress strip (`① Verify  ②Personalize  ③ Vibe`).
2. **`magic-link.tsx`** — "Instant access" headline, lock icon mark, 10-min expiry chip, secure-link badge.
3. **`recovery.tsx`** — "Reset incoming" with key motif, security tips block (3 tiny bullet points with neon dots).
4. **`invite.tsx`** — Big "You're on the list" + inviter name slot, sparkle motifs, "What's inside VYBE" mini feature row (3 emoji tiles: 💬 Chat · 🎵 Sounds · ✨ DNA).
5. **`email-change.tsx`** — Keep the from/to card, upgrade it to a neon framed comparison block with arrow between addresses.
6. **`reauthentication.tsx`** — OTP code box gets a glowing animated-look border (multi-layer box-shadow) + per-digit spacing, expiry countdown chip.
7. **`welcome.tsx`** (transactional) — Confetti gradient header, "Your VYBE starts now" headline, 3-tile quick start grid (Set up profile / Find friends / Drop your first vybe), each as a mini card with a gradient corner accent.

### Files
- `supabase/functions/_shared/email-templates/_styles.ts` — extend tokens (add `heroOverlay`, `divider`, `chip`, `chipRow`, `featureTile`, `glowCard`, `buttonInner`)
- `supabase/functions/_shared/email-templates/signup.tsx`
- `supabase/functions/_shared/email-templates/magic-link.tsx`
- `supabase/functions/_shared/email-templates/recovery.tsx`
- `supabase/functions/_shared/email-templates/invite.tsx`
- `supabase/functions/_shared/email-templates/email-change.tsx`
- `supabase/functions/_shared/email-templates/reauthentication.tsx`
- `supabase/functions/_shared/transactional-email-templates/welcome.tsx`

Then redeploy `auth-email-hook` + `send-transactional-email`.

### Email-client safety notes
- All effects use **inline styles** + **CSS that Gmail/Apple Mail support**: `linear-gradient`, `box-shadow`, `border-radius`, multiple `<Section>` overlays. No `@keyframes`, no SVG filters, no web fonts (system stack only).
- Body remains dark `#0A0A12` (intentional brand choice — VYBE's whole identity is dark; the white preview canvas in the dashboard is just the dashboard chrome, the actual email renders dark).

### Out of scope
- Changing copy beyond the headline polish above
- Adding images/logos (kept text-based VYBE wordmark for crisp retina + zero load)
- Editing `auth-email-hook/index.ts` routing

