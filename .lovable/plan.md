# Fix glitchy compass on FriendMap

## Root cause

In `src/pages/FriendMap.tsx` (Heading-up compass effect, lines ~818–895), the same handler is registered for **both** `deviceorientationabsolute` and `deviceorientation`. On Android Chrome, both events fire — but they use different reference frames:

- `deviceorientationabsolute` → true compass-referenced (north = 0°)
- `deviceorientation` → device-relative (alpha is arbitrary, drifts)

Because both feed the same smoothing accumulator with conflicting raw values, the map snaps back and forth between the two frames every few frames. That is the "glitchy" rotation in the screen recording.

A secondary issue: when iOS doesn't apply (no `webkitCompassHeading`), the code accepts `e.alpha` from a relative event with `e.absolute === false`, which is meaningless as a compass reading.

## Fix

Update the heading-up `useEffect` in `src/pages/FriendMap.tsx`:

1. Build two handlers from a `makeHandler(isAbsoluteSource)` factory.
2. Track `gotAbsolute`. Once a true absolute reading is seen, the relative handler short-circuits and is ignored for the rest of the session.
3. In the relative handler, also bail out when `e.absolute === false` and `webkitCompassHeading` is absent (prevents bogus alpha-only rotation on Android before the first absolute event arrives).
4. Register `absoluteHandler` for `deviceorientationabsolute` and `relativeHandler` for `deviceorientation`; remove the matching listeners on cleanup.

No other behavior changes — smoothing, screen-orientation compensation, iOS permission prompt, the 2.5s "no compass" timeout, and the manual two-finger twist gesture all stay as-is.

## Files changed
- `src/pages/FriendMap.tsx` — only the `headingUp` `useEffect` block
