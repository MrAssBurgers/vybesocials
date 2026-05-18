## The real bug

The bug-reports admin page (and pretty much every authenticated page) is unreachable on the live site because **the root `SmartErrorBoundary` catches a crash from `<DeferredAuthHooks>` and momentarily unmounts the entire app — including `<AuthProvider>` — every render cycle.**

Trace in the console you pasted:

```
Cannot read properties of null (reading 'destroy')
   at updateEffectImpl ...
[SmartErrorBoundary] Caught error: Cannot read properties of null (reading 'destroy')
[SmartErrorBoundary] Component stack: at DeferredAuthHooks → Suspense → AuthProvider
useAuth must be used within an AuthProvider   (x many)
HTTP 400 from /rest/v1/follows … uuid: "undefined"
HTTP 400 from /rest/v1/friend_requests … uuid: "undefined"
HTTP 400 from /rest/v1/notifications … uuid: "undefined"
HTTP 400 from /rest/v1/conversation_members … uuid: "undefined"
HTTP 400 from /rest/v1/posts
```

What's actually happening, in order:

1. One of the nine hooks inside `DeferredAuthHooks` (`usePrefetchBackgrounds`, `useGlobalRealtimeMessages`, `useDynamicFavicon`, `useDynamicManifest`, `useRetroactiveSync`, `useDailyLoginChallenge`, `useCaptureNotifications`, `useApplyAutoTheme`, `useSessionTracking`) is producing a React-internal "destroy" error during an effect cleanup — most likely because a Realtime channel/subscriber it returned from a `useEffect` got nulled before unmount (consistent with `useGlobalRealtimeMessages` keeping multiple channels and the recent realtime subscription refactor).
2. `SmartErrorBoundary` in `App.tsx` wraps the **entire app, above `AuthProvider`**. Its `componentDidCatch` does `setState({ hasError: true })` → render returns `null` → auto-resets 50 ms later. So on every crash the whole tree (AuthProvider included) is torn down and re-mounted.
3. Children that call `useAuth()` outside an `<AuthProvider>` throw "useAuth must be used within an AuthProvider".
4. On re-mount, queries fire before the auth session has been re-resolved, so `profile?.id` is `undefined` and PostgREST gets `?id=eq.undefined` — every one of those 400s is the same root cause.
5. The `/rest/v1/user_backgrounds` 500 (`statement timeout`) is unrelated noise — indexes are already in place. Leave it alone for now.

End result: `AdminErrorsSection` and `AdminBugReports` mount, fire their `bug_reports` query, the whole tree gets blown away mid-flight, and the page never finishes rendering on production. The `bug_reports` table itself is healthy (126 rows in the last 24h, 5 in the last hour — verified directly), so auto-bug-finding is still working; it's just the **viewer** that's broken.

## What we will change

### 1. Stop letting one optional hook take down the whole app

In `src/App.tsx`, wrap `<DeferredAuthHooks />` (and the other lazy notification/overlay mounts that call `useAuth`) in their own tiny `LocalErrorBoundary` that:

- Catches errors from its children only.
- Renders `null` (no fallback UI — these mounts have no visible output anyway).
- Logs the error to `bug_reports` via the existing `reportAppCrash` helper.
- Does **not** unmount its siblings.

Concretely:

```tsx
<AuthProvider>
  <SpotifyPresenceMount />
  <LocalErrorBoundary label="DeferredAuthHooks">
    <Suspense fallback={null}><DeferredAuthHooks /></Suspense>
  </LocalErrorBoundary>
  <LocalErrorBoundary label="LoginApprovalSheet">
    <Suspense fallback={null}><LoginApprovalSheet /></Suspense>
  </LocalErrorBoundary>
  ...
```

Also wrap the inner `Suspense` block that mounts `<GlobalMessageNotifications />`, `<DespiaOneSignalSync />`, `<EnablePushPrompt />`, `<SmartPingBridge />`, `<TabNotificationBadge />`, `<GlobalCallOverlay />`, `<WarningPopup />`, `<InvitePopup />`, `<BanCheck />`, `<PremiumGiftChecker />`, `<TrackingConsentDialog />`, `<FounderAppreciation />`, `<CookieConsentBanner />`, `<RatePromptSheet />` in one `LocalErrorBoundary` so any one of those failing can't blank the page either.

New file: `src/components/error/LocalErrorBoundary.tsx` — ~40-line class component, no UI, fire-and-forget crash report.

### 2. Make the root SmartErrorBoundary stop blanking the whole tree

In `src/components/error/SmartErrorBoundary.tsx`, change the "render `null` then reset 50 ms later" pattern. Instead, when an error is caught **and it's not a chunk-load error**, keep rendering `this.props.children` (do not flip `hasError`). The root boundary should only ever blank the screen for chunk-load reload, never for runtime crashes. Step 1 already shifts the responsibility for catching subtree crashes to the local boundaries, so the root one no longer needs to recover by unmounting.

Specifically: in `componentDidCatch`, drop the `setState({ hasError: true })` path for non-chunk, non-network errors. Keep the bug-report call. Always leave `hasError = false`.

### 3. Patch the actual `destroy` source in DeferredAuthHooks

Even with #1 in place, we want the underlying crash gone so it stops spamming `bug_reports`. The signature ("destroy" called on null at `updateEffectImpl`) almost always means a `useEffect` cleanup is trying to use a value that was set to `null` between mount and cleanup. In this codebase the suspect is `useGlobalRealtimeMessages` (454 lines, multiple Supabase channels). The fix is to:

- Replace any `let channel: RealtimeChannel | null = null; … return () => { supabase.removeChannel(channel) }` patterns with `if (channel) supabase.removeChannel(channel)` guards.
- Wrap the cleanup function body in `try { … } catch {}` so a failing `removeChannel` cannot bubble into React's effect runner.

(Apply the same defensive cleanup pattern to `useApplyAutoTheme`, which also calls `removeChannel` on a captured ref.)

### 4. Verify the bug-reports viewer loads

- After change, visit `/admin` on live and confirm `AdminErrorsSection` lists the 50 most recent rows (the underlying query and FK `bug_reports_reporter_id_fkey` are correct — verified directly in DB).
- Visit `/admin/bugs` and confirm the standalone page renders.
- Confirm console no longer cycles through "useAuth must be used within an AuthProvider" and the wave of `uuid: "undefined"` 400s.

## Files touched

- New: `src/components/error/LocalErrorBoundary.tsx` (small class component, no UI fallback).
- `src/App.tsx` — wrap `<DeferredAuthHooks>` and the deferred notification/overlay Suspense block in `LocalErrorBoundary`.
- `src/components/error/SmartErrorBoundary.tsx` — never flip `hasError` for runtime errors; keep the chunk-load reload branch only.
- `src/hooks/useGlobalRealtimeMessages.ts` and `src/hooks/useApplyAutoTheme.ts` — guard `removeChannel` cleanups against null refs and wrap in `try/catch`.

No design changes, no schema changes, no new dependencies.