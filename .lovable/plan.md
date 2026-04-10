

## Fix: "Media Not Found" — Root Cause and Permanent Solution

### Root Cause

The database contains media URLs pointing to **two different backend projects**:
- **Old project** (`eabvbtkxdbttjpdpbmuw`): Most existing vybe/chat media from before the migration
- **Current project** (`agtcyxjxgkdyoxwxkjth`): New uploads only

The `needsSigning()` function only recognizes URLs from the current project. Old-project URLs pass through raw and 403 because that bucket is private. The code treats them as "not needing signing" and feeds the raw URL directly to `<img>`, which fails silently or shows "media not found."

Additionally, when signing fails for current-project URLs, the hook returns `null` permanently (after the 30s failed cache), and VybeViewer gets stuck showing "Loading..." forever instead of transitioning to the error/retry state.

### Changes

**1. `src/lib/signedUrlCache.ts` — Handle old project URLs**
- Add the old project ID (`eabvbtkxdbttjpdpbmuw`) to `isCurrentProjectUrl()` so those URLs are also recognized as needing signing
- In `parseStorageUrl`, handle both project domains
- When signing an old-project URL, the `createSignedUrl` call will fail (files don't exist on the current project). This is expected — it will cache as failed and consumers will show the error state

**2. `src/hooks/useFastSignedUrl.ts` — Fix infinite loading on failed URLs**
- After `getSignedUrl` completes but returns the raw URL (meaning failure), still call `notifySubscribers()` so `useSyncExternalStore` re-reads the cache
- The cache now returns `null` for failed entries, which correctly triggers error states in consumers
- Reset `fetchedRef` when a URL's failure cache expires so it can retry

**3. `src/components/chat/VybeViewer.tsx` — Fix stuck "Loading..." state**
- Add a timeout (8 seconds) on the signing-pending state: if `signedUrl` hasn't resolved by then, treat it as an error and show the "Media no longer available" UI with a retry button
- When `isFailedUrl(mediaUrl)` returns true, skip the loading spinner and go straight to the error state
- Add a manual retry button that clears the failed cache entry and re-triggers signing

**4. `src/components/chat/ChatMediaBubble.tsx` — Same timeout protection**
- Add a timeout on the skeleton/loading state so it doesn't show indefinitely if signing never resolves

### Files Touched

| File | Change |
|------|--------|
| `src/lib/signedUrlCache.ts` | Recognize old project URLs, handle cross-project gracefully |
| `src/hooks/useFastSignedUrl.ts` | Notify subscribers on failure, enable retry after cache expiry |
| `src/components/chat/VybeViewer.tsx` | Add signing timeout, show retry on failure instead of infinite loading |
| `src/components/chat/ChatMediaBubble.tsx` | Add loading timeout protection |

