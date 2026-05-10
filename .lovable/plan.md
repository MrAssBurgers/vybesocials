## Goal
Make the marketing page on `/vybe-home` honest in two more ways:
1. The "Because none of them do this" comparison table currently lies about Instagram and Snap.
2. The phones in the hero and feature rows are **React-drawn fake UI** (`FeedPhone`, `ChatPhone`, `MapPhone`, `DNAPhone`, `AuraPhone`, `FriendLinkPhone`, `SnapPhone`). You want **real screenshots of the actual app** in those frames.

---

## Part 1 — Comparison table truth pass (`VybeHome.tsx` lines 935-942)

Two rows are factually wrong:

| Row | Today | Truth | Fix |
|---|---|---|---|
| `Live friend map + bump` | Snap=❌ | Snap has Snap Map (friend map). The *bump* part is VYBE-only. | Rename row to **"Tap-to-add (NFC bump)"** — keep Snap=❌, IG=❌, Discord=❌. Honest + still VYBE-unique. |
| `Built-in AI assistant` | IG=❌, Snap=❌ | Instagram has Meta AI, Snap has My AI. | Rename row to **"AI assistant trained on *your* DNA"** — keep IG=❌/Snap=❌ honestly (their assistants aren't personalized to your behavioral vector). |

All other rows stay (Evolving personality engine, Customizable everything, Disappearing snaps Snap=✓, Communities & spaces Discord=✓, Creator payouts 60-70%).

---

## Part 2 — Replace fake phone mockups with real app screenshots

### What's there now
Lines 793-883 render seven hand-coded React components inside a `<PhoneFrame>` (just a black rounded div). They're 100% fabricated UI — not actual app pixels.

### What we'll do
1. **Capture real screenshots** using the browser tool against the live preview, at iPhone-ish viewport (390×844). Screens to grab:
   - `/home` → Feed (replaces `FeedPhone` in hero + nothing else)
   - `/messages` then open a thread → Chat (replaces `ChatPhone` in hero + `SnapPhone` in "Snap · Notes · Calls" section)
   - `/map` → Friend Map (replaces `MapPhone` in hero)
   - `/dna` → VYBE DNA (replaces `DNAPhone`)
   - `/profile` (own profile in edit/aura mode) → Aura (replaces `AuraPhone`)
   - `/add-friend` → Friend Link sheet (replaces `FriendLinkPhone`)
   - `/upload` or camera screen → Snap/Camera (alternate for `SnapPhone`)

2. **Crop & save** each PNG to `src/assets/marketing/` (e.g. `screen-feed.png`, `screen-chat.png`, `screen-map.png`, `screen-dna.png`, `screen-aura.png`, `screen-friendlink.png`, `screen-snap.png`).

3. **Rewrite `PhoneFrame`** in `VybeHome.tsx` to render an `<img>` of the screenshot inside the existing notch/bezel chrome (keep rounded corners, status bar, drop shadow — only the inner content becomes a real image).

4. **Delete the seven fake components** (`FeedPhone`, `ChatPhone`, `MapPhone`, `DNAPhone`, `AuraPhone`, `FriendLinkPhone`, `SnapPhone`) and replace each call site with `<PhoneFrame src={screenFeed} />` style usage.

5. Keep the floating animation (`motion.div` y-bobbing) and layered z-index in the hero — only the inner content swaps from drawn-UI to a real `<img>`.

### Auth requirement (need your input)
Most of the screens above (`/home`, `/messages`, `/map`, `/dna`, `/profile`) are behind auth. The browser tool inherits the preview's logged-in session, so:

> **Please make sure you're already logged into the preview iframe** before I run. If you're not, the screenshots will show the auth screen instead of the real app and I'll have to stop and ask you to log in.

Confirm and I'll proceed.

### Out of scope
- No backend, RLS, or routing changes
- No design-system token changes
- Other marketing pages (`/features`, `/about`, `/safety`) untouched

### Files touched
- `src/pages/VybeHome.tsx` (table rows + phone components + PhoneFrame)
- `src/assets/marketing/*.png` (new — real app screenshots)

### Verification
After implementation:
- Comparison table reads honestly for IG/Snap on the AI and friend-map rows
- Every phone on `/vybe-home` shows actual app pixels, not drawn UI
- Hero phones still bob/float and layer correctly
- Page still renders fine on mobile (`lg:hidden` fallback shows the real Feed screenshot)
