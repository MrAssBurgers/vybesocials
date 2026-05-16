## Goal

Four targeted fixes on the profile + security:

1. Show **live Spotify "Now Playing"** card on the profile (with play in Spotify + listen-along, real beat-matched waveform).
2. Make **age display** actually show on the profile when `show_age` is enabled.
3. Fix **2FA toggles** (Email 2FA + Login Approvals) so they stay enabled after a refresh.
4. Tighten the **profile "hat"** (`ProfileHeroCard`) so the score / badges / age are clean and organized; the "body" (bento + about) stays as-is.

---

## 1. Live Spotify card on profile

Add a new component `src/components/profile/ProfileNowPlayingLive.tsx` rendered inside `ProfileHeroCard` (below the about-me block, top of bento area in `Profile.tsx`). It uses the existing `useLiveMusicPresence(profile.user_id)` hook (already wired to `live_music_presence` realtime).

The card shows:
- Album art (44×44), track title, artist, "Listening on Spotify" label with green pulse.
- **Live progress bar** that interpolates locally between server pushes (already done in `NowPlayingCard`).
- **Beat-matched waveform**: 16 vertical bars whose height oscillates on a tempo derived from track `duration_ms`/section position. Since the Spotify Web API "Audio Analysis" endpoint gives real beats, extend `spotify-now-playing` edge function to also pull `/v1/audio-features/{track_id}` and store `tempo` (BPM) and `energy` on `live_music_presence` (new nullable columns). The waveform then animates at `60_000 / tempo` ms per beat with amplitude scaled by `energy`. Falls back to current CSS pulse if no tempo.
- Two action buttons:
  - **Open in Spotify** → `track_url` (works for everyone).
  - **Listen along** → calls a new edge function `spotify-listen-along` that uses the *viewer's* Spotify access token to `PUT /v1/me/player/play` with `uris: [track.uri]` and `position_ms: presence.progress_ms`. If the viewer has no Spotify connection, button opens the Spotify connect flow first. Resyncs every 10s while the toggle is on.

The card is shown on every profile (not just own) and hidden when `presence.is_playing` is false.

## 2. Age visibility fix

`ProfileAboutDetails` already renders Age when `about.show_age && birthday`. Two real bugs:
- Profile page passes `(profile as any).date_of_birth || (profile as any).birthday`. Confirm the column on `profiles` is actually named `date_of_birth`; if it lives only in `user_about` or on the auth metadata, plug the right source. Add a tiny fallback: if no birthday but the `user_about` row has one, use that.
- Also surface age in the **profile hat** as a compact pill next to the @handle (only when `show_age` is on and birthday exists), so it's visible without scrolling — matches the user's request that it show in the "profile hat".

## 3. 2FA toggle persistence

Symptoms: toggle flips, "Saved" toast, but next visit it's off. Root causes & fixes:
- `Switch onCheckedChange` runs `updateSetting` which does an `upsert(..., { onConflict: 'user_id' }).select(...).single()`. The current RLS UPDATE policy on `user_2fa_settings` has `USING (auth.uid()=user_id)` but **no WITH CHECK**. On some Supabase setups the upsert path takes the INSERT branch first and the row already exists, returning the *old* row via RETURNING. Replace the client logic with: call a SECURITY DEFINER RPC `update_2fa_settings(p_email boolean, p_approvals boolean)` that does a plain `UPDATE ... RETURNING *` after `ensure_2fa_settings()`. Use the returned row to set state. This eliminates the upsert/RLS edge cases and guarantees the persisted values come back.
- Also add an `updated_at` trigger so we can see staleness in the dashboard.
- Verify by re-mounting `SecuritySection` after save and reading from the table directly.

## 4. Profile hat cleanup

`ProfileHeroCard` currently stacks: name row → @handle → VybeScore → status pill → badges/title. On 384px width it wraps and looks busy. Reorganize into a clear two-row identity block:

```text
[ avatar ] Bakrix [crown] [vip]            [⚙] [↗]
           @bakrix · 27 · ESTP
           ─────────────────────────────
           [⚡ 0 vybe]  [🔥 status]  [badges +3]
```

Specifically:
- One name row with name + role badges only.
- Sub-row: `@username · age · MBTI` (only the parts present), small muted text.
- `VybeScore`, status pill and badge row become a single horizontally-scrolling chip strip below, with consistent pill height (24px).
- Stats capsules (Posts / Followers / Following) keep current spot but get equal flex widths so the row is symmetric.
- Remove the `bg-card/40` overlay's heavy darkening; rely on the gradient + border for the glass look so the score & badges read cleanly.

No business-logic changes for the hat beyond surfacing age + reorganizing.

---

## Technical notes

- DB migration: add `tempo numeric`, `energy numeric` to `live_music_presence`; add SECURITY DEFINER `update_2fa_settings(boolean, boolean)` with `SET search_path = public`.
- Edge functions:
  - `spotify-now-playing`: after fetching the track, fire-and-forget fetch `/v1/audio-features/{id}` and include `tempo`/`energy` in the upsert.
  - new `spotify-listen-along`: validates viewer JWT, loads viewer's spotify tokens (refresh if needed), `PUT /me/player/play` with target `uris` + `position_ms`.
- Frontend:
  - New `ProfileNowPlayingLive.tsx` (uses `useLiveMusicPresence`).
  - `ProfileHeroCard.tsx`: layout reorg + inline age + chip strip.
  - `SecuritySection.tsx`: swap upsert for new RPC; keep optimistic UI.
  - `Profile.tsx`: render `<ProfileNowPlayingLive authUserId={profile.user_id} />` between the hero card and bento.

## Out of scope

- No changes to the actual Spotify OAuth flow (already fixed previously).
- No edits to the bento body other than the new live card slot above it.