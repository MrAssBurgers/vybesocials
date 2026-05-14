## Goal
Replace the mockup Play Store screenshots with real screenshots captured from your live app, then composite them with professional captions and brand styling.

## Approach

### 1. Capture real screens from the preview
Use the browser tool to log into the preview and navigate to the 8 target routes at a 1080x1920 (9:19.5 portrait) viewport so the captures match Play Store dimensions natively. Routes:

```
/home          → Home / DNA-ranked feed
/clips         → Vertical Clips
/messages      → Encrypted DMs
/upload        → Camera / composer
/map           → Friend Map
/community     → Communities
/vybe-dna      → DNA + customization
/safety        → Vybe Check / safety
```

If a route needs seeded content to look good, I'll note it and either seed test data or pick the closest already-populated screen.

### 2. Composite to Play Store format
Reuse the existing Python/PIL pipeline from `scripts/` but swap the mock images for the real captures. Each final 1080x1920 PNG keeps:
- Real app screenshot in the top ~72% (rounded corners, soft drop shadow on a brand gradient bg, NOT a phone frame — Play Store rejects device frames)
- Bottom caption band with Roboto Bold headline + Medium subtitle, auto-fit to safe margins
- Subtle navy → purple → cyan gradient seam matching brand tokens

Plus regenerate the 1024x500 feature graphic (no change unless you want one).

### 3. QA every slide
Convert each PNG back to a thumbnail and visually inspect for: clipped text, blurry capture, status-bar junk, visible debug UI, uneven padding. Iterate until clean.

### 4. Output
Save to `/mnt/documents/play-store-screenshots/` with the same `01-home.png` … `08-safety.png` naming so they slot into your existing upload flow. Deliver as `<presentation-artifact>` tags.

## What I need from you before starting

1. **Preview login** — the browser uses your preview's auth session. Please sign in to the preview first so I can reach `/home`, `/messages`, etc. (they're behind ProtectedRoute).
2. **Caption copy** — keep the existing 8 headlines from the previous batch, or want me to rewrite them punchier? (e.g. "Your feed, evolved." / "Real friends, real time." / "Snap. Share. Vanish.")
3. **Background style** — same brand gradient (navy→purple→cyan) or do you want a cleaner look (solid dark + subtle glow, à la Apple App Store)?

Once you confirm those, I'll capture, composite, QA, and ship the new set.