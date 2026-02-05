
# Buttery Smooth Performance Across All Platforms + AI Brief Sparkles Fix

## Overview
This plan addresses:
1. **Global performance optimization** - Make the app 60fps smooth on all devices (web, PWA, native iOS/Android)
2. **AI Brief spinning V animation fix** - Perfect the sparkle animation for the daily brief loading state

---

## Root Cause Analysis

### Current Performance Issues Found

| Issue | Location | Impact |
|-------|----------|--------|
| **`setInterval(50ms)` for recording progress** | `VybeSnapCamera.tsx` line 216, `SnapCamera.tsx` line 284 | Causes React re-renders every 50ms, triggers full VDOM diffing |
| **Framer Motion on spinning V** | `AIBriefLoadingState.tsx` line 56-63 | Motion overhead when CSS `@keyframes` would be smoother |
| **Nested animation conflicts** | VybeMiniIcon sparkles + parent rotation | Sparkles inside rotation cause cumulative transforms |
| **iOS animation override too aggressive** | `index.css` line 59-64 | Forces ALL animations to 0.15s, breaks intentional animations |
| **Heavy `backdrop-blur-xl`** | 24 files, 150+ instances | iOS Safari struggles with blur >12px |

### AI Brief Animation Specific Issues
1. **Spinning container has Framer Motion `animate={{ rotate: 360 }}`** - Overhead when CSS `@keyframes` is smoother
2. **VybeMiniIcon sparkles use `animate-pulse`** - Conflicting with parent rotation
3. **Orbiting sparkles positioned relative to wrong center** - They orbit relative to their container, not the V
4. **Glow ring pulse uses Framer Motion** - Should be pure CSS

---

## Technical Implementation

### 1. Replace Recording `setInterval` with `requestAnimationFrame`

**Files:** `VybeSnapCamera.tsx`, `SnapCamera.tsx`, `Camera.tsx`

**Before (Laggy):**
```tsx
recordingTimerRef.current = setInterval(() => {
  setRecordingProgress(progress); // Re-render every 50ms!
}, 50);
```

**After (Smooth):**
```tsx
const updateProgress = () => {
  const elapsed = Date.now() - startTime;
  const progress = Math.min((elapsed / (MAX_DURATION * 1000)) * 100, 100);
  
  // Update ref, not state - only update state every 100ms for UI
  progressRef.current = progress;
  
  if (progress < 100 && isRecording) {
    frameRef.current = requestAnimationFrame(updateProgress);
  }
};
frameRef.current = requestAnimationFrame(updateProgress);

// Separate interval for UI updates (less frequent)
uiUpdateRef.current = setInterval(() => {
  setRecordingProgress(progressRef.current);
}, 100); // 10fps UI updates instead of 20fps
```

### 2. Convert AI Brief Spinning V to Pure CSS

**File:** `AIBriefLoadingState.tsx`

**Current (Framer Motion):**
```tsx
<motion.div
  animate={{ rotate: 360 }}
  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
>
  <VybeMiniIcon ... />
</motion.div>
```

**After (Pure CSS):**
```tsx
<div className="spin-smooth" data-allow-animation="true">
  <VybeMiniIcon ... />
</div>
```

**New CSS in `index.css`:**
```css
@keyframes spin-smooth {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin-smooth {
  animation: spin-smooth 2.5s linear infinite;
  will-change: transform;
  transform: translateZ(0);
}
```

### 3. Fix Orbiting Sparkles Animation

**Current Issue:** Sparkles orbit correctly but the visual is disconnected from the spinning V

**Solution:**
- Remove sparkles from inside VybeMiniIcon (they rotate with the V, breaking the orbit)
- Keep only the outer `.orbit-sparkle` elements
- Fix positioning to center around the spinning V

**File:** `AIBriefLoadingState.tsx`
```tsx
{/* VybeMiniIcon WITHOUT sparkles - they're added externally */}
<VybeMiniIcon size={64} showSparkles={false} animated={false} />
```

**Ensure orbit sparkle container is centered:**
```tsx
<div 
  className="absolute inset-0 flex items-center justify-center"
  data-allow-animation="true"
>
  {/* 6 orbit sparkles positioned correctly */}
  {[0, 1, 2, 3, 4, 5].map((i) => (
    <div 
      key={i}
      className="orbit-sparkle"
      style={{ animationDelay: `${-i * 0.5}s` }}
    />
  ))}
</div>
```

