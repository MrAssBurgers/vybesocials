## Issue 1 — Background follows you off the profile (race condition)

`src/components/layout/AppBackground.tsx` + `src/pages/Profile.tsx`

Root cause: `setBackgroundImage(otherUserUrl)` triggers an async `signAndApply` (network call to sign the URL). On slow networks that promise can resolve AFTER you navigate away and the unmount `refreshBackground()` has already restored your own bg, overwriting it.

Fix:
- Add a generation token (`appliedTokenRef`) inside `AppBackgroundProvider`. Every call to `setBackgroundImage` / `refreshBackground` increments it and captures the value locally; the async `signAndApply` only commits state if its captured token still matches the latest. Stale resolutions are dropped silently.
- In `Profile.tsx` `useEffect` cleanup, call `refreshBackground()` synchronously AND set `rawUrlRef` cleanup so we don't leak.
- Bonus: short-circuit `setBackgroundImage(null)` to clear body styles immediately (don't wait for state→effect round-trip).

## Issue 2 — X on current background doesn't restore default

`src/components/settings/BackgroundCustomizer.tsx` `removeBackground` (line 438) + `useUserBackgrounds.useClearActiveBackground`

Root cause: after `clearActiveBackground` mutation, the parent (`ThemeCustomizer` / `useCustomTheme`) still re-applies the previously cached opacity/blur via `appBackground.setBackgroundOpacity` on its own re-render. Also the user's equipped cosmetic `equipped_profile_theme` re-applies on next `refreshBackground`.

Fix:
- `removeBackground` now: (1) call `clearActiveBackground.mutateAsync()`, (2) optimistically `appBackground.setBackgroundImage(null)` + reset opacity to 1 and blur to 0, (3) invalidate `user-backgrounds` query, (4) explicitly call `applyBodyBackground({ imageUrl: null, opacity: 1, blur: 0 })` via a new exported helper in `AppBackground.tsx`, (5) toast "Restored default background".
- If user has an `equipped_profile_theme` cosmetic, the X clears the upload but the cosmetic remains — show a small note: "Cosmetic theme still equipped. Unequip in Locker to fully reset."
- Reset local `extractedColors` so the color-match panel disappears.

## Issue 3 — Background settings UX redesign (clean / organized / not crowded)

Restructure `BackgroundCustomizer.tsx` (875 → ~500 lines) into 3 focused, collapsible sections with a single visible action at a time. Pull two subcomponents out for clarity.

New structure (top→bottom):

```
[ Hero preview card ]
  - 16:9 current background, opacity/blur applied
  - corner X button (now actually works)
  - if empty: large dashed dropzone with single "Choose Image" CTA

[ Pill segmented control ]   Library | Upload | Generate
  - only ONE panel renders at a time → no more wall of buttons

  Library panel:
    grid of saved backgrounds (current "My Backgrounds")
    
  Upload panel:
    big drop zone + "Browse" button, supported formats hint

  Generate panel:
    8 style chips (existing AI_BACKGROUND_STYLES) as a single row
    Prompt input + Generate button BELOW chips
    
[ Collapsible "Adjust" accordion ] (only when bg active)
   Opacity slider + Blur slider + "Match UI Colors" button
   Collapsed by default to reduce crowding
```

New files:
- `src/components/settings/background/BackgroundPreviewCard.tsx` — hero card + X.
- `src/components/settings/background/BackgroundLibraryGrid.tsx` — saved grid + rename/delete.
- `src/components/settings/background/BackgroundGenerator.tsx` — style chips + prompt.
- `src/components/settings/background/BackgroundUploader.tsx` — drop zone + file picker.

`BackgroundCustomizer.tsx` becomes a thin orchestrator: header, tabs (Library/Upload/Generate), preview card, adjust accordion. Existing hooks (`useUploadBackground`, `useSetActiveBackground`, etc.) are reused; nothing changes server-side.

Visual polish:
- Reuse existing `Tabs` from shadcn for the segmented control.
- Use `Collapsible` (already in shadcn) for the Adjust section.
- Spacing increased to `space-y-6`, sections wrapped in `rounded-2xl bg-card/60 border`.
- Smaller iconography in chips (no more two CTAs competing for attention).
- Adjust section animated via existing `AnimatePresence` (already imported).

## Files touched

- new `src/components/settings/background/BackgroundPreviewCard.tsx`
- new `src/components/settings/background/BackgroundLibraryGrid.tsx`
- new `src/components/settings/background/BackgroundGenerator.tsx`
- new `src/components/settings/background/BackgroundUploader.tsx`
- edit `src/components/settings/BackgroundCustomizer.tsx` — slim orchestrator
- edit `src/components/layout/AppBackground.tsx` — generation token + export hard `clearAllBackground` helper
- edit `src/pages/Profile.tsx` — defensive cleanup ordering
- edit `src/hooks/useUserBackgrounds.ts` — `useClearActiveBackground` now also returns `Promise<void>` and the new flow waits on it before clearing context

No DB migrations. Existing schema (`user_backgrounds` with `is_active`) is unchanged.
