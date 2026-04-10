

## Fix Explore Bar Gap + Map Page Scroll Lock

### Issue 1: Explore Tab Bar Gap (especially iPad)

The tab bar at line 320 uses `pt-[env(safe-area-inset-top)] pb-2`. On iPads, `env(safe-area-inset-top)` is often 0, but the `pb-2` and container alignment still create a visual gap. The close button also has `top-4` which pushes it down.

**Fix in `src/pages/Explore.tsx`:**
- Remove `pb-2` from the tab bar wrapper — make it `pt-[