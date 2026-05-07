## 1. Floating frosted-glass DM header (no bar)

In `src/components/chat/ChatView.tsx` around line 1274, replace the entire `<header>` element. Remove the full-width black bar (no `border-b`, no opaque background) and split the contents into **two independent floating pills** that look like they're hovering over the chat content:

- **Left pill**: back arrow + avatar + name/presence
- **Right pill**: phone, FaceTime, chat-settings (3-dot)

Both pills:
- `bg-background/40 backdrop-blur-2xl backdrop-saturate-150 border border-white/10` for the Instagram-style live blur of whatever is behind them
- `rounded-full` with soft shadow + inset white ring for premium glass depth
- Header wrapper: `bg-transparent`, `pt-3 sm:pt-4 pb-2`, `sticky top-0 z-20` so they sit lower (no cutoff on small Androids) and the chat content scrolls *behind* them with the live blur showing through.
- Compact icon size (`h-8 w-8`) so nothing overflows.

## 2. Truly hide Friend Link + AI Designer with bottom nav

`src/components/friends/AutoFriendDrop.tsx` line ~343: the current hidden state is `translate-y-28 pointer-events-none` — the button is still visible (just shifted off the safe area). Change to fully hide:
```tsx
className={cn(
  "transition-all duration-300",
  controlVisible
    ? "opacity-100 translate-y-0 pointer-events-auto"
    : "opacity-0 translate-y-28 pointer-events-none invisible"
)}
```

`src/components/ai/VYBECommandBar.tsx` line ~187: current `animate={{ y: controlVisible ? 0 : 112 }}` keeps opacity at 1. Change to:
```tsx
animate={{
  scale: 1,
  opacity: controlVisible ? 1 : 0,
  y: controlVisible ? 0 : 112,
  pointerEvents: controlVisible ? 'auto' : 'none',
}}
```
plus add `style={{ visibility: controlVisible ? 'visible' : 'hidden' }}` on the outer wrapper after the exit transition so it doesn't catch taps.

## 3. Clip thumbnails not loading in chat

Investigate `src/components/chat/MessageBubble.tsx` (or the message renderer) where video messages render. The bug is almost certainly that on the native build the `<video>` element relies on `preload="metadata"` to generate a poster, which Android WebView often blocks for cross-origin signed URLs. Fix:
- Generate a `poster` URL from the existing video processor (`useVideoProcessor` already produces a thumbnail blob on upload — store it as `thumbnail_url` on the message media).
- For legacy clips without a stored poster, fall back to a `<canvas>` first-frame extraction in the bubble (request `crossOrigin="anonymous"` + `seekTo(0.1)` + `drawImage`) and cache the data URL via `signedUrlCache`.
- Set `<video preload="auto" playsInline muted poster={thumbnailUrl}>` so Android shows the first frame even when autoplay is blocked.

## 4. NFC Friend Drop — both phones broadcast + tap triggers add animation

In `src/hooks/useNativeFriendDrop.ts` and `native/android/FriendDropPlugin.kt` / `native/ios/FriendDropPlugin.swift`:

- Both phones must enter **HCE (Host Card Emulation) reader+writer mode simultaneously**. Today the initiator broadcasts and the responder reads — change both to call `startSession()` which:
  1. Registers an HCE service that emits the user's `friend_drop_token` (signed short-lived JWT from `friend-drop-token` edge function).
  2. Simultaneously polls for incoming NDEF messages.
- On `onTagDiscovered`, immediately:
  1. Fire haptic `impactHeavy` + emit `nfc-detected` event consumed by `AutoFriendDrop`.
  2. Set phase to `connecting` so the existing add-user animation (the radial pulse + avatar morph) plays the moment phones touch.
  3. Call `friendDropSync.acceptPeer(token)` to commit the friendship in Supabase.
- Update `AutoFriendDrop.tsx`: subscribe to `nativeFriendDrop.onPeerDetected` and call `setPhase('connecting')` → `setPhase('success')` so the add animation runs end-to-end on tap, even before the server round-trip completes (optimistic UI).

## Technical summary

| File | Change |
|---|---|
| `src/components/chat/ChatView.tsx` | Replace bar header with two floating frosted-glass pills, remove border, add live backdrop-blur |
| `src/components/friends/AutoFriendDrop.tsx` | Add `opacity-0 invisible` on hidden state; subscribe to NFC tag detection to start add animation |
| `src/components/ai/VYBECommandBar.tsx` | Animate opacity to 0 + visibility hidden when nav hides |
| `src/hooks/useNativeFriendDrop.ts` | Expose `onPeerDetected` event, enable simultaneous HCE broadcast+read |
| `native/android/FriendDropPlugin.kt` | Start HCE service + reader mode in parallel inside `startSession()` |
| `native/ios/FriendDropPlugin.swift` | Same — Core NFC reader + CoreBluetooth advertising in parallel |
| Chat message bubble (video) | Persist `thumbnail_url` on message_media; use as `<video poster>`; fallback canvas-extract for legacy clips |

After approval, you'll need to **rebuild in Despia** for the NFC and video poster changes to ship to the Play Store build.
