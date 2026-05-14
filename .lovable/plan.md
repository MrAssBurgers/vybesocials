## Plan — Go deeper on tester-feedback fixes

The first pass landed the 5 baseline items (walkthrough, Rate VYBE, Feedback page, ASO copy, screenshot plan). This pass hardens each so testers actually feel the difference.

### 1. Walkthrough — make it actually re-playable + smarter
- Add a "Replay walkthrough" entry in `HelpSection.tsx` that clears `vybe_intro_seen` and routes to `/intro` (or mounts `MobileIntro` as an overlay).
- Add a 7th slide: "Earn & level up" (XP, streaks, daily login) — testers said features feel hidden.
- After the last slide, instead of dumping straight to `/auth` for already-signed-in replay users, return to where they came from.
- Persist a `vybe_intro_version` so future updates can re-trigger the intro for existing users when slides change.

### 2. Rate VYBE — surface the milestone prompt (currently dormant)
- Wire `shouldShowRatePrompt()` into a real UI: small bottom-sheet `RatePromptSheet.tsx` that triggers after a positive milestone (e.g. 3rd session AND ≥1 post/like sent), with "Rate on Play Store / Not now / Don't ask again".
- Mount once in `App.tsx` behind auth, debounced so it never fires inside chat/calls/camera.
- Track "happy path" trigger via existing session counter; fall back to `usePWAInstallPrompt`-style session count if none.

### 3. Feedback hub — make submitting feel rewarding
- In `Feedback.tsx`: after submit, show a clear success state ("Got it — the team reads every report") with a small XP/badge nudge if available.
- Add screenshot attachment (uses existing storage upload helper) so bug reports include visual context — testers complained reports were too vague to act on.
- Add device/build metadata auto-attached (UA, app version, route) to `useFeedback` payload — invisible to user, huge help for triage.
- Surface the Feedback shortcut in two more high-discovery spots: profile menu + Settings root (not just Help subsection).

### 4. ASO copy — tighten for Play Store character limits
- Verify short description ≤80 chars (current draft is borderline) and rewrite as: `Stories, clips, chat, calls & communities — make your VYBE.`
- Trim full description to <4000 chars and front-load the first 250 chars (what shows before "Read more").
- Add localized title/short-desc stubs for ES, PT, ID, FR in `PLAY_STORE_GUIDE.md`.

### 5. Screenshot plan — make it executable, not just descriptive
- Add a `scripts/capture-store-screenshots.md` runbook: exact routes to visit, viewport (1080×1920), and overlay PSD/Figma spec.
- Mark which 3 screenshots are the "above-the-fold" trio (Home, Clips, Chat) since those drive install rate.

### 6. Quietly fix the runtime error
- Resolve the "Importing a module script failed" runtime error reported on `/` (likely a stale chunk after the camera refactor). Bust the SW cache version in `src/lib/serviceWorker.ts` if needed.

### Files touched (frontend + docs only)
- `src/pages/MobileIntro.tsx`, `src/components/settings/HelpSection.tsx`
- `src/components/feedback/RatePromptSheet.tsx` (new), `src/App.tsx`
- `src/pages/Feedback.tsx`, `src/hooks/useFeedback.ts`
- `PLAY_STORE_GUIDE.md`, `scripts/capture-store-screenshots.md` (new)
- `src/lib/serviceWorker.ts` (cache bump only, if needed)

No DB migrations. No backend changes.