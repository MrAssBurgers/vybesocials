## Plan to stop the DM camera crash

I found three remaining weak spots that can still crash the app even after the prior fixes:

1. `ConversationList` still mounts `VybeSnapCamera` directly without `CameraMountBoundary`, so crashes from the DM list camera path are not protected.
2. `CameraFirstOverlay` also mounts `VybeSnapCamera` directly without the outer boundary.
3. `ChatView` still starts camera access with `Promise.resolve().then(...)`, which moves `getUserMedia` out of the direct tap gesture path on some mobile wrappers. `VybeSnapCamera` also starts camera from `requestAnimationFrame` on mount, so if the preload fails or is delayed, it can still hit the media API outside the original tap.

## What I’ll change

### 1. Make the DM camera open path direct and safe
- Update `ChatView` so the camera button calls `requestCameraStream(...)` immediately inside the click handler.
- Only open `VybeSnapCamera` after that request resolves or returns safely.
- Never leave camera promises unhandled.
- Keep the active-call guard and `stopCameraStream()` cleanup.

### 2. Make `VybeSnapCamera` accept an already-open stream
- Add an optional `initialStream` prop.
- When provided, attach that stream instead of calling `getUserMedia` again from `requestAnimationFrame`.
- This keeps camera permission/access tied to the original user tap and avoids a second media request during component mount.

### 3. Guard every DM camera mount
- Wrap the `ConversationList` camera with `CameraMountBoundary`.
- Wrap the `CameraFirstOverlay` camera with `CameraMountBoundary`.
- Keep the existing `ChatView` boundary.

### 4. Add stronger media API guards in `VybeSnapCamera`
- Before calling any media API, check `navigator.mediaDevices?.getUserMedia` exists.
- Wrap the fallback `getUserMedia({ video: true })` in its own `try/catch` so fallback failures cannot bubble.
- Stop all owned camera tracks on close/unmount.

## Validation

- Check the relevant files after edits for consistent prop usage.
- Use available runtime/console signals after the change if the preview reports new camera errors.
- No backend or database changes.