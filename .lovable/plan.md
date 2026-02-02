

## Fix PWA Install Icon to Show the VYBE V Logo

The Chrome install dialog is showing the old teal "V" letter icon instead of the stylized gradient V logo (like the browser favicon). This happens because the static manifest is being read before the dynamic one replaces it.

---

### Root Cause

1. `index.html` links to `/manifest.webmanifest` (static file)
2. That manifest points to `/icons/vybe-192.png` and `/icons/vybe-512.png` (old icons)
3. Chrome reads this before React mounts and the `useDynamicManifest` hook replaces it
4. Even though the edge function generates the correct V logo, Chrome already cached the old icons

---

### Solution

**1. Update the static PNG icons** (`public/icons/vybe-192.png` and `public/icons/vybe-512.png`)

Replace these with the correct VYBE V logo - the gradient strokes forming a V with the white dot at the vertex (matching the favicon exactly).

I'll generate proper PNG versions of the V logo with the default purple/cyan theme colors using the static favicon design.

**2. Alternative: Make the static manifest use the edge function**

Update `manifest.webmanifest` to point icon URLs to the edge function with default colors:
```json
{
  "icons": [
    {
      "src": "https://eabvbtkxdbttjpdpbmuw.supabase.co/functions/v1/generate-pwa-icon?size=192&primary=271%2091%25%2065%25&accent=189%2094%25%2043%25",
      "sizes": "192x192",
      "type": "image/svg+xml"
    },
    ...
  ]
}
```

This way, even the static manifest serves the correct V logo icon.

---

### Recommended Approach

**Both fixes combined:**

1. Update static icons to show the V logo as a fallback
2. Point static manifest to edge function URLs for dynamic theming

This ensures:
- The Chrome install prompt shows the V logo immediately
- Theme colors sync when the dynamic manifest kicks in

---

### Files to Update

| File | Change |
|------|--------|
| `public/manifest.webmanifest` | Point icons to edge function with default theme colors |

