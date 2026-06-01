# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`

## Current Focus
- Feature: Mobile post camera instant crash (Play Store / WebView)
- Goal: Stable camera open on Create → Post (`/upload` → `MobileCreateStudio`)
- Scope: getUserMedia safety, no AR on mobile, video-only until record gesture

## What I Changed In Lovable
- Branch: (local)
- Files touched: `MobileCreateStudio.tsx`, `postCameraStream.ts`, `cameraSafeMode.ts`, `Camera.tsx`, `useFaceTracking.ts`, `despiaBridge.ts`
- Migrations/SQL touched: none
- Edge functions touched: none

## Current Status
- Done:
- In progress:
- Blocked on:

## Errors / Repro
- Repro steps:
- Expected:
- Actual:
- Logs/screenshots:

## Next 3 Tasks
1.
2.
3.

## Notes For Cursor Agent
- Constraints:
- Do not change:
- Preferred approach:

## Verification Checklist
- [x] `npm run build` passes
- [ ] Create → Post → camera opens on Play Store app (no instant crash)
- [ ] Tap photo / hold for video works
- [ ] no new console/runtime errors
