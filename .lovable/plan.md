

## AR Engine Activation + Snap Camera Kit SDK Integration

### What This Does

Activates the existing (but dormant) AR filter engine in VybeSnapCamera, installs the official Snap AR Camera Kit React SDK (`@snap/react-camera-kit` + `@snap/camera-kit`), and wires everything together so filters actually work on the live camera feed.

---

### 1. Install Snap AR Camera Kit SDK

Install two packages:
- `@snap/camera-kit` — core AR engine
- `@snap/react-camera-kit` — React wrapper with `CameraKitProvider` and `LensPlayer`

These require a Camera Kit API token from the Snap Developer Portal. You'll need to create a free Snap AR account and get an API token + lens group ID.

### 2. Wire MediaPipe Face Tracking into VybeSnapCamera

**File**: `src/components/camera/VybeSnapCamera.tsx`

- Import `useFaceTracking` and `AROverlayCanvas`
- Call `useFaceTracking()` and pass the video element via `startTracking(video)` once the camera stream is active
- Layer `<AROverlayCanvas>` over the `<video>` element with matching dimensions
- Import and replace the CSS-only lens carousel with `ARFilterPicker`
- Track the selected `ARFilterDef` in state and pass to both `AROverlayCanvas` (for face overlays/particles) and the video element's `style.filter` (for CSS color grading)

### 3. Activate ARFilterPicker (Remove "Coming Soon")

**File**: `src/components/camera/ARFilterPicker.tsx`

- Replace `handleFilterSelect` (which just shows a toast) with actual filter application: call `onFilterChange(filter)` directly
- Keep premium gate check — show upsell for locked filters

### 4. Add Snap Camera Kit Provider Wrapper

**New file**: `src/components/camera/SnapARProvider.tsx`

- Wraps `CameraKitProvider` from `@snap/react-camera-kit` with the API token
- Provides a `useSnapLens` hook for loading and applying Snap Lens Studio lenses by ID
- Falls back gracefully if the token isn't configured (uses MediaPipe-only mode)

### 5. Snap Lens Integration in Camera

**File**: `src/components/camera/VybeSnapCamera.tsx`

- When a filter has a `snapLensId` property, use Snap Camera Kit to render it instead of the MediaPipe canvas
- For filters without a lens ID, continue using the existing `AROverlayCanvas` + `useFaceTracking` pipeline
- Both systems can coexist — Snap for premium/community lenses, MediaPipe for built-in effects

### 6. API Token Setup

The Snap Camera Kit API token is a publishable key (safe for client-side). It will be stored as `VITE_SNAP_CAMERA_KIT_TOKEN` in the codebase. You'll need to:
1. Go to https://developers.snap.com
2. Create a Camera Kit application
3. Copy the API token

### 7. Filter Creator Upload Portal

**New file**: `src/components/camera/FilterUploadModal.tsx`

- Users who create lenses in Snap Lens Studio can submit their lens ID + group ID
- Saves to the existing `filters` table with `effect_config: { snapLensId, snapGroupId }`
- Moderation flag: `is_approved: false` by default for public visibility

### 8. Moderation Update

**File**: `src/hooks/useFilters.ts`

- `useCreateFilter` sets `is_approved: false` for non-premium user submissions
- Admin approval uses existing admin dashboard patterns

---

### Technical Details

- `@snap/camera-kit` handles Snap Lens rendering via WebGL — runs alongside or instead of the MediaPipe canvas
- `@snap/react-camera-kit` provides `CameraKitProvider` (context) and `LensPlayer` (managed camera + lens renderer)
- MediaPipe remains the fallback for built-in filters (no external dependency needed)
- Snap lenses load from Snap's CDN — typical load time <500ms with caching

### Files Summary

**New packages** (2): `@snap/camera-kit`, `@snap/react-camera-kit`

**New files** (2):
1. `src/components/camera/SnapARProvider.tsx` — Camera Kit context + hook
2. `src/components/camera/FilterUploadModal.tsx` — Lens upload portal

**Modified files** (3):
1. `src/components/camera/VybeSnapCamera.tsx` — Wire face tracking + AR canvas + Snap lens support
2. `src/components/camera/ARFilterPicker.tsx` — Remove "coming soon", activate filter selection
3. `src/hooks/useFilters.ts` — Moderation flag for uploads

No database changes — existing tables support this.

