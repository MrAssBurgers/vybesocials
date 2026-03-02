

## Fix: Comment Dropdown Shifting on Hover

### Root Cause
The dropdown menu shifts the three-dot icon when opened because of two conflicting styles:

1. **`style={{ position: 'absolute' }}`** on the `DropdownMenuContent` -- This fights with Radix's Portal positioning system. Radix Portals render content at the document root and use their own internal positioning (CSS transforms + fixed positioning). Overriding with `position: absolute` causes it to position relative to the wrong ancestor, shifting the layout.

2. **Bubble-pop animation** starts at `scale(0.8)` and grows to `scale(1)`. Combined with the broken positioning, this makes the dropdown visually "push" elements around as it animates in.

### Fix (single file change)

**`src/components/comments/CommentItem.tsx`** -- Update the `DropdownMenuContent` props:

- **Remove** `style={{ position: 'absolute' as const }}` -- let Radix handle positioning via its Portal
- **Remove** `collisionPadding={8}` -- unnecessary with `avoidCollisions={false}` and can cause micro-adjustments
- **Keep** `avoidCollisions={false}`, `align="end"`, `side="bottom"`, `sideOffset={4}`
- **Keep** `will-change-transform` and `border border-solid border-border`
- **Replace** `origin-top-right` with the Radix CSS variable `origin-[var(--radix-dropdown-menu-content-transform-origin)]` so the animation scales from the correct anchor point (matching the base component)

This ensures the dropdown renders in a fixed position via Radix's built-in Popper, does not interfere with the trigger button's layout, and animates smoothly from the correct origin.

