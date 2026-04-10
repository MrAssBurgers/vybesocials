

## Fix: Custom Background Not Showing (Unsigned URL)

### Root Cause

`AppBackgroundProvider` fetches the `image_url` from the `user_backgrounds` table and applies it directly to `document.body.style.backgroundImage`. However, this URL is a Supabase storage path (e.g. `https://...supabase.co/storage/v1/object/public/...`) that may require signing to be accessible. The provider never signs the URL before applying it, so the browser gets a 403/404 and the background appears black.

Other components (media bubbles, stickers, profile images) all use the `useSignedUrl` hook to resolve storage URLs — the background system was missed.

### Fix in `src/components/layout/AppBackground.tsx`

1. Import the signing utility (`getSignedUrl` and `needsSigning` from `@/lib/signedUrlCache`)
2. After fetching the `image_url` from the database, sign it before storing it in state
3. This ensures the `url(...)` applied to `document.body` is a valid, accessible signed URL
4. Add a periodic re-sign (signed URLs expire) — re-sign when the URL is about to expire or on a 45-minute interval

### Files Touched

| File | Change |
|------|--------|
| `src/components/layout/AppBackground.tsx` | Sign the `image_url` before applying it to `document.body`, add expiry refresh |

