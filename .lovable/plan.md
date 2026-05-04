## Problem

1. **Identity mismatch.** The sidebar profile card shows the stored `display_name` ("MrAssBurgers"), while the home greeting shows `@username` ("@Bakrix"). The user expects both to reflect the same current identity ("Bakrix").
2. **Text flicker.** `StyledUsername` mounts as plain text first, then re-renders with the gradient/name-color once the `useDisplayStyle` query resolves. On every navigation the cached badge query re-runs its render cycle, causing visible flashes on usernames in the sidebar, greeting, headers, etc.

## Fix 1 - Sidebar identity now matches the greeting

In `src/components/layout/Sidebar.tsx` (line ~157-167), change the profile card to render the username with the `@` prefix instead of the display name:

- Pass `preferDisplayName={false}` and `showAtSymbol` to `StyledUsername`, so the sidebar shows `@Bakrix` (matching the greeting).
- Keep the same component so badge gradient styling continues to apply.

This guarantees the left-rail label always tracks the live `profile.username` and never falls behind a stale `display_name` value.

## Fix 2 - Stop the flicker

Update `src/components/ui/StyledUsername.tsx`:

- Render the **plain name immediately with its final layout** (same `display:inline-block`, same className) and only swap in gradient styles **after** `useDisplayStyle` returns. Today the component returns two structurally different `<span>`s, which forces React to repaint and the browser to recompute the gradient — that's the visible flash.
- Use a single `<span>` whose `style` object is built once per render. When badge data is still `undefined` (loading), apply `color: 'inherit'` with no gradient. When it resolves, apply the gradient style. Because the element identity stays the same, there's no remount flash.
- Add `contain: 'paint'` to the gradient style so the browser doesn't repaint surrounding text when the gradient swaps in.

Update `src/hooks/useDisplayStyle.ts`:

- Add `placeholderData: (prev) => prev` and bump `staleTime` so re-mounts (route changes, sidebar toggling, etc.) reuse the cached badge style synchronously instead of going through a loading state.
- Add `refetchOnMount: false` and `refetchOnWindowFocus: false` for the same reason — badge styles change rarely.

These two changes together eliminate the "name pops in / restyles" flash the user is seeing on `@Bakrix`, the sidebar name, and any other place `StyledUsername` is used.

## Files to edit

- `src/components/layout/Sidebar.tsx` - sidebar profile card now renders `@username`
- `src/components/ui/StyledUsername.tsx` - single-span render to remove the restyle flicker
- `src/hooks/useDisplayStyle.ts` - cache placeholder + no refetch on mount/focus

## Out of scope

No DB or auth changes. No edits to the greeting widget (it's already correct). No changes to the display-name field itself — the user can still set a custom display name later; this just makes the sidebar consistent with the greeting today.
