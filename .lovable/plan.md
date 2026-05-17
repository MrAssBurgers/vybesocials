# Fix Daily Brief 404 from malformed deep links

## What's broken

Your current URL is `/brief&topic=Climate` — note the missing `?`. That's not a valid query string, so React Router can't match it to `/brief` and falls through to the NotFound page.

Root cause: the backfill migration I ran earlier used regex `^/\?openBrief=true` → `/brief`, which turned old links like `/?openBrief=true&topic=X` into `/brief&topic=X` instead of `/brief?topic=X`. New notifications generated after the edge function deploy are fine; only the backfilled rows are broken — and those are exactly the ones you're tapping.

## Fix (one page, no new routes)

1. **Data migration** to repair existing notification rows:
   - `UPDATE public.notifications SET deep_link = replace(deep_link, '/brief&', '/brief?') WHERE deep_link LIKE '/brief&%'`

2. **Client-side guard** in `src/pages/BriefPage.tsx` so any malformed `/brief&...` URL the service worker / OS notification cache already opened still works:
   - On mount, if `window.location.search` is empty AND `window.location.pathname` contains a `&`, rewrite the URL to `/brief?<rest>` via `navigate(..., { replace: true })` before reading params.

3. **Also add a NotFound fallback** for `/brief*` paths (e.g. `/brief&topic=Climate`) → redirect to `/brief` so stale OS-cached notifications never 404 again. Done with a single `<Route path="/brief*" element={<Navigate to="/brief" replace />} />` line in `AnimatedRoutes.tsx` (placed after the exact `/brief` route).

No new pages, no UI changes — the existing `/brief` page stays as the one place the brief renders.

## Files

- Migration: backfill repair (one `UPDATE`)
- `src/pages/BriefPage.tsx` — URL repair on mount
- `src/components/layout/AnimatedRoutes.tsx` — wildcard `/brief*` redirect
