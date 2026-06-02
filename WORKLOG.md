# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`

## Current Focus
- Platform polish: speed, offline UX, Friend Link as hero wedge
- Publish all pending changes via Lovable

## What Changed (platform polish — latest)
- Lazy i18n: English only in main bundle; 19 locales on demand (`i18nLoadLocale.ts`)
- Offline feed: empty-state when no cache; “saved feed” banner when offline with cache
- Friend Link spotlight on Home + `openFriendLink()` → AutoFriendDrop sheet
- Mobile intro: Friend Link slide (`VYBE_INTRO_VERSION` 3)

## What Changed (perf + offline)
- Preloader waits for IndexedDB persist restore; skips heavy work when warm cache exists
- Home: tab-gated feeds; Global/Local only after first visit
- No full cache wipe on sign-in; deferred realtime/presence + animation warmup
- `offlineCacheProbe.ts`, `persistRestoreGate.ts`

## What Changed (aurora/touch — prior)
- `#vybe-aurora-mount` behind `#root`; portaled aurora + transparent app shells
- `VybeLiquidTouchOverlay` / `VybeLiquidTouchShell` — global tap ripples (Landing z-25, app z-5010)
- `vybeLiquid` buttons trigger same touch animation; blob pull via bridge
- Custom wallpaper gate: `hasUserWallpaper` + `isBackgroundResolved` hide aurora/touch; `stripLiquidShellDocumentState()` on upload

## Current Status
- Done: `npm run build` (platform polish + perf)
- Done: pushed to `origin/main` — commit `601ebb39`
- **Your turn:** Lovable → Share → Publish → hard-refresh https://vybehub.app

## Publish log
- **2026-06-01** — commit `601ebb39` — perf, offline UX, lazy i18n, Friend Link spotlight — **Publish in Lovable now**
- **2026-06-01** — commit `821c373d` — liquid FAB + auth liquid UI
- **2026-06-01** — commit `6f265956` — auth liquid UI, Welcome heading

## Next 3 Tasks
1. Push + Lovable Publish → smoke cold start + offline feed
2. Friend Link NFC tap test on two Despia phones
3. Create → Post camera smoke on Play Store build

## Verification Checklist
- [x] `npm run build` passes
- [ ] Friend Link spotlight → opens tap sheet
- [ ] Offline: no cache → helpful empty state; with cache → banner + posts
- [ ] Lovable Publish completed
- [ ] `vybehub.app` Home aurora + tap verified
- [ ] `vybehub.app` Login tap + Log In button verified
- [ ] Custom wallpaper hides aurora (Settings → Background)
