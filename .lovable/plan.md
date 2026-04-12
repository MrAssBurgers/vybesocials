

## Fix Post Creation, Reposition DM Icons, Flash Torch, Tap-to-Text in VybeSnap Editor

### Issues Found

1. **"Failed to create post"** — The network logs show the user's requests use only the anon key (no authenticated JWT). The RLS policy on `posts` requires `auth.uid()` to match via the profiles table. The `useCreatePost` hook checks `if (!profile) throw new Error('Not authenticated')` but the user may be logged in with a stale session or the profile query isn't resolving. The insert uses `as any` cast which may also silently drop required fields. Need to add better error logging and ensure the auth check surfaces the real error (likely RLS violation due to missing/stale auth session).

2. **Swap VybeSnap camera icon to far right, Toybox to far left** — In `MessageInputArea` (inside `ChatView.tsx` lines 1967-2031), the camera button is on the left and Toybox is on the right. Need to swap: move Toybox to the left of the text input and camera button to the right (after the send/mic area).

3. **Flash should use phone's actual torch** — Currently both `Camera.tsx` and `VybeSnapCamera.tsx` only show a white screen overlay for flash. Neither uses the `ImageCapture` API or `applyConstraints({ advanced: [{ torch: true }] })` to activate the real hardware flashlight. Need to add torch activation via the video track's `applyConstraints`.

4. **Tap screen after photo to open frosted glass text input** — In `VybeSnapEditor`, the text tool requires tapping the `Type` button. The user wants tapping anywhere on the captured photo to open the frosted-glass text input (matching the Story creator's feel). Add an `onClick` handler on the media container that opens text mode when no other mode is active.

5. **Consistent frosted glass styling** — Ensure `VybeSnapEditor`'s text input uses the same `bg-white/10 backdrop-blur-xl` frosted glass styling consistently (it already does, just needs the tap-to-open behavior).

### Plan

**1. Fix post creation auth error (`src/hooks/usePosts.ts`)**
- Add `console.error` logging in the `onError` handler to surface the actual error message
- Log `profile` state before insert to catch null profile issues
- Remove `as any` cast on the insert object and type it properly
- Add a check: if `!profile?.id` or `!profile?.user_id`, show a toast telling the user to log in again

**2. Swap icon positions in DM input (`src/components/chat/ChatView.tsx`)**
- In `MessageInputArea` (~line 1967-2031): move the VybeSnap camera button from before the text input to after the send/mic buttons (far right)
- Move the Toybox component from after the text input to before it (far left)

**3. Add real torch/flashlight support (`src/components/camera/VybeSnapCamera.tsx` + `src/components/camera/Camera.tsx`)**
- When `flashEnabled` is toggled on, call `stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: true }] })` to activate the phone's hardware flashlight
- When toggled off, set `torch: false`
- Keep the white overlay as a fallback for front-facing cameras (which don't have torch)
- Add the same logic to `Camera.tsx`'s flash toggle

**4. Tap-to-text in VybeSnapEditor (`src/components/camera/VybeSnapEditor.tsx`)**
- Add an `onClick` handler on the media container div (line ~369) that opens text mode when `mode === 'none'` and `!isDrawing`
- When tapped: set `mode` to `'text'`, set `isTextInputOpen` to `true`, auto-focus the textarea

**5. Ensure smooth, glitch-free experience**
- In `VybeSnapEditor`, the drag handler already uses framer-motion's `onDrag` which triggers React state updates per frame. Since the editor is simpler than the story creator's `DraggableOverlay`, this is acceptable, but ensure `dragMomentum={false}` is set (it already is).

### Files to modify
- `src/hooks/usePosts.ts` — better error handling and auth check
- `src/components/chat/ChatView.tsx` — swap camera and toybox positions in `MessageInputArea`
- `src/components/camera/VybeSnapCamera.tsx` — add torch API for real flash
- `src/components/camera/Camera.tsx` — add torch API for real flash  
- `src/components/camera/VybeSnapEditor.tsx` — tap-to-text on media area

