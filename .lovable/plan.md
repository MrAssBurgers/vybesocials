## Autonomous VYBE DNA Agent

Turn VYBE DNA from a passive personality view into an **autonomous AI agent** that silently watches what the user does, decides what to change, and reshapes their experience — feed weights, theme colors, home layout, suggested people, and even nudges — without the user having to ask.

### Concept

Every few hours (and after notable events), an "Auto-Pilot" agent runs in the background:

1. Pulls the user's last 30 days of behavior (existing `vybe_dna`, `dna_content_preferences`, recent posts/likes/follows/saves/sessions).
2. Asks Lovable AI ("VYBE Auto-Pilot") to *decide* what should change for this person, returning a structured JSON action plan.
3. Applies those actions atomically to the user's tables — boost/reduce topics, swap theme palette, reorder home widgets, suggest creators, surface a personalized nudge.
4. Logs every change in a new `dna_agent_actions` audit trail so the user can see "what the AI changed for you" and undo anything.

The user can leave it 100% autonomous, set it to "Suggest only" (review before applying), or pause it.

### What changes for the user

- **Feed personality** — boost/reduce topics in `dna_content_preferences` based on what they've actually engaged with this week.
- **Theme & vibe** — agent picks signature colors, gradient, glyph pattern, and aura intensity, writes them into a new `dna_auto_theme` table that `useApplyThemeFonts` reads first.
- **Home layout** — agent reorders/visibility-toggles widgets in `useHomeLayout` (e.g. surface "Local" if you scroll local posts; demote "Events" if you ignore them).
- **Suggested people** — agent picks 3–5 high-DNA-similarity creators and pins them to a "Made for you" rail.
- **Smart nudges** — one short context-aware note in the new "Auto-Pilot" inbox ("You've been quiet on Clips — want to try the new music trend?").

### New DNA "Auto-Pilot" UI on `/vybe-dna`

- Hero card at the top: pulsing AI orb, "Auto-Pilot ON · Last tuned 2h ago", toggle row (Off / Suggest / Autonomous).
- "What I changed for you" timeline: each `dna_agent_actions` row rendered as a card with icon, plain-language summary, before→after diff, and an Undo button.
- "Run Auto-Pilot now" button for instant re-tune.
- A live "Confidence" meter showing how much data the agent has to work with.

### Data model

New tables (RLS: user can read/update own only):

- `dna_auto_theme` — `user_id`, `signature_colors jsonb`, `gradient`, `glyph_pattern`, `aura_intensity`, `applied_at`.
- `dna_agent_actions` — `id`, `user_id`, `action_type` (`feed_tune`, `theme_swap`, `layout_change`, `suggest_user`, `nudge`), `summary`, `before jsonb`, `after jsonb`, `applied bool`, `reverted bool`, `created_at`.
- `dna_agent_settings` — `user_id PK`, `mode` enum (`off` / `suggest` / `autonomous`, default `suggest`), `last_run_at`, `cadence_minutes` (default 360).

### Backend

- **Edge function `dna-autopilot`** — accepts `{ trigger: 'manual' | 'cron' }`, fetches DNA + recent activity, calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with **tool calling** for structured output (one tool per action type), validates each action, applies it (or stores as `applied=false` if mode is `suggest`), and writes `dna_agent_actions`.
- **Cron** — `pg_cron` job every 6 hours invoking `dna-autopilot` for users whose `dna_agent_settings.mode != 'off'` and `last_run_at < now() - cadence`. Use the `supabase--insert` flow (not migrations) so it carries the project-specific URL + anon key.
- **Edge function `dna-autopilot-revert`** — accepts `action_id`, restores `before` snapshot, marks `reverted=true`.

### Frontend

- New hook `useDNAAutoPilot()` — exposes `settings`, `actions`, `runNow()`, `setMode()`, `revert(actionId)`.
- `src/components/dna/DNAAutoPilot.tsx` — the hero card + mode toggle + timeline, mounted at the top of `VybeDNA.tsx`.
- `useApplyThemeFonts` patched to prefer `dna_auto_theme` over the user's saved theme when present and Auto-Pilot is on.
- `useHomeLayout` patched to merge auto-pilot layout overrides on top of user prefs.
- A subtle floating toast appears in-app when a new autonomous change happens: "VYBE tuned your feed · See what changed".

### Technical details

- Tool schemas (one tool per action) keep the agent's output validated and safe — no free-form JSON parsing.
- Each apply step writes the `before` snapshot first so revert is trivial.
- Hard caps per run (max 1 theme change, 3 feed tunes, 1 layout change, 1 nudge) so the experience never feels chaotic.
- Rate-limit handling for 429/402 from the gateway, surfaced as a toast.
- All RLS policies use `auth.uid() = user_id`; agent edge function uses the service role key only after validating the JWT (same pattern as `dna-chat`).
- `useApplyThemeFonts` and `useHomeLayout` reads gated behind `authReady` to avoid the standard query-guard issue.

### Memory

If approved, save a memory describing the autonomous-agent architecture (action schema, cadence, revert flow) so future work stays consistent.
