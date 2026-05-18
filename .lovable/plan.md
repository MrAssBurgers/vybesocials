## Fix four issues

### 1. AI chat → DM parity
Rebuild `src/pages/AIChat.tsx` so the transcript visually matches `src/components/chat/ChatView.tsx`:
- Same header (avatar + name + presence row, back button, options) but for "Vybe AI".
- Same message stack: right-aligned user bubble using the standard DM `primary`/`primary-foreground` token pair, left-aligned assistant text rendered directly on the chat surface (no colored card), same spacing, same timestamp/grouping rules, same long-press hold menu where it makes sense.
- Same composer: identical input bar styling, attach button, send button states, typing indicator, scroll-to-bottom button.
- Keep the AI-only extras (model picker, regenerate, tool/result chips, suggestion strip, safety badge) layered on top of the standard DM shell, not as a separate layout.
- Reuse the existing DM primitives (`MessageBubble`/`ChatMediaBubble`/`ReplyPreview`/composer) where possible instead of bespoke AI styles.

### 2. Push prompt — only when truly not enabled
In `src/hooks/useEnablePushPrompt.ts` and `usePushNotifications`:
- Treat OneSignal + Despia native push as authoritative: if OneSignal reports `optedIn` / a player ID exists, or Despia's native push token is registered, set `isSubscribed = true` and never open the prompt.
- Also suppress when `Notification.permission === 'granted'` and a subscription exists, even if the server row is missing (re-sync silently in background).
- Persist a "dismissed forever after enable" flag so once the user enables, the prompt never reappears on this device.
- Add a longer snooze (30d) when dismissed and respect it across reloads and routes.

### 3. Video click crashes app
Investigate the click path from feed/grid → video player. Likely culprit is multiple `<video>` elements mounting at once or `ShortCard`/`ClipsViewer` autoplaying without cleanup. Fix:
- Single active-video ref with stop-before-play (pause + `src=''` + `load()` on previous) when a new clip becomes active.
- Wrap the viewer mount in an error boundary that falls back to a black screen + retry instead of crashing the app.
- Ensure `ClipsGrid` modal unmounts cleanly on close (already stops body scroll — also stop any inline previews).
- Add console logging around the mount/play path so the next attempt surfaces the real error if it isn't the autoplay collision.

### 4. White "play button" flash on posts
Anywhere a video poster is shown (`VideoThumbnail`, `ClipsGrid`, `VideoCard`, `ShortCard`, post detail) the placeholder must be solid black, never the default browser/video-element chrome:
- `VideoThumbnail` already shows a dark gradient on empty/error — switch to plain `bg-black` to match the user's request and remove the gradient.
- All `<video>` elements that render before a poster is ready get `poster=""`, `style={{ backgroundColor: '#000' }}`, and `controls={false}` until ready, so the native white play button never paints.
- `VideoCard` keeps its hover play button but the underlying frame is black, not muted.

### Technical notes
- Files expected to change: `src/pages/AIChat.tsx`, `src/components/ai/AIChatAssistant.tsx`, `src/hooks/useEnablePushPrompt.ts`, `src/hooks/usePushNotifications.ts`, `src/components/posts/ShortCard.tsx`, `src/components/posts/MobileShortCard.tsx`, `src/components/posts/ClipsGrid.tsx`, `src/pages/ClipsViewer.tsx`, `src/components/ui/VideoThumbnail.tsx`, `src/components/explore/VideoCard.tsx`.
- No DB or schema changes.
- No new dependencies.

### Validation
- Open `/ai-chat` next to a DM and confirm header, bubble, and composer match pixel-for-pixel aside from AI extras.
- With notifications already enabled (OneSignal opted-in), reload and confirm the "Turn on notifications" sheet never appears.
- Tap a video from feed, profile, and explore — no crash, plays inline, black background before first frame.
- Open `/post/:id` for a video post — no white frame with play button at any point.
