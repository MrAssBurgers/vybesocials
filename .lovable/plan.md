

## Snapchat-Style Camera-First Messaging System

A major UX overhaul that makes camera the center of the messaging experience — matching Snapchat's speed, gestures, and flow.

---

### What This Changes

The DM experience shifts from "tap chat → type text" to "tap → camera opens → capture → send instantly." Every interaction prioritizes speed and gesture-based navigation.

---

### Phase 1: Camera Button on DM List Header

**File**: `src/components/chat/ConversationList.tsx`

Add a camera icon button to the **left side** of the header (next to the user avatar). Tapping it opens VybeSnapCamera in fullscreen with rear camera default. Uses the existing `VybeSnapCamera` component.

---

### Phase 2: Camera-First DM Entry

**File**: `src/components/chat/ChatView.tsx`

When a user taps a DM conversation, instead of showing the chat immediately:
- Show VybeSnapCamera fullscreen first (rear camera default)
- Chat is accessible by swiping up or tapping a "Chat" pill at the bottom
- Keyboard stays hidden until user explicitly taps the text input
- A small semi-transparent overlay at the bottom shows the recipient name + avatar

**New file**: `src/components/chat/CameraFirstOverlay.tsx` — The overlay component that wraps camera + chat-below flow

---

### Phase 3: Snap Preview Viewer for Media Messages

**File**: `src/components/chat/ConversationList.tsx` + `src/components/chat/VybeViewer.tsx`

When a DM has unviewed media (snap), tapping the conversation opens `VybeViewer` directly instead of loading the full chat:
- Fullscreen camera-style viewer with progress bar
- Swipe right → return to DM list
- Swipe up → open full chat thread
- After viewing, mark as read and return to list

---

### Phase 4: Quick Send After Capture

**File**: `src/components/camera/VybeSnapCamera.tsx`

After capturing a photo/video, show a quick-send overlay:
- Recent chats appear as a horizontal avatar row at the bottom
- Tap a contact → sends immediately (no confirmation)
- Send button always visible
- Uses existing `CameraShareSheet` logic but streamlined into an inline row

---

### Phase 5: Gesture Navigation System

**File**: `src/components/chat/CameraFirstOverlay.tsx` (new)

Implement Snapchat-style gesture navigation on the camera-first view:
- **Swipe right** → exit camera, return to DM list
- **Swipe left** → open chat overlay
- **Swipe up** → open memories/chat overlay
- Smooth spring animations tracking finger position
- Haptic feedback at gesture thresholds

---

### Phase 6: Frosted Glass Text Input on Captured Media

**File**: `src/components/camera/VybeSnapEditor.tsx`

Replace the existing text overlay system with Snapchat-style frosted glass text input:
- Tap anywhere on captured media → centered text box appears with frosted glass background
- Semi-transparent blur with rounded corners (`backdrop-filter: blur(20px)`)
- Auto-contrast: light tint on dark images, dark tint on light images (sample center pixel)
- Text box expands dynamically as user types
- Draggable + pinch-to-resize after placing
- Smooth fade-in animation on appear

---

### Phase 7: Performance Optimizations

**Files**: `src/components/camera/VybeSnapCamera.tsx`, `src/components/chat/CameraFirstOverlay.tsx`

- Camera stream pre-warm on DM list mount (gesture-gated, not auto-start)
- Instant camera open (<150ms) by keeping stream reference alive
- Text input appears within 100ms via pre-rendered hidden input
- No UI flicker on view transitions (use `will-change: transform`)
- Haptic feedback on capture (medium) and send (light)

---

### Technical Summary

**New files** (1):
1. `src/components/chat/CameraFirstOverlay.tsx` — Camera-first DM entry wrapper with gesture nav

**Modified files** (4):
1. `src/components/chat/ConversationList.tsx` — Camera button in header + snap preview tap behavior
2. `src/components/chat/ChatView.tsx` — Camera-first entry mode, deferred keyboard
3. `src/components/camera/VybeSnapCamera.tsx` — Quick send row, instant open optimizations
4. `src/components/camera/VybeSnapEditor.tsx` — Frosted glass text input with auto-contrast

**No database changes required.**

