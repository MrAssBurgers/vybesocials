

## Fix AdSense Policy Violations

### The Problem

Google rejected the site for two policy violations:

1. **"Ads on screens without publisher-content"** — The AdSense script loads globally on every screen (camera, loading states, empty feeds, settings, etc.), and ad units render on pages that may have no meaningful content.
2. **"Low value content"** — The ad slot IDs are **placeholders** (`1234567890`, `0987654321`), meaning Google sees ad containers being pushed without valid slot configuration. This makes the site appear low-quality to their crawler.

### The Fix

**Disable AdSense entirely until the site meets Google's content requirements.** The ad infrastructure stays in code but becomes inert. Once Google approves the site, you flip a single flag and add real slot IDs.

### Changes

**1. `index.html`** — Remove the AdSense script loader  
Delete the deferred `pagead2.googlesyndication.com` script block (lines 16-25). No AdSense JS means no policy violations from Google's crawler.

**2. `src/components/ads/AdUnit.tsx`** — Add an early return  
Return `null` immediately. The component becomes a no-op. This prevents any `<ins class="adsbygoogle">` tags from rendering anywhere in the app.

**3. `src/components/ads/FeedAdCard.tsx`** — Update slot IDs to be clearly marked  
Add a `TODO` and keep the placeholder IDs but document they must be replaced with real AdSense slot IDs before re-enabling.

**4. `src/hooks/useShowAds.ts`** — Force `showAds: false`  
Add a kill switch: `const ADS_ENABLED = false;` at the top. All downstream consumers (`Home.tsx`, `StoryViewer.tsx`, `HomeWidgetRenderer.tsx`) automatically stop rendering ads without any changes needed.

### Re-enabling Later

When you're ready to resubmit to AdSense:
1. Get real ad slot IDs from your AdSense dashboard
2. Replace placeholder IDs in `FeedAdCard.tsx`
3. Restore the AdSense script in `index.html`
4. Flip `ADS_ENABLED` to `true` in `useShowAds.ts`
5. Remove the early return in `AdUnit.tsx`
6. Request a new review from Google

### Files Modified (4)
1. `index.html` — Remove AdSense script
2. `src/components/ads/AdUnit.tsx` — Early return null
3. `src/components/ads/FeedAdCard.tsx` — Document placeholder slots
4. `src/hooks/useShowAds.ts` — Kill switch flag

No database changes.

