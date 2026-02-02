
## Why it still shows the white rounded-square icon

What you’re seeing is coming from two places that still use **static PNG icons**, not the dynamic manifest:

1) **iOS “Add to Home Screen” ignores the manifest in many cases** and instead uses:
- `index.html` → `<link rel="apple-touch-icon" href="/icons/vybe-192.png">`

2) Even on Android/Chrome, the OS often **caches the installed app icon at install time**. Changing the manifest later usually won’t update the already-installed icon unless you reinstall (or force a cache-bust).

Right now `index.html` still points to `/icons/vybe-192.png`, and that file is still the “white tile” style. So even though we fixed the manifest to use the V SVG generator, the home-screen icon can still come from the old PNG.

---

## Goal

Make *every* install path (Android install prompt + iOS home screen) show the stylized V, and remove the baked-in white tile by ensuring the PNGs are correct and caches are busted.

---

## Changes to implement

### A) Replace the static PNGs that iOS (and sometimes Android) uses
Update these files to be the stylized V logo **with a transparent background** (no white rounded square baked into the image):

- `public/icons/vybe-192.png`
- `public/icons/vybe-512.png`

Optional but recommended for consistency (used by notifications / other surfaces):
- `public/icons/icon-192x192.png`
- `public/icons/icon-512x512.png`
- `public/icons/icon-96x96.png` (badge / notification icon)

Implementation detail:
- Generate PNGs based on the same V geometry as the favicon / generator.
- Ensure the PNG canvas itself is full-size (192/512) and background alpha = 0.

### B) Update `index.html` to point to the updated icon assets and bust caches
In `index.html`, update:
- `<link rel="icon" type="image/png" sizes="192x192" href="/icons/vybe-192.png" />`
- `<link rel="apple-touch-icon" sizes="180x180" href="/icons/vybe-192.png" />`

Add a simple cache-busting query so devices fetch the new image immediately:
- `/icons/vybe-192.png?v=2`

(You can keep the filename the same; the `?v=2` is the important part.)

### C) Bust caching for the manifest icon URLs too (optional but helpful)
Your `public/manifest.webmanifest` points to the icon generator with a **1-year cache**. To force devices to fetch the latest icon, append a version param:
- `...generate-pwa-icon?...&v=2`

This doesn’t change the icon visually (still the V), but avoids “I fixed it, but it still shows the old one” issues.

### D) Reinstall requirement (this is the part most people miss)
Even after the code changes, the OS may keep the old app icon until reinstall.

We’ll validate in two ways:
1) In browser DevTools → Application → Manifest (confirm icons are the V)
2) Uninstall + reinstall PWA:
   - **Android/Chrome**: remove the installed app, then install again
   - **iOS**: remove from home screen, then “Add to Home Screen” again (sometimes also helps to clear Safari website data for the site)

---

## What “transparent” can and can’t do (important expectation)
We can make the icon image itself transparent (no white tile baked in).  
However, some launchers / iOS styles may still render icons inside a system-defined rounded shape. The key is: the icon file won’t force a white square anymore.

If you still see white after this, the next step would be to intentionally render a dark background for the “maskable” icon variant, but we’ll only do that if you prefer it.

---

## Files involved
- `public/icons/vybe-192.png` (replace)
- `public/icons/vybe-512.png` (replace)
- `index.html` (update icon links + add cache-bust)
- `public/manifest.webmanifest` (add `v=2` cache-bust to generator URLs)
- (Optional) `public/icons/icon-192x192.png`, `public/icons/icon-512x512.png`, `public/icons/icon-96x96.png` (replace for consistency)

---

## Acceptance checklist
- Install prompt shows the stylized V (not old teal letter icon)
- Home screen icon uses stylized V and no longer has the baked-in white tile
- After uninstall/reinstall, the icon updates reliably

