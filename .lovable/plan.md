

## Fix Sticker Panel: Broken Images + Snapchat-Style Layout

### Problem 1: Images Not Loading
The sticker thumbnails show broken image icons. The `image_url` stored in `user_stickers` likely contains public URLs from the `chat-media` bucket. The `<img>` tag has no error handling — if the URL fails to load, it shows a broken icon with no fallback.

### Problem 2: Grid Too Small and Squished
Current layout uses a 4-column grid with small `aspect-square` tiles crammed together — doesn't match Snapchat's sticker tray which uses larger, well-spaced items.

### Fix in `src/components/chat/StickerPanel.tsx`

1. **Switch to 3-column grid** with more gap (`gap-3`) — larger sticker previews, less cramped
2. **Increase max panel height** from 280px to 340px and inner scroll area from 200px to 260px for more room
3. **Add `onError` fallback** on `<img>` — if the image fails to load, show a placeholder icon instead of a broken image
4. **Use `object-contain` with padding** instead of `object-cover` — stickers are often transparent/irregular so they shouldn't be cropped; show the full image with some breathing room (like Snapchat)
5. **Remove heavy borders** — use subtle rounded containers with a light background instead of bordered tiles (cleaner Snapchat look)
6. **Add `crossOrigin="anonymous"`** and `referrerPolicy="no-referrer"` to the img tag to help with CORS/loading issues

### Files Touched

| File | Change |
|------|--------|
| `src/components/chat/StickerPanel.tsx` | 3-col grid, larger tiles, image error handling, Snapchat-style spacing |

