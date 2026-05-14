# Play Store Screenshot Runbook

A repeatable process for producing the 8 phone screenshots referenced in
`PLAY_STORE_GUIDE.md`. Follow it top-to-bottom and you'll get a consistent,
ranking-friendly set every time.

## 1. Device & viewport

- **Resolution:** 1080×1920 (portrait)
- **Recommended capture device:** Pixel 7 emulator at `1080x1920` density `xxhdpi`,
  or Chrome DevTools "Custom" 360×800 with DPR 3 then export at 1080×1920.
- Disable system bars: in Chrome DevTools → "Capture full size screenshot" with
  the device toolbar enabled. In Android Studio emulator: `adb shell wm overscan 0,72,0,0`.

## 2. Demo account

Sign in with the seeded **demo creator** (or any account that has):
- 5+ stories in the rail
- ≥1 trending clip with engagement
- ≥2 active DM threads (one with media, one with reactions)
- ≥1 community joined
- A custom theme applied

## 3. Routes & captures

| # | Above-the-fold? | Route | What to show | Overlay headline | Subtitle |
|---|---|---|---|---|---|
| 1 | ★ | `/` | Home feed, stories rail visible, hero post in view | **Your social home** | All your people, in one feed |
| 2 | ★ | `/clips` | Vertical Clips, engagement bar visible | **Endless clips** | Built for short video |
| 3 | ★ | `/messages/{thread}` | DM with reactions, a GIF, and a voice note | **Chat without limits** | Reactions, voice notes, GIFs |
| 4 |   | Camera (open from `/`) | Stories editor mid-effect | **Share your VYBE** | Filters, music, AI effects |
| 5 |   | Active group call overlay | Group video call w/ 3+ avatars | **Calls with your people** | HD voice & video |
| 6 |   | `/communities` | Discovery grid w/ live Space pinned | **Find your community** | Communities & live Spaces |
| 7 |   | `/settings/themes` | Theme customizer mid-edit | **Make it yours** | Themes that adapt to you |
| 8 |   | `/settings/privacy` | Privacy/parental controls panel | **Safe by default** | Privacy you can feel |

## 4. Overlay spec (consistent across all 8)

- Headline: **Inter / SF Pro Display Bold**, 96pt, `#FFFFFF`, `text-shadow: 0 4px 24px rgba(0,0,0,0.5)`
- Subtitle: **Inter Medium**, 38pt, `rgba(255,255,255,0.85)`, 24pt below headline
- Position: bottom 22% of frame, left-aligned with 64px padding
- Background gradient strip behind text: `linear-gradient(180deg, transparent 0%, rgba(11,11,16,0.85) 100%)`, 50% of frame height

## 5. Export

- Format: **PNG**, sRGB, no transparency
- File names: `01-home.png`, `02-clips.png`, `03-chat.png`, … `08-privacy.png`
- Upload order in Play Console = file order

## 6. Localization

When duplicating the set for ES / PT / ID / FR, change ONLY the overlay text — keep the underlying screenshot identical so the visual story stays consistent.

## 7. Feature graphic (1024×500)

- Background: brand gradient `linear-gradient(135deg, #0B0B10 0%, #8B5CF6 60%, #06B6D4 100%)`
- Wordmark: VYBE logo, centered-left, white
- Headline beside it: **Make your VYBE.** — same Inter Bold, 72pt, white

## 8. Above-the-fold rule

Screenshots 1, 2, 3 are the only ones most browsers see in search results.
Never reorder them and never replace one without A/B testing the install rate.
