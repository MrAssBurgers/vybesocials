
Goal: make the user’s selected custom image actually replace the app background everywhere, instead of being hidden by the current UI.

What I found:
- The app has 2 competing background systems:
  1. `AppBackgroundProvider` applies the real background to `document.body`
  2. `ThemeCustomizer` / `useCustomTheme.ts` still use legacy `backgroundImage` theme tokens and `applyBackgroundImage(...)`
- The real background is being painted over by opaque app wrappers:
  - `src/components/layout/AnimatedRoutes.tsx` uses `min-h-screen bg-background`
  - `src/components/layout/AppLayout.tsx` loading shell uses `bg-background`
  - many route shells use solid `bg-background`
- Messages explicitly disables the wallpaper:
  - `src/pages/Messages.tsx` sets `data-dm-active`
  - `src/index.css` then forces `background-image: none !important`
  - the DM container also sets `backgroundImage: 'none'`
- `AppBackground.tsx` exposes opacity/blur state, but the CSS layer that should visually apply those values is incomplete, so that part is unreliable too.

Implementation plan:
1. Make `AppBackgroundProvider` the only source of truth for the actual image
- Keep image rendering in `src/components/layout/AppBackground.tsx`
- Stop using the legacy theme-token path as a rendering mechanism for custom wallpapers
- In `ThemeCustomizer` / `BackgroundCustomizer`, use the app background context + active background data for live preview/state, instead of relying on `theme_tokens.backgroundImage`

2. Unmask the global wallpaper
- Remove or conditionally neutralize the solid `bg-background` wrappers that sit on top of the body background:
  - `src/components/layout/AnimatedRoutes.tsx`
  - `src/components/layout/AppLayout.tsx`
- Add a clean “background-aware” shell rule in `src/index.css` so top-level layout surfaces become transparent when a custom background is active, while inner cards/sheets can still stay readable

3. Stop DMs from killing the wallpaper
- Remove the forced wallpaper suppression in:
  - `src/pages/Messages.tsx`
  - `src/index.css` (`html[data-dm-active="true"] body { background-image: none !important; }`)
- Keep DM readability by using chat-level surfaces/overlays instead of disabling the global background entirely

4. Remove the split-brain settings behavior
- Update `src/components/settings/ThemeCustomizer.tsx`
- Update `src/components/settings/BackgroundCustomizer.tsx`
- Update `src/hooks/useCustomTheme.ts`
So the settings screen reflects the real active background from the background library/provider, not stale theme-token background state

5. Finish the visual layer cleanly
- Either:
  - wire opacity/blur to a real CSS-backed background layer, or
  - temporarily simplify/remove those controls if they cannot be made reliable in this pass
- I’ll keep the final result clean: no dead sliders, no fake “applied” state

Files to update:
- `src/components/layout/AppBackground.tsx`
- `src/components/layout/AnimatedRoutes.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/pages/Messages.tsx`
- `src/index.css`
- `src/components/settings/ThemeCustomizer.tsx`
- `src/components/settings/BackgroundCustomizer.tsx`
- `src/hooks/useCustomTheme.ts`

Acceptance criteria:
- Upload/select a custom background and it immediately replaces the app background
- Refresh the app and the same background still shows
- Open Messages and the custom background still remains visible
- Settings shows the correct currently active background
- No more cases where theme changes or DM route logic silently remove the wallpaper
- The result looks intentional and clean, not like a transparent/buggy overlay hack

No backend/database changes are needed for this fix; this is a frontend architecture and CSS cleanup issue.
