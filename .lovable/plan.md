

## Perfect Friend Link — Complete Polish

After reviewing the current implementation, here are the improvements I'll make to create a truly polished, delightful experience:

### Current Issues
1. **QR code uses white background** — looks jarring in dark mode
2. **No loading state** for QR code image (blank space while loading)
3. **Camera scanner has no visual scanning animation** — feels static/dead
4. **NFC tab feels empty** — just two phone icons and dots, no real sense of activity
5. **No Snapcode-style design** — QR is a plain square, not branded
6. **Floating pill blocks content** — always visible on home screen
7. **No share option** — can't share your link via native share sheet
8. **Corner brackets are tiny** — barely visible as a scanning guide
9. **No tab transition animation** between QR/NFC — feels abrupt
10. **Phase transitions lack polish** — found/exchanging/success screens are functional but bland

### Changes

**1. Snapcode-style QR card**
- Rounded card with theme-aware background (dark mode: dark card, light mode: white)
- Larger avatar overlay centered on QR with a ring pulse animation
- Username + display name below QR in clean typography
- "Share My Code" button using native Web Share API (fallback: copy link)

**2. Animated scanner experience**
- Add a scanning laser line that sweeps vertically across the camera feed
- Larger corner brackets (28px) with rounded corners and primary color glow
- Subtle pulse animation on the brackets while scanning
- Camera permission denied state with recovery button

**3. Polished NFC tab**
- Replace static phone icons with a smooth CSS animation: two phones sliding toward each other with a ripple burst at the center
- Pulsing concentric rings animation around the tap point
- Status text updates: "Searching..." → "Found nearby!" with spring animation
- Fallback message styled as a soft info card, not plain text

**4. Phase screen upgrades**
- **Found**: Add a subtle gradient glow behind the avatar, smooth scale-in animation
- **Exchanging**: Overlapping avatars with a rotating ring/spinner between them instead of plain "animate-pulse" text
- **Success**: Confetti burst (CSS-only, 6-8 small colored dots that scatter), checkmark with scale-bounce animation

**5. Remove floating pill, improve entry**
- Remove the always-visible "Friend Link" pill from home screen (per the plan's intent)
- Keep swing-to-activate gesture as the primary mobile entry
- The component will be activated programmatically or via swing only

**6. Bottom sheet UX**
- Add a drag handle bar at the top of the sheet
- Smooth spring animation on open/close
- Proper safe area insets for all iPhone models

### Files Modified
- `src/components/friends/AutoFriendDrop.tsx` — Full rewrite with all polish above

### Files Unchanged
- All hooks (`useFriendDropSync`, `useNativeFriendDrop`, `useSwingDetection`) — no changes needed
- `src/pages/Home.tsx` — still lazy-loads the component the same way