### 4. Convert Glow Ring to Pure CSS

**Before (Framer Motion):**
```tsx
<motion.div
  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
  transition={{ duration: 2, repeat: Infinity }}
/>
```

**After (CSS):**
```tsx
<div className="glow-ring-pulse" data-allow-animation="true" />
```

**New CSS:**
```css
@keyframes glow-ring-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 0.8; }
}

.glow-ring-pulse {
  animation: glow-ring-pulse 2s ease-in-out infinite;
  will-change: transform, opacity;
  transform: translateZ(0);
}
```

### 5. Fix iOS Animation Override

**Current Problem (`index.css` line 59-64):**
```css
.platform-ios *,
.platform-ios *::before,
.platform-ios *::after {
  animation-duration: 0.15s !important;  /* Breaks intentional animations! */
  transition-duration: 0.15s !important;
}
```

**Solution:** Only target non-essential animations, respect `data-allow-animation`:
```css
/* iOS: Speed up NON-essential animations only */
.platform-ios *:not([data-allow-animation="true"]):not([data-allow-animation="true"] *) {
  transition-duration: 0.15s !important;
}

/* Never override keyframe animations - let them run at intended speed */
.platform-ios *[class*="animate-"]:not(.animate-spin):not(.animate-pulse) {
  animation-duration: 0.15s !important;
}

/* Explicitly allow certain animations to run normally */
.platform-ios .spin-smooth,
.platform-ios .glow-ring-pulse,
.platform-ios .orbit-sparkle,
.platform-ios [data-allow-animation="true"],
.platform-ios [data-allow-animation="true"] * {
  animation-duration: unset !important;
  transition-duration: unset !important;
}
```

### 6. Global Performance Improvements

**a) Add `contain` properties for layout isolation:**
```css
.post-card, article, .message-bubble {
  contain: layout style paint;
}

.feed-container, .chat-messages {
  contain: layout;
  will-change: scroll-position;
}
```

**b) Reduce blur on ALL mobile devices (not just iOS):**
```css
.device-mobile .liquid-glass,
.device-mobile .liquid-glass-card {
  backdrop-filter: blur(10px) saturate(130%) !important;
  -webkit-backdrop-filter: blur(10px) saturate(130%) !important;
}
```

**c) Reduce particle count for low-perf devices:**
In `VybeRecordButton.tsx`:
```tsx
const particleCount = isLowPerf ? 4 : 8;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/home/AIBriefLoadingState.tsx` | Replace Framer Motion with pure CSS, fix sparkle positioning |
| `src/index.css` | Add new keyframes, fix iOS animation overrides, add mobile blur reductions |
| `src/components/camera/VybeSnapCamera.tsx` | Use RAF for progress, reduce state updates |
| `src/components/chat/SnapCamera.tsx` | Use RAF for progress, reduce state updates |
| `src/components/camera/Camera.tsx` | Use RAF for recording duration |
| `src/components/camera/VybeRecordButton.tsx` | Reduce particles on low-perf devices |
| `src/components/ui/VybeMiniIcon.tsx` | Add prop to disable internal sparkles when used in spinning context |

---

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Recording animation FPS | ~40fps (iPhone Safari) | 60fps |
| AI Brief spinner | Janky, conflicting animations | Smooth, 60fps |
| Feed scrolling | Occasional jank | Butter-smooth |
| Blur rendering time | Variable | <16ms per frame |

---

## Implementation Order

1. **CSS changes first** - Immediate impact, zero risk
2. **AI Brief loading animation** - Most visible fix
3. **Recording RAF conversion** - Performance-critical
4. **Mobile blur reductions** - Global improvement

---

## Validation Checklist

After implementation:
- Test AI Brief loading animation on iPhone Safari - should be perfectly smooth
- Record a video on iPhone - progress ring should animate at 60fps
- Scroll the feed rapidly - no dropped frames
- Open popups/sheets - smooth spring animations
- Test on Android Chrome - should feel equally smooth
- Test on desktop browsers - no regressions
