# Redesign "Design Your VYBE" + fix duplicate Terms step

## Problems found

**Duplicate Terms step (real bug):** `src/pages/Onboarding.tsx` renders the same `LegalAcceptance` component for both `case 5` and `case 6` of `renderStep()`. Whether the user has a username or not, the math (`getActualStep = step + 1` when no username, `TOTAL_STEPS = 6` when they do) lands users on the Terms screen on **two consecutive steps**. They have to accept and click Next twice on what looks like the exact same page.

**"Design Your VYBE" (`AIVybeDesigner.tsx`) issues:**
- 917-line monolith with 7 step states (`intro` → `vibe-select` → `font-select` → `animation-select` → `prompt` → `building` → `confirm` → `preview`). Way too long to design through.
- Crash risk: theme "revert" stores a JSON string of computed CSS values, then writes them back via `style.setProperty`. If anything throws between the snapshot and the apply (network failure, malformed AI response), the user is stuck with a broken theme and no way out except a manual settings reset.
- Visual noise: every text node has `drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]` hardcoded — looks muddy on light themes and competes with the gradient glow background.
- Phase animation uses chained `setTimeout` with no cleanup — if the user backs out mid-build, timers keep firing and call `setBuildPhase` on an unmounted-but-remounted component.
- "Try Different Style" resets to `vibe-select` but keeps the previous applied theme on screen for a frame, causing a flash.
- Confirm step is redundant: user already picked everything, watched a 4-second build animation, and now has to confirm before the *preview* — which is itself another confirm step.

## What we'll build

### 1. Fix the Onboarding terms duplication

In `src/pages/Onboarding.tsx`:
- Drop one of the duplicate Terms cases. Make Terms the final step exactly once.
- Recompute `TOTAL_STEPS` (5 with username, 4 without) and the `stepLabels` array to match.
- Update `getActualStep` and `canProceed` so step 5 (or 4) is the only Terms step.

Net effect: users see Terms exactly once, at the end.

### 2. Rewrite Design Your VYBE as a clean 3-step flow

New file: `src/components/onboarding/AIVybeDesigner.tsx` (full rewrite, replacing the 917-line version).

The new flow:

```text
┌──────────────────────────────────────────┐
│ STEP 1 — VIBE                            │
│  • Pick a personality (8 options)        │
│  • Tap a preset OR type your own prompt  │
│    in the same panel (no separate step)  │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│ STEP 2 — STYLE                           │
│  • Font pairing                          │
│  • Motion preset                         │
│  Both on one screen (segmented controls) │
└──────────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────────┐
│ STEP 3 — PREVIEW                         │
│  • Build animation plays inline          │
│  • Live preview cards appear under it    │
│  • Two buttons: Keep / Try Again         │
│  • Subtle "Revert" link if needed        │
└──────────────────────────────────────────┘
```

Drops `intro`, `prompt`, and `confirm` as separate steps (intro becomes the first paragraph of step 1, prompt is inline, confirm is removed because preview already lets you back out).

### 3. Premium animations & visuals

- **Aurora background:** single subtle conic gradient that gently pans (one `transform` animation, no chained spinners). Replaces the heavy rotating ring around the VybeMiniIcon.
- **Step transitions:** unified 350ms `EASE_OUT_EXPO` slide+fade (matches the Premium Motion Standards memory).
- **Vibe tiles:** soft scale + glow on selection using a single Framer Motion `layoutId` so the highlight ring smoothly travels between tiles instead of toggling.
- **Build phase:** progress arc that fills in real time around the VYBE icon, phase labels cross-fade on top. Replaces the current progress-rings + separate label stack.
- **Preview reveal:** mock cards stagger-in (50ms each) using `motion.div` with `initial/animate` derived from a single parent variant.
- **Removed:** every hardcoded `drop-shadow-[...]` — text uses `text-foreground` / `text-muted-foreground` so it adapts to whatever theme is being previewed.

### 4. Crash-proofing

- **Snapshot safety:** wrap the snapshot capture and revert in try/catch. If revert fails, call `themeReset.resetToDefault()` (already exists in `src/lib/themeReset.ts`) as a guaranteed fallback.
- **Cleanup phase timers:** replace the chained `setTimeout` recursion with a single `useEffect` that schedules an interval and clears it on unmount or when `step !== 'building'`.
- **AbortController on unmount:** the existing `abortControllerRef` is created but never aborted on unmount — wire it into the cleanup function so leaving mid-generation cancels the edge-function call.
- **Defensive AI parsing:** if `data.theme` is missing required tokens (`--background`, `--foreground`, `--primary`), don't apply it — show "Try again" with a toast instead of writing garbage CSS variables that could brick the screen.
- **Reduced-motion respect:** check `prefers-reduced-motion` once and short-circuit decorative animations (background pan, build rings) to fades. Prevents jank on low-end Android devices.

### 5. Files touched

| File | Change |
|---|---|
| `src/pages/Onboarding.tsx` | Remove duplicate Terms case in `renderStep`, fix `TOTAL_STEPS`, `getActualStep`, `canProceed`, and `stepLabels`. |
| `src/components/onboarding/AIVybeDesigner.tsx` | Full rewrite (~917 lines → ~450 lines). |
| `src/components/onboarding/VybeGenerationAnimation.tsx` | Simplify to a single progress arc + phase label; drop the multi-ring overlap. |
| `src/components/onboarding/FontSelector.tsx` | No code change — gets reused inside the new combined Style step (cleaner spacing only if needed). |
| `src/components/onboarding/AnimationSelector.tsx` | Same — reused inside Style step. |

Nothing else needs to change. The two unused legacy files (`src/components/onboarding/DesignYourVybe.tsx` and `src/components/settings/DesignYourVybe.tsx`) are referenced nowhere — they're dead code, but I'll leave them alone unless you want them deleted.

### Out of scope

- The settings-page customizer (`UIBuilder.tsx`) — separate component, not what users see during onboarding.
- The edge function that generates themes (`generate-advanced-theme`) — keeping the same contract.
- Backend / DB — pure client-side rewrite.
