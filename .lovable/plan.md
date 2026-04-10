

## Fix Slow Chat Media + Long-Press Popup Menu

### Problems

1. **Slow media loading**: Each chat image/video triggers an individual `getSignedUrl` call. Unlike feed/clips/stories which batch-sign all URLs at once, chat has zero batch preloading. Opening a conversation with 10 images = 10 sequential network requests.

2. **Long-press on images shows browser context menu instead of app menu**: The `<img>` tag in `ChatMediaBubble` has no `onContextMenu` prevention. On mobile, long-pressing an image triggers the browser's native "Save Image / Copy" menu, intercepting the bubble's custom long-press handler that should show reactions/unsend/pin options.

### Changes

**A. `src/components/chat/ChatView.tsx` — Batch preload media URLs when messages load**
- After messages are fetched/loaded, collect all `media_url` values from the message list
- Call `batchSignUrls(mediaUrls)` once to sign them all in a single network request per bucket
- This means by the time `ChatMediaBubble` renders, URLs are already in cache and display instantly

**B. `src/components/chat/ChatMediaBubble.tsx` — Prevent native context menu on images**
- Add `onContextMenu={(e) => e.preventDefault()}` to the `<img>` and `<video>` elements
- Add `-webkit-touch-callout: none` and `user-select: none` CSS to prevent iOS Safari's native long-press menu
- This lets the parent bubble's long-press handler fire correctly instead of being intercepted

### Files Touched

| File | Change |
|------|--------|
| `src/components/chat/ChatView.tsx` | Add batch URL preloading for chat messages |
| `src/components/chat/ChatMediaBubble.tsx` | Block native context menu on media elements |

