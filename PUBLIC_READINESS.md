# Public readiness checklist

Last reviewed: 2026-06-01

## Automated checks
- [x] `npm run build` — passes
- [ ] `npm run lint` — many pre-existing `any` rules in `src/` and edge functions (non-blocking for runtime)

## Critical paths patched this session
| Issue | Fix |
|-------|-----|
| `/friend-drop/:id` URLs 404 | New `FriendDropLink` page + route |
| Logged-out deep links lost after login | `authReturnPath` + all login paths + `ProtectedRoute` stash |
| `/add-friend` sent users to `/landing` (missing route) | Redirect to `/auth` |
| Protected routes dropped return URL | Stash path → `/auth` on sign-in required |
| Friend Drop “Add Friend” did nothing | Calls `completeFriendAdd()` |
| Despia NFC | Official one-shot read loop (`despiaNFCv2`) |
| Post camera WebView crashes | `cameraSafeMode` + `postCameraStream` (prior commit) |

## Intentionally disabled (safe for public)
- **AdSense** — `ADS_ENABLED = false`, `AdUnit` returns null
- **AR Lenses** in `Camera.tsx` — “coming soon” toast (not production AR)

## Requires your action before calling it “perfect”
1. **Lovable Publish** — production web at https://vybehub.app
2. **Despia rebuild** — NFC capability + addon, then new store binary
3. **Supabase secrets** — `RESEND_API_KEY` for branded password reset (optional fallback exists)
4. **Env in Lovable Cloud** — `VITE_SUPABASE_*` must match project `hprmicwhlaaqfgshucec`

## Manual smoke test (30 min)
- Sign up / log in / forgot password / reset password
- Create → Post camera (Play Store app)
- Friend Link: QR + two-phone NFC tap
- Open shared link logged out → log in → lands on friend add
- Upload photo + short video
- DM send + receive
- Home feed scroll + like

## Known non-blockers
- Theme marketplace / Spotify edge cases — monitor Sentry after launch
- Native FriendDrop plugin (Capacitor) — only if custom build includes plugin; web NFC + Despia cover most users
