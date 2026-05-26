## My VYBE Theme — Showcase, Share & Send

Add a polished "My Current VYBE" card at the top of Settings → Themes → Customize that previews the user's live theme and unlocks a unified Share flow (public, unlisted link, friends-only DM, or private snapshot). Received themes open in a fullscreen preview sheet with one-tap Equip that instantly applies + auto-saves.

### 1. `MyCurrentVybeCard` (new) — top of Customize tab

Replaces empty space at top of `ThemesSection`'s Customize tab.

- Live mini-preview: rounded card rendered with the user's actual `--primary / --secondary / --accent / --background` tokens, a fake mini chat bubble, a gradient button, a swatch row (4 dots), and a soft animated gradient halo behind it.
- Title shows the theme's name (or "Untitled VYBE" with inline rename pencil).
- Two CTAs:
  - **Share** (primary, gradient) → opens `ShareMyThemeSheet`
  - **Snapshot** (ghost) → silently saves current tokens to My Themes as a private entry
- Footer micro-stats if already shared: likes • saves • "Shared 3d ago".

### 2. `ShareMyThemeSheet` (new) — bottom sheet

Three vertically stacked, tappable visibility cards (user picks one path, no commit until they confirm — matches "let the user decide"):

```text
┌─────────────────────────────────────┐
│  ◉ Public                           │
│    Listed in Browse, anyone can     │
│    equip. Earns likes + saves.      │
├─────────────────────────────────────┤
│  ◉ Unlisted link                    │
│    Only people with the link.       │
│    [ Copy link ]                    │
├─────────────────────────────────────┤
│  ◉ Send to friends                  │
│    Pick friends → sends as DM.      │
│    [ avatar avatar avatar + ]       │
├─────────────────────────────────────┤
│  ◉ Private snapshot                 │
│    Just save to My Themes.          │
└─────────────────────────────────────┘
        [   Share   ]
```

- Name + optional description fields above the cards (prefilled from current theme).
- "Send to friends" expands an inline friend picker (reuse existing `ShareSheet` friend list source).
- Share button text adapts: "Publish" / "Copy link" / "Send to N friends" / "Save".
- Single mutation underneath: always creates a `shared_themes` row; `is_public` true only for Public path; for Unlisted & Friends, `is_public=false` and the row's `id` is the link slug; Friends path additionally sends a `shared_theme` DM per recipient.

### 3. DM `shared_theme` message type

- New `message_type = 'shared_theme'`; payload uses existing columns: `content = shared_theme_id`, optional `media_url = preview snapshot url` (skip for v1, render live preview from tokens).
- New `SharedThemeMessageBubble` renders a compact card in the thread:
  - 64px square live theme preview (gradient + 3 swatches)
  - Theme name + "from @sender"
  - "Tap to preview" hint
- Tap opens `ReceivedThemeSheet` (fullscreen).

### 4. `ReceivedThemeSheet` (new) — fullscreen preview

- Hero: large animated theme preview (gradient background using shared tokens, mock UI: header chip, message bubble, button, swatch row, sample text in heading font).
- Below: creator avatar + name, theme name, description, likes/downloads.
- Sticky bottom action bar:
  - **Equip** (primary, gradient) — applies tokens instantly via existing `applyThemeToDocument` helper from `useCustomTheme`, calls `useSaveSharedTheme` to auto-save to My Themes, fires haptic + toast "Equipped ✨", closes sheet.
  - **Just save** (ghost) — only saves, no equip.
- "Already equipped" / "Saved" pill states replace buttons when applicable.

### 5. Schema changes

Migration adds:
- `shared_themes`: nothing structural needed; `is_public=false` rows already supported. Add index on `id` (PK already covers).
- RLS update on `shared_themes` SELECT: allow `is_public = true OR creator_id = current_profile_id() OR EXISTS (saved_themes where shared_theme_id = id AND user_id = current_profile_id()) OR EXISTS (messages where message_type='shared_theme' AND content = shared_themes.id::text AND user is conversation member)`. Simplest: also allow SELECT when row id was sent in a DM to the requesting user.
- Add `'shared_theme'` to any messages CHECK constraint on `message_type` if one exists (verify in migration).

### 6. Routing — unlisted link

- New route `/theme/:id` → renders `ReceivedThemeSheet` standalone (works for logged-out users too, with Equip gated behind sign-in).
- Share sheet's "Copy link" copies `https://vybehub.app/theme/{id}`.

### Technical notes

- All previews use the existing `ThemeTokens` shape from `useCustomTheme`; no new format.
- Equip reuses `useApplyUserTheme` mutation path (writes to `user_themes` active row) — same as Marketplace "Apply".
- Auto-save uses existing `useSaveSharedTheme`; swallow `23505` duplicate as silent success.
- Motion: 0.4s EASE_OUT_EXPO sheet entry; gradient halo on MyCurrentVybeCard uses 300% width looping background (matches Ambient Visual standard).
- Cards use solid `bg-card` (per perf standard — no backdrop-blur in high-frequency surfaces).
- DM bubble respects `data-dm-active` visual isolation.
- All toasts gated by Premium Toast Standards (Equip toast OK — non-routine action).

### Files

**New**
- `src/components/themes/MyCurrentVybeCard.tsx`
- `src/components/themes/ThemePreviewCanvas.tsx` (reusable live token preview, used by card + DM bubble + ReceivedThemeSheet)
- `src/components/themes/ShareMyThemeSheet.tsx`
- `src/components/themes/ReceivedThemeSheet.tsx`
- `src/components/messages/bubbles/SharedThemeMessageBubble.tsx`
- `src/pages/SharedThemeLink.tsx` (route `/theme/:id`)

**Edited**
- `src/components/settings/ThemesSection.tsx` — mount `MyCurrentVybeCard` above Tabs
- `src/hooks/useSharedThemes.ts` — extend `useShareTheme` to accept `visibility: 'public' | 'unlisted' | 'friends' | 'private'` and `recipientProfileIds?: string[]`; add `useEquipSharedTheme` that applies tokens + saves in one call
- `src/lib/sendShareToUser.ts` — add `sendThemeToUser(recipientProfileId, sharedThemeId)` helper
- Messages thread renderer — route `message_type === 'shared_theme'` to new bubble
- `src/App.tsx` — register `/theme/:id` route

**Migration**
- One migration: RLS expansion on `shared_themes` SELECT for recipients; CHECK constraint update on `messages.message_type` if present.
