# Live Screenshot Capture, Polish, Storage & Site Placement

## Goal
Log into the published app at vybehub.app as `vybesocial.info@gmail.com`, capture every major screen at 390×844 (iPhone), polish each into two formats (bare device-frame for app stores, composed marketing version for the website), upload both to a public Supabase bucket, register them in a new `app_screenshots` table, and wire the marketing versions into VybeHome + Features.

## 1. Database (one migration)

New public bucket `marketing-screenshots` (public SELECT, owner-only write via service role from this run).

New table `public.app_screenshots`:
- `screen_key` (text, unique) — e.g. `home`, `clips`, `dna`, `messages`, `map`, `profile`, `add-friend`, `communities`, `spaces`, `stories`, `camera`, `notifications`, `settings`
- `title`, `subtitle`, `feature_tag` (text)
- `raw_url`, `device_url`, `marketing_url` (text — public storage URLs)
- `width`, `height` (int)
- `display_order` (int) — drives carousel order
- `placement` (text[]) — `['hero','features','store']`
- `created_at`, `updated_at`

RLS: public SELECT (it's marketing data); writes restricted to service role only. No user-facing writes.

## 2. Capture pass (browser tool, against https://vybehub.app)

Sign in once with the Live credentials, then navigate + screenshot each route at 390×844:

| Key | Route | Notes |
|---|---|---|
| home | /home | Default Explore feed |
| clips | /home?tab=clips | Vertical video feed |
| dna | /vybe-dna | Personality engine |
| messages | /messages | Inbox |
| map | /map | Friend Map (geo permission may fall back to skyline state — capture whatever renders) |
| profile | /profile | Own profile / bento |
| add-friend | /add-friend | QR + suggestions |
| communities | /spaces or /communities (whichever exists) | |
| spaces | /vybe-spaces | |
| stories | /home + open first story | |
| camera | /home → camera FAB | Capture camera UI |
| notifications | /notifications | |
| settings | /settings | |

For each: dismiss cookie banner first, wait for content to render, then `browser--screenshot`. Save raw PNGs to `/tmp/shots/<key>-raw.png`.

If a screen is blocked by a tutorial or empty state, capture the best representative state and note it — partial coverage is acceptable, this is a marketing pass not a QA pass.

## 3. Polish (Python script, no external services)

Single script `/tmp/polish.py` using Pillow (already available):

**Device version** (`<key>-device.png`, 1290×2796 — App Store 6.7" spec):
- Black iPhone 15 Pro frame, screenshot fitted to inner viewport with rounded corners
- Transparent background (PNG) so it can be dropped on any store listing background
- Also output a 1242×2688 variant for older 6.5" requirement

**Marketing version** (`<key>-marketing.png`, 1600×1200):
- Same device frame, scaled smaller (~70% height)
- VYBE gradient backdrop (Deep Navy → Vivid Purple → Bright Cyan, matches `--gradient-primary` from `index.css`)
- Headline + subtitle text from the `app_screenshots` row, rendered with the project's heading font, bottom-left aligned
- Soft glow under device

Also keep the raw screenshot as `<key>-raw.png` for reference.

## 4. Upload + register

For each screen, upload the three files to `marketing-screenshots/<key>/` via `supabase--storage_upload`, then `supabase--insert` a row into `app_screenshots` with the public URLs and metadata.

## 5. Marketing site placement

- **`src/pages/VybeHome.tsx`**: Replace existing static feature visuals (`screen-feed.png` etc.) with a `useAppScreenshots()` hook that reads from `app_screenshots`. The hero `PhoneFrame` cycles through the `hero`-tagged shots; each feature section pulls its matching `screen_key`. Falls back to bundled assets if the table is empty.
- **`src/pages/Features.tsx`**: Add a "See it in action" gallery that lists every `app_screenshots` row in `display_order`, using the marketing version, with the feature_tag as a chip.
- New small hook `src/hooks/useAppScreenshots.ts` (cached, public read, no auth required).

## 6. Deliverables for stores

After the run completes, provide:
- A `<lov-artifact>` zip at `/mnt/documents/vybe-store-screenshots.zip` with all device-frame PNGs grouped by 6.7" / 6.5" folders (App Store) and 1080×1920 PNGs (Play Store — generated from the same compositor).
- A short markdown index listing each screen + URL, also in the zip.

## Technical notes

- Capture runs against Live, which logged in successfully in the previous step. Session is reused across navigations.
- `browser--screenshot` returns a `tool-results://` path; copy each into `/tmp/shots/` with `code--copy` before polishing.
- Screenshot capture is best-effort — any screen that won't render in headless will still get its row written with `raw_url=null` and a placeholder marketing card so the site doesn't break.
- No frontend code changes touch business logic; only presentation files.
- Storage bucket is public so the same URLs work in the website, App Store Connect, and Play Console without signed-URL juggling.

## Files

Created: `supabase/migrations/<ts>_app_screenshots.sql`, `src/hooks/useAppScreenshots.ts`.
Edited: `src/pages/VybeHome.tsx`, `src/pages/Features.tsx`.
Generated artifacts: `/mnt/documents/vybe-store-screenshots.zip`.