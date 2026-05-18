# VYBE Patch Notes

## v1.1.5 — May 18, 2026

### 💬 Messaging & Notifications
- **DM push notifications now always show up** — even when the app is fully closed, you'll see the sender's name and a preview of what they said.
- Hardened OneSignal sync (`DespiaOneSignalSync`) so device tokens stay registered across background/foreground transitions.
- Improved `useMessages` realtime handling so incoming DMs deliver reliably when the app is backgrounded.
- Chat view (`ChatView`) tightened to prevent dropped message subscriptions on reconnect.

### 🛡️ Stability & Crash Isolation
- New **`LocalErrorBoundary`** wraps background/overlay mounts (`DeferredAuthHooks`, `LoginApprovalSheet`, `GlobalMessageNotifications`, `DespiaOneSignalSync`, etc.) so a crash in one subtree no longer takes down the whole app.
- `SmartErrorBoundary` no longer auto-recovers on runtime subtree errors — this stops the cascade of `useAuth must be used within an AuthProvider` errors and `uuid: "undefined"` 400s that were blanking the screen.
- Hardened realtime cleanups in `useGlobalRealtimeMessages` and `useApplyAutoTheme` with null guards and `try/catch` around `supabase.removeChannel()` so cleanup errors can't crash React.

### 🐞 Bug Reports & Admin
- **Bug reports page now loads on the live website.** Fixed auth race condition that was firing queries before the session was ready.
- `useUserRole` now correctly recognizes the **`owner`** role (checks both `user_roles` and `user_roles_auth`).
- Gated moderation queries (`useContentFlags`, `useReports`, `useAllWarnings`, `useAllBans`) behind `authReady && !!user` to eliminate premature 400s.
- `AdminBugReports` and `AdminDashboard` updated to grant owners full access and show proper error / access-denied states.
- Added `AdminBugReport` type for cleaner typing.

### 🔧 Version
- App version bumped to **1.1.5**.
