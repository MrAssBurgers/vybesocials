# Bug Fixes + UX Overhaul — From Your Notes

Decoded what you wrote in the photo and grouped it into 7 work items. Here's how I'll handle each.

---

## 1. Stories — pinch‑to‑zoom while recording
**Issue:** Stories camera doesn't let you zoom while holding record.
**Fix:** `StoryCreator.tsx` is currently using a basic capture path. Wire in the existing `CameraZoom.tsx` pinch handler (already used by `VybeSnapCamera`) so two‑finger pinch on the story preview adjusts `videoTrack.applyConstraints({ advanced: [{ zoom }] })` continuously while recording — matches Snapchat/IG behavior.

## 2. Stories — finalized video preview
**Issue:** After recording a story video, you don't see the finalized clip before posting.
**Fix:** Insert a preview step in `StoryCreator.tsx` (mirrors `VybeSnapEditor` flow): on `mediaRecorder.onstop`, build a `Blob` URL → render a fullscreen `<video controls autoplay loop>` with Send/Retake/Save Draft. Nothing gets uploaded until user confirms.

## 3. Overlays/text not persisting on post
**Issue:** Adding text/stickers to a post — they don't actually post with the media.
**Fix:** In `CameraEditor.tsx` + `MobilePostComposer.tsx`, the upload pipeline currently sends the original media, ignoring the overlay layer. Switch to a `flattenMediaWithOverlays()` step:
- Photos: composite onto an offscreen `<canvas>` → `toBlob('image/webp', 0.92)`
- Videos: render overlays onto a `MediaStream` via `canvas.captureStream()` + `MediaRecorder` (or burn a CSS overlay via existing `useVideoProcessor` ffmpeg path on supported devices).

## 4. VYBESnap caption — Snapchat‑style slim text
**Issue:** Text on snaps is way too big / bulky. Should stay slim, and as you type more it grows the dark backdrop downward (essay mode), but the text size itself stays constant.
**Fix:** In `VybeSnapEditor.tsx` text overlay:
- Drop font from current size → `text-[15px] leading-[1.25] font-medium tracking-tight` (Snap parity)
- Container: `bg-black/55` strip, full width, `py-1.5 px-3`, auto‑grows in **height only** as lines wrap. No font scaling on overflow.
- Keep draggable position, keep color picker.

## 5. VYBE Map — point in the direction phone is facing
**Issue:** Map should rotate to phone heading like Google Maps' compass mode.
**Fix:** In `FriendMap.tsx`:
- Add `DeviceOrientationEvent` listener (with iOS `requestPermission()` gate)
- Apply `map.setBearing(heading)` (or CSS `transform: rotate(-heading)` on the map container if not Mapbox‑backed)
- Add a compass FAB to toggle "heading‑up" vs "north‑up", default **on** if permission granted.

## 6. Friend Link — redesign (clean, NFC renamed "Phone Tap")
**Issue:** Current `AddFriend.tsx` UI is bulky.
**Fix:** Rebuild as a single compact card:
- Top: large user QR (rounded, glassy, neon edge glow)
- Tab bar (segmented, pill style): **Phone Tap** | **QR Code** | **Username**
- Detect NFC via `'NDEFReader' in window` or `useNFC` capability flag → if available, **auto‑select Phone Tap tab** on mount and show a subtle "Tap phones to connect" pulse animation
- Rename every "NFC" string → "Phone Tap" in `NFCFriendShare.tsx`, `NFCSwapAnimation.tsx`, `NFCInviteShare.tsx` (keep internal hook names)
- Reduce overall card height ~30%, swap heavy borders for hairlines + aurora.

## 7. AI Enhance — make it actually work + global Drafts
**Issue A — AI Enhance is weak.**
**Fix:** `AIPhotoEnhancer.tsx` currently sends a vague prompt to Gemini Flash. Replace with `google/gemini-3.1-flash-image-preview` (image edit model) using a strong directive:
> "Enhance this photo: increase sharpness, reduce noise, improve dynamic range, boost color vibrance subtly, fix white balance, brighten shadows, recover highlights. Preserve all subjects, identity, composition, and aspect ratio. Photo‑realistic only."
Show before/after slider so the difference is visible. Add intensity slider (Subtle / Standard / Max).

**Issue B — Drafts system (global).**
**Fix:** New table + UX:
- DB: `post_drafts (id, user_id, kind, media_url[], overlays jsonb, caption, created_at, updated_at)` with RLS owner‑only
- Auto‑save trigger: any time the composer (`CameraEditor`, `MobilePostComposer`, `StoryCreator`, `VybeSnapEditor`) unmounts with unsent content → upsert draft
- Re‑entry: when user opens the composer/post screen, show a small chip at top: **"Draft · [thumb] Tap to resume"** → restores media + overlays + caption to exact state.

---

## Technical Notes
- Reuse `CameraZoom.tsx`, `useVideoProcessor`, `useNFC`, `aiSafetyClient`, and the Lovable AI Gateway (`google/gemini-3.1-flash-image-preview`) — no new external services.
- Drafts stored in Supabase Storage bucket `drafts/` (auto‑purge after 14 days via cron).
- All motion uses existing `T.enter` / `MOTION_CONFIG` tokens for consistency.

---

## Files Touched
**Edit:** `StoryCreator.tsx`, `CameraEditor.tsx`, `MobilePostComposer.tsx`, `VybeSnapEditor.tsx`, `FriendMap.tsx`, `AddFriend.tsx`, `NFCFriendShare.tsx`, `NFCSwapAnimation.tsx`, `NFCInviteShare.tsx`, `AIPhotoEnhancer.tsx`
**New:** `src/components/composer/DraftChip.tsx`, `src/hooks/useDrafts.ts`, `src/lib/flattenMedia.ts`, migration for `post_drafts` table + storage bucket.

Approve and I'll execute all 7 in order (Stories → Snap text → Map → Friend Link → AI Enhance → Overlay flatten → Drafts).
