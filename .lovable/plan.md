# Fix haptics in Despia shell

## Problem

Haptics never fire on your device because `src/lib/haptics.ts` calls the wrong Despia API:

```ts
(window as any).location.href = `haptic://impact?style=${style}`;
```

That URL scheme **does not exist** in Despia. Per `despia-native`'s type definitions, the only valid haptic schemes are:

- `lighthaptic://`
- `heavyhaptic://`
- `successhaptic://`
- `warninghaptic://`
- `errorhaptic://`

(No `medium` — Despia does not expose one.)

On top of that, `window.location.href = ...` is the wrong dispatch mechanism. The `despia-native` package already exposes a `despia(command)` helper (used elsewhere in the app, e.g. `useRewardedAd`) that handles the bridge correctly without risking page navigation in non-Despia browsers.

The Capacitor branch added in the previous turn is dead code for you (you ship Despia only), so it can be removed to keep things lean.

## Changes — single file: `src/lib/haptics.ts`

1. **Remove the Capacitor import + branch** added last turn.
2. **Import the Despia helper** instead:
   ```ts
   import despia from 'despia-native';
   ```
3. **Detect Despia** the same way `useRewardedAd.ts` does (UA contains `despia`), so behavior is consistent across the codebase.
4. **Rewrite `nativeHaptic(style)`** to map our 6 internal styles to Despia's 5 real schemes and call `despia(...)`:
   - `light` → `lighthaptic://`
   - `medium` → `lighthaptic://` (Despia has no medium; light is the closest taptic)
   - `heavy` → `heavyhaptic://`
   - `success` → `successhaptic://`
   - `warning` → `warninghaptic://`
   - `error` → `errorhaptic://`
5. Wrap the call in `try/catch` and return `true` on success so `triggerHaptic` short-circuits the `navigator.vibrate` web fallback when Despia handled it (avoids double-buzz on Android where both fire).
6. Keep `navigator.vibrate` fallback intact for plain browser/PWA use.
7. Keep the `vybe-haptics-enabled` localStorage gate and the existing `haptics.tap/select/impact/success/warning/error/send/like/navigate` public API — no call sites need to change.

## Out of scope

- No call-site changes; every existing `haptics.tap()` etc. starts working automatically once the bridge is fixed.
- No new haptic triggers added to components in this pass. If, after testing, specific screens still feel "dead," we can do a second pass to sprinkle `haptics.tap()` into the missing buttons — let me know which screens.
- No backend, RLS, or routing changes.

## Verification

- Build the Despia APK/IPA from the updated bundle and confirm taps trigger the Taptic Engine / vibrator on:
  - Bottom-nav switches
  - Like / reaction long-press
  - Send message
  - Pull-to-refresh / publish celebration
- In a desktop browser, confirm no console errors and no accidental navigation (the old `window.location.href = 'haptic://...'` bug).
