# Fix: NFC works inside the Despia shell for Friend Link

## Root cause

`AutoFriendDrop.tsx` → `startWebNfcScan()` tries `new NDEFReader().scan()` directly. Inside the Despia Android WebView this throws (`NotSupportedError` or generic), so the catch toasts **"NFC unavailable on this device"** even though Despia has NFC enabled. The existing `useNFC.ts` hook already supports Despia's native NFC bridge (`despiaCall('nfcread://')`, `scannfc://`, `nfc://read`) but Friend Link's auto-drop never calls it.

## Plan

### 1. Add a shared Despia NFC helper — `src/lib/despiaBridge.ts`

Export a new function `despiaScanNFC(timeoutMs = 30_000): Promise<string | null>` that:
- Returns `null` immediately if not in Despia runtime or not Android.
- Calls `despiaCall(url, ['nfcResult','payload','data','url'])` against each bridge URL in order: `nfcread://`, `scannfc://`, `nfc://read`.
- Returns the first non-empty string payload (`nfcResult || payload || data || url`).
- No parsing — callers decide what to do with the string.

Refactor the existing `despiaNFCScan` inside `useNFC.ts` to use this helper (still parses for `/add-friend/`), so we have one canonical bridge call.

### 2. Wire Despia NFC into Friend Link — `src/components/friends/AutoFriendDrop.tsx`

Rename `startWebNfcScan` → `startNfcScan` and rewrite the order:

1. **If `isDespiaRuntime() && isAndroidUA()`** → call `despiaScanNFC()` first.
   - On success, parse the returned string for **both** patterns the QR camera already handles:
     - `/friend-drop/([a-zA-Z0-9-]+)` → `handleDropScan(id)`
     - `/add-friend/([a-zA-Z0-9-]+)` → `handleFoundUser(id)` (skip if it's our own id)
   - If Despia returned a payload but neither pattern matched → toast `"That tag isn't a VYBE link"`.
   - If Despia returned `null` (user cancelled / no tag) → silent return (no error toast).
2. **Else fall back to Web NFC** (current `NDEFReader` block, unchanged behaviour).
3. **In the `NDEFReader` catch:** if `isDespiaRuntime() && isAndroidUA()` and we landed here because the WebView rejected the permission, retry once via `despiaScanNFC()` before showing any error.
4. **iOS Despia / non-Android Despia:** detect and toast `"NFC isn't supported on iPhone — use the QR tab"` instead of the generic "unavailable" message.
5. The toast wording for true unavailability becomes: `"This device can't scan NFC — switch to QR"` (clearer than "unavailable").

### 3. Make the Phone Tap tab auto-start in Despia

Today, when `nativeFriendDrop.isAvailable` is false the user has to tap the "Phone Tap" tab to trigger `startWebNfcScan`. The `useEffect` on lines 369–378 only starts the native (Capacitor) session. Extend it so that in Despia we also auto-fire `startNfcScan()` once when entering the tap tab — no extra tap required, matching the rest of the app's NFC UX.

Gate with a ref so we don't re-fire on every state change.

### 4. Also patch the standalone Web NFC hook — `src/hooks/useWebNFC.ts`

`useWebNFC.start()` returns a generic toast `"NFC isn't supported on this device"` when `NDEFReader` is missing. In the Despia branch make it call `despiaScanNFC()` (passing the payload through the existing `onRead` callback as a single text record) before falling back to the error. This way every consumer (AddFriend, NFCFriendShare, AutoFriendDrop) gets the Despia path for free.

## Files touched
- `src/lib/despiaBridge.ts` — add `despiaScanNFC` helper.
- `src/hooks/useNFC.ts` — refactor `despiaNFCScan` to use the shared helper (no behaviour change).
- `src/hooks/useWebNFC.ts` — Despia fallback in `start()`.
- `src/components/friends/AutoFriendDrop.tsx` — rewrite `startWebNfcScan`, auto-start in Despia, sharper error toasts.

## Out of scope
- iOS Core NFC (Despia iOS doesn't expose a bridge for this — handled via clearer "use QR" messaging).
- Writing to NFC tags from the FriendLink sheet (only the scan path is broken; writing is already gated to Web NFC in `useNFC.ts`).
- Native Capacitor BLE peer-finding (`useNativeFriendDrop`) — unaffected.

## How to verify after build
1. Open Friend Link inside Despia Android with NFC enabled, tap **Phone Tap** → toast should say "NFC scanning…", not "unavailable".
2. Bring a friend's QR-link NFC tag close → friend modal opens (success).
3. Open Friend Link inside Despia iOS → tab toast says "use the QR tab".
4. Open in regular Chrome Android → Web NFC path still works.
