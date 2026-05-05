## Fix VYBE AI Assistant Layout

The VYBE AI chat panel currently opens as a full-screen sheet with sharp edges that visually collide with the bottom nav and floating buttons. I'll restyle it into a polished, rounded floating panel.

### Changes (single file: `src/components/dna/DNAChatAssistant.tsx`)

**Container**
- Replace the full-bleed `fixed inset-0` sheet with a rounded floating panel:
  - Mobile: `inset-x-2 bottom-2 top-4` with `rounded-3xl`
  - Desktop (sm+): bottom-right anchored, `w-[420px] h-[640px] max-h-[85vh]`, `rounded-3xl`
- Add a dimmed `bg-background/60 backdrop-blur-sm` backdrop that closes the panel on tap
- Apply `border border-border/50 shadow-2xl overflow-hidden` so corners and edges look clean
- Replace the slam-up `y: 100%` animation with a softer `y: 40, scale: 0.96` spring

**Header**
- Swap the avatar from `rounded-full` to a `rounded-2xl` gradient tile with primary→accent glow shadow
- Reformat the stat row: each stat (`⚡ 53%`, `💬 81%`, `🎨 49%`) becomes an inline chip with bolder values and softer dot separators, no longer overflowing
- Replace the bg with a subtle `bg-gradient-to-r from-primary/10 via-accent/5 to-transparent` accent strip
- Round the close button (`rounded-full h-9 w-9`)

**Result**
- Panel no longer covers the whole screen behind the bottom nav
- All four corners are properly curved
- Stats line up cleanly under the title without crowding the close button
