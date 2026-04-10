

## Fix Chat Media + VibeMap Directions

### Problems Found

**1. VYBE Snap media "not found"**: Snaps upload to the private `chat-media` bucket, but the stored URL uses the public URL format. The RLS SELECT policy for `chat-media` uses a complex 4-table JOIN that can silently fail, causing signed URL generation to fail permanently (cached as "failed" for 5 minutes).

**2. Regular chat images show "shared image" but no picture**: Same root cause — `ChatMediaBubble` feeds a raw public URL to `<img>` when signing fails, and has **no `onError` handler**, so the browser shows a broken image icon (blue box with `?`).

**3. VibeMap Navigate button**: The code already passes the friend's exact `latitude`/`longitude` to Google Maps. The likely issue is that `window.open(..., '_blank')` doesn't reliably trigger the Google Maps app on mobile. Fix: use `window.location.href` for mobile devices so it properly hands off to the native maps app.

### Changes

**A. Database migration — simplify chat-media SELECT policy**
Replace the fragile 4-table JOIN with a simple "any authenticated user can SELECT from chat-media" policy. This is safe because the bucket is private (requires signed URLs which require auth), and message-level access is already controlled by conversation membership RLS on `messages`.

**B. `src/components/chat/ChatMediaBubble.tsx`**
- Add `onError` handler with retry logic and a fallback "tap to retry" UI instead of broken image
- Add `onLoad` success state to hide loading skeleton

**C. `src/lib/signedUrlCache.ts`**
- Reduce `FAILED_CACHE_DURATION` from 5 minutes to 30 seconds so transient signing failures recover quickly

**D. `src/hooks/useFastSignedUrl.ts`**
- When signing fails and the hook falls back to the raw public URL, return `null` instead so consumers show a retry state rather than feeding a 403 URL to `<img>`

**E. `src/pages/FriendMap.tsx`**
- Change the Navigate button to use `window.location.href` on mobile (detected via user agent or touch capability) so it properly opens in the Google Maps app instead of a new browser tab that may not hand off correctly
- Keep `window.open` for desktop

### Files touched

| File | Change |
|------|--------|
| New migration | Simplify `chat-media` SELECT policy to `authenticated` only |
| `src/components/chat/ChatMediaBubble.tsx` | Add error/retry states |
| `src/lib/signedUrlCache.ts` | Reduce failed cache TTL |
| `src/hooks/useFastSignedUrl.ts` | Don't pass through failed raw URLs |
| `src/pages/FriendMap.tsx` | Mobile-friendly Google Maps handoff |

