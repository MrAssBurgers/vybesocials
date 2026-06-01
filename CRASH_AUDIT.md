# Crash risk audit (VYBE web + Despia shell)

Last updated: 2026-06-01. Use with `WORKLOG.md` when hardening releases.

## High risk (fixed or mitigated in this pass)

| Area | Risk | Mitigation |
|------|------|------------|
| Post/create camera | Overlapping `getUserMedia`, audio on mount, 1080p, MediaPipe AR on mobile WebView | `cameraSafeMode`, `postCameraStream`, `CameraMountBoundary` |
| Friend Link QR camera | Same WebView camera pitfalls in `AutoFriendDrop` / `FriendDrop` | `acquirePostCameraStream` + `stopStream` when safe mode |
| NFC friend drop | iOS Despia blocked; Android one-shot scan only | `friendLinkNfc.ts` continuous session, `despiaNFCv2` + legacy bridges, iOS `despiaReadNFC` |
| Unhandled media errors | React tree crash on camera deny | Boundaries + suppressed errors + `setCameraBlocked` UI |

## Medium risk (monitor / next)

| Area | Risk | Notes |
|------|------|-------|
| Framer Motion overlays | Heavy GPU on low-end devices during NFC swap | `NFCSwapAnimation` is full-screen; test on Play Store mid-range |
| jsQR scan loop | Main-thread jank if camera resolution high | Friend Link uses 640×480 or safe 720p stream |
| `friend_drops` realtime | Duplicate events / race if both tap NFC twice | `exchangeLockRef` guards in Friend Link UI |
| Global `globalStream` in `useCameraPreload` | Stale stream shared across routes | Prefer route-local streams where possible |
| MediaPipe / AR filters | OOM on older phones | Gated by `isCameraSafeMode()` |
| Despia NFC | Read/write in same gesture breaks native parse | Friend Link uses **read-only** loop; write only in `NFCWriteSheet` |

## Low risk

| Area | Risk |
|------|------|
| OneSignal / preview domain | Already filtered in `main.tsx` |
| Service worker on preview hosts | Disabled via `isPreviewServiceWorkerDisabled` |
| Gradient button animation | Cosmetic seam only |

## Despia NFC checklist (store builds)

1. Despia Editor: **NFC addon ON**
2. Apple App ID: **NFC Tag Reading** capability
3. Rebuild native binary after enabling NFC
4. Edge secrets: `RESEND_API_KEY` for branded reset email (unrelated to NFC)

## Manual test matrix

- [ ] Create → Post camera (Android WebView + iOS WebView)
- [ ] Friend Link → Phone Tap → two Despia phones back-to-back → swap animation → both friended
- [ ] Friend Link → QR scan
- [ ] Forgot password (edge function + fallback)
- [ ] Upload photo/video (timeout toast, no infinite spinner)
