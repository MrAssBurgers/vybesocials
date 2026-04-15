

## Fix: Remove Bottom Nav Frosted Glow + Fix DM Gap

Two targeted fixes, both in existing files.

---

### 1. Remove frosted/glowing background from Bottom Nav

**File**: `src/components/layout/BottomNav.tsx` (lines 530-537)

The inner container currently has:
- A gradient overlay with `hsl(var(--primary) / 0.35)` and accent tinting
- A glowing `boxShadow` with `hsl(var(--primary) / 0.3)` spread

**Fix**: Replace with a clean solid `bg-card` background, no glow shadow. Keep the border and rounded corners. The edit mode glow stays (only shows during drag-to-reorder).

```
// Before
background: 'linear-gradient(135deg, hsl(var(--primary) / 0.35), ...)), hsl(var(--card))'
boxShadow: '0 8px 32px hsl(var(--primary) / 0.3), ...'

// After  
background: 'hsl(var(--card))'
boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
```

Also remove the top-edge highlight line (`via-white/8` gradient on line 540) — that's part of the frosted look.

---

### 2. Fix DM gap

**File**: `src/pages/Messages.tsx`

The Messages page wrapper has `backgroundColor: 'hsl(var(--card) / 0.85)'` with `backdropFilter: 'blur(16px)'` — this semi-transparent card background can cause a visible gap/seam against the page background behind it, especially at the edges near the bottom nav.

**Fix**: Change to solid `hsl(var(--card))` (no 0.85 opacity), remove the backdrop-filter entirely. The DMs container should be fully opaque so there's no visual separation or gap between it and surrounding UI.

---

### Files modified (2)
1. `src/components/layout/BottomNav.tsx` — solid bg-card, no glow shadow, remove highlight line
2. `src/pages/Messages.tsx` — solid opaque background, no backdrop blur

