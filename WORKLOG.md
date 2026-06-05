# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`

## Current Focus
- App Store resubmit: ATT blank-screen fix (`934af286` + ATT patch)
- NFC demo video for App Review (see rejection notes)
- Optional: `VITE_SNAP_CAMERA_KIT_TOKEN` for Snap-native lenses

## What Changed (smoothness + bug pass — latest, local)
- ATT resume only after real backgrounding (no cold-load splash skip)
- IndexedDB restore 600ms cap so cold start never hangs
- PublicOnlyRoute loader instead of blank null during auth
- Friend Link: lighter QR scan (every 2nd frame), native NFC stop on close, duplicate-add guard

## What Changed (App Store ATT fix — prior)
- No duplicate tracking dialog on Despia native — uses `despia.trackingDisabled` only
- `attResumeRecovery.ts` clears stuck splash/body lock after system permission sheets
- Landing/RootGate never render blank during auth redirect (iPad review device)

## What Changed (Friend Link + Create camera — prior)
- **Friend Link:** single shake listener; iOS motion on pill tap + coach “Got it”; instant X close; activation hints (pill coach, sheet tips, feed spotlight); `AutoFriendDrop` mounted app-wide (pill only on `/home`); NFC/tap auto-add now calls `runAutoFriendAdd`
- **Create camera:** Snapchat-style bottom stack (lenses → shutter → modes), glass top controls, viewfinder grid, one-time `CreateCameraCoach`

## What Changed (AR — prior)
- Mobile AR enabled: `arEngine.ts` lite profile (CPU, 320px, smoothed landmarks)
- AR composited into photos (`arCapture.ts`); scan reticle while finding face
- Friend Link QR scanner: orbital sweep + target pulse animation
- `SnapARProvider` mounted in App (needs Snap token for full lens library)

## What Changed (platform polish)
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
- Done: `npm run build` + smoke tests (iPhone/iPad local)
- **Your turn:** Lovable Publish + Despia rebuild for App Store resubmit

## Publish log
- **2026-06-05** — smoothness/ATT resume + Friend Link perf — **Publish in Lovable + Despia now**
- **2026-06-02** — commit `ee375394` — ATT blank-screen fix
- **2026-06-02** — commit `934af286` — Friend Link polish + Create camera revamp
- **2026-06-02** — commit `686f01c0` — mobile AR + Friend Link QR scanner
- **2026-06-01** — commit `601ebb39` — perf, offline UX, lazy i18n, Friend Link spotlight
- **2026-06-01** — commit `821c373d` — liquid FAB + auth liquid UI
- **2026-06-01** — commit `6f265956` — auth liquid UI, Welcome heading

## Next 3 Tasks
1. Commit + push + Lovable Publish
2. Phone smoke: Friend Link tap/shake/X, QR scan, NFC tap (Despia)
3. Create tab: lenses, AR FX, coach dismiss, photo + hold video

## Verification Checklist
- [x] `npm run build` passes
- [ ] Friend Link pill + shake on Home; X closes instantly
- [ ] Friend Link spotlight → opens tap sheet
- [ ] Offline: no cache → helpful empty state; with cache → banner + posts
- [ ] Lovable Publish completed
- [ ] `vybehub.app` Home aurora + tap verified
- [ ] `vybehub.app` Login tap + Log In button verified
- [ ] Custom wallpaper hides aurora (Settings → Background)
