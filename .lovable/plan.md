
# Fix Plan: Camera Inversion, DM Animation Lag, and Badge Sync

## Issues Identified

### 1. Camera Still Bugged in Vybe Snap
**Problem:** The camera preview is mirrored for the front camera (`scaleX(-1)`), BUT the captured image also needs to correctly apply this mirroring. Currently:
- Line 159-162: Canvas mirroring IS implemented in `handleCapture`
- Line 461: Video preview IS mirrored with `transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'`

**Root Cause:** The canvas capture draws the raw video feed, then applies `scaleX(-1)` transform. However, this approach might have issues with certain devices where the video feed is already hardware-mirrored. Additionally, the mirroring needs to account for object-fit cropping calculations.

**Solution:** Refactor the capture logic to:
1. Always capture the raw video frame first
2. Apply mirroring AFTER cropping calculation for front camera
3. Add a debug mode to verify the output matches the preview

### 2. DM Sending Animation Glitchy on iPhone/iPad
**Problem:** The message sending animation is laggy and choppy on iOS Safari devices.

**Root Cause:** 
- Framer Motion animations with complex spring configs cause jank on mobile WebKit
- Multiple simultaneous animation properties (opacity, scale, translateY) without GPU acceleration
- The chat view scroll-to-bottom is fighting with the new message animation

**Solution:**
- Optimize message entrance animations in ChatView to use simpler `ease` transitions instead of springs on mobile
- Add `will-change: transform` and `transform: translateZ(0)` for GPU acceleration
- Use `opacity` and `transform` only (not layout properties)
- Detect iOS/Safari and use CSS transitions instead of Framer Motion springs

### 3. DM Badge Doesn't Sync When Viewing
**Problem:** When you view a DM, the unread badge on the messages tab (bottom nav and sidebar) doesn't immediately clear.

**Root Cause:** 
- `useInstantReadClear` updates `last_read_at` in the database
- It invalidates `['unread-messages-count']` and `['conversations']` queries
- BUT BottomNav and DesktopLeftSidebar use `useUnreadMessagesCount` which has its own query key: `['unread-messages-count', profile?.id]` 
- The invalidation doesn't include the profile ID in the query key, causing a mismatch

**Solution:**
- Fix the query invalidation to use the full query key pattern
- Add immediate optimistic update for the unread count
- Ensure realtime subscription properly triggers badge refresh

---

## Implementation Details

### File: `src/components/chat/SnapCamera.tsx`

**Changes:**
1. Fix camera capture mirroring for front camera:
   - Move the canvas mirroring to happen correctly with the crop calculation
   - Ensure the transform is applied AFTER drawing to match the visible preview exactly

```typescript
// In handleCapture, around line 158-168:
// Draw first, then if front camera, flip the entire result
if (facingMode === 'user') {
  // Create temp canvas, draw video to it
  // Then draw flipped result to main canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = outputWidth;
  tempCanvas.height = outputHeight;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    ctx.translate(outputWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
} else {
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
}
```

### File: `src/components/chat/ChatView.tsx`

**Changes:**
1. Optimize message entrance animations for iOS:
   - Detect iOS/Safari using user agent
   - Use simpler CSS transitions on iOS instead of spring animations
   - Add GPU acceleration classes

2. In the message rendering section (around where messages are mapped):
```typescript
// Add iOS detection at top of component
const isIOSSafari = useMemo(() => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}, []);

// For message animations, use simpler config on iOS:
const messageVariants = isIOSSafari ? {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.15, ease: 'easeOut' }
} : {
  initial: { opacity: 0, y: 12, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring', stiffness: 500, damping: 35 }
};
```

3. Add GPU acceleration to message containers:
```typescript
style={{ 
  willChange: 'transform, opacity',
  transform: 'translateZ(0)',
}}
```

### File: `src/hooks/useMessageNotifications.ts`

**Changes:**
1. Fix query key pattern in `useInstantReadClear` to include profile ID:

```typescript
// Around line 229-230, change:
queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });

// To:
queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profile.id] });
```

2. Add immediate optimistic decrement of unread count:
```typescript
// Before the database update, also update the tab badge count
queryClient.setQueryData(['unread-messages-count', profile.id], (old: number | undefined) => {
  return Math.max(0, (old || 0) - 1); // Optimistically decrement
});
```

### File: `src/hooks/useMessages.ts`

**Changes:**
1. Reduce staleTime for faster updates when badge needs to sync:
```typescript
staleTime: 30000, // 30 seconds instead of 60
refetchOnWindowFocus: true, // Add this
```

### File: `src/hooks/useTabNotificationBadge.ts`

**Changes:**
1. The duplicate `useUnreadMessagesCount` function here should use the same query key as the one exported from useMessages.ts, OR we should consolidate them.

2. Fix the query to use the same key pattern:
```typescript
queryKey: ['unread-messages-count', profile?.id],
```
(This already matches - the issue is the invalidation calls)

---

## Summary of Changes

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/components/chat/SnapCamera.tsx` | Bug fix | Fix front camera mirroring on capture |
| `src/components/chat/ChatView.tsx` | Performance | Optimize animations for iOS/Safari |
| `src/hooks/useMessageNotifications.ts` | Bug fix | Fix query key pattern for badge sync |
| `src/hooks/useMessages.ts` | Enhancement | Faster staleTime for badge updates |

---

## Testing Checklist
- [ ] Front camera capture shows correctly mirrored image
- [ ] Back camera capture is not mirrored
- [ ] DM sending animation is smooth on iPhone
- [ ] DM sending animation is smooth on iPad
- [ ] Unread badge clears immediately when opening a DM
- [ ] Badge count syncs across bottom nav and sidebar
- [ ] Badge updates in real-time when new messages arrive
