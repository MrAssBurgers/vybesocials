# VYBE Architecture Roadmap

Phased delivery plan for closing platform gaps. Each phase gets its own implementation plan before coding.

## Current state (Messaging Polish — Phase 1)

| Area | Status |
|------|--------|
| Vybe Snap text drag (1:1) | `SnapOverlayDraggable` shared by `VybeSnapEditor` + legacy `SnapCamera` |
| Snap entry points | `ChatView`, `ConversationList`, `CameraFirstOverlay` → `VybeSnapCamera` |
| Camera reentrancy | `VybeSnapCamera.startingRef`, `postCameraStream.acquiring`, call path waits |
| DM outbox | IndexedDB queue; flush on reconnect, online, focus, visibility, `app-resumed` |
| Snap send | Optimistic UI + failed-state retry in `ChatView.handleVybeSend`; canvas flatten on send |
| Calls resume | `GlobalCallOverlay` visibility + `app-resumed` mic/playback recovery |

## Phase 2 — Content layer polish

- Unify `/clips`, `/shorts`, `/watch` routing and nav highlights
- Ranked feed (`get_ranked_feed`) on all browse surfaces including `VideoBrowse`
- Duet/remix: implement or remove locale promises

**Exit criteria:** One canonical clips route; ranked feed parity; no dead-end upload promises.

## Phase 3 — Camera + Lenses v1

- Merge `LENS_FILTERS` presets with `Filters.tsx` marketplace
- Creator upload pipeline for static lenses
- Tier static → animated lenses without full Creator Studio scope

**Exit criteria:** Single lens catalog; upload → preview → apply path works on native.

## Phase 4 — VYBE DNA v2

- One ranking pipeline for Home, Clips, notifications
- Explainability surfaces on feed items
- Retire tag-keyword-only Home DNA where ML signals exist

**Exit criteria:** Same ranking RPC/model family across primary feeds; debug/explain panel in dev.

## Phase 5 — Community merge

- Forum threads OR merge Community channels with Spaces
- Wire Spaces UI to LiveKit/Daily for real audio (today UI-only)

**Exit criteria:** Live space join/leave with audio; thread model documented in DB.

## Phase 6 — Architecture audit document

Expand this file into full `docs/ARCHITECTURE.md` with:

1. System context diagram
2. Database schema map (auth, social, messaging, media)
3. Feed ranking pipeline
4. Messaging + outbox + realtime
5. Media upload and CDN paths
6. Native shell (Despia) constraints
7. Scaling notes: 1M / 10M / 100M users
8. Security model (RLS, storage policies)
9. Observability and incident runbooks
10. Migration safety checklist

## Out of scope without explicit approval

- Full lens Creator Studio / AI text-to-filter platform
- Client E2E encryption revival
- Competitor UI clone or rebrand
- Destructive DB migrations

## Deploy

Web production: **Lovable → Share → Publish** → https://vybehub.app  
Supabase project ref: `agtcyxjxgkdyoxwxkjth` (see `supabase/config.toml` and `AGENTS.md`)
