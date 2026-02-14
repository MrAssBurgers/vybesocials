

## Fix: App Stuck on Loading Screen (Live Site)

### Problem
The live site (vybehub.app) is stuck showing the static HTML splash screen (purple circle + "VYBE" text). React never mounts. The preview environment works fine because it's running the latest code, but the **live site still has the old broken build** with the `asyncCssPlugin` that was corrupting the production HTML output.

### Root Cause
The `asyncCssPlugin` that was added to fix a CSS audit issue broke the production build by incorrectly transforming the CSS `<link>` tag in the built HTML. This was already removed from the code, but the fix was **never published** to the live site.

### Additional Risk Found
The deferred `liquid.css` import at the top of `App.tsx` (module-level side effect using `requestIdleCallback`) is unusual and could cause edge-case issues in production builds. This should be moved inside a React component to be safer.

### Plan

**Step 1: Move deferred CSS loading into React lifecycle (safe)**
- Remove the module-level `requestIdleCallback`/`setTimeout` code for loading `liquid.css` from the top of `App.tsx`
- Move it into a `useEffect` inside the `AppWithPreloader` component so it only runs after React has mounted successfully
- This eliminates any risk of module-level side effects interfering with the production build

**Step 2: Publish to live site**
- After the code change, publish the app so the live site gets the working build (with the `asyncCssPlugin` removed and the CSS loading fixed)

### Technical Details

```text
Current (risky module-level side effect):
  const loadLiquidCSS = () => import('./styles/liquid.css');
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(loadLiquidCSS);
    } else {
      setTimeout(loadLiquidCSS, 100);
    }
  }

After (safe React lifecycle):
  // Inside AppWithPreloader useEffect:
  useEffect(() => {
    import('./styles/liquid.css').catch(() => {});
  }, []);
```

This is a minimal, safe change that preserves all existing functionality while ensuring the production build cannot be broken by top-level side effects.
