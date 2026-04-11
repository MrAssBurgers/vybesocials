
Scope lock: I will stop touching SwipeToReply except where needed to prevent it from stealing hold/tap events. The focus is notification hold behavior, DM media tap behavior, story camera back navigation, and the broken custom background.

1. Make notification hold use the exact same DM menu
- Extract the current DM long-press card out of `src/components/chat/ChatView.tsx` into one shared component (same emoji row, same dark card, same clean action list).
- Reuse that shared menu in `src/components/notifications/MessageNotificationToast.tsx` so holding a live DM notification opens the same menu style as holding a DM bubble.
- Upgrade `src/hooks/useMessageNotifications.ts` + `showMessageNotification(...)` so the toast receives the real message payload (`messageId`, `conversationId`, text/media type/media URL), not just a preview string.
- Action rules will match DM behavior:
  - React row always
  - Reply always
  - Copy for text
  - Save / Save Sticker for image media
  - Delete for me / report-style actions only when valid
  - No fake actions when the message type does not support them

2. Perfect tap vs hold on DM media
- Keep long-press opening the menu, but make a normal tap on the image/video open the centered fullscreen viewer every time.
- Harden `src/components/chat/ImageViewer.tsx` to behave like Google Messages:
  - centered fullscreen media
  - pinch/double-tap zoom
  - drag only when zoomed
  - reply + save actions
  - clean close behavior on backdrop/back
- Fix the current bug in `ChatView.tsx` where the “Save” menu row opens the viewer instead of actually downloading the file.
- Keep `src/components/chat/ChatMediaBubble.tsx` responsible only for rendering; move tap/hold ownership to the parent so gestures stay reliable.

3. Add the story camera back button the right way
- `src/components/stories/StoryCreator.tsx` already shows a back arrow before entering camera mode, but once it opens `src/components/camera/Camera.tsx` the top-left button is still an X.
- Add a camera header mode/prop so Story mode shows an `ArrowLeft` and returns to the story flow instead of closing the whole experience.
- Keep the X button for normal camera entry points outside Story creation.

4. Rebuild the custom background flow so it actually persists and shows
I found two competing background systems:
- `AppBackgroundProvider` applies the real visible background on `document.body`
- `useCustomTheme.ts` still contains older root-level background logic that does not match the live body-based system

Fix plan:
- Make `src/components/layout/AppBackground.tsx` the single source of truth for visible backgrounds.
- Remove/stop the legacy root-only background application path in `src/hooks/useCustomTheme.ts` from trying to manage the same background.
- Make `refreshBackground()` resilient:
  - if there is no active background, fall back to the newest saved one
  - if the DB is in a broken state, best-effort repair the active flag
  - handle query errors / multiple-active edge cases safely
- Use mobile-safe attachment behavior instead of always forcing `background-attachment: fixed`, which is a common reason body backgrounds fail on phones.
- Verify immediate apply from `src/components/settings/BackgroundCustomizer.tsx` and persistence after refresh / relog / theme changes.

5. QA pass before I stop
I will verify all of this together, not piecemeal:
- hold a live DM notification -> shared DM menu appears cleanly
- hold a DM image -> same menu appears
- tap a DM image -> fullscreen viewer opens in the middle and works like Google Messages
- save actually downloads
- save sticker only appears for images
- story camera top-left control goes back, not close
- custom background shows on Home, survives refresh, and is not wiped by theme changes
- DM screens can still intentionally stay opaque while the rest of the app shows the custom background

Technical notes
- Best implementation path is a shared component such as `src/components/chat/DMHoldMenu.tsx` (new) used by both `ChatView.tsx` and `MessageNotificationToast.tsx`.
- Main files likely touched:
  - `src/components/chat/ChatView.tsx`
  - `src/components/chat/ChatMediaBubble.tsx`
  - `src/components/chat/ImageViewer.tsx`
  - `src/components/chat/DMHoldMenu.tsx` (new)
  - `src/components/notifications/MessageNotificationToast.tsx`
  - `src/hooks/useMessageNotifications.ts`
  - `src/components/stories/StoryCreator.tsx`
  - `src/components/camera/Camera.tsx`
  - `src/components/layout/AppBackground.tsx`
  - `src/hooks/useCustomTheme.ts`
  - `src/components/settings/BackgroundCustomizer.tsx`

One important implementation note:
- If you also mean the full Notifications page history rows (not just the live DM popup toast), exact DM-style actions there will need message/conversation metadata added to stored notifications. I can include that too if needed, but the live popup notification can be fixed immediately with the data already available from the real-time message event.
