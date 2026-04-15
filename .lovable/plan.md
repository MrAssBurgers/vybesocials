

## Fix: Background Suppression on Upload Page + Filter Baking for Sent Photos + AI Enhance Filter Preservation

Three issues to fix:

---

### 1. Suppress Custom Background on /upload and Other Full-Screen Pages

**Problem**: The custom user background (wallpaper) bleeds through on pages like `/upload` where it hurts contrast (camera viewfinder, compose screen). The `MobileCreateStudio` and `DesktopCreateStudio` already use `bg-black` / `bg-background` but the `has-custom-bg` CSS overrides make those transparent.

**Fix**: On mount of the Upload page (and any other full-screen overlay pages like camera), temporarily remove the `has-custom-bg` class from `document.body` and restore it on unmount. This gives these pages their solid default background while keeping the wallpaper on normal pages.

**Implementation**: Add a `useEffect` in `Upload.tsx` that removes `has-custom-bg` on mount and restores it on unmount. Also add the same to `MobilePostComposer.tsx` (the compose phase).

**Files**: `src/pages/Upload.tsx`

---

### 2. Fix "Filter Not Applied When Sending" — Gallery-Picked Images

**Problem**: When a user picks an image from gallery and applies a filter via `ImageFilterEditor`, the `handleEditorApply` correctly replaces the file. However, in `MobilePostComposer`, the `onEnhanced` callback only updates `previews` (the display URL) but **never updates the `files` array**. The `files` prop is what gets uploaded. So the preview shows the enhanced/filtered version but the original file gets sent.

Since `MobilePostComposer` receives `files` and `previews` as props (not state it owns), it can't update them. The `onEnhanced` callback at line 247-250 sets `newPreviews` but never calls any setter and never updates the file.

**Fix**: Convert the AI enhance `onEnhanced` handler to also create a new `File` from the data URL and update the files array. Since `files`/`previews` are props from the parent, we need to either:
- Add `onUpdateFiles` callback prop to `MobilePostComposer`, OR
- Manage local state copies of files/previews inside `MobilePostComposer` so edits can be applied locally

The simpler approach: add local state mirrors of `files` and `previews` in `MobilePostComposer` that initialize from props but can be mutated locally for enhancements.

**Files**: `src/components/create/MobilePostComposer.tsx`

---

### 3. AI Enhancement Doesn't Preserve Current Filter

**Problem**: The AI enhance sends the original `imageFile` to the edge function. If the user already applied a camera filter (baked into the JPEG at capture time from the canvas), the filter IS in the file. But if the user applied a filter via `ImageFilterEditor` in the desktop flow, the filtered file replaces the original — so the AI enhance would work on the filtered version.

The real issue is in `MobilePostComposer` where `onEnhanced` doesn't actually persist anything (bug #2 above). Once we fix bug #2 so the enhanced data URL gets converted to a File and replaces the entry in the local files array, the AI enhancement will be properly applied and sent.

**Files**: Same fix as #2 — `src/components/create/MobilePostComposer.tsx`

---

### Technical Summary

**Files modified** (2 files):
- `src/pages/Upload.tsx` — Add `useEffect` to suppress custom background on mount/unmount
- `src/components/create/MobilePostComposer.tsx` — Add local state mirrors for files/previews; fix `onEnhanced` to convert data URL to File and update both arrays; fix the dead code where `newPreviews` is set but never used

**No database changes needed.**

