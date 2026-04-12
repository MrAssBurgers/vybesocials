

## Fix: Animation Flicker, Notification PFP Placement, and Background Leak

### Issues Found

**1. Aurora/background effect animation snaps back**
The `aurora-sweep` keyframe animates from `background-position: 0%` to `100%` with `background-size: 200%`. At the end of each cycle the gradient jumps back to 0%, causing a visible flicker. Per the project's motion standards, this needs a tile-safe seamless loop where the end frame is visually identical to the start frame.

**2. Notification profile avatar misaligned**
In grouped notifications (`GroupedNotificationRow`), the stacked avatar container uses a hardcoded width/height that doesn't account for the icon badge's negative offset (`-bottom-0.5 -right-0.5`), causing the PFP to clip or shift out of place.

**3. Visiting a user's profile from notifications overwrites your background permanently**
In `Profile.tsx` lines 78-93, the `useEffect` that applies another user's equipped theme image returns early (no cleanup) when `themeImg` is null. This means if the other user has no theme, the effect skips cleanup — but if they DO have one, the cleanup calls `refreshBackground()` on unmount. The real bug: `refreshBackground` is missing from the dependency array, and if you navigate to a profile that has a theme and then navigate away, the background can persist because the cleanup runs with a stale `refreshBackground` reference. Additionally, the effect should always restore the background on unmount, not only when a theme was applied.

### Plan

**File 1: `src/components/effects/BackgroundEffects.tsx`**
- Fix `aurora-sweep` keyframe: change gradient to a repeating tile pattern (A-B-C-D-A) at `300% 100%` background-size, animate from `0% 50%` to `-33.333% 50%` so end = start. Use 5s linear infinite.
- Apply same seamless-loop fix to second aurora layer.

**File 2: `src/pages/Profile.tsx`**
- Restructure the theme background `useEffect` (lines 78-93) so the cleanup always runs — move the cleanup function outside the `if (!themeImg)` early return.
- Add `refreshBackground` to the dependency array.
- When no theme image exists, explicitly do nothing on mount but still restore on unmount.

**File 3: `src/pages/Notifications.tsx`**
- In `GroupedNotificationRow` (line 534), fix the avatar container sizing to properly accommodate the icon badge overlay without clipping.

### Technical Details

Aurora seamless loop fix pattern:
```css
/* Before (snaps): */
@keyframes aurora-sweep {
  from { background-position: 0% 50%; }
  to { background-position: 100% 50%; }
}
/* background-size: 200% 100% */

/* After (seamless): */
@keyframes aurora-sweep {
  from { background-position: 0% 50%; }
  to { background-position: -33.333% 50%; }
}
/* gradient: A-B-C-D-A pattern, background-size: 300% 100% */
```

Profile background cleanup fix:
```typescript
useEffect(() => {
  const themeImg = equippedTheme ? THEME_IMAGES[equippedTheme] : null;
  if (themeImg) {
    const img = new Image();
    img.onload = () => setBackgroundImage(themeImg);
    img.src = themeImg;
  }
  // Always restore on unmount, regardless of whether theme was applied
  return () => { refreshBackground(); };
}, [equippedTheme, setBackgroundImage, refreshBackground]);
```

