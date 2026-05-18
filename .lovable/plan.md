## Goal
Make Friend Link work reliably in the Despia Android app and remove the gray placeholder/play image from the QR camera area.

## What I’ll change
1. **Remove the fake camera placeholder**
   - In `AutoFriendDrop.tsx`, hide the QR camera frame until the real camera stream is active.
   - Show a small loading state while the camera opens, then show only the live `<video>` feed and scan corners.
   - If camera access fails, show the existing retry UI instead of a gray placeholder/play image.

2. **Fix Despia NFC detection**
   - Make Despia runtime detection more tolerant by checking user agent, native bridge signals, and app-like runtime hints instead of relying only on a narrow user-agent match.
   - This should stop the app from incorrectly falling through to Web NFC and showing “NFC unavailable on this device”.

3. **Make NFC scanning parse real payload formats**
   - Normalize NFC payloads before matching so encoded URLs, raw `vybe:friend:` payloads, and callback object fields all route correctly.
   - Support both friend formats already used by the app:
     - `/friend-drop/:dropId`
     - `/add-friend/:userId`

4. **Patch the active Friend Link flow**
   - Update `AutoFriendDrop.tsx`, which is the component currently used on the home page.
   - When Phone Tap opens in Despia Android, call Despia’s native NFC bridge first and do not show the generic unavailable toast.
   - Add debug logging around bridge detection/result so if Despia still fails, the console will show exactly whether the bridge is missing, timing out, or returning an unexpected payload.

5. **Patch shared NFC helpers**
   - Update `src/lib/despiaBridge.ts`, `src/hooks/useNFC.ts`, and `src/hooks/useWebNFC.ts` so any other add-friend NFC entry point benefits from the same Despia path.

## Validation
- Run targeted static checks/searches to confirm the old “NFC unavailable on this device” path is no longer used by Friend Link in Despia Android.
- Confirm the QR tab can no longer render the gray placeholder/play image before the real camera feed is ready.
- I can’t physically tap an NFC phone from the sandbox, so I’ll make the app log the native bridge state/result for verification in Despia and avoid claiming hardware success beyond what can be validated in code.