## 1. Stop the offline/online toast spam on app rejoin

**File:** `src/components/error/GlobalErrorHandler.tsx`

When the Despia/Android WebView resumes, it fires `online`/`offline` events repeatedly, producing 100+ toasts.

Replace the simple `online`/`offline` listeners with a guarded version that:

- Tracks `lastState` and only emits when state actually changes.
- Debounces events for 1.5s (ignore flapping during reconnect).
- Suppresses all network toasts for 4s after `visibilitychange → visible` (handles "rejoining the app" bursts).
- Throttles to one toast per 8s.
- Uses sonner's `id: 'net-status'` so any new toast replaces the old one (no stacking).
- Drops the emoji from the title for a cleaner look.

## 2. Native haptics inside the Despia shell

**File:** `src/lib/haptics.ts`

`navigator.vibrate` is gated/disabled inside Despia's WebView, so taps feel dead. Add a Despia detection branch that also tries the native shell:

- Detect `navigator.userAgent.toLowerCase().includes('despia')` once.
- For each haptic call, additionally invoke `window.location.href = 'haptic://impact?style=light|medium|heavy'` style scheme (Despia exposes `haptic://` taps; fall back gracefully if not handled).
- Keep `navigator.vibrate` as the secondary path so PWA + browser still works.
- Continue to respect the `vybe-haptics-enabled` localStorage flag.

Implementation sketch:
```ts
const isDespia = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('despia');
function nativeHaptic(style: HapticStyle) {
  if (!isDespia) return false;
  try {
    // Despia haptic scheme (no-op if unsupported)
    const map = { light: 'light', medium: 'medium', heavy: 'heavy', success: 'success', warning: 'warning', error: 'error' };
    (window as any).location.href = `haptic://impact?style=${map[style]}`;
    return true;
  } catch { return false; }
}
```
Call it in `triggerHaptic` before/alongside `navigator.vibrate`.

## 3. Calling UI cleanup (screenshot shows duplicated overlay)

**File:** `src/components/call/GlobalCallOverlay.tsx`

The screenshot shows two overlapping cards: the floating "Xxsucks2BUxX · Ringing" pill at the top **and** the centered "Connecting to the other side…" card with avatar + progress bar layered on top of the main centered avatar (line 1213) and the header pill (line 1244). The result is three avatars stacked.

Fix:

- **Remove the standalone "Stage-aware Connecting overlay"** at lines 1303–1323 entirely. The header pill (line 1244) and the centered avatar/name block (lines 1213–1237) already convey "Ringing/Connecting" — the third overlay is redundant and is what's rendering as a floating glass card with its own avatar and progress bar.
- Instead, surface `stageLabel` inline under the centered name when `!isConnected`:
  - Replace the existing `isConnecting` / `isRingingOut` paragraphs (lines 1225–1230) with a single block that shows `stageLabel` plus a slim 1px progress bar (`stageProgress`) sitting under the avatar.
- Keep the header pill and main avatar as-is. Now there's exactly one centered status card.
- Verify `pointer-events-none` on the main backdrop so the "End" button stays tappable.

## 4. Better video/clip thumbnail in chat

**File:** `src/components/chat/VideoBubble.tsx`

The Android WebView shows a white box with a play button because:
- The `<video poster>` doesn't paint until metadata loads.
- The first-frame canvas extraction fails with CORS on signed Supabase URLs (`v.crossOrigin = 'anonymous'` rejects when the URL doesn't return matching CORS headers, which our signed URLs sometimes don't).

Fixes:

- Try canvas extraction **without** `crossOrigin` first; if the canvas read throws (`SecurityError`), fall back to a generated gradient placeholder instead of a blank white frame.
- Add a permanent dark gradient background to the bubble (`bg-gradient-to-br from-zinc-800 to-zinc-900`) so even when no poster is available, the bubble looks like a Clips tile, not a white card.
- Show a small `Film` icon + caption preview behind the play button in the no-poster state so it reads as "video" rather than "broken image".
- For new clips, ensure we persist `thumbnail_url` on `message_media` when the clip is sent (existing path) — leave the upload code unchanged, this is just confirming.

## 5. Add Despia offline local push helper

**New file:** `src/lib/despiaPush.ts`

Wraps `sendlocalpushmsg://` for self-set reminders (timer-style notifications that fire even when the app is closed):

```ts
const isDespia = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('despia');

export function scheduleOfflinePush(opts: {
  delaySeconds: number;
  title: string;
  body: string;
  url?: string; // deep link
}) {
  if (!isDespia) return false;
  const t = encodeURIComponent(opts.title);
  const b = encodeURIComponent(opts.body);
  const u = encodeURIComponent(opts.url || window.location.origin);
  try {
    (window as any).location.href = `sendlocalpushmsg://push.send?s=${opts.delaySeconds}=msg!${b}&!#${t}&!#${u}`;
    return true;
  } catch { return false; }
}
```

Use cases (wired up later as needed): unread DM reminders after N minutes, scheduled message confirmations, story expiry warnings. This commit just lands the helper so feature code can call it.

## Files touched

- `src/components/error/GlobalErrorHandler.tsx` — debounced/visibility-aware net toasts
- `src/lib/haptics.ts` — Despia native haptic scheme
- `src/components/call/GlobalCallOverlay.tsx` — remove duplicate connecting overlay, inline stage label under name
- `src/components/chat/VideoBubble.tsx` — robust thumbnail + dark gradient fallback
- `src/lib/despiaPush.ts` — new offline push helper

No DB / RLS / edge function changes. No Despia rebuild required for any of these (Despia ships `haptic://` and `sendlocalpushmsg://` schemes by default).
