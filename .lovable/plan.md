
Recording 1 (VYBE) shows the compass tilting the entire map view — markers, "you" pin, and tile edges all rotate together and the map zooms in awkwardly. Recording 2 (Google Maps) shows the correct behavior: tiles rotate under upright pins, with a small "north" indicator that resets bearing on tap. Plan below makes Vybe Maps match that behavior, and bundles the other open issues from this thread.

## 1. Vybe Maps — Google-Maps-style compass
File: `src/pages/FriendMap.tsx`

Today the wrapper `<div ref={mapEl}>` is rotated AND uniformly scaled to `1.18`. Because that wrapper holds tiles, controls *and* every marker, everything tilts as one block — the exact glitch in Recording 1.

- Move the rotation off the outer wrapper and onto Leaflet's inner `.leaflet-map-pane` only (`transform-origin: center center`). Tiles + marker positions rotate together; the wrapper stays put so the top bar, FABs, sheets and safe-area paddings never skew.
- Replace the fixed `scale(1.18)` with a dynamic cover-scale: `scale = |cos(θ)| + |sin(θ)|`. At 0° this is `1.0` (no zoom-in), and it grows just enough to keep the rotated square covering the viewport — no empty corners, no permanent zoom-in.
- Inject a CSS rule that **counter-rotates every marker icon** (`.leaflet-marker-icon, .leaflet-marker-shadow { transform: rotate(var(--map-counter-rot, 0deg)); transform-origin: center }`). Update `--map-counter-rot` from React in lock-step with heading so avatars, "you" pin, event pins and labels stay upright (matches Recording 2).
- Add a small **north needle badge** in the right-side controls that rotates with `-heading`. Tap → `setHeadingUp(false)` and reset bearing to north (Google Maps behavior).
- Change the user/me marker to a Google-style **direction cone** (a faint sector pointing in the heading direction) when compass is on; static blue dot when off.
- Tighten the heading low-pass filter to `alpha = 0.18` and throttle to 100 ms; keep absolute > `webkitCompassHeading` > relative priority and the screen-orientation compensation.
- Run the existing two-finger twist gesture through the same map-pane rotation path (and same counter-rotation variable) so manual rotate matches compass rotate visually.

## 2. Vybe Snap crash when opened from a DM
Files: `src/components/chat/ChatView.tsx`, `src/components/camera/VybeSnapCamera.tsx`

- Reset `phase`, `segments`, `capturedMedia`, `selectedFilter`, `activeARFilter` whenever `isOpen` flips true (effect keyed on `isOpen`). A stale `phase === 'edit'` from the previous open currently throws because the prior blob URL was already revoked.
- Wrap `startCamera` + `applyConstraints({ zoom })` + `applyConstraints({ torch })` in a single try/catch that always settles `cameraReady`. iOS Safari throws on unsupported `zoom` constraints and aborts the rest of the flow → black screen → downstream null deref.
- Guard `useFaceTracking.startTracking()` and `applySnapLens()` to only run when `videoRef.current?.readyState >= 2`. Today they can fire against a `null` element when the modal mounts inside an animated DM container.
- Run `stopCameraStream()` and `URL.revokeObjectURL(...)` inside a `finally` on close so the next open is clean.

## 3. Remove "Camera warming up…" placeholder
File: `src/components/friends/AutoFriendDrop.tsx`

- Delete the "Camera warming up…" overlay block. Render the live `<video>` immediately on QR-tab open; first frame paints the moment the stream resolves.
- Keep the existing permission-denied / `cameraError` toast + "Try again" CTA, but only show them when there is an actual error — never as a "warming" state.

## 4. 2FA + Login Approval — make them work everywhere (web, PWA, Despia)
Files: `supabase/functions/auth-2fa-request/index.ts`, `supabase/functions/auth-login-approval/index.ts`, `src/pages/Landing.tsx`, `src/components/auth/LoginGateModal.tsx`

a. **Users past the first 200 silently bypass 2FA.** Both functions look up the user via `admin.auth.admin.listUsers({ page: 1, perPage: 200 })`. Anyone created later returns `user = null` → `requires2fa: false`. Replace with a direct `profiles` lookup by `email` (service role), with a paginated `listUsers` fallback only when no profile row exists.

b. **Mobile race: navigation happens before the gate paints.** In `Landing.tsx`, after `signIn()` we `await` two edge calls; on mobile the auth listener fires `SIGNED_IN` and routes to `/home` first. Set a `pendingGateRef` *before* `signIn`, and add a short-lived guard that suppresses the post-auth redirect for ~2 s while the gate decision is in flight. Show a "Verifying…" spinner during that window.

c. **Polling pauses when the tab backgrounds for the trusted-device prompt** (iOS PWA / Despia). Switch `LoginGateModal`'s polling to a recursive `setTimeout` that re-arms on `visibilitychange === 'visible'` and immediately ticks on resume.

d. Add a **Resend code** button (re-invokes `auth-2fa-request`) with a 30 s cooldown so unreliable mobile email push isn't a dead end.

e. **Verify both edge functions are deployed to Live** (re-deploy in this pass) — past attempts silently fell into the `console.warn` branch.

## 5. Biometrics — only on login, never mid-session (Despia)
Files: `src/lib/despiaBiometrics.ts`, `src/components/settings/BiometricLockCard.tsx`, new `src/hooks/useBiometricLoginGate.ts`, root provider

- New `useBiometricLoginGate()` mounted once at the root. On cold start (and on `visibilitychange === 'visible'` after >2 min in background), if `isDespia()` && `getBioAuthPref()` && a Supabase session exists, render a full-screen blocker and call `requestBioAuth()`. Success → unblock. Fail/cancel → `supabase.auth.signOut()` + route to `/auth`. `unavailable` → unblock + one-time hint toast.
- In `BiometricLockCard`: only call `requestBioAuth()` when **enabling** the toggle (to confirm enrollment); disabling just clears the pref. Remove the auto-fire path on the "Test biometric prompt" button so it only runs on explicit click.
- Audit and remove any other `requestBioAuth()` / `confirmWithBiometrics()` call sites so biometrics never pop unexpectedly during normal app use.

### Out of scope
- No DB schema or design-token changes.
- 2FA toggles + `user_2fa_settings` table stay as-is — only edge-function lookup paths change.

### Files touched
- `src/pages/FriendMap.tsx`
- `src/components/camera/VybeSnapCamera.tsx`
- `src/components/chat/ChatView.tsx`
- `src/components/friends/AutoFriendDrop.tsx`
- `supabase/functions/auth-2fa-request/index.ts`
- `supabase/functions/auth-login-approval/index.ts`
- `src/pages/Landing.tsx`
- `src/components/auth/LoginGateModal.tsx`
- `src/lib/despiaBiometrics.ts`
- `src/components/settings/BiometricLockCard.tsx`
- New: `src/hooks/useBiometricLoginGate.ts` (mounted in existing root provider)
