

## VYBE Upload & Call UI — Complete Revamp

### Part 1: Upload Experience Redesign

**Current Problems:**
1. Camera screen bottom is cluttered — mode selector, filter toggle, filter carousel, capture button, gallery, music, hint text all stacked vertically
2. Post composer is a plain form — media preview, caption, tags all feel like filling out a document, not creating art
3. No swipe-up gesture to access gallery — users must tap a tiny thumbnail
4. No post-capture preview animation — photo just appears in composer, no satisfying "snap" moment
5. Upload progress is a thin bar — no celebration, no dopamine
6. Desktop studio has no drag-and-drop delight — plain dotted box

**Redesign:**

**A. Camera Overhaul — "Swipe to Create"**
- Replace the stacked bottom controls with a **single swipe-up drawer** for gallery access (like Instagram's recent photos grid)
- Move mode selector (Photo/Video/Multi/Text/Story) to a **horizontal pill strip at the very top** of the bottom area, above the capture button
- Collapse filter/AR toggle into the filter carousel itself — first item is "Normal", swipe right shows filters, swipe left shows AR
- Add a **shutter animation**: white flash + scale-down bounce on the viewfinder when photo is taken
- After capture, show a **3D flip transition** from camera to the preview (card flip effect)

**B. Post Composer — "Create Card" Design**
- Wrap the entire compose screen in a **card metaphor** — the post preview looks like the actual post card (rounded corners, shadow, the way it'll appear in the feed)
- Caption input becomes a **floating translucent bar over the media** (like Stories caption), not a separate section below
- Tags become **colorful chips that animate in** with stagger, with a "shake to suggest" feature using device motion
- Add a **publish animation**: the card shrinks, flips, and "flies away" toward the top-right like it's being sent into the feed

**C. Upload Progress — "Rocket Launch"**
- Replace the thin progress bar with a **full-screen celebration overlay**: gradient background, animated progress ring in the center, percentage counter
- On completion: confetti burst + checkmark + "Your VYBE is live!" with a "View Post" button

**Files modified:**
- `src/components/create/MobileCreateStudio.tsx` — Bottom controls restructure, shutter animation, gallery drawer
- `src/components/create/MobilePostComposer.tsx` — Card metaphor, floating caption, publish animation
- `src/components/create/DesktopCreateStudio.tsx` — Enhanced drag-drop with preview delight
- New: `src/components/create/GalleryDrawer.tsx` — Swipe-up recent photos grid
- New: `src/components/create/PublishCelebration.tsx` — Full-screen upload celebration

---

### Part 2: Calling UI Redesign

**Current Problems:**
1. Footer control bar is a horizontal strip of same-sized buttons — no visual hierarchy between "Mute" and "End Call"
2. Audio call screen is just a big avatar with pulse rings — feels empty, no activity visualization
3. Incoming call dialog has no slide-to-answer gesture — just two buttons
4. Local video preview (PiP) is a fixed rectangle — can't be dragged to different corners
5. No call effects/reactions — can't send emoji reactions during a call (like FaceTime)
6. Header and footer auto-hide but there's no elegant way to bring them back on mobile

**Redesign:**

**A. Control Bar — "Floating Dock"**
- Redesign the bottom controls as a **two-tier system**:
  - Primary row: Mute (circle), Video (circle), **End Call (wide red pill, 2x width)** — End Call is visually dominant
  - Secondary row (above): Settings gear, Stay On Call crown, camera flip — smaller, less prominent
- Add **haptic feedback** on every control tap
- End call button gets a **long-press to confirm** with a radial progress fill (prevents accidental hang-ups)

**B. Audio Call — "Sound Visualizer"**
- Replace the static avatar pulse with a **real-time audio waveform ring** around the avatar — the ring reacts to the remote user's voice volume
- Add a subtle **ambient particle system** behind the avatar that responds to audio levels
- Show call quality indicator (signal bars icon) next to the duration

**C. Incoming Call — "Slide to Answer"**
- Replace the two-button layout with a **slide-to-answer bar** at the bottom (like iPhone's native call screen)
- Green slider on the left → slide right to answer
- Red X button above → tap to decline
- The caller's avatar has a **breathing glow** animation while ringing

**D. Draggable PiP**
- Make the local video preview **draggable** to any corner using a pan gesture
- Snap to nearest corner on release with spring physics
- Double-tap PiP to swap local/remote video (fullscreen your camera)

**E. In-Call Reactions**
- Add a small emoji button to the control bar
- Tapping it opens a row of 6 reactions (thumbsup, heart, laugh, fire, clap, wave)
- Selected emoji floats up from the bottom with a scale+fade animation, visible to both participants
- Reactions are sent via the existing Realtime broadcast channel

**Files modified:**
- `src/components/call/GlobalCallOverlay.tsx` — Two-tier controls, long-press end, draggable PiP, reactions, audio visualizer
- New: `src/components/call/AudioVisualizer.tsx` — Real-time waveform ring component
- New: `src/components/call/CallReactions.tsx` — Emoji reaction picker + floating animations
- New: `src/components/call/SlideToAnswer.tsx` — Slide gesture for incoming calls
- `src/components/call/MinimizedCallBubble.tsx` — Polish the minimized state

---

### Implementation Order

**Wave 1 — Upload (highest user impact):**
Gallery drawer, shutter animation, card-style composer, publish celebration

**Wave 2 — Call controls:**
Two-tier dock, long-press end, slide-to-answer, draggable PiP

**Wave 3 — Call delight:**
Audio visualizer, in-call reactions

### What Stays the Same
- All camera functionality (filters, AR, zoom, timer, flash, recording)
- P2P + LiveKit dual-mode calling architecture
- Safety scanning, content moderation
- Sound/music picker integration
- All existing hooks and backend

