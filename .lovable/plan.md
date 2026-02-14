
# Fortnite-Style Locker UI Overhaul

## Overview
Replace the current collapsible accordion layout with a Fortnite-inspired horizontal tab bar at the top. Each category (Badges, Name Colors, Titles, Effects, Frames, Themes, Shop) becomes a tab. When you select an item, a dedicated "Equip" / "Equipped" button appears at the bottom -- just like Fortnite's locker.

## Layout Structure

```text
+------------------------------------------+
|  [Header: Your Locker / Level badge]     |
+------------------------------------------+
| Badges | Colors | Titles | Effects | ... |  <-- horizontal scrollable tabs
+------------------------------------------+
|                                          |
|   Grid of items for active tab           |
|   (cards with icon, name, level)         |
|                                          |
+------------------------------------------+
|  [ Selected Item Preview ]               |
|  Name + Description + Level req          |
|  [====== EQUIP / EQUIPPED button ======] |  <-- bottom action bar
+------------------------------------------+
```

## What Changes

**Tab Bar (top)**
- Horizontal scrollable row of icon+label tab buttons
- Active tab gets a highlighted/filled style with a sliding indicator (using framer-motion layoutId)
- Tabs: Badges, Colors, Titles, Effects, Frames, Themes, Shop
- Scrolls horizontally on mobile so all tabs are accessible

**Item Grid (middle)**
- Shows items for the currently selected tab
- Each item card shows: icon/swatch, name, level, lock icon if locked, green checkmark if equipped
- Clicking an item selects it (highlighted border) but does NOT immediately equip
- Selected item state is local -- separate from equipped state

**Bottom Action Bar**
- Appears when an item is selected
- Shows selected item name, description, and level requirement
- Large "EQUIP" button (green/primary) when item is not equipped
- Shows "EQUIPPED" (with checkmark, muted style) when item is already equipped -- clicking it unequips
- "LOCKED" button (disabled, gray) for locked items
- Smooth slide-up animation when selection changes

**Badges tab** keeps its current content (earned badges grid, visibility toggles, locked badges) since badges don't have equip/unequip mechanics -- they work differently.

## Technical Details

### File: `src/components/profile/ProfileLocker.tsx` (full rewrite)

**State Changes:**
- Add `activeTab` state (string, default "badges")
- Add `selectedItem` state (LockerItem or null) -- tracks which item is highlighted but not yet equipped
- Remove the `LockerSection` collapsible component entirely

**Tab definitions:**
```
const TABS = [
  { id: 'badges', label: 'Badges', icon: Award },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'frames', label: 'Frames', icon: Diamond },
  { id: 'themes', label: 'Themes', icon: Layers },
  { id: 'shop', label: 'Shop', icon: ShoppingBag },
]
```

**Tab Bar Component:**
- Horizontal flex container with `overflow-x-auto scrollbar-hide`
- Each tab button shows icon + label, uses `layoutId="locker-tab-indicator"` for a smooth sliding active background
- Active tab gets a filled primary background pill

**Equip Button Logic:**
- When a cosmetic item (not badge) is selected:
  - If locked: show disabled "LOCKED -- Level X" button
  - If unlocked and not equipped: show "EQUIP" button (green/gradient, full width)
  - If unlocked and equipped: show "EQUIPPED" button (secondary style with checkmark) -- clicking unequips
- The equip/unequip action calls the existing `handleEquip` function
- After equipping, the `selectedItem` stays selected so the user sees the state change

**Item Cards (updated):**
- Now have a "selected" state (blue/accent border highlight) separate from "equipped" (green checkmark)
- Single click = select (shows in bottom bar)
- The equip action only fires from the bottom button

**Animations:**
- Tab content transitions with fade + slight slide
- Bottom action bar slides up with spring animation when item selected
- Tab indicator uses framer-motion `layoutId` for smooth sliding between tabs

### Existing sub-components kept:
- `CosmeticCard`, `NameColorCard`, `ThemeCard` -- updated to accept `isSelected` prop for selection highlight, and remove the direct `onToggle` click (replaced with `onSelect`)
- Badge section content stays the same (grid of earned/locked badges + visibility toggles)

### No other files change
This is entirely contained within `ProfileLocker.tsx`.
