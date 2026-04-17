

## Two-Part Fix

### Part 1 — Confetti behavior (precise fix)

**The bug:** `CaughtUpScreen.tsx` auto-fires the full-screen `Confetti` component every time it mounts. That component spans the whole viewport and rains 100 pieces from the top of the screen — which is exactly what you're seeing every time you land on Home (the "you're all caught up" empty state mounts on every visit).

**The fix:**
1. **Remove the auto-confetti from `CaughtUpScreen.tsx`.** Drop the `showConfetti` state, the `useEffect` timer, and the `<Confetti />` render. The screen still has its own subtle checkmark + emoji rotation — that's enough.
2. **Add a "burst" mode to the welcome-back splash itself.** `WelcomeBackSplash.tsx` already has a 24-particle radial burst that fires from the avatar center when it dismisses. I'll upgrade that burst:
   - Bump particle count (24 → 60)
   - Wider color palette (match brand neon)
   - Longer travel distance + slight gravity arc (particles fall a bit at the end instead of just shrinking)
   - Slightly longer duration (0.7s → 1.1s) so it reads as one continuous "shoot from your avatar" motion as the splash dissolves
3. **Result:** Confetti only happens on actual sign-in (welcome back), shoots out *from the welcome-back card* in one smooth motion, and never auto-plays on Home again.

Other confetti sources stay intact and correct (token purchases, post publish celebration, easter egg unlocks) — those are user-triggered and contextual.

### Part 2 — "Full app scan" — scope check

Honest read: the app has 100s of components and dozens of major flows (camera, AR, DMs, calls, stories, clips, communities, marketplace, creator program, admin, payments, etc.). A real "test every single thing and fix anything I don't like" pass is not one task — it's weeks of QA. If I claim to do it in one shot I'll either miss things or change behavior you actually liked.

So instead of a vague promise, I'll do a **focused polish pass** on the highest-traffic surfaces — the ones every user touches every session. If you approve this scope, I'll cover:

1. **Home feed** — story rail tap response, post card lift/tap settle, like/save/share wired to the existing `heartPop`/`saveFold`/`shareFly` variants, scroll smoothness
2. **Bottom nav** — verify magic-move indicator, tap haptics, no flash-of-wrong-tab on route change
3. **Post detail / comments sheet** — open/close spring, drag-to-dismiss, keyboard behavior
4. **DMs list + thread** — open animation, message entry stagger, send button press
5. **Profile** — tab switch (layoutId), stat number flips using the new `AnimatedNumber`
6. **Camera entry** — capture button feel, mode switch, permission gate
7. **Toasts + sheets** — verify all use the standardized liquid spring, no jarring fades
8. **Reduced-motion respect** — confirm the global `MotionConfig` actually disables springs for users who set it

For each surface I'll: read the code, fix anything obviously broken or janky, apply the existing motion primitives where they're missing, and note (not silently change) anything that looks intentional but rough.

**What I will NOT touch in this pass** (unless you ask): admin/owner panels, payment flows, AR filter pipeline, calling system internals, AI safety scan UI, the marketplace, anything monetization-related. Those are sensitive and need targeted asks.

### Files

**Part 1 (3 files):**
1. `src/components/home/CaughtUpScreen.tsx` — remove auto-confetti
2. `src/components/ui/WelcomeBackSplash.tsx` — upgrade burst (more particles, wider spread, gentle arc, longer duration)
3. No third file — `Confetti.tsx` itself stays unchanged (still used by token marketplace + easter eggs)

**Part 2 (~10–15 files):** scoped to the surfaces listed above. Exact list will be reported in the implementation summary.

No DB changes. No new packages.

