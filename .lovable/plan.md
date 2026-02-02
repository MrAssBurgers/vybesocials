

## Fix PWA App Icon to Match Browser Favicon

The installed web app icon currently shows a V logo on a **white rounded rectangle background**. You want it to be **transparent** like the browser favicon, with the V matching your vybe theme colors.

---

### What needs to change

**1. Update the edge function** (`supabase/functions/generate-pwa-icon/index.ts`)

Currently the function adds a white background for "maskable" icons:
```javascript
${maskable ? `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="white"/>` : ''}
```

The fix:
- Remove the white background rectangle entirely for all icons
- Use the same SVG V structure as the favicon (with gradient strokes)
- Return a transparent SVG that lets the user's home screen color show through

**2. Ensure the dynamic manifest** (`src/hooks/useDynamicManifest.ts`)
- Already reads CSS variables (`--primary`, `--accent`) correctly
- Already regenerates the manifest when `vybeThemeChange` fires
- No changes needed here - it will automatically use the updated edge function

---

### Technical implementation

**Edge function changes:**

```javascript
// Remove the maskable background completely
// Generate same V shape as favicon with theme gradients
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="primary-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${primaryHSL})"/>
      <stop offset="100%" stop-color="hsl(${primaryHSL} / 0.8)"/>
    </linearGradient>
    <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${accentHSL})"/>
      <stop offset="100%" stop-color="hsl(${accentHSL} / 0.8)"/>
    </linearGradient>
  </defs>
  <!-- V strokes with theme gradients, NO background -->
  <path d="M${leftX} ${topY} L${centerX} ${bottomY}" stroke="url(#primary-grad)" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <path d="M${rightX} ${topY} L${centerX} ${bottomY}" stroke="url(#accent-grad)" stroke-width="${strokeWidth}" stroke-linecap="round"/>
</svg>`;
```

---

### Result

After this change:
- The PWA home screen icon will be a transparent V that matches your current vybe theme colors
- When you change your theme, the manifest regenerates and new installs get the updated icon
- Matches exactly the style of the browser favicon

---

### Platform note

Some platforms (especially iOS) may display a default background color behind transparent app icons. This is controlled by the device, not the icon itself. On Android and most desktops, the transparent icon will blend with the home screen/dock background.

