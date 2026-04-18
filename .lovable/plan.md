

### Goal
Fix the chaotic flashing aura that appears on the avatar when the remote user leaves a persistent call (the "they can rejoin" state). Replace it with a calm, aligned, satisfying "standby" pulse.

### Root cause
In `GlobalCallOverlay.tsx` (lines ~1010-1068), when `remoteUserLeft === true` the avatar block keeps rendering ALL of these on top of each other:
1. `AudioVisualizer` — driven by remote stream that no longer exists, producing random flicker
2. Primary purple expanding ring (3s loop)
3. Accent expanding ring (3s loop, 0.8s delay)
4. Blurred gradient glow (4s scale loop)
5. Avatar wrapper scale pulse (3s loop)

All five animate simultaneously with mismatched timings → "weird aura flashing." None are centered to a single rhythm, and the visualizer reacts to a dead stream.

### Fix
In the audio-call avatar block, branch on `remoteUserLeft`:

**When connected & remote present** → keep current rings (active call vibe).

**When `remoteUserLeft` is true** → render a "standby" aura instead:
- Hide `AudioVisualizer` entirely (no stream to react to).
- Replace the 3 mismatched rings with **one** slow, perfectly centered breathing ring (6s ease-in-out) using a soft amber/white tone to signal "waiting."
- Add **one** very subtle second ring at 50% opacity, same timing, slightly larger — synchronized, not staggered.
- Keep the avatar itself with a gentle, slower scale breath (5s) matched to the ring rhythm.
- Desaturate the avatar slightly (`opacity-80`) to reinforce the "paused" feeling.

All animations share the same 6s cycle so they pulse **together** — that's what makes it satisfying instead of chaotic.

### File to edit
- `src/components/call/GlobalCallOverlay.tsx` — lines ~1014-1048 (audio-call avatar visualizer + rings block). Wrap existing rings in `{!remoteUserLeft && (...)}` and add a new `{remoteUserLeft && (...)}` block with the calm synchronized standby aura.

### Expected result
When the other person leaves a Stay-On call, the avatar gently breathes with one aligned soft ring — calm, centered, and visually obvious that the call is waiting for rejoin rather than actively connected. No more flicker fight.

