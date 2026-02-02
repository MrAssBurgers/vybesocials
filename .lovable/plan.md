

# Comprehensive App Walkthrough - Bug Fixes & Optimization Plan

## Issues Found During Testing

### 1. React Ref Warnings (Console Errors)
**Files Affected:**
- `src/components/layout/BottomNav.tsx` - Missing `forwardRef`
- `src/components/debug/DebugPanel.tsx` - Missing `forwardRef`

**Fix:** Wrap these components with `React.forwardRef()` to eliminate the console warnings about refs.

### 2. CallOverlay Mount/Unmount Flicker
**Console Log:** `"[CallOverlay] Component UNMOUNTING - this should NOT happen during calls!"`

**File:** `src/components/call/GlobalCallOverlay.tsx`

**Fix:** Add proper mounting guards to prevent unnecessary re-renders during navigation.

### 3. Post Loading Performance
The posts are loading (verified via network requests showing 200 OK for `get_posts_with_counts`), but the initial load could be faster.

**Optimization:** Pre-warm the signed URL cache and add skeleton placeholders during image loading.

### 4. Network Request Latency
- Posts RPC: ~650-700ms
- Media signing: ~640ms  
- Avatar signing: ~690ms

**Optimization:** Batch media signing requests more aggressively.

---

## Implementation Plan

### Phase 1: Fix React Ref Warnings

**`src/components/layout/BottomNav.tsx`**
- Wrap component with `forwardRef` and `memo`
- Add proper ref forwarding to the root nav element

**`src/components/debug/DebugPanel.tsx`**
- Wrap with `forwardRef` for clean ref handling

### Phase 2: Fix CallOverlay Flickering

**`src/components/call/GlobalCallOverlay.tsx`**
- Add a stable mounting key
- Use `useMemo` for the component state to prevent re-renders
- Remove unnecessary logging in production

### Phase 3: Optimize Mobile/Tablet/Desktop Layouts

**Cross-Platform Verification:**
- Mobile (390x844): ✅ Bottom nav displays correctly
- Tablet (820x1180): Test responsive sidebars
- Desktop (1920x1080): Test left/right sidebars

**Files to Review:**
- `src/components/layout/AppLayout.tsx` - Already uses `useBreakpoint`
- `src/components/layout/RootBottomNavMount.tsx` - Correctly hides on desktop
- `src/hooks/usePlatform.tsx` - Breakpoint detection

### Phase 4: Performance Optimizations

**Signed URL Cache (`src/lib/signedUrlCache.ts`):**
- Add request deduplication for in-flight requests
- Increase batch size for media signing

**Image Loading (`src/components/posts/PostCard.tsx`):**
- Add blur placeholder during load
- Implement progressive loading for large images

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/layout/BottomNav.tsx` | Add `forwardRef` wrapper |
| `src/components/debug/DebugPanel.tsx` | Add `forwardRef` wrapper |
| `src/components/call/GlobalCallOverlay.tsx` | Fix mount/unmount flicker |
| `src/lib/signedUrlCache.ts` | Add request deduplication |
| `src/components/posts/PostCard.tsx` | Add blur placeholder during load |

---

## Expected Results

1. **Zero Console Warnings** - Clean developer experience
2. **No CallOverlay Flicker** - Smooth call transitions
3. **Faster Perceived Loading** - Blur placeholders show content structure immediately
4. **Cross-Platform Consistency** - Proper layouts on phone, tablet, and desktop

