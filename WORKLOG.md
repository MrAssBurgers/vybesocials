# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

## PUBLISH handoff (2026-07-14) — camera + chat timers + contacts

- **Merged to `origin/main`:** `81fda138` — camera recording playback/REC, DM ephemeral timers, contacts sync, theme fallback, map heading, feed scroll pause
- **Firebase staging hosting:** https://vybe-daaab.web.app ✅
- **Backend already on `vybe-daaab`:** `purgeUnsavedOnLeave`, `sendDmMessage`, `onMessageViewCreated`, `purgeExpiredMessages`, Firestore rules
- **Production `vybehub.app`:** **Lovable → Share → Publish** (sync `main` @ `d85fd633` / feature `81fda138`) — Cursor cannot click Publish
- **Lovable:** https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7
- **After Publish:** hard-refresh → record video plays · DM 24h / When I leave · saved kept · contact sync

---

## Camera recording + chat delete timers (2026-07-14)

- **What changed:** Camera blob MIME + revoke fix + smoother REC; `on_close` + leave purge; 24h expires at send; DM Settings leave-purge; contacts/theme/map/feed polish from same batch
- **Tests:** cameraRecording + leaveDmConversation unit tests; `npm run build` ✅
- **Next:** Lovable Publish · hard-refresh verify

---

## PUBLISH handoff (2026-07-14) — hold menu + map heading + search

- **Merged to `origin/main`:** `51b111e2` (DM hold options, Despia gyro heading/follow, map search settings layout)
- **Firebase staging hosting:** https://vybe-daaab.web.app ✅
- **Production `vybehub.app`:** **Lovable → Share → Publish** (sync `main` @ `51b111e2`) — Cursor cannot click Publish
- **Lovable:** https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7
- **After Publish:** hard-refresh → hold conversation for options · map follow phone direction · long place search keeps settings visible

---

## Hold menu + map heading + search bar (2026-07-14)

- **What changed:**
  - DM hold options: gesture rows for tablet shell (`<1024`) + touch; long-press also on desktop branch; hold cancel slop 18px
  - Vybe Map heading: Despia `gyroscope://start?threshold=0` via `subscribeDeviceHeading` + follow-bearing; web keeps DeviceOrientation
  - Map search open pill: `min-w-0` so settings button is not clipped
- **Shipped:** `51b111e2` on `origin/main`; staging hosting deployed
- **Next:**
  1. Lovable Publish for `vybehub.app`
  2. Hard-refresh verify hold menu · map compass · search+settings

---

## PUBLISH handoff (2026-07-14) — DM keyboard composer

- **Merged to `origin/main`:** `395acdc6` (DM composer sits above soft keyboard on immersive threads)
- **Firebase staging hosting:** https://vybe-daaab.web.app ✅
- **Production `vybehub.app`:** **Lovable → Share → Publish** (sync `main` @ `395acdc6`) — Cursor cannot click Publish
- **Lovable:** https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7
- **After Publish:** hard-refresh → open DM → focus composer above keyboard → Back to inbox (no bottom nav in thread)

---

## DM composer keyboard dock (2026-07-14)

- **What changed:** DM dock padding includes `--kb-h` under `data-dm-active`; `useKeyboardHeight` keeps listeners across desktop→mobile shell; soft-keyboard detect also accepts touch / `hover: none`.
- **Symptom fixed:** Composer not above keyboard; user thought nav/back were broken (nav was already unmounting on threads).
- **Tests:** Manual verify (composer above KB, no bottom nav in thread, back to inbox). Debug instrumentation removed.
- **Shipped:** `395acdc6` on `origin/main`; staging hosting deployed.
- **Next:**
  1. Lovable Publish for `vybehub.app`
  2. Hard-refresh verify DM thread keyboard + back
  3. Optional: discard local `.firebase/hosting.ZGlzdA.cache` dirty file if unused

---

## PUBLISH handoff (2026-07-14) — camera overlay crash

- **Merged to `origin/main`:** `ecc3a536` (camera overlay safe hooks + split modules; Home/Messages/Upload no longer crash on `useCameraOverlay*`)
- **Firebase staging hosting:** https://vybe-daaab.web.app ✅
- **Production `vybehub.app`:** **Lovable → Share → Publish** (sync `main` @ `ecc3a536`) — Cursor cannot click Publish
- **Lovable:** https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7
- **After Publish:** hard-refresh → Home / Messages / Upload without camera-overlay Error Monitor spam

---

## PUBLISH handoff (2026-07-14) — composer + map sheet

- **Merged to `origin/main`:** `c0ff5418` (DM composer immersive dock, friends-on-map finger-follow drag, map heading, Error Monitor, console/rules sweep)
- **Firebase staging hosting:** https://vybe-daaab.web.app ✅
- **Firestore rules + indexes:** deployed to `vybe-daaab` ✅
- **Function:** `analyzeBugReport` redeployed ✅
- **Production `vybehub.app`:** **Lovable → Share → Publish** (sync `main` @ `c0ff5418`) — Cursor cannot click Publish
- **Lovable:** https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7
- **After Publish:** hard-refresh → DM composer flush · Map friends sheet drag · Error Monitor Fix All

---

## PUBLISH handoff (2026-07-14)

- **Merged to `origin/main`:** `030b035c` (PR #5 — debug/signup/console/DM toast fixes)
- **Firebase staging hosting:** https://vybe-daaab.web.app ✅
- **Firestore rules + indexes:** deployed to `vybe-daaab` ✅
- **Production `vybehub.app`:** **Lovable → Share → Publish** (sync `main` @ `030b035c`) — Cursor cannot click Publish
- **Lovable:** https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7
- **After Publish:** hard-refresh vybehub.app → signup · Messages (no historical toast spam) · home console

---

## Polish + staging hosting deploy (2026-07-14)

- **Client:** Quiet Tutorial logs (DEV-only); filter remaining noisy console patterns in `main.tsx` (permission-denied / missing-index / App Check / WebGL / web-share).
- **Staging:** `firebase deploy --only hosting` → https://vybe-daaab.web.app ✅ (includes DM toast fix + signup/rules/console fixes).
- **Verified on staging:** boot past splash · login · home (no critical console) · Messages hard-refresh (0 historical toasts) · profile · lint · typecheck · test 304
- **Still for prod web:** Lovable → Share → Publish for **vybehub.app** (this hosting deploy does not publish the custom domain).
- **Next:** Publish via Lovable; hard-refresh vybehub.app; confirm DM toast + signup on production.

---

## Fix DM toast spam on Messages load (2026-07-14)

- **Evidence:** Recording `17.05.22` — opening DMs instantly stacked in-app banners with historical previews (reighly / Jayden / macy).
- **Cause:** `subscribePostgresChannel` only skipped callback #1. Firestore persistence often emits empty `fromCache` first, then a server snapshot where every existing message is `added` → treated as INSERT → `maybeShowForegroundDmNotification`.
- **Fix:**
  - Bootstrap wait until non-empty cache or first server sync; discard that seed batch before live events (`realtimeService.ts`).
  - Age-gate foreground DM toasts (45s) via `isFreshForegroundDmMessage`.
- **Verified:** unit freshness tests · typecheck · lint
- **Next:** Hard-refresh Messages — no historical toast stack; new live messages still toast when not viewing that thread.

---

## Debug scan (2026-07-14)

- **Scan:** `npm run debug` — build · lint · CSS · boot · CF refs (67 client / 201 local) · probes sharePreview/livekitToken/aiCatchUp — ALL PASS
- **Also:** typecheck · test 301 · staging/prod hosting HTTP 200 · Auth domain 200
- **Fixes (safe in-repo):**
  - Signup username check fail-soft on Firestore `permission-denied` (profiles require signed-in; unblocked email signup)
  - Tutorial spotlight `motion.rect` — never paint undefined SVG width/height
  - `fetchPriority` → `fetchpriority` on img/avatar props (React DOM warning)
  - `dna_content_preferences` Firestore rules + hook soft-fail
  - Added rules for `user_active_boosts`, `screen_time_sessions`, `analytics_events`; own-user **read** on `auth_challenges`
  - Tightened `user_levels` / `challenge_rewards` read rules for auth-uid list queries
  - Gate `usePendingModerationCount` to staff only (was spamming reports/flags/appeals/bugs denies for everyone)
  - Soft-fail active boosts / VybePass reads; quieter analytics flush in DEV
  - Composite indexes for comments/events/challenge_rewards/messages/calls/auth_challenges
  - Lint unused `eslint-disable` on dm debug helpers; Tailwind ambiguous duration/ease classes
- **Verified:** lint clean · typecheck · test 301 · build PASS · UI signup `debugscan0714` → home OK
- **Production deploy:** `firestore:rules` + `firestore:indexes` → `vybe-daaab` ✅ (kept live `calls` indexes; redeployed after remaining console fixes)
- **Still open:**
  1. Merge PR + Lovable → Share → Publish for `vybehub.app` (client signup/console fixes)
  2. Indexes may still finish building — missing-index warns can linger briefly
  3. Some CF names are client-only RPCs (`ensure_profile` HTTP 404 expected); `claimProfileByEmail` deployed (401)
- **Remaining console noise (env / non-blocking):** WebGL SwiftShader deprecation; `web-share` feature warning; Presence/Tutorial debug logs; App Check site key unset locally
- **Next:** Merge/publish client → hard-refresh home; confirm DNA + index noise gone; re-check DM nav on desktop

## DM composer + friends sheet drag (2026-07-14)

- **Ask:** Composer felt wrong vs before; friends-on-map sheet must follow finger while swiping.
- **Change:**
  - Composer: restore immersive dock (`--dm-composer-lift: 0`); hide bottom nav on open DM threads; don’t disable input on message fetch; drop Texter `layout` thrash
  - Map sheet: real finger-follow drag via motion `y` + snap open/closed (was handle-only rubber-band)
- **Tests:** bottomNavRoutes unit PASS · tsc PASS · user verified
- **Next:** Optional commit + Lovable Publish

---

## Scroll flicker + map heading + Error Monitor (2026-07-14)

- **Ask:** Background flicker while scrolling DMs; map arrow/gyro wrong; friends sheet drag; Error Monitor Fix All / AI verify.
- **Change:**
  - Scroll: stop stripping `.messages-scroll` backdrop-filter and rewriting `.dm-inbox-card` box-shadow on `is-scrolling` (caused mid-scroll glow/background flicker)
  - Map: prefer compass over GPS course; iOS orientation permission on gesture; screen-orientation offset + heading lerp; Friends drawer handle drag up/down
  - Error Monitor: `analyzeBugReport` verify → ACTIVE/RESOLVED; Fix All optimistic clear + `resolved_at`; Copy All = pending/reviewing only
- **Tests:** client build PASS · functions build PASS
- **Deploy:** `firebase deploy --only functions:analyzeBugReport` for AI verify in prod
- **Next:** Hard-refresh — scroll Chat list; open Map & tap once for compass; drag Friends sheet; Fix All in Admin Errors

---

## Console bug sweep (2026-07-14)

- **Ask:** Fix console errors (permission-denied, missing indexes, duplicate DM listeners, manifest/fonts, React warnings).
- **Change:**
  - DM realtime: skip resync when conversation set unchanged; reuse active channels; update handler context without teardown
  - Firestore rules: `user_backgrounds`, `dna_agent_settings`, `user_custom_sounds`, `user_active_boosts`, `screen_time_sessions`, `analytics_events`, `auth_challenges` (read own)
  - Firestore indexes: `calls` (receiver_id+status+created_at, status+created_at), `events` (is_public+start_time)
  - PWA manifest: removed cross-origin `id`; local shortcut icons
  - Disabled missing VybeFont `@font-face` (OTS parse errors)
  - `ProfileAvatarImage`: set fetchPriority via ref (React 18 warning)
  - Quieter TutorialProvider + usePresence dev logs
- **Tests:** `npm run build` PASS · `npm run test` PASS
- **Next:** Deploy rules + indexes (`firebase deploy --only firestore`) · hard refresh · verify console clean

---

## Profile UI revert to classic (2026-07-14)

- **Ask:** Revert profiles to pre-revamp look with square profile photo.
- **Change:** Restored `Profile.tsx` + `ProfileHeroCard.tsx` from HEAD; all profile routes (`/profile`, `/profile/:id`, `/u/:username`) route to classic Profile page again.
- **Tests:** `npm run build` PASS
- **Next:** Hard-refresh `/profile` or `/u/{you}`

---

## Reference profile compact cleanup (2026-07-14)

- **Ask:** Fix stretched/empty profile — shorter cover, grouped identity, horizontal Level+Score card, compact stats/actions/stories/tabs, centered 840px shell, square grid.
- **Change:** Cover -35%; identity block; stats Posts/Followers/Following/Friends (hidden when unavailable); Edit Profile action row; `ProfileLevelScoreRow`; slim tabs; 3/4-col square grid; clean card surface below hero; single avatar ring.
- **Tests:** profile unit tests 7 pass · `npm run build` PASS
- **Next:** Hard-refresh `/profile` · compare to reference mock

---

## Reference-faithful profile polish (2026-07-14)

- **Ask:** Match the neon-night reference mock almost pixel-for-pixel (no Snap branding).
- **Change:** Rebuilt hero (cinematic cover, left avatar w/ conic gradient ring, stacked Level + VYBE Score glass cards, stat rail); polished circular action rail (Camera gradient ring); Stories w/ See All; BF + Compatibility cards; white-underline tabs + 3-col vertical grid; neon badge tiles; `profile-chrome.css` rewrite.
- **Tests:** profile unit tests 7 pass · `npm run build` PASS
- **Next:** Hard-refresh `/u/{you}` · compare side-by-side with reference · friend/stranger modes · commit when ready

---

## Profile mock visual pass (2026-07-14)

- **Ask:** Make `/u/` profile look like the dense neon mock, with no Snapchat icons/names.
- **Change:** Dense cover identity + Level/VYBE Score glass cards; Followers/Following/Posts/Friends rail; circular Camera/Chat/Call/Video/More rail; Stories header; friend-only BF + Compatibility cards; neon badges row; denser Posts/Clips/Tagged grid; `profile-chrome.css` theme tokens.
- **Tests:** profile unit tests pass · `npm run build` PASS
- **Next:** Hard-refresh `/u/{you}` · friend profile check · Theme Designer switch · commit when ready

---

## Profile UI revamp (2026-07-14)

- **Ask:** Unify profiles on `/u/:username` with theme-token UI; kill Snap branding and dual profile pages.
- **Change:**
  - `useProfileViewModel` + mode/actions permissions shell
  - Canonical `ProfileView` at `/u/:username`; `/profile` + `/profile/:id` redirects
  - Light cover hero, primary actions, friendship strip, real story/highlights, Posts/Clips/Tagged
  - Sheets: About / Score / Badges / Friendship / More; friends list sheet
  - `post_user_tags` + `story_highlights` Firestore rules; PersonTagPicker on create
  - Removed Snap CSS/heroes and old `Profile.tsx` / `RelationshipProfile.tsx`
- **Tests:** `npm run test` 309 pass · `npm run build` PASS
- **Next:** Hard-refresh `/u/{you}` · Theme Designer switch · commit + push · Lovable Publish · deploy rules if needed

---

## Profile Snapchat redesign (2026-07-14)

- **Ask:** Profile UI looked bad; redesign more like Snapchat.
- **Change:** Centered Bitmoji-style hero, yellow Snap CTAs, conic story rings, Stories tray, Spotlight pill tabs, rounded snap grid; `/u/` matches.
- **Files:** `snap-profile.css`, `ProfileHeroCard`, `ProfileHighlightsRow`, `Profile.tsx`, `SocialProfileHero`, `main.tsx`.
- **Next:** Hard-refresh `/profile` · tweak if needed · commit + publish

---

## Profile Snap × Instagram redesign (2026-07-14)

- **Ask:** Profiles felt boring — want Snapchat + Instagram mix.
- **Change:** IG handle/stats/bio hero + Snap story rings; highlights shelf; sticky tab rail; denser grid; `/u/` social hero matches.
- **Files:** `ProfileHeroCard`, `ProfileHighlightsRow`, `Profile.tsx`, `SocialProfileHero`.
- **Next:** Hard-refresh `/profile` · commit + push · Lovable Publish

---

## Prevent "Something went wrong" crash page (2026-07-14)

- **Bug:** After a few seconds on Home, full-page “Something went wrong” appeared.
- **Cause:** `CreateMenuLayer` threw `useCameraOverlay must be used within CameraOverlayProvider`; App `SmartErrorBoundary` had `AppErrorFallback` which skipped soft recovery.
- **Fix:** Optional camera context in create menu; root/route boundaries soft-remount by default; Messages keeps `hardFallback`.
- **Verified:** User confirmed fixed; debug instrumentation removed.
- **Next:** Commit + push `origin/main` · staging deploy · Lovable Publish

---

## Fix post images not loading (2026-07-14)

- **Bug:** Feed post images failed (gray placeholders); legacy Supabase media rewrote to tokenless Firebase URLs.
- **Cause:** `useFastSignedUrl` cancelled Firebase `getDownloadURL` on Strict Mode/effect re-run, then `fetchedRef` skipped retry; UI painted unsigned URLs → 403.
- **Fix:** Shared in-flight Firebase resolve that always caches tokens; never paint tokenless Storage URLs until signed.
- **Verified:** User confirmed fixed; debug instrumentation removed.
- **Next:** Commit + push `origin/main` · staging deploy · Lovable Publish

---

## Friend button status + social/compose/scroll fixes (2026-07-14)

- **Bug:** Add Friend showed for people already friends; tap returned already-friends; compose New message/group wrong; false online; chat crash `peerTrulyOnline`; inbox darken/lag on scroll.
- **Fix:** Friendship status prefers legacy+accepted; FriendButton uses friends list; send no-ops if already friends; compose → search / CreateGroupDialog; FS-only presence; scroll blur/shadow polish.
- **Deployed:** `mutateFriendship` + `getFriendshipState` on `vybe-daaab`.
- **Verified:** User confirmed friend button fixed; debug instrumentation removed.
- **Next:** Commit + push `origin/main` · staging deploy · Lovable Publish

---

## Fix DM toast spam + 7-day notification TTL (2026-07-14)

- **Bug:** Opening Messages spammed dozens/hundreds of DM toasts; bell feed retained old/unrelated items.
- **Cause:** `sanitizeRealtimeMessage` invented `created_at = now` for non-string timestamps, so catch-up INSERT replay looked fresh.
- **Fix:** Parse real timestamps; toast only if age ≤ 60s; coalesce one toast/conversation; disable client push backup; bell query `.gte(created_at, 7d)` + hide `message` type.
- **Also:** Contrast scroll flicker sticky/skip; inbox projection person-dedupe; RR7 `useTransitions={false}` (prior).
- **Verified:** User confirmed fixed; debug instrumentation removed.
- **Next:** Commit + push `origin/main` · staging deploy · Lovable Publish

---

## Fix DM nav lock — RR7 startTransition desync (2026-07-14)

- **Bug:** Opening a DM trapped Back / switch-row / sidebar — handlers fired but chat chrome stayed mounted after URL left to `/messages`.
- **Cause:** React Router 7 `BrowserRouter` wraps location updates in `startTransition`; history updated while ChatView unmount lagged and further taps interrupted the leave. Hard-escape only checked `window.location`, so it never fired.
- **Fix:** `<BrowserRouter useTransitions={false}>`; ChatHeader hard-escape also checks `#vybe-chat-shield-root` still mounted.
- **Verified:** User confirmed fixed on local Vite after instrumentation; debug logs removed.
- **Next:** Commit + push `origin/main` · deploy staging · Lovable Publish for vybehub.app

---

## Fix desktop DM lock from screen recording (2026-07-14)

- **Evidence:** Recording `01.45.27` — desktop 3-pane; back, other chats, and Explore all dead while YUJIN KIM thread painted.
- **Fix:** Clear stale viewport overlays; shield curtain never receives pointers; desktop sidebar z-80 above main; thread shell forced relative in column; disable chat-screen shield on desktop; back Link hard-`location.replace` fallback.
- **Verified:** typecheck · test 301 · build PASS
- **Published:** `origin/main` @ **`3de17cc8`** · https://vybe-daaab.web.app ✅
- **Production:** Lovable → Share → Publish (sync `main` @ `3de17cc8`)
- **Next:** Hard-refresh — open DM → Explore / switch row / Back must work.

---

## Fix DM back via Link (2026-07-14)

- **Bug:** User still trapped in DM — Back tap did nothing after prior fixes.
- **Cause:** ChatHeader `onPointerUp` + `preventDefault` cancelled the click fallback; leave only ran if that fragile pointerup fired.
- **Fix:** Back is a real `<Link to="/messages" replace>`; prepare leave side effects on click; overlay close still consumes first tap; raised header z/pointer-events.
- **Verified:** typecheck · test 299 · build PASS
- **Published:** `origin/main` @ **`5d9eda89`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `5d9eda89`)
- **Next:** Hard-refresh staging — open DM → tap Back once → inbox.

---

## Fix DM navigation lock (2026-07-14)

- **Bug:** Opening a DM trapped navigation — mobile Back dead; desktop could not switch or leave; no chrome escape while thread open.
- **Cause (residual after 9fc1033e):** Bottom nav unmounted on `/messages/:id`; Capacitor back used `replaceState` (no leave suppress / RR sync); header back ignored open sheets/viewers; Texter `setPointerCapture` never released.
- **Fix:**
  - Keep BottomNav mounted on DM threads; Messages tab active; `--dm-composer-lift` restored above nav.
  - Unified `requestDmThreadBack` / `handleSystemBackForDm` → overlay close then `leaveDmConversation` (Capacitor + swipe + header).
  - ChatView registers priority back handler; closes viewers/sheets/camera/menus; clears overlays on conversation change.
  - Texter releases pointer capture on up/cancel/unmount; `vybe-dm-nav-debug=1` click/leave logging.
- **Verified:** typecheck · test 298 · build PASS
- **Published:** `origin/main` @ **`725d337e`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `725d337e`)
- **Next:** Hard-refresh — Back → inbox; Home/Clips from nav while in thread; desktop switch + sidebar.

---

## Fix DM leave after 5e75cc98 (2026-07-14)

- **Bug:** After sticky/shell publish, phone Back still failed; leave could bounce back into the same DM.
- **Cause:** Sticky header under overflow:hidden did nothing useful; AppLayout swipe-back (`clientX<=40`) stole the back tap and cancelled click mid-translate; inbox remount under finger reopened a row.
- **Fix:**
  - `.dm-chat-header` → `position: relative` (in-flow, not sticky).
  - `useSwipeBack` ignores `.dm-chat-header` / back; edge zone **16px**; ChatHeader `stopPropagation` + pointerup leave (latched).
  - `leaveDmConversation` sets ~400ms `vybe-dm-leave-suppress`; `openChat` no-ops while fresh (inbox + safe list).
- **Verified:** typecheck · test 283 · build PASS
- **Published:** `origin/main` @ **`9fc1033e`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `9fc1033e`)
- **Next:** Hard-refresh — phone Back once → stay on inbox; edge swipe outside header still leaves.

---

## Unblock DM back + desktop navigation (2026-07-14)

- **Bug:** Mobile back felt dead; desktop/tablet could not switch DMs or leave Messages while a thread was open.
- **Cause:** Viewport `fixed inset-0 z-100` chat shell + absolute header lost hit tests to the message pane; thread pane stacking (`z-[1]` + `translateZ(0)`) covered the inbox; tablet (768–1023) hid inbox and bottom nav together.
- **Fix:**
  - Sticky in-flow chat header (`z-50`); reduced message top pad.
  - Mobile shell → `absolute` inside `.messages-scroll` (not viewport fixed).
  - Inbox `z-[2]`; thread `z-0`; no `translateZ(0)` on `.dm-shell .messages-scroll`.
  - Inbox split from tablet/md; `leaveDmConversation` clears `data-dm-active` before navigate.
- **Verified:** typecheck · test 278 · build PASS
- **Published:** `origin/main` @ **`5e75cc98`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `5e75cc98`)
- **Next:** Hard-refresh — mobile back + desktop/tablet DM switch + leave app chrome.

---

## Fix DM thread blank pane + full-app Retry reload (2026-07-13)

- **Recording:** Inbox painted; right pane blank ~6.5s → “Chat is taking too long to open” → Retry ran `location.assign` → full VYBE boot → chat then appeared.
- **Root causes:** Lazy `Suspense` shell owned the pane and hard-reloaded on Retry; ChatView early returns stripped header/composer; warm `cancelQueries` could abort live fetches; timeout armed before actor resolve.
- **Fix:**
  - Eager `ChatView` mount (no Suspense timeout/reload); thread `LocalErrorBoundary` with thread-only Retry.
  - Keep `ChatThreadShell` always — inline banners for timeout/error/opening; message-area skeletons only (`pointer-events-none` there).
  - Cancel stale message queries when selection changes; warm timeout no longer `cancelQueries`.
  - Soft escape only after `actorReady` (8s); `placeholderData`/`initialData` from this conversation’s cache; first page limit **50**.
  - Composer mounts immediately (`isPending` while connecting).
  - Dev logs via `dmThreadLog` (`localStorage vybe-dm-thread-debug=1`).
- **Verified:** typecheck · test 278 · build PASS
- **Published:** `origin/main` @ **`435afafc`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `435afafc`)
- **Next:** Hard-refresh staging QA — open/switch DMs without boot screen.

---

## Fix DM conversation perpetual loading (2026-07-13)

- **Root cause:** Untimed Firestore message/profile reads + soft escape only on `messagesPending` (missed Opening chat / hung refetch); shared warm fetch could poison the thread query.
- **Fix:**
  - `loadConversationMessages`: 6s fetch timeout + 3s enrich timeout; return seed or throw (never hang).
  - `resolveSessionProfileId`: whole inflight (incl. first `getProfileByAuthUid`) timed 2.5s; fallback auth uid; clear inflight.
  - `ChatView`: conversation-keyed 4s escape (covers Opening chat / hung refetch); seed without waiting for `profileId`.
  - `warmDmConversation`: timed fetch + `cancelQueries` on timeout.
  - Suspense `ChatThreadLoadingShell`: 5s Retry / Back.
- **Verified:** typecheck · test 276 · build PASS
- **Published:** `origin/main` @ **`b2baffe6`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `b2baffe6`)
- **Next:** Hard-refresh staging — open DM must paint seed/messages quickly; never infinite skeleton.

---

## Fix Messages back button (2026-07-13)

- **Bug:** Chat back arrow / swipe / Android back could fail or bounce — push `/messages` left the thread in history; mobile Messages disabled swipe-back; loading states had no back; header `pointer-events: none` hurt taps.
- **Fix:** `leaveDmConversation(navigate)` uses `{ replace: true }`; header hit target + `pointer-events: auto` / z-index; swipe-back enabled in open DMs → inbox; Capacitor back on threads → replace `/messages`; loading/error shells include Back.
- **Verified:** typecheck · test 273 · build PASS
- **Published:** `origin/main` @ **`e952c0a3`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `e952c0a3`)
- **Next:** Hard-refresh staging — open DM → header back → inbox; also swipe / Android back.

---

## Fix profile click + DM open hangs (2026-07-13)

- **DM hang:** `loadConversationMessages` awaited membership repair even when messages already loaded (`getDocumentFromServer` could never settle). Now return data immediately; timed repair (~3s) only on empty/error.
- **Claim poison:** `resolveSessionProfileId` claim raced with 2.5s timeout; clear `inflight`; prefer non-placeholder Firestore hit.
- **Profile hang:** Own tab → `/profile`; `isSelf` by username; RelationshipProfile Navigate to `/profile`; identity returns before count scans (counts hydrate via setQueryData).
- **ChatView:** soft escape after 4s with Try again (no endless skeleton).
- **Verified:** typecheck · test 270 · build PASS
- **Published:** `origin/main` @ **`60c42d82`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `60c42d82`)
- **Next:** Hard-refresh staging — profile + DM open should work instantly.

---

## Instant DMs + profiles (2026-07-13)

- **DMs still blank:** Thread used `offlineFirst` (can pause forever); empty message fetch didn't await membership repair; list waited for profileId before any network; membership only queried one id.
- **Fix:** `useMessages`/`useConversationDetail` → `networkMode: 'always'`; await repair + retry on empty; load list with authUid fallback; dual membership keys (profileId + authUid); refetch on actorId change.
- **Profiles slow:** `/u/:username` waited on friendship+visibility after profile; cache key included viewer id (miss on auth); wrong preload chunk.
- **Fix:** Paint hero as soon as profile exists; stable `['profile', username]` key + session placeholder; early self → Profile; softer friendship refetch; preload RelationshipProfile.
- **Verified:** typecheck · test 270 · build PASS
- **Published:** `origin/main` @ **`b6e724b3`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `b6e724b3`)
- **Next:** Hard-refresh staging — open DMs + profiles should paint instantly.

---

## DM open + scroll dark + profile hang + dupes + update copy (2026-07-13)

- **Chat open stuck:** Inbox 1-message seed marked RQ fresh + `refetchOnMount` only on empty → never hydrated. Fixed sparse-seed refetch + `fetchQuery` warm (staleTime 0) after seed.
- **DM scroll dark flash:** `html.is-scrolling .dm-inbox-card` forced opaque `--background` over gradient — removed background swap (shadows only).
- **Profile hang:** RQ v5 disabled queries stay `isPending` forever — `useFriendProfile` uses `isLoading`; own `/profile` falls back to session profile.
- **Duplicate accounts:** Claim before ensure on placeholder profiles; friends/search/inbox dedupe by id + username.
- **Update overlay:** Copy → **“App updated / Please restart the app”**.
- **Verified:** typecheck · test 270 · build PASS
- **Published:** `origin/main` @ **`7a3d07da`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `7a3d07da`)
- **Next:** Hard-refresh staging — open chats hydrate; scroll without dark flash; profile loads; update copy asks restart.

---

## Instant-load deep scan + fixes (2026-07-13)

- **Goal:** Find / fix cold-start + Messages/image stalls so conversations and avatars paint from cache instantly.
- **P0 fixes:**
  - Splash no longer awaits feed media signing (warm in background).
  - Persist restore backup wait **300–400ms** (was 0–40ms) so IDB hydrate lands before Messages opens empty.
  - `batchSignUrls` transport errors no longer poison the whole batch for 10 minutes.
  - `loadConversationMessages` keeps seed cache when `actorId` unresolved (no wipe to `[]`).
  - `resolveSessionProfileId` reads Firestore first; claim/ensure only if missing (no claim RPC on every open).
- **P1 fixes:**
  - Firebase download URLs write into `signedUrlCache`; `getCachedSignedUrl` serves them on next paint.
  - Avatar disk cache uses in-memory map (no per-row `JSON.parse`).
  - Priority avatars use `decoding="async"` (was `sync` — main-thread jank).
  - Messages `refetchOnMount` no longer forces network on short seeds.
  - DM shadow projection default **off** (extra dual read).
  - GPS watch deferred ~1.8–2.5s after cold start unless already on map.
- **Verified:** `npm run typecheck` · `npm run test` 270 PASS · `npm run build` PASS
- **Published:** `origin/main` @ **`e98108f6`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `e98108f6`)
- **Next:**
  1. Hard-refresh staging — splash shorter; inbox/avatars from cache; open chat keeps seed.
  2. Manual QA: Messages scroll + open chat + avatar paint.
  3. If still laggy: defer `useStories` on inbox until idle; audit ChatView Suspense chunk.

---

## CI typecheck failures on main (2026-07-13)

- **Cause:** `useRecentNewFriendProfileIds` returns `string[]` but legacy `ConversationList` still typed/defaulted `Set`; `sortDmConversations` used unsafe casts rejected by `tsc`.
- **Fix:** `ensureStringSet` at ConversationList; sort via local comparator (no casts).
- **Verified:** `npm run typecheck` · lint · test 270 · build — all PASS
- **Published:** push `origin/main` (unblocks `[CI - main]` emails)

---

## Freeze inbox sort clock + fix false online in chat (2026-07-13)

- **Shuffle root cause:** Projection/`updated_at`/`_sortTime` were treated as “latest message,” so rows jumped without a real send/receive.
- **Fix:** `getInboxLatestMessageAt` uses only `last_message.created_at` (else conversation `created_at`). Projection merge patches unread/profile without rewriting the sort clock unless projection has a **newer real message**. Server projection no longer falls back to `conv.updated_at`.
- **False online:** ChatView used `isOnline={… || !!peerPresence}` so “viewing” (or any presence object) looked online. Now requires Firestore heartbeat (`peerPresence.is_online`); broadcast no longer forces online; header green dot only when truly online.
- **Verified:** unit tests + `npm run build` PASS
- **Published:** `origin/main` @ **`3b82fbc4`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `3b82fbc4`)
- **Next:** Hard-refresh Messages; confirm rows only move on real messages; online only with live heartbeat.

---

## Snapchat-stable DM inbox order + top bar (2026-07-13)

- **Bug:** Rows jumped when presence/typing/unread/rank/streak/projection changed because UI sort used `compareInboxActivity` (activity + unread ties) and category ranks (`bestFriendRank`, story boost, online score on Active).
- **Sort:** New `sortInboxConversations` — pinned (`pinOrder`) → `latestMessageAt` desc → `conversationId`. Volatile fields never affect order. Load path + category/legacy filters share the same comparator.
- **Filters:** Hard-filter (not soft-dim). Primary chips: **Chat / Best Friends / Groups / Unread / Active**. Extra categories kept for persistence/More later.
- **UI:** Centered Chat title + avatar/search left, notifications/add/more right; compact 48px underline text tabs.
- **Verified:** `npm run test` 269 PASS · `npm run build` PASS
- **Published:** `origin/main` @ **`1e14d6ce`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `1e14d6ce`)
- **Next:** Manual QA — rows stay put on presence/typing/unread; new message bumps one chat; pins stay top.

---

## Challenge sync 500 + `t?.has` Messages crash (2026-07-13)

- **syncMyChallengeProgress 500:** missing Firestore index `post_reactions(user_id ASC, created_at ASC)`. Added indexes (+ comments/posts/follows/challenges composites). `countActivity` now fail-softs on query errors so one missing index cannot INTERNAL the whole sync.
- **incrementChallengeProgress 500:** Firestore transaction read-after-write (`tx.get(reward)` after `tx.set(progress)`). Fixed: read progress + reward first, then write.
- **`t?.has is not a function`:** RQ-persisted Set/Map corpses — hardened inbox organize / index builders with `ensureStringSet`/`safeSetHas`/`normalizePersistedMap`; `recent-new-friend-ids` now persists as `string[]`; `inbox-call-summaries` Map revive; Quick Add uses `ensureStringSet`.
- **Verified:** vitest related PASS · client build PASS · functions `tsc` PASS
- **Deployed (`vybe-daaab`):** firestore indexes + `syncMyChallengeProgress` / `incrementChallengeProgress` + hosting → https://vybe-daaab.web.app
- **Published:** `origin/main` @ **`6d2ff097`** · https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `6d2ff097`)
- **Note:** new indexes can take minutes to build (Building → Enabled). Client `.has` fix is live on staging.
- **Next:** Confirm index Enabled in Firebase console; hard-refresh staging Messages; Lovable Publish for production.

---

## DM scroll black gaps + instant paint deep fix (2026-07-13)

- **Cause:** Framer Motion GPU layers + `bg-background` row shells over transparent list → black slabs on fling; sibling `/messages` routes remounted tree; avatar/sign + scroll I/O amplified jank.
- **Fix:** CSS-transform swipe (no idle Motion); transparent shells; `html.is-scrolling` cheap paint; throttled scroll persist; priority avatars + idle-sign rest; single `/messages/:conversationId?` mount; messages actor refetch; chat bottom pin after seed expand; dedupe stories; pause presence/typing while chat open.
- **Verified:** `npm run test` 263 PASS · `npm run build` PASS
- **Published:** `origin/main` @ **`46be36ce`** · https://vybe-daaab.web.app ✅
- **Production:** Lovable → Share → Publish

---

## Inbox instant paint + open-chat lag (2026-07-13)

- **Cause:** “Signing in…” hid cached rows; openChat awaited profile; inbox flooded 12 high-priority message warms; nearby GPS always on; row `max-height` clipped swipe rows.
- **Follow-up (`0e0190f9`):** sync navigate (no `startTransition`); ChatView paints from cache without profile; stable `conversation-detail` key; messages query enabled without actorId; no per-row/panel glass blur; avatar 404 fails cached 10m; sign only first 24 avatars.
- **Published:** `origin/main` @ **`0e0190f9`** · https://vybe-daaab.web.app ✅
- **Note:** Console OneSignal / challenge-sync 500 / missing avatar 404s are staging noise — not the list lag root cause.
- **Production:** Lovable → Share → Publish

---

## Inbox render stability — blank collapse + remount flicker (2026-07-13)

- **Root cause (recording):** list geometry invalidation from partial row arrays + projection order swap (looked like virtualizer blank gaps). Virtual windowing permanently removed from inbox path.
- **Sticky display rows:** `resolveInboxDisplayRows` keeps cache during refetch; **rejects partial shrinks** while fetching/projection-hydrating and patches by `conversationId` into stable order.
- **No forced remount:** Removed `key` on `<DMInboxPage />` in `Messages.tsx`.
- **Projection merge:** Patch projection fields onto **legacy order** (no wholesale reorder); stale-while-revalidate; refuse shrink of `allConversations` during `isFetching`/`isLoading`.
- **Stable row model:** Core preview cache + live overlay; reuse row object refs when fields unchanged; keys = `conversationId`.
- **Scroll:** Restore **once per filter key** + once on chat return (no remount restore loop).
- **Fixed row slots:** `--dm-inbox-row-slot: 84px`; no height/margin/padding/position transitions on rows.
- **Geometry debug:** `logDmInboxGeometryReset` on rejected partials and >40% row-count drops.
- **Verified:** `npm run test` PASS · `npm run build` PASS
- **Published:** `origin/main` @ **`7fed24cc`** · Firebase hosting https://vybe-daaab.web.app ✅
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `7fed24cc`)
- **Next:** Manual QA on staging (list must not blank / jump; no glow remount; scroll stable).

---

## Snapchat-style DM inbox categories (2026-07-13)

- **Category bar:** `InboxCategoryBar` + chips (Unread, Needs Reply, Near Me, Groups, Stories, Calls, Best Friends, Streaks, New) with soft-dim filtering — matches promoted, non-matches dimmed (~48% opacity).
- **Filter engine:** `buildInboxConversationIndex`, `filterInboxByCategory`, `inboxCategoryCounts` + unit tests.
- **Hooks:** `useInboxCategories` (session persistence), `useFilteredConversations`, `useInboxCallSummaries` (per-conversation call metadata).
- **Optimistic options:** `dmInboxCachePatch` + `useDmInboxActions` instant pin/mute/read/archive/lock; Lock/Unlock row in `ConversationOptionsSheet`.
- **Row actions:** Reply chip (needs-reply), callback (calls), story avatar → `StoryViewer`.
- **Flag:** `dm_inbox_category_bar` (default ON; `localStorage` `vybe-dm-flag:dm_inbox_category_bar`).
- **Verified:** `npm run test` 247 PASS · `npm run build` PASS
- **Published:** `origin/main` @ **`970e1e59`** · Firebase hosting `vybe-daaab.web.app` ✅
- **Manual staging QA:** vybe-daaab.web.app — category switching, counts, scroll persistence, long-press, swipe, lock, new connections section.
- **Production (vybehub.app):** Lovable → Share → Publish (sync `main` @ `970e1e59` first)

---

## Staging profiles + chats load fix (2026-07-13)

- **Symptom:** vybe-daaab.web.app — full-page "Couldn't load Messages" boundary; profiles false "not found" during hydration
- **Fixes:** expanded `isRecoverableDmCacheError` (Map/Set/TDZ patterns) + boundary error persistence; hardened `useDMInbox` presence/streak maps; Profile `authReady` skeleton gate; DM inbox "Signing in…" when `profileId` unresolved
- **Staging:** `npm run build` + `firebase deploy --only hosting` → https://vybe-daaab.web.app
- **Verified:** typecheck PASS · test 235 PASS · build PASS

---

## Relationship engine + VYBE Score + conversation fix (2026-07-13)

### Phase 0 — Conversation loading (shipped in-repo)
- `useMessages` / `useDMConversations` → `networkMode: 'always'`
- `/messages/new` route above `/messages/:conversationId`
- `useChatPrefetch` uses `useAuthProfileId()`; inbox awaits profile before navigate
- `ChatView` surfaces `conversationError` + signing-in state
- **Verified:** build PASS · 208 tests PASS

### Phase 1 — Relationship backend (writes, flag-gated)
- `functions/src/relationshipEngine.ts` — `recordRelationshipActivity`, streaks, debounced rank recalc, inbox semantic projection sync, scheduled reconciliation
- Callables: `updateFriendshipPreferences`, `updateFriendshipEmojiPreferences`, `pinFavoriteFriend`, `getRelationshipState`
- Trigger: `onCallEndedRelationship` on `calls/{callId}` end
- Hooks: `dmSend`, `friendProfile` accept, `challengeProgress` claim (VYBE Score)
- `dm_inbox_entries` semantic fields: `primary_relationship_state`, `best_friend_rank`, `streak_state`, etc.
- Scripts: `scripts/relationship-backfill.mjs`, `scripts/relationship-shadow-compare.mjs`
- Flag: `app_config/relationship_rollout.relationship_engine_write` (default OFF)

### Phase 2 — Relationship client (flag-gated UI)
- Flags in `dmInboxFeatureFlags.ts`: `relationship_projection_read`, `relationship_emoji_ui`
- `relationshipEmojiMap.ts` + inbox row emoji + streak on preview line
- Best Friends tab uses `best_friend_rank` (not `close_friends`) when projection read on
- `RelationshipProfileSection` + Settings → Messages → Relationship Emojis

### Phase 3–4 — VYBE Score
- `functions/src/vybeScore.ts` — idempotent events, daily caps, milestones, rebuild, privacy callable
- Client `useVybeScore` reads Firestore; `VybeScore` sheet shows categories + privacy (flag `vybe_score_ui`)

### Phase 5 — QA + long-press fix (2026-07-13)

- **Long-press fix:** Lifted `ConversationOptionsSheet` to [`DMConversationList.tsx`](src/features/dms/DMConversationList.tsx) via `useHeldConversationOptions` + `HeldConversationOptionsSheet` (survives virtualization).
- **Unified gesture:** [`useConversationRowGesture.ts`](src/hooks/useConversationRowGesture.ts) — 450ms hold, 10px slop, tap/swipe/scroll cancel, `didLongPressRef` click suppression.
- **Row cleanup:** Removed competing camera long-press + avatar `stopPropagation` in [`DMConversationRow.tsx`](src/features/dms/DMConversationRow.tsx); `pointer-events: none` on decorative inbox layers.
- **Semantic relationship label** in options sheet via [`conversationOptionsLabel.ts`](src/lib/conversationOptionsLabel.ts).
- **Tests added:** gesture component suite (9), relationship/vybe pure logic, feature-flag rollback (232 total PASS).
- **Verified:** typecheck PASS · test 232 PASS · lint PASS · build PASS · functions build PASS
- **Device QA checklist (manual):** hold still · hold+slight move · hold while scrolling · swipe L/R · tap row · tap camera · verify sheet stays open when row scrolls off screen

---


- **Restored:** `sync_my_challenge_progress` RPC → `syncMyChallengeProgress` Cloud Function (removed fake `{ ok: true }` stub).
- **Server CFs:** `functions/src/challengeProgress.ts` — `syncMyChallengeProgress` (60s server cooldown, recalc from trusted activity, never lowers valid progress, returns changes + newly_completed + timestamps), `incrementChallengeProgress`, `claimChallengeReward`. **No** `forceSyncMyChallenges` export.
- **Deleted prod:** `forceSyncMyChallenges` (us-central1) — no remaining app callers.
- **Index:** `messages(sender_id ASC, created_at ASC)` added to `firestore.indexes.json` and deployed.
- **Client:** `useChallengeSync` hook (60s client cooldown) — login, app resume, reconnect, Challenges screen open, daily login activity. Manual sync button uses `force: true`.
- **Callers updated:** `ChallengesHub`, `ProfileSection`, `useRetroactiveSync`, `DeferredAuthHooks`, `useDailyLogin`.
- **Deployed (vybe-daaab):** indexes ✅ · `syncMyChallengeProgress` ✅ · `incrementChallengeProgress` ✅ · `claimChallengeReward` ✅
- **Verified:** functions build PASS · client build PASS · test PASS
- **You:** Lovable Publish for vybehub.app · device QA on Challenges sync + claim XP

---

- **Entry points:** `ConversationOptionsSheet`, `RelationshipProfileActions`, `ChatView`, `DMConversationRow`, `DMComposeButton`, `CreateMenu*`, `StoryCreator` now use `openSnapCamera({ source, conversationId?, recipientIds?, returnRoute?, replyToMessageId? })` — no blob-URL `onSend` / inline `insertDmMessage`.
- **Global multi-send:** After global camera send, overlay stays open, shows "Sent to N" toast, clears draft, preserves camera side/zoom/flash.
- **Reply context:** `CameraLaunchContext.replyToMessageId` + `replyConversationId`; wired from ChatView when replying.
- **Story destinations:** Custom/Group Story hidden unless `snap_future_story_destinations` feature flag.
- **Offline ephemeral:** view-once/replay-once pending shows "Waiting for connection"; blob cleanup on sent/dismiss/expired failed draft.
- **Tests:** Vitest includes `.tsx`; component tests for SnapEditor, SendToScreen, SnapSendProgress, useSheetBackStack; +snapFlowBehavior/snapBlobCleanup/storyDestinationVisibility. **204 tests PASS.**
- **Enforcement:** `npm run test:camera-send-enforcement` static scan.
- **Removed:** legacy `handleVybeSend` blob path from ChatView.
- **Verified:** typecheck PASS · test PASS (204) · lint PASS · build PASS · functions build PASS · camera-send-enforcement PASS.
- **Pushed:** `origin/main` @ **`678bcb19`**
- **Device QA:** manual pass still required (capture, offline, partial failure, back button).
- **Deployed (vybe-daaab, 2026-07-13):** Firestore rules ✅ · indexes ✅ · **`getFriendshipState`** ✅ · **`mutateFriendship`** ✅
- **Functions fleet:** full `--force` redeploy hit Cloud Run CPU quota in `us-central1` — many unrelated CF updates failed; new friendship callables are live. Orphan challenge CFs (`claimChallengeReward`, etc.) still in prod (delete failed).
- **You:** Lovable → sync `main` @ **`0d9bb0d1`** → Publish. Request GCP quota increase if you need a full CF fleet refresh.

---

## Snapchat-style camera flow: capture → edit → Send To → background send (2026-07-13)

- **User ask:** Redesign the VYBE camera to match Snapchat's capture → edit → send mechanic; one shared system for all entry points (Messages, Stories, VYBE Snap, Create); VYBE theming; existing Firebase backend (callable-only DM sends).
- **New launch model:** `src/lib/camera/cameraLaunchContext.ts` — `CameraLaunchContext { source: global|conversation|story|profile|group|create, conversationId?, recipientIds?, groupId?, profileId?, defaultDestination?, returnRoute? }`. Every camera entry now passes it via `OpenCameraOptions.launchContext` (new `openSnapCamera()` helper in `CameraOverlayContext`). Legacy `onSend`/`onCapture` paths still work when no context is passed (DesktopCreateStudio, CameraFirstOverlay).
- **Flow:** capture (shutter flash, existing hold-to-record ring/timer/grid/zoom/flip/gallery) → `SnapCaptureFlow` → `SnapEditor` (floating edge controls: Retake top-left; Text/Stickers/Draw/Image rail top-right + `editorExtensions.ts` registry for future Music/Crop/Trim/Mute/Captions; Save + media-mode selector bottom-left; recipient/story-audience chip bottom-center; themed Send bottom-right with <400ms shrink animation, reduced-motion aware) → direct send when preselected, else `SendToScreen` (Recent / Best Friends / Friends / Groups / Stories sections, search, multi-select, chips row, "Send to N" bar, blocked users filtered) → background send → return route per source.
- **Send pipeline (new `src/lib/camera/`):** `snapDraft.ts` (local draft before upload; deterministic `snap-<mediaId>:<conversationId>` client_message_id idempotency), `uploadSnapMedia.ts` (upload once to `chat-media`, reuse URL for every conversation *and* story destination; video thumbnail), `snapSendService.ts` (module-level jobs: preparing/uploading/processing/sending/sent/partially_sent/failed/retrying + waiting_for_connection; optimistic vybe bubbles per conversation via messages cache, replaced on confirm / marked `_failed`; DM sends via callable-only `insertDmMessage`; per-destination retry-failed-only), `createStoryRecord.ts` (non-hook story insert; My Story + Close Friends), `snapOfflineQueue.ts` (IndexedDB persistence incl. media Blob, flush on reconnect), `snapSendStateMachine.ts` + `recipientSelection.ts` (pure, tested). `SnapSendProgress` (mounted in `CameraOverlayProvider`) shows non-blocking progress + retry.
- **Entry points wired:** ChatView snap button (conversation preselected, chip, returns to chat), `DMConversationRow` long-press (fixes old blob-URL-to-server bug), `DMComposeButton` "Send VYBE Snap" (fixes previously dead flow — now global Send To), `CreateMenuLayer` (global), hub `CreateMenu` (create → post prefill to /upload), `StoryCreator` camera (story audience chip, posts directly, returns Home).
- **Media modes:** view_once / replay_once / 24h (timed) / permanent — all server-allowed values in `sendDmMessage`.
- **Tests:** +5 files / 64 tests — `cameraLaunchContext.test.ts` (destination rules, return routes), `snapDraft.test.ts` (draft + idempotency), `snapSendStateMachine.test.ts` (phases, partial fail, retry-failed-only), `recipientSelection.test.ts` (chip add/remove/labels), `snapOfflineQueue.test.ts` (queue semantics with in-memory store).
- **Verified:** typecheck PASS · test PASS (25 files / 184) · lint PASS (repo-wide) · build + postbuild PASS.
- **Gaps / degradations (no backend support):**
  - Custom Story / Group Story audiences — no schema; shown disabled ("Soon") in audience picker + Send To; `createStoryRecord` rejects them loudly.
  - Music/crop/trim/mute/captions in editor — documented extension points (`editorExtensions.ts`); existing `ImageCropEditor`/`VideoTrimEditor` under create/ not yet wired.
  - Video overlay bake remains best-effort (existing `bakeCameraEdits` limitation).
  - Slide-away-cancel while recording not implemented (existing record button has no slide gesture); reply-context launch not plumbed (would need `replyToMessageId` on the context).
  - Component tests skipped — vitest `include` is `src/**/*.test.ts` (no .tsx).
- **Follow-ups for the social-surfaces agent (files I could not edit):** `ConversationOptionsSheet.tsx` "VYBE Snap" action and `RelationshipProfileActions.tsx` camera action still use the old blob-URL `onSend` path — switch both to `launchContext: { source: 'conversation'|'profile', conversationId, returnRoute }` (drop their `onSend` + `insertDmMessage` blocks).
- **Next:** (1) wire ConversationOptionsSheet + RelationshipProfileActions to launchContext once unlocked; (2) device pass on capture→edit→send timings + offline queue (airplane-mode test); (3) decide custom/group story backend (stories audience table) and enable the disabled audiences.
- **Published:** not committed/pushed yet.

---

## VYBE Social Surfaces — drawer + canonical profiles (2026-07-13)

- **User ask:** Implement the approved "social surfaces" plan: conversation long-press action drawer, nested chat-settings/friendship drawers, canonical `/u/:username` relationship profile, People You May Know, and friendship-state hardening.
- **Routing:** `/u/:username` is now canonical for self/friend/pending/stranger/blocked (`src/pages/RelationshipProfile.tsx`); `/friend/:username` is a compatibility redirect; `profilePathForFriendship` always returns `/u/`. Self resolves to the owner Profile surface; blocked (either direction) renders a privacy-safe "Unavailable" state before any data shows.
- **Long-press drawer:** `ConversationOptionsSheet` rebuilt as a full-width Vaul bottom drawer (friend card w/ avatar glow + presence + relationship badge + profile chevron; VYBE Snap / Chat / Video / Voice quick actions with call-availability reasons; 54–60px action rows; destructive Delete/Block/Report last with confirmations). Opened by the existing 480ms/8px hold in `SwipeableDmConversationRow` (haptic on open, tap/swipe arbitration preserved, ContextMenu/Shift+F10 keyboard support, Android back via `useSheetBackStack` history stack).
- **Nested drawers:** Chat Settings (per-conversation alerts, mentions, reactions, media auto-download, disappearing default, receipts/typing/theme/wallpaper) persists to viewer-owned `dm_settings` (owner-only rules already in place; new fields additive). Friendship detail drawer shows pair stats, streak, shared media, saved messages, calls, location state, pin state, mutual friends. Create Group opens the existing creator with the friend preselected.
- **Profile surface:** Hero (avatar, name + verified badge, mode chip, privacy-gated bio/presence/mutuals, Back/Share/More), mode-exact relationship controls (Add → optimistic Request Sent/cancel; Accept/Decline; Message + Send VYBE Snap for friends), privacy-filtered posts/clips/stories/shared tabs (empty sections hidden), People You May Know (up to 6 compact Add/Dismiss cards), state-aware More menu (share/copy/hide suggestion/cancel/accept/decline/block/report).
- **Friendship hardening:** `getFriendshipState`/`mutateFriendship` callables are the only write path (self/duplicate/already-friends/blocked enforced in transactions + rate limit); `declined`/`cancelled` preserved instead of collapsing to pending; client hooks do optimistic cache updates with snapshot rollback + realtime invalidation; `friend_requests` client writes locked to admin-only schema/transition-validated rules.
- **Tests:** gesture arbitration (`dmLongPressGesture.test.ts`), action-state labels (`conversationActionModel.test.ts`), canonical routing (`friendProfileRoutes*.test.ts`), friendship state machine (`useFriends.test.ts`); emulator rules script added (`scripts/test-friendship-rules.mjs`).
- **Verified:** typecheck PASS · test PASS (137/20 files) · lint PASS · build PASS · functions build PASS · rules syntax PASS (Firebase MCP validator).
- **Blockers:** Emulator rules script needs Java (not installed on this machine) — run `npx firebase-tools emulators:exec --only firestore,auth "node scripts/test-friendship-rules.mjs"` once Java is available. Manual device pass (iOS/Android hold, swipe-down, back, share fallback, calls, offline rollback) still to do. New callables (`getFriendshipState`, `mutateFriendship`) and rules need `firebase deploy` before publish.
- **Next:** 1) Deploy functions + rules to `vybe-daaab`; 2) push `origin/main` + Lovable Publish; 3) device spot-check long-press drawer + `/u/` profile states.

---

## Match concept Chat mock exactly (2026-07-13)

- **User ask:** Make inbox look like the concept mock in every way (keep density).
- **Chrome:** Title → **Chat**; tabs → Friends / Best Friends / Nearby / Groups / Requests / Unread (legacy set).
- **Layout:** Glowing glass conversation panel (rounded top + neon border); stronger ambient wash.
- **VFX:** Hotter avatar ring bloom (tone variants), glass header pills, magenta tab underline glow, rounded-square camera, vivid status tones, bloom compose FAB.
- **Verified:** typecheck PASS · test PASS (120) · build PASS.
- **Pushed:** `origin/main` @ **`bf864d99`**
- **You:** Lovable → sync/confirm `main` @ **`bf864d99`** → **Share → Publish** → hard-refresh https://vybehub.app/messages
- **Next:** Spot-check Chat title, Friends tabs, glass panel, neon rings on device.

---

## Inbox neon glass VFX polish (2026-07-13)

- **User ask:** Keep compact conversation density; upgrade look to match concept mock (neon rings, glass header actions, glow tab underline, richer status/camera/compose VFX).
- **Kept:** 72px rows, redesign filters, thin separators, capture long-press sheet.
- **Added:** Ambient primary/accent wash; glowing header avatar ring + Search/Bell/Add/More glass pills; neon tab underline; per-row ring tones; status icon + relationship meta + quick reaction; glowing camera circle + compose bloom; unread tint rail.
- **Verified:** typecheck PASS · test PASS (120) · build PASS.
- **Pushed:** `origin/main` @ **`6fbe9ea8`**
- **You:** Lovable → sync/confirm `main` @ **`6fbe9ea8`** → **Share → Publish** → hard-refresh https://vybehub.app/messages
- **Next:** Spot-check glow + density on device.

---

## Snapchat-density Messages inbox (2026-07-13)

- **User ask:** Match VYBE Messages inbox to Snapchat compact density/spacing/row behavior; keep VYBE branding, icons, themes, backend. No Snapchat IP assets.
- **Status line:** `resolveDmInboxStatus` → one line (`Received · 15m · 6 🔥`, `Start a conversation`, group `Name: preview · time`). Empty preview copy no longer says “Tap to chat.”
- **Row/header:** Compact `DMConversationRow` (name + status + light capture shortcut; long-press → Photo/Video/Voice/Location). Compact `DMHeader` (44px avatar · Messages · Add Friend · More).
- **CSS:** Rows 72px (68–74), avatars ~50px / 2px ring, 10px online, 14×8 padding, 11px avatar gap, 16/600 name, 13px preview, 38px camera, 42px underline filters, 54px compose above bottom nav. Thin separators, no row cards, reduced glow. Virtual row estimate 72px.
- **Filters:** Redesign filter set (All / Unread / Needs Reply / Groups / Pinned / Active) forced on for Messages chrome; projection-read flag unchanged.
- **Verified:** typecheck PASS · test PASS (120) · build PASS.
- **Pushed:** `origin/main` @ **`0bbfdee6`**
- **You:** Lovable → sync/confirm `main` @ **`0bbfdee6`** → **Share → Publish** → hard-refresh https://vybehub.app/messages
- **Next:** Spot-check phone density (8–10 rows visible); confirm filters/header/camera long-press.

---

## Rollout — callable send + projection deploy (2026-07-12)

- **Deployed to `vybe-daaab`:**
  1. Firestore rules ✔ (messages create denied; dm_inbox_entries; app_config; message_deletions)
  2. Indexes ✔
  3. Cloud Functions ✔ (`sendDmMessage` update + projection triggers + `backfillDmInboxEntries` / `refreshMyDmInboxEntry`)
  4. Backfill ✔ `node scripts/backfill-dm-inbox.mjs` → COMPLETE `totalProcessed=238 totalWrote=219` (~174 live `dm_inbox_entries` after invalid/empty drops)
- **Rollout config:** `app_config/dm_inbox_rollout` seeded with internal ids (`e78010f2-…`, `wuy7bIoV…`), `projection_read_pct=0`, `redesign_ui_pct=0`, empty `redesign_internal_ids`
- **Client gates:** shadow on for all; projection read for internal allowlist only; redesign UI off until `redesign_internal_ids` / pct raised (legacy Friends/Nearby/Requests tabs remain default)
- **Pushed:** `origin/main` @ **`21bb72b4`**
- **You:** Lovable → open project → sync/confirm `main` @ **`21bb72b4`** → **Share → Publish** → hard-refresh https://vybehub.app/messages
- **Verified:** typecheck · 120 tests · functions + rules/indexes deploy PASS · backfill COMPLETE

---

## Callable-only DM send + blocked enforcement (2026-07-12)

- **User ask:** Do not enable redesign for everyone yet. Fix blocked-user gap by routing every DM send through `sendDmMessage`; keep legacy inbox; add blocked/rate-limit/reconnect tests.
- **Fix:** `insertDmMessage` is callable-only (no client Firestore message create). Rules deny `messages` create (`allow create: if false`). CF enforces blocks (before membership writes), rate limits, schema/media validation, `client_message_id` idempotency, and `dm_send_audit`. Outbox passes temp id as `client_message_id` and treats blocked as permanent fail. Story/share/call/capture/admin DMs also go through `insertDmMessage`.
- **Flags:** `dm_inbox_projection_read` / `dm_inbox_redesign_ui` remain **default off**. Shadow compare stays on.
- **Tests:** `dmSendErrors.test.ts`, `dmSendCore.test.ts`, `scripts/test-dm-send-enforcement.mjs` (+ `:emu`).
- **Rollout order:** deploy rules/indexes/functions → backfill projection → shadow monitor → internal `dm_inbox_projection_read` → small % `dm_inbox_redesign_ui` — **after** this send-path deploy is live.
- **Verified:** typecheck PASS · test PASS (120) · lint PASS · build PASS · functions build PASS · `test:dm-send-enforcement` PASS (static).
- **Published:** not committed/pushed yet.

---

## Messages redesign Phase 1 (projection) + Phase 2 (inbox UI) (2026-07-12)

- **User ask:** Implement full Messages redesign plan — projection first, then one-list inbox against the final data contract.
- **Phase 1 — projection:** `functions/src/dmInboxProjection.ts` (triggers on messages/members/conversations + admin `backfillDmInboxEntries` + `refreshMyDmInboxEntry`); `dm_inbox_entries` rules (viewer read-own, no client writes); composite indexes; emulator ports in `firebase.json`; `scripts/test-dm-inbox-rules.mjs`; client loader/shadow compare/feature flags (`dmInboxProjection.ts`, `dmInboxShadowCompare.ts`, `dmInboxFeatureFlags.ts`, `useDmInboxProjection`); `useDMInbox` shadow-reads while legacy remains visible until `dm_inbox_projection_read` is enabled.
- **Phase 2 — inbox:** Filters All / Unread / Needs Reply / Groups / Pinned / Active (no section headers); activity-first All sort; per-filter scroll + filter prefs persistence; sticky “Messages” header + activity line; compose sheet (New message / New group / Send VYBE Snap); Requests removed from Messages filters (lives under Add Friends).
- **Verified:** covered by later Phase 7–8 full suite (typecheck / 107 tests / lint / build / functions build / rules static).
- **Rollout:** deploy rules+indexes+functions → backfill → shadow observe → flip `dm_inbox_projection_read` → then `dm_inbox_redesign_ui`.
- **Published:** not committed/pushed yet.

---

## Messages redesign Phase 7 (realtime/offline/push/security) + Phase 8 (a11y/tests/cleanup) (2026-07-12)

- **User ask:** Harden the `dm_inbox_entries` projection era with security/offline fixes (Phase 7), then a11y, filter tests, legacy-file pointers, docs, and a full verification pass (Phase 8).

**Phase 7**
- **Projection triggers** — already covered `conversation_members` writes (`onDmInboxMemberWritten`), including `last_read_at` updates recomputing `unread_count`/`needs_reply`; no gap found, no change needed.
- **`functions/src/dmSend.ts` (`sendDmMessage`)** — added a rate limit (60/min/uid via the existing `rateLimit`/`enforceRateLimit` helpers) and a blocked-user check (`isBlockedPair`, queries `blocked_users` both directions) before the message write. **Gap:** the primary send path is a direct client Firestore insert (`insertDmMessage` in `dmSendCore.ts`), gated only by `firestore.rules`, which can't cheaply query `blocked_users` (non-composite doc IDs) — so blocking is only enforced on the Cloud Function fallback path today. Documented in `docs/MESSAGING.md`.
- **`firestore.rules`** — added the missing `message_deletions` match block (collection is written by `useMessageDeletions.ts`/`useMessageActions.ts` but had zero rules — any signed-in write would have been silently denied by the default-deny fallthrough, and there'd be nothing stopping a future looser rule from exposing other users' deletion records). Scoped like `message_pins`: owner-only read/write via `user_id`.
- **Friend request / report callables** — searched `functions/src`; neither exists as a callable (both are direct Firestore writes gated by `firestore.rules` today), so there's nothing to rate-limit here. Noted as N/A rather than skipped silently.
- **`functions/src/pushTriggers.ts`** — confirmed muted members are already excluded from DM push (`member.is_muted === true` check on the primary `conversation_members` path); added a comment explaining why the two bootstrap fallback paths (used only when a 1:1 thread has zero membership rows yet) can't apply mute suppression. Deep-link fields (`conversationId`, `path`) were already present in the push payload.
- **`src/lib/dmOutbox.ts`** — fixed a real bug: permanently-failing queued sends (validation/permission errors, not just offline) were silently dropped from the outbox with no user-facing signal. Items now get `status: 'failed'` instead of being deleted, and a new `vybe:dm-outbox-failed` event fires. `App.tsx` listens for it, flags the corresponding message bubble `_failed` (reusing the existing retry-bubble UI/CSS in `ChatView`) and shows a toast. `retryFailedItem(tempId)` lets the user retry from the stored payload even after `ChatView` remounts (doesn't depend on in-memory `pendingMessagesRef`); `ChatView`'s retry button now tries that first, falling back to the in-session retry. No second outbox — same store, same `flush()` loop.

**Phase 8**
- **A11y** — `DMCategoryTabs.tsx` now implements the roving-tabindex ARIA tablist pattern (Arrow Left/Right/Up/Down, Home, End move focus and activate); added `role="tabpanel"`/`aria-labelledby`/`id` wiring between the tabs and `DMConversationList`. Added a visually-hidden `aria-live="polite"` unread-count announcer to `DMInboxPage` and `DmInboxSafeList`. Spot-checked tap targets for DM-specific controls (tabs 58px, header actions/compose FAB 44–68px, swipe actions full row height) — already compliant from earlier phases, no changes needed.
- **Tests** — new `src/lib/dmInboxOrganize.test.ts` (`compareInboxActivity` tie-breaking; `filterConversationsForTab` for `all`/`needs_reply`/`active`/`unread`-fallback; `filterPreviewsForFilter` for `all`/`needs_reply`/`active`/`unread`) and `src/lib/dmInboxFilterPersistence.test.ts` (stored filter + legacy-tab migration, per-filter scroll, per-profile order/hidden prefs). `dmInboxShadowCompare.test.ts` already existed and was left as-is (already covers the projection-vs-legacy diff).
- **Legacy files** — `src/components/chat/ConversationList.tsx` and `src/components/chat/DMsHeader.tsx` confirmed unreferenced by anything except each other (dead code, not deleted). Updated/added header comments pointing at `DMInboxPage`/`DmInboxSafeList`, the feature flags in `dmInboxFeatureFlags.ts`, and `docs/MESSAGING.md` for the rollback criteria — no behavior change.
- **`docs/MESSAGING.md`** — new "Messages redesign — `dm_inbox_entries` projection" section (doc shape, rules, triggers, client hooks, feature-flag table + rollout order, testing pointers) and "Offline outbox — failure surfacing" section; updated "Active inbox UI" pointer and the send-pipeline note to mention the blocked-user/rate-limit gap.

### Verification
- `npm run typecheck` — PASS.
- `cd functions && npx tsc --noEmit` — PASS.
- `npm run test` — PASS (14 files / 107 tests; +2 files / +25 tests over the prior 12/82).
- `npm run lint` — PASS.
- `npm run build` — PASS (+ `postbuild` dist checks PASS).
- `cd functions && npm run build` — PASS (recompiled `lib/` for `dmSend.ts`/`pushTriggers.ts`).
- `npm run test:dm-inbox-rules` — PASS (static check; emulator not running, matches script's documented behavior).

### Files changed
- `functions/src/dmSend.ts`, `functions/src/pushTriggers.ts` (+ recompiled `functions/lib/*`)
- `firestore.rules`
- `src/lib/dmOutbox.ts`, `src/App.tsx`, `src/components/chat/ChatView.tsx`
- `src/features/dms/DMCategoryTabs.tsx`, `src/features/dms/DMInboxPage.tsx`, `src/components/chat/dm-inbox/DmInboxSafeList.tsx`, `src/features/dms/DMConversationList.tsx`
- `src/components/chat/ConversationList.tsx`, `src/components/chat/DMsHeader.tsx` (comments only)
- `docs/MESSAGING.md`, `WORKLOG.md`
- New: `src/lib/dmInboxOrganize.test.ts`, `src/lib/dmInboxFilterPersistence.test.ts`

### Blockers / remaining gaps
- **Blocked-user enforcement doesn't cover the primary send path** (direct Firestore insert) — only the Cloud Function fallback checks `blocked_users`. Closing this properly needs either deterministic `blocked_users` doc IDs (`{blockerId}_{blockedId}`) so `firestore.rules` can `exists()`-check them on message create, or routing all sends through `sendDmMessage`. Both are bigger changes than this pass's scope — flagged for explicit follow-up, not attempted.
- No callable rate limits added for friend requests/reports since neither is implemented as a callable (direct Firestore writes only).
- Device QA still outstanding for: swipe interactions, VFX reduced-motion, `/messages/search`, DM theme bubbles (carried over from Phase 3–6), plus the new keyboard-nav tabs and outbox-failure toast/retry flow.
- Not committed/pushed — awaiting explicit go-ahead per instructions.

### Next 3 tasks
1. Decide on the blocked-user enforcement gap (composite `blocked_users` IDs + rules check, vs. funneling all sends through `sendDmMessage`).
2. Manual QA: force a permanent outbox failure (e.g. temporarily deny a write) and confirm the toast + bubble retry + `retryFailedItem` flow feels right on-device.
3. Commit/push once approved, then Lovable Publish.

---

## Messages redesign Phase 5 (search) + Phase 6 (ChatView split, start) (2026-07-12)
- **User ask:** Ship `/messages/search` page + start splitting `ChatView.tsx` into modules without breaking send/realtime.
- **Phase 5 — search:** New `MessagesSearchPage` (`/messages/search`, wired in `AnimatedRoutes.tsx`); `DMInboxPage`/`DmInboxSafeList` search buttons now navigate here instead of opening `ChatSearchSheet`. `useMessagesSearch` debounces (250ms) + guards stale requests via monotonic request id; conversations search `dm_inbox_entries.search_tokens` (`array-contains`, via `searchDmInboxEntriesByToken` in `dmInboxProjection.ts`, using `firestoreDb` helpers — not the `db` shim) and fall back to filtering the loaded inbox if the query throws/misses; people search stays on the `db` shim (`profiles` table, matches existing `Search.tsx`/`NewMessage.tsx` pattern). Recent searches persist in `localStorage` (`dmSearchHistory.ts`, max 8); initial state shows recent searches, recent conversations, and suggested (friend, non-recent) people. Message-body search deferred (would require N+1 or a dedicated index — out of scope for this pass).
- **Phase 6 — ChatView split (started, not finished):** Extracted `chat-view/ChatThreadShell.tsx` (shell div + `ChatHeader` wrapper — `ChatHeader.tsx` already existed with the compact back/avatar-name/call-video-more layout + `EphemeralChatNotice`) and `chat-view/groupMessages.ts` (pure sender-grouping + `spacingClassForItem`, same precedence as the old inline logic: media-transition/sender-switch > reply > default). `ChatView.tsx` now builds `profileSlot`/`actionsSlot` and renders `<ChatThreadShell>` instead of the inline `<div>` + `<header>`; `messageItems` now calls `groupMessages()`. Composer, message list, swipe-reply, double-tap reaction, and long-press sheet were **not** touched — still inline in `ChatView.tsx`. `useInstantSend`/realtime paths untouched.
- **Bubble theming:** Renamed the (previously dead — no JS ever set them) `--dm-theme-sent`/`--dm-theme-received` CSS vars to `--dm-bubble-sent`/`--dm-bubble-received` + added `-fg` text vars; `ChatThreadShell`'s `themeStyle` now sets all four from `blendDmThemes()` whenever the viewer picked a non-default DM theme, so bubble color actually reflects the equipped theme (previously computed but unused).
- **Verified:** `npm run build` PASS · `npm run test` PASS (12 files / 82 tests) · `npm run lint` PASS.
- **Not done / deferred:** Member-scoped message-body search; further ChatView slimming (composer/message-list extraction); no manual device QA of chat theming or search UX yet.
- **Published:** Not committed/pushed — awaiting explicit go-ahead.
- **Next 3 tasks:** 1. Manually QA `/messages/search` (empty state, debounce, start-chat, projection-index-still-building fallback) and themed bubble colors in a real chat. 2. Continue Phase 6: extract message list rendering + simplify `ChatComposer` prop surface. 3. Commit/push once approved, then Lovable Publish.

## Messages crash fix — persisted Set cache (2026-07-12)
- **User ask:** “Couldn't load Messages” after DM tabs ship
- **Cause:** React Query persistence turns `Set` into `{}`; `.has()` on call/friend/request sets threw in `useDMInbox`, then SafeList reused the same hook and bubbled to page fallback
- **Fix:** `ensureStringSet` + normalize pending requests/close friends; harden request row; nested LocalErrorBoundary so safe list can't blank the whole Messages page
- **Verified:** typecheck PASS · test PASS (79)
- **Published:** pending push + Lovable Publish
- **You:** Lovable sync `main` → **Share → Publish**; hard-refresh `/messages` (Retry / Full reload if sticky)

## DM inbox tabs deep fix (2026-07-12)
- **User ask:** Tabs don’t filter / feel broken — deep scan UI + backend and make DMs perfect
- **Fixes:** Scroll reset on tab change; Requests = first-class accept/decline rows; Nearby always on while inbox mounted + peer cards + locating/denied UX; Best Friend toggle in chat options + invalidate `close-friend-ids`; Friends excludes request threads; unread badge unified with `_hasUnread` + calls; safe list uses `useDMInbox`
- **Tests:** `filterConversationsForTab` coverage (78 tests)
- **Verified:** typecheck PASS · lint PASS · test PASS · build PASS
- **Published:** `origin/main` @ **`76106704`** — awaiting Lovable Share → Publish
- **You:** Lovable → sync `main` @ **`76106704`** → **Share → Publish**; hard-refresh `/messages`; QA each tab

## Full concept DM inbox restore (2026-07-12)
- **User ask:** Restore inbox to concept image look — dense neon rows, story rings, full chrome (not compact/basic)
- **CSS:** 96px rows / 64px avatars / 48px camera / 64px FAB / 80px header / 58px tabs; status+preview typography; reduced-motion; virtual slice 96/32
- **Stories:** Re-enabled `useStories` → `storyStateByProfileId` via `normalizeStoryGroups` + try/catch (no safe-mode crash)
- **Rows:** Trail timestamp; status icons, badges, streaks, reactions, presence, secondary avatar, unread bar preserved; name stays plain text; TAP_SLOP open-chat kept
- **Safe list:** Tabs + compose FAB + message preview parity
- **Verified:** typecheck PASS · lint PASS · tests PASS · build PASS
- **Published:** `origin/main` @ **`04d6cced`** — awaiting Lovable Share → Publish
- **You:** Lovable → sync `main` @ **`04d6cced`** → **Share → Publish**; hard-refresh `/messages`

## DM inbox richer rows restore (2026-07-12)
- **User ask:** “where is everything else… make it look better” after compact pass felt empty
- **Cause:** Compaction hid the message preview line (`display: none`) and dropped it from row markup; safe-mode list also lacked full Chat chrome
- **Fix:** Restored status + message preview under names; stronger glass header/tabs/aurora; 86px rows / 52px avatars / 44px camera / 60px FAB; safe list shows Chat header + search (no safe-mode banner); remount key `dm-inbox-v3`
- **Open-chat fix:** Name was a nested button that `stopPropagation`’d pointerdown (dead zone when no username / stole taps to profile); swipe gesture treated tiny vertical jitter as scroll and skipped `onClick`. Name is plain text again (row opens chat); avatar still opens profile; tap slop opens chat after micro-moves.
- **Verified:** typecheck PASS · lint PASS · tests PASS · build PASS (open-chat typecheck PASS)
- **Published:** `origin/main` @ **`ff331773`** — awaiting Lovable Share → Publish
- **You:** Lovable → sync `main` @ **`ff331773`** → **Share → Publish** for **vybehub.app**; hard-refresh `/messages`; tap row → chat, avatar → profile

## Concept DM inbox full visual match (2026-07-12)
- **User ask:** Match concept image — six tabs, status icons, neon VFX, Best Friends/Nearby; Firebase-only (not Supabase)
- **Tabs:** Friends / Best Friends / Nearby / Groups / Requests / Unread (Calls merged into Unread); sessionStorage persistence; Calls legacy tab remaps to Unread
- **Data:** Expanded `DMConversationPreview` with storyState, deliveryStatus, badges, secondary avatar; `resolveDmInboxStatus` + lucide icons; `useCloseFriendIds`; Nearby via `useNearbyFriendLink` when tab active; batched `useStories` for rings
- **UI/VFX:** Glass rounded tabs, conic neon rings, unread accent bar + badge pulse, status tones, trail camera/reaction, compose FAB above bottom nav; theme CSS variables only
- **Verified:** typecheck PASS · lint PASS · 71 tests PASS · build PASS
- **Published:** pending Lovable Publish after push
- **You:** Lovable → sync `main` → **Share → Publish**; hard-refresh `/messages` — concept tabs + neon rows

## DM inbox concept restore + full-width layout (2026-07-12)
- **User ask:** Inbox looked like plain fallback list beside giant empty card — restore concept neon-glass design from reference
- **Layout:** `/messages` inbox is full-width until a chat opens; removed desktop marketing empty pane; split pane only on `lg+` when a thread is active
- **Visual:** Restored concept measurements — 96px rows, 64px avatars with conic rings, 58px glow tabs, glass header, separate status + preview lines, 48px camera, 64px FAB
- **Resilience:** `DmInboxSafeList` now uses production row chrome + signed avatars; camera row uses optional overlay hook (no provider crash)
- **Verified:** typecheck PASS · lint PASS · 71 tests PASS · build PASS
- **Published:** pending push + Lovable Publish
- **You:** Lovable → sync `main` → **Share → Publish**; hard-refresh `/messages` — expect full-screen Chat header + tabs + neon rows (not letter-only sidebar)

- **DM inbox:** Production rows are 80px with 52px avatars, 42px camera targets, a 56px compose FAB, slimmer safe-area header/tabs, one secondary status/preview line, hairline separators, a soft avatar ring, 2px active underline, and light list-level glass. Swipe, camera, profile navigation, tabs, desktop layout, and virtual slicing remain wired; row/header estimates now exactly match 80px/28px and skeletons match the compact geometry.
- **Theme persistence:** Authenticated reads are strictly scoped to the live Firebase UID; global theme keys are unauthenticated legacy-only. Equip/save/hydration paths pass the authenticated UID, scoped timestamps participate in storage synchronization, and account-mismatched boot snapshots are rejected. Local scoped state remains first-paint authority over Firestore backup.
- **Theme races/reset:** Auto-Pilot cannot overwrite an explicit equipped theme, mode remains independent from theme identity, and reset cleanup is shared across settings/logout paths and removes scoped tokens/timestamps, boot snapshot, remembered UID, equipped ID, and global legacy state.
- **Tests:** Added focused coverage for scoped reads, account switching, snapshot isolation, reset cleanup, and the Auto-Pilot guard; completed test storage now implements the standard `length`/`key()` API.
- **Verified:** `npm run typecheck` PASS · `npm run lint` PASS · `npm run test` PASS (11 files / 71 tests) · `npm run build` PASS · `npm run validate:css` PASS (two pre-existing Tailwind ambiguity warnings).
- **Blockers/manual QA:** No code blocker and no deploy performed. Device QA remains for `/messages`: safe areas, tabs after reload, swipe/profile/camera targets, FAB hide/clearance, 40+ row virtualization, desktop split pane; also verify cold boot/equip/account-switch/reset/Auto-Pilot theme behavior.
- **Next 3 tasks:** 1. Run the compact inbox checklist on iPhone and tablet. 2. Test two-account theme switching plus cold launch/reset/Auto-Pilot. 3. After approval, commit/push and use Lovable Publish separately.

## DM inbox Snapchat-style redesign (2026-07-12)
- **User ask:** Match concept image — six tabs, status icons, neon VFX, Best Friends/Nearby; Firebase-only (not Supabase)
- **Tabs:** Friends / Best Friends / Nearby / Groups / Requests / Unread (Calls merged into Unread); sessionStorage persistence; Calls legacy tab remaps to Unread
- **Data:** Expanded `DMConversationPreview` with storyState, deliveryStatus, badges, secondary avatar; `resolveDmInboxStatus` + lucide icons; `useCloseFriendIds`; Nearby via `useNearbyFriendLink` when tab active; batched `useStories` for rings
- **UI/VFX:** Glass rounded tabs, conic neon rings, unread accent bar + badge pulse, status tones, trail camera/reaction, compose FAB above bottom nav; theme CSS variables only
- **Verified:** typecheck PASS · lint PASS · 71 tests PASS · build PASS
- **Published:** pending Lovable Publish after push
- **You:** Lovable → sync `main` → **Share → Publish**; hard-refresh `/messages` — concept tabs + neon rows

## DM inbox concept restore + full-width layout (2026-07-12)
- **User ask:** Inbox looked like plain fallback list beside giant empty card — restore concept neon-glass design from reference
- **Layout:** `/messages` inbox is full-width until a chat opens; removed desktop marketing empty pane; split pane only on `lg+` when a thread is active
- **Visual:** Restored concept measurements — 96px rows, 64px avatars with conic rings, 58px glow tabs, glass header, separate status + preview lines, 48px camera, 64px FAB
- **Resilience:** `DmInboxSafeList` now uses production row chrome + signed avatars; camera row uses optional overlay hook (no provider crash)
- **Verified:** typecheck PASS · lint PASS · 71 tests PASS · build PASS
- **Published:** pending push + Lovable Publish
- **You:** Lovable → sync `main` → **Share → Publish**; hard-refresh `/messages` — expect full-screen Chat header + tabs + neon rows (not letter-only sidebar)

- **DM inbox:** Production rows are 80px with 52px avatars, 42px camera targets, a 56px compose FAB, slimmer safe-area header/tabs, one secondary status/preview line, hairline separators, a soft avatar ring, 2px active underline, and light list-level glass. Swipe, camera, profile navigation, tabs, desktop layout, and virtual slicing remain wired; row/header estimates now exactly match 80px/28px and skeletons match the compact geometry.
- **Theme persistence:** Authenticated reads are strictly scoped to the live Firebase UID; global theme keys are unauthenticated legacy-only. Equip/save/hydration paths pass the authenticated UID, scoped timestamps participate in storage synchronization, and account-mismatched boot snapshots are rejected. Local scoped state remains first-paint authority over Firestore backup.
- **Theme races/reset:** Auto-Pilot cannot overwrite an explicit equipped theme, mode remains independent from theme identity, and reset cleanup is shared across settings/logout paths and removes scoped tokens/timestamps, boot snapshot, remembered UID, equipped ID, and global legacy state.
- **Tests:** Added focused coverage for scoped reads, account switching, snapshot isolation, reset cleanup, and the Auto-Pilot guard; completed test storage now implements the standard `length`/`key()` API.
- **Verified:** `npm run typecheck` PASS · `npm run lint` PASS · `npm run test` PASS (11 files / 71 tests) · `npm run build` PASS · `npm run validate:css` PASS (two pre-existing Tailwind ambiguity warnings).
- **Blockers/manual QA:** No code blocker and no deploy performed. Device QA remains for `/messages`: safe areas, tabs after reload, swipe/profile/camera targets, FAB hide/clearance, 40+ row virtualization, desktop split pane; also verify cold boot/equip/account-switch/reset/Auto-Pilot theme behavior.
- **Next 3 tasks:** 1. Run the compact inbox checklist on iPhone and tablet. 2. Test two-account theme switching plus cold launch/reset/Auto-Pilot. 3. After approval, commit/push and use Lovable Publish separately.

## DM inbox Snapchat-style redesign (2026-07-12)
- **User ask:** Conversations look bad — make clean/fresh like Snapchat
- **Header:** Flat “Chat” title, profile avatar, minimal icon actions; removed aurora hero, wordmark, quick-lane chips
- **List:** Full-bleed rows with hairline dividers (no glass cards/gaps); 56px avatars; name + preview + time layout
- **Unread:** Blue dot on avatar + count pill (no pink tinted row backgrounds)
- **Tabs:** Simple pill filters (no gradient chips)
- **Swipe:** Flat row reveals — horizontal Reply/More/Delete labels
- **Verified:** typecheck PASS · lint PASS · 64 tests PASS
- **Published:** `origin/main` @ **`ec75b6f2`**
- **You:** Lovable → sync `main` @ **`ec75b6f2`** → **Share → Publish** for **vybehub.app**; QA `/messages` on mobile

## Publish handoff — CI fix + V theme + image preload (2026-07-12)
- **User ask:** Publish; fix failing GitHub CI verify job
- **CI fix:** Typecheck errors (missing lucide imports, cache generic `T`, VybeMap/FriendCardSheet, Market motion `as const`, warmHomeCaches types) — `9cf0e974`
- **Includes:** V mark live-theme sync + splash image preload (`13af6ed5`), full perf A–C + DM inbox swipe (`88ec4399` chain)
- **Verified:** typecheck PASS · lint PASS · 64 tests PASS · build PASS
- **Published:** `origin/main` @ **`9cf0e974`**
- **Firebase redeploy:** Not needed — client-only
- **You:** Lovable → sync `main` @ **`9cf0e974`** → **Share → Publish** for **vybehub.app**; confirm GitHub CI green

## V icon theme sync + instant image preload (2026-07-12)
- **User ask:** V mark color doesn't match equipped theme; images should appear instantly on Home
- **V icon:** `useVybeMarkColors` now reads live `--primary` / `--accent` from painted CSS first (not stale localStorage); MutationObserver refreshes on theme paint + mode class
- **Images:** `signAndPreloadFeedPosts` + `signAndPreloadProfileAvatar` — sign URLs then decode into browser cache during splash (`useAppPreloader`, `warmHomeCaches`); greeting avatar `priority`; StoriesBar preloads own avatar + story posters
- **Verified:** build PASS · lint PASS · 64 tests PASS
- **Published:** `origin/main` @ **`1c1a1197`** (code @ `13af6ed5`)
- **Firebase redeploy:** Not needed — client-only
- **You:** Lovable → sync `main` @ **`1c1a1197`** → **Share → Publish** for **vybehub.app**; hard-refresh Home — V matches theme, avatars/feed images instant

## Publish handoff — perf + theme boot + DM inbox swipe (2026-07-12)
- **User ask:** Publish client batch (instant theme, Phases A–C perf, DM inbox swipe revamp)
- **Theme boot:** Equipped Vybe theme applies on first paint — no classic pink/cyan flash; cold DB hydrate when local empty
- **Perf A–C:** Clips windowing, lazy ChatView, staggered route preload, vendor chunks; DM listener cap (24), RQ cache patches, lazy LiveKit; feed + thread virtualization, presence cap (30)
- **DM inbox:** Pointer-based swipe row (no sticky Framer drag); simplified flat conversation cards
- **Verified:** build PASS · lint PASS · 64 tests PASS
- **Published:** `origin/main` @ **`9d9d6168`**
- **Firebase redeploy:** Not needed — no `functions/src`, rules, or indexes changes in this batch
- **You:** Lovable → sync `main` @ **`9d9d6168`** → **Share → Publish** for **vybehub.app**; hard-refresh; QA `/messages` swipe + long feed scroll

## DM inbox swipe + row layout revamp (2026-07-12)
- **User ask:** Fix sticky/janky conversation swipe; simplify row layout; quick seamless-feel wins in inbox
- **Root cause:** Framer `drag="x"` fought `animate={{ x: 0 }}` snap-back (stuck mid-swipe); nested touch handlers + long-press competed with drag; row `backdrop-filter` + `:active scale` on card inside transformed layer caused compositor jank
- **Swipe:** Replaced drag prop with pointer gesture state machine (same pattern as `SwipeToReply`) — vertical scroll wins early, manual `x.set()` + explicit `animate(x, 0)` snap-back; `touch-pan-y` on row; `shouldUseListMotion()` gates spring vs fast snap
- **Layout:** Flattened `DmConversationCard` — avatar / name / preview / time / unread badge only; removed glow layer, glass blur, gradient text, avatar ring wrapper; card is non-interactive `div` (swipe row owns tap)
- **CSS:** Lighter `.dm-inbox-card` (no backdrop-filter, no active scale); `.dm-inbox-card--swiping` disables transitions during drag; row estimate 68px
- **Preserved:** Tabs, pin/mute/archive, swipe right = quick reply, left = more, far left = delete, long-press = options
- **Verified:** build PASS · lint PASS · 64 tests PASS
- **You:** Mobile QA on `/messages` — swipe should snap back cleanly; scroll list vertically without horizontal stick

## Phase C perf pass — feed + thread virtualization, presence cap (2026-07-12)
- **User ask:** Phase C — virtualize Home feed + DM message list; cap `useConversationListPresence` (~30 subs)
- **Home feed:** `useVirtualScrollSlice` on `InlinePostList` — app-scroll windowing at 15+ posts (`FEED_VIRTUAL_THRESHOLD`); only visible PostCards + overscan mount; spacer padding preserves scroll height; load-more sentinel at list bottom when virtualized
- **DM thread:** Same hook on `ChatView` message list at 50+ messages (`CHAT_VIRTUAL_THRESHOLD`); variable-height estimates per message type; scroll-to-bottom + load-older preserved via existing scrollHeight delta
- **Presence cap:** `MAX_CONVERSATION_PRESENCE_LISTENERS = 30` in `performanceConfig.ts`; `useConversationListPresence` sorts by pinned + recent activity (`sortDmConversations`), always includes active thread, dedupes peers
- **Shared:** New `useVirtualScrollSlice.ts`; `useDmInboxVirtualSlice` refactored to use it
- **Verified:** build PASS · lint PASS · 64 tests PASS
- **Next (Phase D):** variable-height measure pass for feed/chat estimates; `scrollToMessage` expand visible window; optional `@tanstack/react-virtual` if estimates drift on long sessions

## Phase B perf pass — listener caps, cache patches, lazy LiveKit (2026-07-12)
- **User ask:** Continue perf work after Phase A — Phase B
- **DM realtime:** Cap scoped message listeners to **24** recent + active thread (`MAX_SCOPED_DM_LISTENERS` in `performanceConfig.ts`; `dmScopedMessageRealtime.ts`)
- **React Query:** Narrow invalidations — `useRealtimeProfiles` patches embedded profiles/posts in-place; `usePostsRealtime` UPDATE patches caches; helpers in `invalidateConversationCaches.ts`
- **LiveKit:** Dynamic import via `loadLiveKit.ts`; `GlobalCallOverlay` loads on persistent call connect + preloads when call active (removes static `livekit-client` from initial bundle path)
- **Motion:** `shouldUseListMotion()` gates list animations on low-end/native perf mode — `PostCard.tsx`, `Market.tsx` `ListingCard` outer wrappers
- **Verified:** build PASS · lint PASS · 64 tests PASS
- **Next (Phase C):** virtualize Home feed + DM message list; cap `useConversationListPresence` (~30 subs)

## Phase A perf pass — smooth / no jank (2026-07-12)
- **User ask:** App feels glitchy; make it fast and smooth with no lag spikes
- **Clips:** `/clips` windowing — only mount video players at current ±2 (matches Explore)
- **Messages:** Lazy-split `ChatView` from inbox with stable `ChatThreadLoadingShell`; preload chunk on thread open
- **DM inbox:** Removed `LayoutGroup` + `layout` motion on conversation rows (CSS cards only)
- **Splash preload:** Stagger tab route preloads — active tab first, neighbors idle, rest delayed (no 7-tab burst)
- **Bundles:** `vendor-mapbox` + `vendor-livekit` manualChunks in Vite
- **Verified:** build PASS · lint PASS · 64 tests PASS
- **Next (Phase B):** cap DM realtime listeners, narrow RQ invalidations, dynamic LiveKit import, feed/message virtualization

## Instant VYBE theme boot (2026-07-12)
- **User ask:** Equipped Vybe theme should load instantly on app open — no classic pink/cyan flash then switch
- **Fix:** Removed splash deferral when equipped tokens exist in localStorage; full `applyThemeTokens` during splash; cold-device DB hydrate starts immediately when local empty; `earlyThemeBoot` reinforces after CSS load
- **Persist paths:** AIVybeDesigner + agent `apply_theme`/`generate_theme` now call `persistEquippedUserTheme`/`equipTheme`
- **Verified:** build PASS · lint PASS · 64 tests PASS (includes `themeHydration.test.ts`)
- **You:** Lovable Publish after push; hard-refresh after equipping a non-classic preset — colors should be correct from first frame

## Private Friend Profile — Phase 1 (2026-07-12)
- **User ask:** Implement complete Private Friend Profile Phase 1 (routing, rules, CF client, UI, privacy settings)
- **Routing:** `/friend/:username` route + `usePageTitle`; entry points retargeted via `friendProfileRoutes` / `ProfileLink` (ChatView, DmInboxView, ConversationList, VybeMap, GlobalCallOverlay, Search, PostCard, ShortCard, MobileShortCard, MutualFriends*)
- **Backend:** Firestore rules for `friendship_pairs`, `location_requests`, `location_shares`, `profile_visibility`, `shared_content_index`, `user_safety_settings`, `user_notes`; tightened `user_live_locations`; indexes for location + shared content queries
- **CF exports:** `friendProfile.ts` + `locationSharing.ts` from `functions/src/index.ts`; client `friendProfileClient.ts` with invoke wrappers
- **UI:** `FriendProfile.tsx` + `src/components/friend-profile/*` (header, actions, friendship card, map, location request sheet, tabs, more menu); hooks `useFriendProfile`, `useFriendshipPair`, `useLocationShareWithFriend`, `useSharedWithFriend`, `useFriendProfileRealtime`
- **Privacy:** `FriendProfileVisibilityCard` in Settings → Privacy (`profile_visibility` collection)
- **Verified:** build PASS · lint PASS · 61 tests PASS (includes `friendProfileRoutes.test.ts`)
- **Firebase deploy (vybe-daaab):** rules + indexes + 9 friend-profile CFs live
- **Published:** `origin/main` @ **`46ec4299`**
- **You:** Lovable → sync `main` @ **`46ec4299`** → **Share → Publish** for **vybehub.app**; manual QA `/friend/:username` + location request flow
- **Next:** Wire `indexSharedContent` from DM share actions so Shared tab auto-populates

## Challenge auto-rotation — server fix (2026-07-12)
- **User ask:** Fix challenges not auto-generating (daily/weekly empty)
- **Root cause:** `rotate_challenges` ran in browser; Firestore `challenges` write = admin only → silent permission-denied
- **Fix:** `functions/src/challenges.ts` — `rotateChallengesCore` (Admin SDK), `rotateChallenges` callable, `scheduledRotateChallenges` cron (05:00 UTC daily)
- **Client:** `dataClient` RPC → `invokeFunction('rotate_challenges')`; removed client-side Firestore writes; `useChallenges` logs RPC errors + UTC week alignment
- **Data:** `challenge_templates` present in Firestore (20+ docs)
- **Verified:** functions build PASS · client build/typecheck/lint/test PASS (58)
- **Firebase deploy:** `rotateChallenges` + `scheduledRotateChallenges` live on **vybe-daaab**
- **Published:** `origin/main` @ **`0f981a97`**
- **You:** Lovable → sync `main` → **Share → Publish** for **vybehub.app**; open Challenges hub to confirm daily quests populate
- **Follow-up:** Port `increment_challenge_progress` / `sync_my_challenge_progress` (still stubbed) if completion/XP broken

## Publish handoff — welcome-back PFP + CI fix (2026-07-12)
- **User ask:** Publish client polish + fix CI typecheck on DM inbox tests
- **Welcome back:** Instant profile photo on sign-in — cache-first splash, `ProfileAvatarImage` priority, boot preloader warms avatar signed URL
- **VybeMiniIcon:** Resolved theme HSL via `useVybeMarkColors` (SVG CSS vars did not repaint on theme change)
- **CI:** `dmInboxPhase1.test.ts` — `member()` helper with `role` + `_sortTime` on fixtures
- **Functions lib:** Synced tracked `functions/lib/*` exports for DM CFs (already deployed to vybe-daaab)
- **Verified:** build PASS · typecheck PASS · lint PASS · 58 tests PASS
- **Published:** `origin/main` @ **`dc8b99d1`**
- **Firebase redeploy:** Not needed — no `functions/src`, rules, or indexes changes since last deploy @ `4b4a25e8`
- **You:** Lovable → sync `main` → **Share → Publish** for **vybehub.app**

## VYBE DM System Upgrade — Phase 1 (2026-07-12)
- **User ask:** Implement DM upgrade plan (smart inbox, media rules, voice transcription, search, lock/remind/schedule, themes, capture alerts) — Firebase only, no ChatView rewrite
- **Inbox:** `DmInboxTabs` (Friends/Groups/Requests/Unread/Calls), Needs Reply sections + priority sort, typing/presence on rows, virtual slice for 40+ rows, locked chats hidden from list
- **Swipe:** Bidirectional mobile swipe — right = quick reply, left = more options, far left = delete; `useDmInboxActions` for pin/mute/archive/mark-unread/lock
- **ChatView extract:** `chat-view/` modules (`ChatComposer`, `ChatHeader`, `ChatMessageList`, `formatMessageDate`, `ChatMediaViewerHost`); `ConversationList` deprecated
- **Media:** Extended `ViewMode` + `EphemeralChatNotice` modes; `dmMediaRules.ts`; CF `onMessageViewCreated`
- **Voice:** `message_transcripts` + `useMessageTranscript`; CF `transcribeVoiceMessage`; `AudioMessage` transcript UI
- **Search:** `ChatSearchSheet` + `useChatSearch` (keyword, type, date filters)
- **Lock/schedule:** `LockedChatGate`, `dm_reminders`, CF `processDueScheduledMessages`
- **Themes:** `dmThemeBlend` + `theme_mode` in `dm_settings`; blend wallpaper CSS var on chat shell
- **Capture:** `CaptureAlertPopup` + `CaptureDetailsSheet`; CF `onCaptureEventCreated` with `event_key` dedupe
- **Backend:** Firestore rules + indexes for `scheduled_messages`, `locked_chats`, `dm_reminders`, `message_transcripts`, `message_media_rules`, `vanish_*`, `screenshot_notifications`; extended `capture_events` read
- **Verified:** build PASS · 58 tests PASS
- **Published:** `origin/main` @ **`4b4a25e8`** (index fix) · **`2912e73b`** (DM Phase 1)
- **Firebase deploy (vybe-daaab):** rules + indexes + 4 DM CFs live (`processDueScheduledMessages`, `onMessageViewCreated`, `transcribeVoiceMessage`, `onCaptureEventCreated`); 409 resolved by adding `friend_requests` indexes to `firestore.indexes.json`
- **You:** Lovable → sync `main` @ **`4b4a25e8`** → **Share → Publish** for **vybehub.app**
- **Next:** Manual QA matrix (view-once, swipe, lock, schedule delivery); Phase 2 NL search + group channels

- **User ask:** Fix camera UI (universal across surfaces); double-tap viewfinder to flip front ↔ back like Snapchat
- **Double-tap:** `useCameraGestures` now detects mobile double-tap (was desktop-only `onDoubleClick`); movement threshold avoids accidental flips during pinch/swipe; shared `useDoubleTapCameraFlip` hook (320ms window)
- **Flip stream:** `VybeSnapCamera` restarts `getUserMedia` on `facingMode` change without resetting capture state; boot vs flip effects split
- **Universal chrome:** `Camera.tsx` + `VybeSnapCamera` use shared `CameraTopControls` (glass chips: close, flash, timer, flip); side tools match same glass style
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish; open camera from DM/Story/Create — double-tap preview toggles front/back repeatedly

## VYBE Perfection Roadmap — Phase 1 (2026-07-12)
- **User ask:** Implement perfection roadmap Phase 1 — unified design system + media zero-flash
- **Map + camera glass:** New `MapLiquidSheet` wrapper; migrated 6 VybeMap sheets off `bg-black/95`; VybeSnapCamera/Editor bottom sheets use `liquid-glass-depth` + `bg-black/75` (viewfinder stays dark)
- **Desktop sidebars:** `Sidebar` + `DesktopLeftSidebar` clusters → `liquid-glass-subtle border-border/30` (matches right sidebar)
- **Connect storefront:** `ConnectStorefront` wrapped in `AppLayout` + `PageTransition`; `liquid-glass-card` product tiles; `Skeleton` loading grid; canonical `EmptyState`
- **Media zero-flash:** DM inbox first 8 threads `ProfileAvatarImage priority`; StoriesBar own tile + first 7 friends priority posters/avatars; Explore grid first row `VideoThumbnail`/`AvatarImage` eager; `ShortCard` already on upgraded `MediaFallback`
- **Cleanup:** Deleted unused `empty-state.tsx` + dead `settings/DesignYourVybe.tsx` (onboarding version kept)
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish for **vybehub.app**; manual: VybeMap sheets glass blur, DM inbox avatars no gray flash, `/connect/storefront/...` on-brand

## Quick preset auto-equip + core social polish (2026-07-12)
- **User ask:** Quick presets should auto-equip on tap; scan app for blocky/ugly UI on core social surfaces
- **Presets:** `basePreset` threaded through `equipTheme` → `syncEquippedThemeToAccount`; ThemeCustomizer equips on tap with light/dark mode switch, toast, no Save bar; setting tweaks auto-equip silently
- **Polish:** Fixed `skeleton-shimmer` / `media-shimmer` CSS collisions; upgraded `MediaFallback`, `PostSkeleton`, greeting/feed placeholders; clips loader, DM typing bubble, story loaders, glass DM panels; unified empty/skeleton patterns on Profile, Notifications, Search, Community
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish; test Settings → Themes quick presets (one tap = equipped, persists on exit)

## Fullscreen app update + butter-smooth load pass (2026-07-12)
- **User ask:** Everything instant/smooth; "Updating app" UI glitchy and half-screen — make it fullscreen and polished
- **Update overlay:** `AppUpdateOverlay` now portals to `document.body` at full `100dvh` with safe-area insets; locks scroll + hides `#root`/`#app-shell` via `app-update-visible`; never auto-dismisses before reload; ambient mesh matches boot splash; `appUpdateBridge` coordinates SW + `useAutoUpdate` with 1.5s paint delay before reload
- **Instant load:** `FEED_PRELOAD_AHEAD` 6; first 8 feed posts eager; boot preloads 12 posts; splash min 280ms; avatars/videos priority skip fade; `ProfileAvatarImage` priority prop
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish for **vybehub.app**; trigger update (publish new build) — fullscreen overlay should cover entire screen until refresh completes

## Instant image loading — thumb-first + warm cache (2026-07-12)
- **User ask:** Image loading should feel instant
- **Fix:** New `useProgressiveImageSrc` — paints thumb (or full) immediately, upgrades to full res in background with no opacity fade; `signedUrlCache` persists to sessionStorage and hydrates at boot; `<link rel="preload">` for eager feed images; feed preloads first 12 posts (high priority first 4); `PostCard`/`NaturalAspectImage` uses progressive src; `OptimizedImage` priority skips shimmer/fade; `index.html` preconnect to Firebase Storage; non-blocking `preparePostMedia` on feed fetch
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish for **vybehub.app**; hard refresh Home — first 5 posts should show images with no gray flash

## Perceived load speed — images + boot (2026-07-12)
- **User ask:** Images and content load in too slowly; looks bad
- **Fix:** Thumbnail blur-up on feed images; sync signed-URL cache on first paint; await sign+preload for first 8 feed posts; `preloadFeedPostsMedia` with resized transforms; parallel feed warm from cached profile during splash; faster splash dismiss (~380ms min); avatar/image fade 100ms; larger lazy-load margin (400px)
- **Verified:** build PASS · 49 tests PASS

## Themes — scroll flicker fix (2026-07-12)
- **User ask:** Flicker while scrolling (screen recording in Settings/Themes)
- **Root cause:** `useApplyUserTheme` MutationObserver reacted to every `html` class change — including `is-scrolling` toggled on every scroll — forcing full `applyThemeTokens()` repaint at scroll start/end
- **Fix:** Observer now only re-adapts when `light`/`dark` actually changes (`attributeOldValue` diff)
- **Verified:** build PASS · 49 tests PASS

## Themes — custom theme save/equip stickiness (2026-07-12)
- **User ask:** Custom themes flash default then switch; selection forgotten on exit; Save reverts to previous theme
- **Root cause:** `ThemeCustomizer` only previewed via `applyThemeTokens` (never `equipTheme`/localStorage) until explicit Save; stale `userTheme` refetch could overwrite in-progress edits; Gallery/Marketplace equip didn't update react-query cache; `AppLayout` cleared preview lock on every route change
- **Fix:** New `persistEquippedUserTheme()` — equip + sync query cache; ThemeCustomizer commits on preset tap / AI gen / setting change; guarded load effect when `hasChanges`; Gallery/Marketplace use same helper; `MyCurrentVybeCard` listens to `vybeThemeEquipped`; preview lock only clears outside `/settings`
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish for **vybehub.app**

## Themes — settings crash + equip stickiness (2026-07-05)
- **User ask:** Settings → Themes still crashed; equipped theme kept jumping back to old one
- **Crash fix:** `ThemesSection` lazy-mounts tabs (Browse/Mine no longer force-mount via Radix `forceMount`); invalid `shared_themes` rows skipped; per-tab + settings error boundaries
- **Equip fix:** `prefetchAndApplyUserTheme` never overwrites local equipped tokens with stale DB — syncs local → DB instead; `useApplyUserTheme` prefetches once per user/session; save/equip mutations update cache without invalidate refetch
- **Verified:** build PASS · 49 tests PASS
- **Published:** `origin/main` @ **`c7de8161`** · staging hosting deployed
- **You:** Lovable → Share → Publish for **vybehub.app**

## AI Theme Designer — auto-save + Custom preset slot (2026-07-05)
- **User ask:** generated themes don't persist when leaving the page; replace Minimal preset with Custom that always reflects the user's latest AI generation
- **Root cause:** themes only saved on explicit "Keep Theme" tap — preview applied CSS via `applyThemeTokens` but never `equipTheme`/DB until confirm; leaving unlocked preview and `useApplyUserTheme` reverted to old equipped theme
- **Fix:** `commitTheme()` auto-saves (equip + DB) on every AI generation and preset apply; unmount flush saves any unsaved tweaks; preview lock stays on while `previewTheme` is set
- **Custom preset:** replaced `minimal` with `custom` in `THEME_PRESETS` + quick presets UI; `vybe-last-generated-theme` localStorage slot updates on each AI gen; Custom card shows latest theme name + 4-color gradient swatch
- **Verified:** build PASS · 49 tests PASS
- **You:** Lovable → Share → Publish for **vybehub.app**

## AI Theme Designer — deterministic multi-color mapping (2026-07-05)
- **User ask:** theme still not accurate enough — if something has 4 colors, all 4 must appear in the theme
- **Was:** grounded research returned text/JSON but the theme AI still reinterpreted colors and collapsed palettes (e.g. OnlyFans bg ended up white)
- **Now:** `groundedColorResearchStructured()` returns JSON `{mode, colors:[{name, hex, role}]}` with every distinct color; when 2+ colors found, `buildThemeFromResearchedPalette()` maps them deterministically into `colorPrimary`, `colorSecondary`, `colorAccent`, `bgMain`, `borderColor` (no AI color guessing); AI only names the theme + picks background effect
- **UI:** theme preview gradient in DesignYourVybe shows all 4 key colors (primary → secondary → accent → border)
- **Deployed:** `generateTheme` + `generateAdvancedTheme` to vybe-daaab
- **Verified:** "onlyfans" → blue + dark blue + white accent + dark gray bg + white border (all 4 brand colors) · "lakers" → purple + gold + black + white
- **You:** Lovable → Share → Publish for **vybehub.app** (client preview gradient change)

## AI Theme Designer — real color lookup via Google Search grounding (2026-07-05)
- **User ask:** typed prompts still got inaccurate colors — the model guessed brand/thing colors from memory (e.g. "onlyfans" → hot pink instead of the real #00AFF0 sky blue); user wants the AI to *look up* the actual colors of whatever they type
- **New:** `groundedColorResearch()` in `functions/src/_shared/geminiAi.ts` — native Gemini `generateContent` call with the `google_search` tool (thinking budget 0, 9s timeout, returns null on any failure) that researches the real colors (hex codes) of the typed subject via live web search
- **Wired in:** `generateTheme` runs the lookup in parallel with profile/DNA loads whenever there's a typed prompt, injects the findings as a "VERIFIED COLOR RESEARCH" block into the theme prompt, and the system prompt instructs the model to build the palette from those exact colors
- **Deployed:** `generateTheme` + `generateAdvancedTheme` to vybe-daaab
- **Verified end-to-end (authed test user, since deleted):** "onlyfans" → OnlyFans Azure `197 100% 47%` (= #00AFF0 exactly) · "mcdonalds" → red + golden arches yellow · "starbucks" → Starbucks green · "lakers" → purple + gold · "cherry blossoms in kyoto" → pink light theme · "lightning mcqueen" → red — all real colors, zero fallbacks, ~4-6s response
- **No client changes** — nothing to publish on Lovable for this fix
- **Publish (2026-07-05):** build PASS · 49 tests PASS · hosting staging deployed · `origin/main` @ `f4f57b82` · backend already live

## AI Theme Designer — AI-first always, no canned palettes (2026-07-05)
- **User ask:** never "remember" colors — every generation should be designed fresh by AI from whatever the user typed (brand, scene, object, anything)
- **Was:** `src/lib/aiThemeGeneration.ts` short-circuited before AI: known brand names returned hardcoded palettes from `brandThemePalettes.ts`, and high-confidence keyword parses (≥0.72) returned local `promptThemeBuilder` palettes — the AI never ran for those inputs
- **Now:** both instant-return paths removed — cloud AI runs for every request (typed or profile-generated); brand hints still ride along in the prompt as context; canned brand/keyword palettes survive only as the last-resort fallback when both cloud + client AI fail
- **Verified:** typecheck PASS · 49 tests PASS · build PASS · staging deployed
- **You:** Lovable → Share → Publish for **vybehub.app** (client change)

## AI Theme Designer — themes now actually match the prompt (2026-07-05)
- **Root cause:** `gemini-2.5-flash` is a thinking model — it silently spent the entire `max_tokens` budget (1024) on internal reasoning, so theme JSON came back truncated (`finish_reason: length`) → server fell back to generic keyword palettes for every typed prompt
- **Fix 1:** `functions/src/_shared/geminiAi.ts` `chatCompletion` now sends `reasoning_effort: 'none'` (helps every short structured AI call: themes, captions, safety scans)
- **Fix 2:** `functions/src/ai.ts` theme system prompt uses concrete HSL examples ("330 100% 50%") instead of the literal "H S% L%" placeholder the model sometimes copied; new `normalizeThemeColors` coerces near-miss outputs (hsl() wrappers, "H 325 S 85% L 50%", hex) into bare HSL triplets before validation
- **Deployed:** `generateTheme` + `generateAdvancedTheme` to vybe-daaab (clean deploy, no quota errors)
- **Verified end-to-end (authed test user, since deleted):** "onlyfans" → OnlyFans Classic (hot pink 330 100% 50%) · "cyberpunk tokyo at night" → Neon Tokyo Nights (violet, dark) · "soft pastel light mode with lavender" → Lavender Pastel (270 50% 75%, light) — all real AI themes, zero fallbacks, ~2.5s response
- **No client changes** — nothing to publish on Lovable for this fix

## FriendLink Nearby fallback — AirDrop-style, no NFC required (2026-07-05)
- **Why:** some phones have no NFC; web/WebView can't do phone-to-phone Bluetooth, so the fallback is realtime presence discovery that looks/feels like AirDrop
- **New:** `src/lib/friendLinkNearby.ts` (coarse ~165m location cells, presence freshness) + `src/hooks/useNearbyFriendLink.ts` — publishes a short-lived presence doc to new `friend_link_nearby` Firestore collection (doc id = profile id, 20s heartbeat, 65s stale window, deleted on close), streams peers in same + 8 adjacent cells via realtime bindings + initial seed query
- **AutoFriendDrop:** new `tapMode: 'nfc' | 'nearby'` — NFC always tried first; phones without NFC (`isNfcSupported()`) open straight into Nearby; after 3s of waiting on an NFC tap a "Friendlink not working? Click here." link fades in under the status line and switches to Nearby; mode resets each open
- **Sheet UI:** Nearby mode shows a radar scene (own avatar + CSS pulse rings, perf-mode/reduced-motion aware) and discovered people as tappable gradient-ring avatar bubbles (spring pop-in); tapping a bubble runs the existing auto-add handshake (friend request + drop confirm + DM + success animation); location denied/unavailable → friendly message + retry
- **Rules:** `friend_link_nearby` — read signed-in, write own `user_id` only; **deployed** to vybe-daaab
- **Verified:** typecheck PASS · 49 tests PASS · lint PASS · build PASS
- **You:** Lovable → Share → Publish for **vybehub.app**; manual two-device check (NFC phone → hint at 3s → Nearby; two accounts same location see each other's bubbles)
- **Next:** consider TTL cleanup job for stale `friend_link_nearby` docs; optional sound/haptic when a peer appears

## Buttery-smooth pass — scroll/animation/input jank (2026-07-05)
- **Feed scroll:** `InlinePostList` now caches one stable ref-callback per post index — previously every visible-post change re-created every row's ref, forcing React to detach/re-attach refs across the whole feed on each scroll step
- **PostCard:** action buttons + tag pills use targeted `transition-[transform,background-color]` instead of `transition-all` (browser no longer watches box-shadow/filter on the most-rendered component); same fix in `CommentItem`/`CommentThread` (`transition-[filter]` for safety blur) and Explore clip overlays
- **Scroll infra:** `useScrollOptimization` MutationObserver rebind coalesced to 1 per 500ms (was a document-wide `querySelector` on every DOM mutation batch)
- **DM thread:** video bubbles now play only while ≥40% on-screen via IntersectionObserver (was `autoPlay` for every message — multiple live decoders while scrolling media-heavy threads); unopened-Vybe tile shimmer/breathe converted from per-frame framer-motion JS to compositor CSS keyframes (auto-paused by `.is-scrolling`); typing presence throttled — repeat `setTyping(true)` skipped within 4s (was a Firestore write per keystroke; 12s stale window keeps indicator live); composer autoResize batched in rAF (was sync layout read/write per keystroke); "last seen Xs ago" ticks 1s only under a minute old, then 30s (was 1s forever)
- **StoryViewer:** progress bar is now ref + direct DOM width writes — zero React re-renders during playback (was re-rendering the whole viewer 4x/sec)
- **Explore clips:** fullscreen pager windows video cards to current ±2 (was all mounted); IntersectionObserver no longer torn down + re-attached to every clip on each snap (both `Explore.tsx` and `ExploreClipsSection`); `VideoThumbnail` img now `loading="lazy" decoding="async"`
- **Home:** `LiveActivityTicker` rotation pauses while tab hidden
- **Verified:** typecheck PASS · 49 tests PASS · lint PASS · build PASS
- **Staging:** https://vybe-daaab.web.app (hosting deployed)
- **You:** Lovable → Share → Publish for **vybehub.app**
- **Next:** extract memoized `MessageRow` from `ChatView` (stable per-message handlers — needs the planned ChatView split); consider server-generated video thumbnails for Explore; profile on a mid-tier Android device

## High-End Social Foundation Pass (2026-07-05)
- **Fault isolation (Phase 1):** `SpotifyPresenceMount`/`RealtimeSyncMount`/`BriefPreFetchInit` now wrapped in `LocalErrorBoundary`; gamification providers (easter eggs, streak popup, reward modals/realtime, tutorial overlay) isolate their risky effects behind boundaries — a crash degrades to "feature off" instead of blanking the app; per-route boundaries on `/home`, `/messages`, `/notifications`, `/profile` with in-page retry; `ErrorBoundary` auto-resets on route change (crashed tab no longer sticks); `queryPersister` deserialization guarded — corrupt IndexedDB cache is dropped instead of throwing at boot; guarded `useEasterEggs` localStorage `JSON.parse`
- **Deploy safety:** `AppUpdateOverlay` mounted; SW update flow posts `SKIP_WAITING` + one controlled reload on controllerchange (guarded against first-install and loops); hashed `.js` chunks now network-first with cache fallback in `sw.js` (v34, assets cache v5) — stale-chunk white screens after deploy eliminated
- **Surfaced errors (Phase 2):** `claim_profile_by_email` failure → warn + Sentry; global signOut revoke failure → warn + Sentry (local state still clears); DM membership repair failures in `useInstantSend` (2 sites) + `dmOutbox` → logged; `bumpConversationUpdatedAt` failure → logged (stale inbox sort now diagnosable)
- **Social-first home (Phase 3):** default widgets slimmed to greeting + stories + feed (`useHomeLayout` DEFAULT_ORDER/HIDDEN, `useGridLayout` DEFAULT_ENABLED) — saved layouts untouched; one-time "Tap Customize to add widgets" hint; empty For You feed now shows ONE `FindFriendsCTA` (Friend Link) replacing FriendLinkSpotlight + FirstPostCTA + generic empty-state stack; duplicate `/spaces` route removed — `/spaces` now serves `VYBESpaces` (live audio, matches `SpaceRoom` back-nav), dead `Spaces` route/import dropped, preloader updated
- **Speed + money trust (Phase 4):** `VybeMapboxCanvas` lazy-loaded — map page chunk is now 79 kB (mapbox-gl's 1.5 MB loads after HUD paints); `useVybeMapFlyTo` extracted to its own module (type-only mapbox import); `useVybeTokens` re-typed via new pure `src/lib/tokenMath.ts` (parse + multiplier, no `as any`); `useRevenueCat` casts replaced with typed product-id resolution + documented native package bridge; engagement score extracted to pure `src/lib/feedEngagementScore.ts`
- **Tests:** +30 new (tokenMath 13, feedEngagementScore 7, messagesQueryKey 10) — 49 total PASS
- **Verified:** typecheck PASS · 49 tests PASS · lint PASS · build PASS
- **Staging:** https://vybe-daaab.web.app (hosting deployed)
- **You:** Lovable → Share → Publish for **vybehub.app**
- **Next:** split `ChatView.tsx` (3.2k lines) / `GlobalCallOverlay.tsx` (2k) in a dedicated session; integration tests in CI; feed ad/reward cadence tuning (product call)

## Map follow fix + app-wide perf pass (2026-07-05)
- **Map:** GPS follow now stops permanently when you pan/zoom away (real gestures only, via `originalEvent` check); only the recenter button re-engages follow (`flyToUser` + `vybe:resume-follow`); tapping meetups/friends no longer re-arms follow
- **Auth context memoized:** stable API wrappers via ref — every `useAuth()` consumer (all PostCards etc.) no longer re-renders on each AuthProvider render
- **Unread badge query:** was 200 msgs/convo fetched serially every 60s; now only messages newer than last-read, DESC-indexed, parallel batches of 8, cap 50
- **StoryViewer:** progress ticks 4/sec (was 20/sec) with CSS linear transition — same look, 5x fewer viewer re-renders
- **Dedup:** removed duplicate `useNotificationChatPrefetch` (Notifications page), merged duplicate unread-notifications count queries into `['unread-notifications']`
- **Feed:** media preload capped at 4 posts/page (was full page); reward card positions stable across pagination (no more jumping); Home onboarding profile check once per session
- **Verified:** typecheck PASS · 19 tests PASS · lint PASS · build PASS
- **Staging:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for **vybehub.app**

## Deep foundation scan + fixes (2026-07-04)
- **Scan:** `npm run debug` PASS · `backend:scan` 15 pass → all pass after fixes · functions build PASS · production probes healthy
- **Type errors fixed (17):** missing imports (`markConversationReadForViewer`/`getSessionAuthUid` in `useMessages`, `safeDmMembers` in `dmScopedMessageRealtime`), `viewerAuthUid` never passed through `ConversationContent` (inbox previews used wrong viewer), voice-note send spinner never showed (`isUploading` renamed away), unsafe casts in `useDMConversations`/`useTrashedConversations`/`DesktopRightSidebar`, test fixture gaps
- **CI hardened:** new `npm run typecheck` script + CI step — type errors can no longer land silently (build/lint didn't catch these)
- **Firestore data repair:** deleted 35 junk self-referencing `conversation_members` rows + 1 test `friend_requests/x` doc; stripped own-id from 28 `member_ids` arrays (backup: `scripts/migrate-firebase/backups/`); verify now 100% connected, 0 orphans
- **New tool:** `scripts/migrate-firebase/cleanup-selfref-members.mjs` (dry-run by default)
- **Verified:** typecheck PASS · 19 tests PASS · lint PASS · build PASS
- **Staging:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for **vybehub.app** (backend scan flagged prod bundle STALE)

## DM Snapchat parity — full history + reliable tap-to-save (2026-07-04)
- **Was:** Scroll-up pagination used an unordered scan capped at ~400 rows (long threads hit a wall); tap-to-save relied on `onClick`, which iOS Safari drops on non-interactive elements (only long-press menu worked); `scroll-smooth` animated every pin-to-bottom; new incoming messages yanked reader out of history
- **Now:** Server-ordered pages via `conversation_id + created_at` index (exact pagination, index-free fallback); tap detection moved into the SwipeToReply pointer state machine (`onTap` fires on clean release — works on iOS/desktop); scroll-up preload at 600px; pin-to-bottom only for own sends or near-bottom; older pages survive recent refetches in cache merge; history cap raised to 10k
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS
- **Staging:** https://vybe-daaab.web.app (hosting + firestore indexes deployed)
- **You:** Lovable → Share → Publish for **vybehub.app**

## DM stability, tap-to-save, text flicker (2026-07-04)
- **Was:** Background full-history hydrate froze thread on open; save toggle cleared both users' flags; 24h unsave didn't restore expiry; contrast guard + `transition-all` flickered DM text
- **Now:** Recent-only open + scroll-up pagination only; skeleton skipped when cache has messages; scroll-to-bottom on append only; per-user save helper + server expiry restore; DM thread shielded from contrast guard; targeted bubble transitions
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS
- **Committed:** `94d5c0c1` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Lovable → Share → Publish for **vybehub.app**

## DM instant open — fast recent-first load (2026-07-04)
- **Was:** Opening a chat paginated up to ~2,400 messages before paint
- **Now:** Single round-trip recent fetch (200 msgs) for instant open; full history hydrates in background; inbox last_message seeds thread at tap
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS

## DM inbox flicker fix (2026-07-04)
- **Was:** Sidebar rows re-faded on every reorder (entrance animation + section remounts + opacity CSS transition on read/active)
- **Now:** Stable flat list keys, layout-only motion, deferred read patches, no skeleton flash when cache exists
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS

## Snapchat-style DM recents ordering (2026-07-04)
- **Was:** Opening a chat could bump inbox order via `updated_at` repair + unread-tier sorting
- **Now:** Inbox order uses last message time only; view/read clears badge without reorder; send/receive still moves chat to top
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS

## DM full message history (2026-07-04)
- **Was:** Threads capped at 50 messages — older history never loaded
- **Now:** Paginated fetch up to 2,500 messages on open; scroll-up loads more; prefetch keeps 200 for speed then full fetch on open
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS

## Foundation roadmap (target: 10/10)

| Phase | Focus | Status |
|-------|--------|--------|
| 1 | CI + unit tests on DM identity/avatar | Done (`043cbc02`) |
| 2 | Publish avatar fix + warm-all chats | Done (`dc96f6e0`) — staging deploy pending |
| 3 | Split `ChatView` / `GlobalCallOverlay` into modules | Not started |
| 4 | Integration tests (`test:conversation-load`, `test:dm-send`) in CI | Not started |
| 5 | DEPLOY.md → Firebase-only alignment | Not started |
| 6 | Bundle splits (Map, Calls) + perf budget | Not started |

## Foundation Phase 1 — CI + DM identity tests (2026-07-04)
- **Tests:** Vitest + 9 unit tests (`dmMemberResolve`, `profileAvatarCache`)
- **CI:** `.github/workflows/ci.yml` — lint → test → build on push/PR
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS
- **Committed:** `043cbc02` · pushed `main`

## DM avatar + instant open fix (2026-07-04)
- **Wrong PFP:** `resolveProfileAvatarUrl` no longer falls back to current user when `profileId` is missing; member resolution excludes auth uid duplicate rows
- **Instant all chats:** Prefetch/warm entire inbox on load (first 6 parallel, rest staggered idle)
- **Verified:** `npm run test` PASS · `npm run lint` PASS · `npm run build` PASS
- **Committed:** `dc96f6e0` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Lovable → Share → Publish for **vybehub.app**

## DM chat switch — follow-up (2026-07-04)
- **Root cause:** Every sidebar click re-ran full `prepareMessagesRoute` (DM list refetch storm); scroll jumped after paint; no active-row highlight; thread/header could lag one frame behind cache
- **Fix:** Route prep once per session; `useLayoutEffect` scroll before paint; sync cache thread + header; active inbox row styling; `startTransition` navigate; message list keyed by `conversationId`
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `4dc98dc1` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Lovable → Share → Publish for **vybehub.app**

## DM chat switch — Snapchat-style instant open (2026-07-04)
- **Prefetch:** `warmDmConversation` seeds header + messages cache on touch/hover, inbox batch-warms top 8 chats
- **Navigation:** Eager `ChatView` load (no lazy Suspense flash); removed cross-thread `placeholderData` bleed
- **ChatView:** Cache-first skeleton skip; reset reply/edit/recording state on thread switch
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `c5159169` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Lovable → Share → Publish for **vybehub.app**

## Publish — DM previews + voice review UI (2026-07-04)
- **DMs:** Inbox shows latest message per chat (backfill fetch, thread cache, auth uid matching)
- **Voice:** Hold-to-record opens dedicated review bar (Listen / discard / re-record / send); fixed recorder restart loop
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `fa3cb9f4` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Lovable → Share → Publish for **vybehub.app**

## Publish — DMs, voice notes, sound mix (2026-07-04)
- **DMs:** Trash bin shows deleted chats (Firestore-safe query + optimistic cache); inbox shows last message preview; voice notes pause on release with play/delete/restart/send
- **Sounds:** Central mix bus, lower bundled volumes, pop/tap no longer uses share-post WAV, overall volume slider in settings
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `75c72719` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Lovable → Share → Publish for **vybehub.app**

## Publish gate — restored empty Cloud config removed (2026-07-04)
- **Root cause:** The obsolete `supabase/` directory had been restored again, now with only `config.toml`; Lovable Publish can still detect that folder as a backend sync target and fail with the generic internal publish error.
- **Fix:** Removed the restored empty `supabase/` directory, then added one targeted migration after the fresh security scan showed Live still had broad storage write policies for media, announcements, and sounds.
- **Verified:** `npm run build` PASS · `npm run lint` PASS · Test storage policies no longer include the broad write rules; Live still has them until publish applies the migration.
- **Next:** Lovable Publish → verify the migration applies to Live and `vybehub.app` updates, then hard refresh devices.

## Publish gate — remove obsolete Cloud migrations (2026-07-03)
- **Root cause:** This app is Firebase-only, but a restored `supabase/` folder contained pending SQL migrations; Lovable Publish was trying to sync an unused Cloud schema path and returning the generic internal publish error.
- **Fix:** Removed the obsolete `supabase/` directory so production publish only builds the current Firebase-backed React app.
- **Verified:** `npm run build` PASS · `npm run lint` PASS · security scan has no open findings.
- **Next:** Lovable Publish → verify `vybehub.app` updates, then hard refresh devices.

## Publish — splash zero-flicker (2026-07-02)
- **Fix:** Loading screen theme vars scoped on `#vybe-static-boot` (immune to index.css :root); no full `applyThemeTokens` during splash — lightweight `reinforceSplashTheme()` only; full apply after splash dismiss
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `514922a5` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Hard-refresh staging with equipped Vybe; then **Lovable → Share → Publish** for **vybehub.app**

## Publish — splash theme flash fix (2026-07-01)
- **Fix:** Hard refresh no longer dips equipped → classic → equipped — early theme boot before App graph, CSS-aware skip check, force equipped re-apply during splash
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Staging:** https://vybe-daaab.web.app
- **You:** Hard-refresh with equipped Vybe; then Lovable Publish for **vybehub.app**

## Publish — splash theme simple fix (2026-07-01)
- **Fix:** Reverted over-engineered splash lock that re-applied stale classic snapshot mid-splash. Boot + splash now always paint equipped localStorage first; query-cache theme apply deferred until splash dismisses.
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Staging:** https://vybe-daaab.web.app
- **You:** Hard-refresh with equipped Vybe — splash should stay your colors

## Publish — splash theme persistence fix (2026-07-01)
- **Fix:** Equipped Vybe stays on splash after refresh — equipped wins over stale `vybe-boot-theme` snapshot; `data-vybe-theme-painted` only when vars applied; unified fingerprint + splash downgrade guard; self-heal snapshot when mismatch detected at boot
- **Verified:** `npm run build:boot-theme` PASS · `npm run build` PASS · `npm run lint` PASS
- **Staging:** https://vybe-daaab.web.app (Firebase hosting deploy)
- **You:** Hard-refresh staging with non-classic equipped Vybe; then Lovable → Share → Publish for **vybehub.app**

## Publish — splash theme lock (2026-06-30)
- **Splash:** Single static boot layer; snappier progress; mesh matches aurora; no duplicate React splash
- **Theme flash:** Equipped localStorage wins over stale `user-theme` cache; stop persisting user-theme; boot prepaint adapts light/dark
- **AI:** Typed theme client Gemini fallback; chat without client-config gate; clearer errors
- **OAuth:** `applyOAuthSession()` instant popup/redirect session apply
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Staging:** https://vybe-daaab.web.app (Firebase hosting)
- **You:** Lovable → Share → Publish for **vybehub.app**

## Publish — splash branding, AI input, instant OAuth (2026-06-17)
- **Splash:** Brand wordmark image on static boot + React splash (`/brand/vybe-wordmark-transparent.png`, preloaded)
- **AI theme:** Typed prompts cloud-first → client Gemini fallback when cloud fails; “couldn’t run” only when both fail
- **AI chat:** Removed client-config gate before server chat; emoji strip on quick prompts; clearer sign-in error
- **OAuth:** `applyOAuthSession()` — popup applies session before navigate; faster redirect auth poll
- **Verified:** `npm run build` PASS · `npm run lint` PASS · `verify:gemini --from-firebase` PASS
- **Deployed:** https://vybe-daaab.web.app + `generateTheme` + `aiChat`
- **You:** Lovable → Share → Publish for **vybehub.app**

## Publish — Google OAuth freeze fix (2026-06-17)
- **Fix:** Wait for `authStateReady` before `getRedirectResult`; capture after auth listener; mark pending on all redirects; recover session if Firebase already signed in
- **Verified:** `npm run build` PASS
- **Staging:** https://vybe-daaab.web.app (Firebase hosting)
- **You:** Lovable → Share → Publish for **vybehub.app** production

## Publish — splash + AI routing (2026-06-30)
- **Committed:** `3e4350e8` · pushed `main`
- **Staging:** https://vybe-daaab.web.app (Firebase hosting)
- **Functions:** AI + `startVybeCheck` already on vybe-daaab (GEMINI + OPENAI secrets)
- **You:** Lovable → Share → Publish for **vybehub.app** production

## Cost-aware AI routing (2026-06-17)
- **Strategy:** Gemini lite first (cheapest) → auto-escalate to flash on 5xx/empty; flash for chat, typed themes, agent tools; OpenAI only for Vybe Check moderation/STT (skipped if key invalid)
- **Fix:** Token caps per task; Google BYOK only (no OpenAI sk- sent to Gemini); invalid OPENAI_API_KEY fails open to Gemini safety
- **Deployed:** 38 GEMINI Cloud Functions on vybe-daaab
- **You:** `GEMINI_API_KEY` in `.env` → `npm run setup:gemini-secrets` · optional valid `OPENAI_API_KEY` for Vybe Check

## AI features + GEMINI key audit (2026-06-17)
- **Finding:** Local `.env` has `VITE_FIREBASE_API_KEY` but no `GEMINI_API_KEY` — these are different keys
- **Production:** `GEMINI_API_KEY` in Firebase Secret Manager — **PASS** (`npm run verify:gemini -- --from-firebase`)
- **Fix:** Default chat model → `gemini-2.5-flash` (flash-lite was returning 503); redeployed 38 GEMINI functions
- **Added:** `npm run verify:gemini` + clearer `.env.example` section for `GEMINI_API_KEY`
- **You:** Add `GEMINI_API_KEY=AIza...` to `.env` (from https://aistudio.google.com/apikey) · `npm run verify:gemini` · hard refresh · VYBE-AI → Clear Chat · test chat + theme designer

- **Problem:** Black screen for several seconds on cold start; returning users skipped splash entirely; progress bar hit "ready" instantly without rehydrating
- **Fix:** `#vybe-static-boot` moved outside `#root` (React no longer wipes it); `splash-visible` + aurora body bg from first paint; always show splash on cold open (not skipped for stored sessions); preloader runs auth → profile → feed warm with weighted progress; min ~1.1s splash + fade at 100% before dismiss; safety cap 10–12s
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Next:** deploy staging hosting · cold-start test on Despia/device · Lovable Publish vybehub.app

- **Problem:** Typed prompts returned generic purple/wrong palettes — local keyword matcher skipped Gemini
- **Fix:** `typedPrompt` forces cloud AI (22s); AI colors win in merge; brand instant path kept; server prompt prioritizes literal user request
- **Verified:** `npm run build` PASS · `npm run lint` PASS · functions build PASS
- **Committed:** `4df56460` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app + `generateTheme` / `generateAdvancedTheme`
- **You:** Settings → Themes → try "cherry cola sunset", "rainy tokyo neon", "Spotify green"

## Google/Apple instant OAuth sign-in (2026-06-17)
- **Problem:** Google/Apple sign-in opened another page but never logged user in
- **Cause:** `getRedirectResult` only ran when sessionStorage pending flag survived OAuth round-trip (often cleared on mobile); AuthCallback cleared pending too early; mobile non-Safari forced slow redirect instead of popup
- **Fix:** Always capture Firebase redirect on boot + pageshow; pending flag mirrored to localStorage; popup on Android Chrome/desktop; AuthCallback completes Firebase redirect; Despia deeplink navigates immediately on success
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deployed:** https://vybe-daaab.web.app
- **You:** Hard refresh · test Google + Apple on phone browser + Despia app

## Colorful wallpaper restore (2026-06-17)
- **Problem:** DMs/Settings looked flat black — opaque `#main-content` (0.92) covered aurora app-wide; DM chat shell semi-opaque; native Despia hid all blobs
- **Fix:** Opaque main-content only on Home feed (`.home-shell`); DM chat shell transparent glass; native perf shows static theme blobs + slow mesh drift; DM keeps mesh color drift (blobs paused)
- **Verified:** `npm run build` PASS
- **Deployed:** https://vybe-daaab.web.app
- **You:** Hard refresh staging · check DMs + Settings + Home scroll

## Platform GEMINI for all VYBE AI chat (2026-06-17)
- **Problem:** User wanted shared env `GEMINI_API_KEY` for everyone, not personal BYOK blocking chat
- **Fix:** `aiChat` always uses platform secret unless `usePersonalKey`; client always server-first
- **Deployed:** https://vybe-daaab.web.app + `aiChat`
- **Committed:** `aed22872` · pushed `main`
- **You:** Lovable Publish vybehub.app · Clear Chat in VYBE-AI · test message

## VYBE AI server error fix (2026-06-17)
- **Problem:** VYBE AI showed generic "server error" bubble; BYOK key saved but not used (client AI ran first)
- **Fix:** Server-first routing when BYOK or App Check unverified; BYOK key lookup fallbacks + validate on save; clearer Gemini/BYOK errors; strip error bubbles from history
- **Verified:** `npm run build` PASS · `npm run lint` PASS · functions build PASS
- **Committed:** `a9cad8ac` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app + `aiChat`, `saveUserAiKey`, 38 GEMINI functions
- **You:** Lovable → Share → Publish vybehub.app · VYBE-AI ⋮ → **Clear Chat** · re-save Google AI key in Settings if restricted · test "hey"

## DM composer keyboard position (2026-06-17)
- **Problem:** DM message composer flew too high when typing — not resting just above keyboard like Vybe AI
- **Fix:** Mobile DM shell `fixed inset-0` like AI; keyboard measure skips `screen.height` fallback when layout already resized; focus scroll uses `scrollTop` not `scrollIntoView`
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `ca268680` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for vybehub.app · device-test DM composer on Despia

## Instant DM Delivered + inbox trash (2026-06-17)
- **Problem:** DMs showed Sent then Delivered after ~1s; trash button missing on DM inbox for deleted chats
- **Fix:** Optimistic messages show Delivered immediately; stable `_clientKey` prevents bubble remount on server confirm; `DmInboxView` trash header button restored
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `919401e2` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for vybehub.app · device-test instant Delivered + trash on Despia

## Keyboard over-scroll fix — Vybe AI pattern (2026-06-17)
- **Problem:** DM messages jumped too high when typing; keyboard detection OK but scroll offset wrong
- **Fix:** Removed DM `KeyboardAwareTexter` fixed dock; unified in-flow flex + `--kb-h` padding (`.vybe-chat-composer` / `.vybe-chat-messages`) matching AI chat; enabled `useKeyboardHeight` in DM; community chat footers aligned
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `dc89f5ef` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable Publish vybehub.app · device-test DM + AI keyboard on Despia

## Safe area v2 + location privacy disclosure (2026-06-17)
- **Problem:** Header not flush under camera; DM composer / profile pill / call UI sitting too high; App Store missing Location disclosure in privacy policy
- **Fix:** Trust measured `env(safe-area-inset-*)` only (removed inflated Despia bottom fallback ~68px); tightened `--dm-header-stack`, composer `padding-bottom`, call overlay insets; MobileHeader + DM header use `--app-header-safe` only; Privacy v2.1 Section 12 Location Data
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `2f72758f` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for vybehub.app (privacy at `/privacy`) · resubmit App Store privacy review · device-test DM composer + incoming call on Despia

## Mobile safe area + splash polish (2026-06-29)
- **Problem:** Home header huge top gap; asymmetric width; splash V too far above wordmark; progress bar stuck ~28%
- **Fix:** Unified `--app-gutter-x` insets; toolbar flush under safe area; splash brand stack + JS-driven progress (removed static 28% CSS cap)
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `29a26d5e` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for vybehub.app

## Despia Google OAuth — oauth:// secure session (2026-06-29)
- **Problem:** Google sign-in in Despia app opened full Safari to vybehub.app; login never completed in app
- **Cause:** Capacitor Firebase Auth never runs in Despia WebView (`isNativePlatform` false); fallback used `signInWithPopup` → Safari handoff
- **Fix:** `src/lib/despiaOAuth.ts` — Despia `oauth://?url=...` → ASWebAuthenticationSession; `public/native-callback.html` → `com.despia.vybe://oauth/auth?id_token=...`; Firebase `signInWithCredential`; removed popup fallback for Despia in `nativeOAuth.ts`; separate `vybe-despia-oauth-pending` state
- **Verified:** `npm run build` PASS · `npm run lint` PASS · `dist/native-callback.html` present
- **Committed:** `8ca13e0d` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Google Cloud Console → add redirect URI `https://vybehub.app/native-callback.html` · Lovable Publish vybehub.app (callback must be live) · test Google on Despia device (secure sheet, not Safari tab)

## Seamless login fix — native OAuth + faster auth boot (2026-06-29)
- **Problem:** Slow login; Google opens separate Safari browser on Despia/iOS; spinner before form
- **Fix:** Platform router `nativeOAuth.ts` — Capacitor Firebase Auth on native shells (no redirect); popup desktop; redirect mobile Safari only; instant login form when logged out; deferred `getSession` token enrich; unified 12s sign-in timeout; OAuth return Cancel + 18s mobile capture; splash dismiss 300ms after SIGNED_IN; deep link OAuth capture in `capacitor.ts`
- **Deps:** `@capacitor-firebase/authentication@8.3.0`
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Committed:** `2acdbe7b` · pushed `main`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable → Share → Publish for vybehub.app · Despia native rebuild (`npx cap sync`) + Firebase iOS/Android OAuth clients · test Google on device (no Safari handoff)

## Home "page couldn't load" — corrupt challenge/pass cache (2026-06-29)
- **Symptom:** Recurring route error `"This page couldn't load"` on `/home` when logged in (AnimatedRoutes ErrorBoundary)
- **Cause:** IndexedDB persisted `challenges` / `vybe-pass-tiers` as plain `{}` instead of arrays → `BattlePassWidget` / `useChallengesWithProgress` called `.map`/`.filter` on object and threw
- **Fix:** `mustPersistAsArray` blocks re-persisting non-array list keys; `select` + `ensureArray` on challenge/pass hooks; per-widget ErrorBoundary on stories + battle pass; cache buster `vybe-cache-v18`
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deployed:** https://vybe-daaab.web.app
- **You:** Hard refresh once (Cmd+Shift+R) or Settings → clear site data · Lovable Publish → vybehub.app

## Splash boot crash fix — useAuth outside AuthProvider (2026-06-17)
- **Symptom:** Full-screen "Something went wrong" / "VYBE hit a snag" on app load
- **Cause:** `VYBELogo` → `useVybeMarkColors` → `useUserTheme` → `useAuth`, but splash renders before `<AuthProvider>`
- **Fix:** `useVybeMarkColors` reads equipped theme from storage/CSS + `vybeThemeChange` events only (no auth hook)
- **Verified:** headless /home no error · `npm run build` PASS · `npm run lint` PASS
- **Deployed:** https://vybe-daaab.web.app

## VybeMap location puck + Snap-style background tracking (2026-06-17)
- **Self puck:** Snap-style blue dot + direction beam + clean pulse ring; rotates with GPS/compass heading
- **Find friend arrow:** Smoothed compass lerp (no jittery spring); custom arrow glyph + calm rings
- **Background tracking:** GPS watches while live-sharing OR on VybeMap (updates Firestore off-map like Snap Map); visibility-aware refresh
- **Map follow:** Camera eases to user position when coords update (pauses while panning)
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deployed:** https://vybe-daaab.web.app

## DM mobile layout — header + composer inset (2026-06-17)
- **Problem:** Composer floated ~7rem above bottom (legacy bottom-nav clearance while nav hidden in chat); header sat too low below status bar
- **Fix:** `--dm-composer-lift: 0` in active chat; composer pins to safe-area bottom + keyboard; DM-specific `--dm-floating-header-scroll`; header uses `--sat` only
- **Verified:** `npm run build` PASS
- **Deployed:** https://vybe-daaab.web.app
- **Next:** device verify on Despia · Lovable Publish

## Custom VYBE sound pack (2026-06-17)
- **Assets:** 7 user-provided WAVs optimized → `public/sounds/` (mono 44.1kHz loudnorm): dm-received, dm-sent, post-liked, share-post, comment, call-ring, vybe-notification
- **Registry:** `src/lib/vybeSoundAssets.ts` — URL map for all bundled sounds
- **Engine:** `premiumSounds.ts` — bundled WAVs by default; synth fallback for tap/toggle/error/call connect/end; preload on first gesture; respects silent mode + category toggles
- **Wired:** DM send/receive · call ring (loop) · share success (`ShareSheet`) · bell notifications (like → post-liked, comment → comment, else → vybe-notification) · settings previews (messages/calls/ui + like/comment)
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deployed:** https://vybe-daaab.web.app (Firebase hosting, 2026-06-17)
- **Next:** Lovable Publish → vybehub.app · device test all sound categories

## Unified camera phase 2 — gestures + story fast-post (2026-06-17)
- **Gestures (`useCameraGestures`):** Swipe down close · swipe up gallery · swipe left memories/gallery · horizontal filter swipe · pinch zoom + indicator · tap-to-focus reticle · double-tap flip (resets zoom)
- **Capture UX:** `VybeRecordButton` with mode-aware max duration (story 15s, snap/DM 30s, clip/video 60s); gallery button + drawer wired
- **Story fast-post:** `CameraStoryPostSheet` — capture → edit → caption/close-friends → post (skips generic share sheet when `captureTarget === 'story'`)
- **Mode tabs:** `modesForTarget()` shows context-appropriate modes per entry point
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deployed:** https://vybe-daaab.web.app (Firebase hosting, 2026-06-27)
- **Next:** Lovable Publish → vybehub.app · push git so Lovable syncs latest

## Reactions, comments, Say Hi, unified camera phase 1 (2026-06-27)
- **Comments broken:** Firestore rules required `author_id` but client writes `user_id` — permission denied on every insert
- **Reactions:** Likes rules tightened with `willOwnUserField`; server confirms write after `setDocument`
- **Say Hi:** Only on empty 1:1 threads with a friend accepted in last 30 days; otherwise shows last message or "Tap to chat"
- **Unified camera:** All entry points route through `Camera` via `UnifiedVybeCamera` (DM/Snap/Story/Create share one engine)
- **Verified:** `npm run build` PASS · `npm run lint` PASS · Firestore rules deployed
- **Next:** Lovable Publish

## Smooth UI / anti-jank pass (2026-06-27)
- **Root cause:** Native Despia shell had `reduce-motion` + Framer `reducedMotion: 'always'` — killed all CSS/JS transitions (jarring, jittery feel)
- **Fix:** Removed native reduce-motion; mounted `PlatformProvider` for proper perf tiers; unified buttery expo-out tweens (`smoothMotion.ts`, `smooth-ui.css`); GPU route crossfade; scroll-time animation pause; bottom-nav will-change only while animating
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Next:** Lovable Publish · feel-test tab switches, feed scroll, DM thread on device

## Notification deep links + call UI + silent sounds (2026-06-27)
- **Deep links:** `NotificationActionRouter` centralizes all push taps — DMs, typing, calls, login approval, social — routes to correct screen via `data.path` / `conversationId` / `callId`
- **Typing push:** `"X is typing…"` with chat deep link; passive priority, no sound on lock screen
- **Calls:** OneSignal Answer/Decline buttons; native full-screen incoming call (CallKit / Android full-screen intent); in-app `GlobalCallOverlay` when foreground
- **Silent mode:** `deviceSilentMode.ts` gates in-app sounds (`premiumSounds`, `callSounds`) when phone is on silent/vibrate
- **Verified:** `npm run build` PASS · `npm run lint` PASS · functions build PASS
- **Deployed:** https://vybe-daaab.web.app + `onCallCreated`, `onDmMessageCreated`, `sendPushNotification` (2026-06-27)
- **Next:** Lovable → Share → Publish for vybehub.app · test DM/typing/call tap on Despia device · verify lock-screen call UI on physical device

## Notification system hardening v2 (2026-06-26)
- **Root cause:** Placeholder `despia:{profileId}` tokens written before real OneSignal UUID → server had zero delivery targets; `linked:true` returned without subscription; Despia bridge fired before native module loaded; auth uid used as external_id fallback
- **Fix:** `ensureDespiaDeviceRegistered()` awaits native + polls up to 8s; never persist placeholders; strict `linked` only with real UUID; server deletes stale placeholders on link; smart gate skips suppression when `online:false`; DM client backup push restored; diagnostics show OneSignal errors
- **Verified:** debug scan PASS · build PASS · lint PASS
- **Deployed:** https://vybe-daaab.web.app + all push functions (2026-06-26)
- **Shipped:** git `2d4cdcef` pushed · Firebase staging redeployed (2026-06-26)
- **Next:** Lovable → Share → Publish for vybehub.app · device: Force re-register in notification diagnostics

## Notification system hardening (2026-06-17)
- **Problem:** Push only worked after manual Despia Developer relink; duplicate DM pushes; no server-side "viewing chat" suppression; scattered registration paths racing
- **Client:** `NotificationRegistrationService` — single mutexed pipeline with exponential backoff; lifecycle hooks (launch, login, token refresh, foreground, network reconnect); removed placeholder `despia:{id}` tokens; `linkDespiaExternalId` profile-id only (no dual auth uid); `relinkDespiaPushInBackground` delegates to service; removed client DM push fallback in `dmSendCore`
- **Server:** `smartPushGate.ts` — skip push when viewing conversation, muted, or blocked; DM delivery logging to `push_delivery_logs`; `linkOnesignalUser` logs to `push_registration_logs` with `device_id` + `reason`; FCM skips OneSignal UUID tokens (fixes duplicate native push)
- **Diagnostics:** Admin page `/settings/notification-diagnostics` — permission, tokens, registration history, test push, force re-register, copy debug
- **Verified:** `npm run build` PASS · `npm run lint` PASS · functions build PASS
- **Deployed:** Firebase staging https://vybe-daaab.web.app — hosting + `linkOnesignalUser`, `getPushSubscriptionStatus`, `sendPushNotification`, `onDmMessageCreated` (2026-06-17)
- **Next:** Verify on Despia device without manual relink · Lovable Publish for vybehub.app · extend smart gate to calls/social triggers · rich notification grouping

## Login endless wait fix (2026-06-17)
- **Problem:** After entering credentials, login spinner never ended — `gatePending` blocked redirect while `signInWithPassword` hung; stale `vybe-oauth-pending` slowed auth init
- **Fix:** Removed `gatePending` navigation lock; 12s sign-in timeout + fast token path; recover from `auth.currentUser` on timeout; OAuth pending TTL (3 min) + boot cleanup; `INITIAL_SESSION` null unblocks login UI immediately
- **Debug scan:** build PASS · lint PASS · CSS/boot PASS · prod probes PASS (sharePreview, livekitToken, aiCatchUp)
- **Shipped:** git pending push · Firebase staging https://vybe-daaab.web.app
- **Next:** Lovable → Share → Publish for vybehub.app · verify email + Google login on staging

## Login network error fix (2026-06-17)
- **Problem:** Email/password login showed "Connection error" when Firebase accepted credentials but ID token fetch failed
- **Fix:** Resilient `toVybeSession` (retries + fallback token), password login network retries, live-session recovery in `signIn`, safer auth state listener
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** git `fe7086a6` pushed · Firebase staging https://vybe-daaab.web.app (2026-06-17)
- **Next:** Lovable → Share → Publish for vybehub.app · verify login on staging + production

## Vybe Snap lock + composer keyboard (2026-06-17)
- **Vybe Snap:** Server-backed view state — tap once, hold-to-replay once, then `view_mode: vybe_locked` (persists after refresh)
- **Composer:** Desktop no fake keyboard inset (fixes freeze); native lift 7rem + keyboard scroll-into-view
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** git `d23f4064` · Firebase staging https://vybe-daaab.web.app (2026-06-17)
- **Next:** Lovable → Share → Publish for vybehub.app

## DM composer + keyboard + Snapchat notifications (2026-06-17)
- **Composer:** Much higher bottom lift on Despia (`--dm-composer-lift` 3.75rem); presence sits above composer; keyboard polling + height estimate when visualViewport is 0
- **Vybe Snap:** JPEG compress before upload; skip signed-URL round trip; client push on every DM insert (backup when phone locked)
- **Push:** OneSignal DMs/calls use `time_sensitive` + longer TTL; client `sendMessagePush` after every successful `insertDmMessage`
- **UI:** Snapchat-style chat banner toast + notifications list rows (avatar, “sent you a chat”, blue unread dot)
- **Verified:** `npm run build` PASS · `npm run lint` PASS · functions build PASS
- **Shipped:** git `8af9f349` · Firebase staging https://vybe-daaab.web.app (2026-06-17)
- **Next:** Lovable → Share → Publish for vybehub.app

## Push + Vybe Snap + camera filter fixes (2026-06-17)
- **Push:** DM trigger resolves 1:1 recipients from conversation ids; OneSignal auth uid fallback
- **Camera:** VYBE filter on capture; Vybe Snap default VYBE filter; direct Send in DMs; free-drag emojis
- **Shipped:** git `72d54587` · Firebase staging (2026-06-17)

- **Composer:** Centered texter, 48dp targets, 5-line expand, keyboard spring dock, glass pill polish
- **Shipped:** git `12039225` · Firebase staging https://vybe-daaab.web.app (2026-06-17)

## Server push linking fix (2026-06-17)
- **Problem:** Instant test push fired server send without OneSignal subscription id — "not linked" / no delivery
- **Fix:** `sendDespiaServerPush` resolves subscription (device probe + retries + server lookup), links, sends with `subscriptionId`; `link-onesignal-user` pulls subs from OneSignal when client has none; Despia subscribe/resync uses `relinkDespiaPushInBackground`
- **Verified:** `npm run build` PASS · `npm run lint` PASS · functions build PASS
- **Shipped:** git `b0380b4b` · Firebase staging https://vybe-daaab.web.app + linkOnesignalUser/sendPushNotification/getPushSubscriptionStatus (2026-06-17)
- **Next:** Lovable Publish for vybehub.app

## Instant test push (2026-06-17)
- **Problem:** Settings "Send me a test push" worked but felt slow — awaited permission check (~600ms) + server round trip before toast
- **Fix:** `fireDespiaTestPushInstant` — sync local notification via preloaded `despia-native`; server send in background; toast on tap
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-17)
- **Next:** Lovable Publish for vybehub.app

## Despia push — official external_id flow (2026-06-26)
- **EnablePushPrompt:** Turn-on-notifications dialog on Despia; `acceptDespiaPushPermission` → registerpush + instant `setonesignalplayerid://`
- **Auth load:** `linkDespiaExternalId` on every login/resume/foreground (Despia docs pattern)
- **Shipped:** git `bb22903e` · Firebase staging https://vybe-daaab.web.app (2026-06-26)
- **Next:** Lovable Publish for vybehub.app

## Flagship UX/perf overhaul — phase 2 (2026-06-17)
- **Push test (Despia):** Settings test uses Despia Push Demo flow — native relink, `get-push-subscription-status`, send by `subscriptionId`; local instant notification fallback
- **Push server:** `send-push-notification` returns `error: No push tokens found` when `sent=0`; `link-onesignal-user` returns accurate `linked` flag
- **Bottom nav:** CSS-only hide/show (no Framer Motion fighting scroll); accumulated scroll-down threshold; scroll listener only on `[data-app-scroll-container]`; tab-to-tab no longer resets hide state; removed `is-scrolling` transition kill on nav
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** git `be3817e4` pushed · Firebase staging https://vybe-daaab.web.app + `sendPushNotification`/`linkOnesignalUser`/`getPushSubscriptionStatus` (2026-06-26)
- **Next:** Lovable Publish for vybehub.app · keyboard avoidance audit

## Flagship UX/perf overhaul — phase 1 (2026-06-26)
- **Bottom nav:** `bottomNavController.ts` — velocity/distance thresholds, stays hidden until deliberate scroll-up, no touchmove/wheel jitter; `useSyncExternalStore`; AppLayout padding tracks effective nav visibility
- **VYBE wordmark:** Stronger contrast — text-stroke + background drop-shadow on light/dark/glass
- **AI theme:** Brand instant path (Nike/Ferrari/etc. never purple); `preferBaseColors` merge; achromatic primary sanitize fix; cloud purple fallback removed
- **Push:** Auto relink on `app-resumed` / `pageshow` / visibility; permission re-prompt path when OS grants outside app
- **Perf monitor:** `performanceMonitor.ts` + Debug Panel FPS/frame/memory (`?vybe_perf=1` or `localStorage vybe_perf_monitor=1`)
- **Motion:** Standard 150/220/300ms tokens in `motion.ts` + CSS vars
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** git `61d4b5cd` pushed · Firebase staging https://vybe-daaab.web.app + `generateTheme` (2026-06-26)
- **Next:** Lovable Publish for vybehub.app · Phase 2 keyboard/feed perf

## Theme generator — personalized from user context (2026-06-26)
- **Feature:** AI theme generation now uses profile, Vybe DNA, interests, bio, equipped theme, and adaptation hints — not just the typed prompt
- **Client:** `themeUserContext.ts` + auto-collect in `useGenerateTheme`; Design Your Vybe / Theme Customizer allow blank prompt ("generate from what VYBE knows")
- **Server:** `generate-theme` cloud function loads profile + `vybe_dna` and injects context block into Gemini prompt
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deploy:** Redeploy `generate-theme` function for server-side context on production
- **Shipped:** git `31513cec` pushed · Firebase staging https://vybe-daaab.web.app + `generateTheme`/`generateAdvancedTheme` (2026-06-26)

## Instant full-theme boot paint (2026-06-26)
- **Problem:** Logo showed equipped Vybe colors immediately (reads localStorage) but nav borders, Customize pill, hero cards flashed default theme until React `applyThemeTokens` ran — `index.html` only set ~15 CSS vars and skipped the full `vybe-boot-theme` snapshot when equipped tokens existed
- **Fix:** `themePrepaint.ts` + `public/boot-theme.js` (sync script in `<head>`) replays full snapshot then applies complete equipped derivation (`--sidebar-accent`, `--ring`, `--glass`, `--border`, etc.) before first paint; `ensureBootThemeApplied()` uses same path + `markThemeAppliedFromBoot`
- **Build:** `npm run build:boot-theme` runs before `dev` and `build`
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Next:** Ship staging + Lovable Publish; hard-refresh and confirm Home nav + Customize match logo on first paint

## Boot + content load performance (2026-06-26)
- **Splash:** Never blocks on auth/profile/feed network — instant dismiss, all warming in background
- **Persist:** IndexedDB restore cap 40ms (web) / 80ms (native); on restore → theme hydrate + `warmHomeCaches` immediately
- **Routes:** Critical route chunks preload immediately (was 2s idle delay)
- **Boot:** Sentry + App Check deferred to `requestIdleCallback`; faster auth/splash caps
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## Deep scan — camera fullscreen + theme auto sync (2026-06-26)
- **Camera glitch:** Vybe Snap shutter bled into DM column — camera mounted inside `#root` stack (not portaled); fixed with `FullscreenPortal` + `z-[10050]` + hide `#app-shell` while `data-camera-open`
- **Theme slow load:** `prefetchAndApplyUserTheme` bailed when stale localStorage existed — now paints local instantly then always reconciles with `user_themes` DB; `equipTheme` auto-saves to account; DB row is source of truth in `useApplyUserTheme`
- **Prod probes:** `sharePreview` was wrongly deployed as callable (GET → 400); deleted + redeployed as HTTPS with `?probe=1` health; debug-scan uses POST for callables (401 = PASS)
- **Debug scan:** build PASS · lint PASS · CSS/boot PASS · 66/144 functions OK · prod probes PASS (sharePreview, livekitToken, aiCatchUp)
- **Published:** Firebase staging https://vybe-daaab.web.app (hosting + firestore rules + sharePreview, 2026-06-26) · git `e73f2ec1` pushed to `main` — **you:** Lovable → Share → Publish for vybehub.app
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)
- **Next:** Lovable Publish for vybehub.app · user-verify camera fullscreen on desktop DMs

## Texter liquid-glass redesign (2026-06-26)
- **Problem:** DM composer looked flat/muddy — shadcn `Textarea` forced `liquid-glass-input` → dark sunken box inside the pill
- **Fix:** Native `<textarea>` in unified frosted pill; gradient border + shine; themed icon buttons (Toy Box, camera, mic/send); keyboard scrim fade
- **Camera tap lag:** `openCameraFromGesture` awaited getUserMedia before showing overlay → instant open + `streamPromise` from gesture; pause liquid aurora while camera open
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## DM visual cohesion + avatars (2026-06-26)
- **Bubbles:** Removed hardcoded orange/yellow 24h & view-once overrides — sent bubbles stay primary→accent; ephemeral = subtle ring only
- **Glass shell:** Chat column + inbox + sidebar share same translucent glass; liquid aurora shows through (no flat black chat pane)
- **Upload CTA:** `gradient-animated` uses primary→accent only (no bg-gradient-start/mid/neon-purple sweep)
- **Avatars:** DM list enriches members from avatar cache + batch URL signing; Vybe snap card uses theme gradient
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## DM crash + theme cohesion (2026-06-26)
- **Crash fix:** `MessageInputArea` used `messagesContainerRef` without destructuring it → `ReferenceError` crashed ChatView / showed "Couldn't load Messages"
- **Theme:** Wordmark gradient primary→accent only; messages column matches inbox glass; Upload aura sweep drops hardcoded neon-purple; DM avatars use `ProfileAvatarImage`
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## Theme sync fix — cohesive Vybe palette (2026-06-26)
- **Problem:** Home UI looked "messed up" — logo/accents pink-cyan but nav active + trending chips orange-brown; stale boot snapshot could block full theme re-apply
- **Boot:** Equipped tokens always win over `vybe-boot-theme` snapshot; snapshot-only boot no longer marks theme as fully applied; logout clears all theme localStorage keys
- **Tokens:** `--sidebar-accent` derived from primary (not raw `colorSecondary`); nav active + trending badges use primary tint
- **UI:** DiscoveryCards gradients use `--primary`/`--accent`; StoriesBar avatar uses same path as sidebar
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## Slower bubbles + theme-matched logo (2026-06-17)
- **Logo fix:** SVG strokes use resolved theme HSL (`useVybeMarkColors`) — WebKit-safe; V mark visible on splash/header; boot static SVG uses CSS stroke colors
- **No theme snap:** Boot replays `vybe-boot-theme` snapshot + `vybe-equipped-theme` fallback in `index.html`; `ensureBootThemeApplied()` in `main.tsx`; `markThemeAppliedFromBoot()` skips redundant React re-apply; logo reads equipped tokens directly
- **Fast theme load:** `themeHydration.ts` — per-user equipped cache, prefetch on auth/preloader, hydrate from IndexedDB react-query cache on persist restore; `useUserTheme` initialData from localStorage
- **Background motion:** Splash overlay transparent + ambient bubbles; blob cycles ~58–72s
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-17, logo + motion fixes)

## Single Vybe-matched animated background (2026-06-26)
- **Problem:** 3 competing backdrops on load — static `.vybe-bg` gradient, portaled aurora (hardcoded purple/cyan), plus `BackgroundEffects` from theme
- **Fix:** One global `VybeLiquidBackground` via `AppGlobalLiquidShell`; mesh/blobs/bloom use `hsl(var(--primary|--accent|--secondary))`; slow 48–100s drift; retired `.vybe-bg`; removed duplicate Landing inline aurora + theme `BackgroundEffects` layer; DM inbox hero aurora hidden when global liquid active
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## VybeMap follow toggle + Texter DM composer (2026-06-26)
- **Map:** Device compass follow is now **off by default** — toggle via compass FAB (right side) or Map settings → "Follow phone direction"; pauses while you pan/zoom/rotate
- **Texter:** Liquid-glass pill composer (Toy Box, Vybe Snap, voice hold/slide-cancel, send); shared for 1:1 + group DMs
- **Keyboard:** `KeyboardAwareTexter` tracks `--keyboard-height` / `--texter-stack-h`; Texter fixed above keyboard; message list padding adjusts; auto-scroll on keyboard open
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (2026-06-26)

## Camera overlay wiring — remaining entry points (2026-06-17)
- **Extended overlay API:** `onCapture`, `onDismiss`, `showBackArrow`, `defaultMode` on `OpenCameraOptions`; `UnifiedVybeCamera` routes captures to callback or `/upload`
- **Wired:** StoryCreator (story camera + onCapture back to preview), DesktopCreateStudio (post capture → studio files), CreateMenu (camera → overlay), hub already on `CreateMenuLayer`
- **Cleanup:** Removed dead `showSnapCamera` block from ConversationList; removed inline `Camera` mounts from StoryCreator / DesktopCreateStudio / CreateMenu
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** Firebase staging https://vybe-daaab.web.app (hosting + firestore rules, 2026-06-26)
- **Next:** Lovable → Share → Publish for vybehub.app production · optional Texter full swap in DM composer

## Camera + Texter + theme marketplace fixes (2026-06-25)
- **Hub camera dead tap:** Global `CameraOverlayProvider` — opens camera inside user gesture with pre-acquired stream; hub/create menu wired to `UnifiedVybeCamera`
- **Unified camera:** `cameraConfig.ts`, `UnifiedVybeCamera` (DM/Snap → VybeSnapCamera; Hub/Story → Camera); black preview until stream ready (no blurry placeholder)
- **DM composer:** `KeyboardAwareTexter` wrapper + texter pill styles; Vybe Snap opens shared camera with `captureTarget=dm`
- **Theme save/publish:** Firestore rules for `user_themes`, `shared_themes`, `saved_themes` (were deny-all → save/share failed silently)
- **Publish to marketplace:** Design Your Vybe share now saves then publishes with `visibility: public`
- **Removed:** "Design Your Layout" button (broken UIBuilder entry)
- **AI themes:** Added Cowboys, Ferrari, Minecraft, Barça, Christmas brand palettes
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **You:** `firebase deploy --only firestore:rules,hosting --project vybe-daaab` · hard refresh · test hub camera + DM keyboard + theme save/share

## Deep scan + map settings persistence + perf (2026-06-25)
- **Debug scan:** build PASS · lint PASS (fixed ConversationList constant-binary + queryRefetchPolicy warnings) · CSS/boot PASS · 66/144 Cloud Functions refs OK · prod probes WARN (400 on sharePreview/livekit/aiCatchUp — expected without auth body)
- **VybeMap remembers map look:** `useMapViewMode` persists 2D/3D/satellite/terrain/hybrid in `vybe-map-view-mode-v1` — leave on 3D, returns on 3D
- **Map layers** already persisted in `vybe-map-layers-v2`
- **Perf:** Fixed infinite RAF loop in `useLiveFriends` (was re-rendering every frame forever); map route preloaded (`/map` in routePreloader + sidebar hover prefetch); live friends poll 8s→12s
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Shipped:** commit `e7e2e08e` pushed to `main` · Firebase hosting https://vybe-daaab.web.app
- **You:** Hard refresh staging · **Lovable → Share → Publish** for vybehub.app production

## AI theme designer — fast + faithful matching (2026-06-17)
- **Problem:** Theme generation waited on slow Cloud Function first; vague/unrelated palettes for brand/color prompts
- **Fix:** New `promptThemeBuilder.ts` — instant parse for brands, hex codes, color names, scenes (sunset, ocean, y2k, etc.); high-confidence prompts return immediately with no network
- **Pipeline:** Instant parse → parallel client AI (6s) + cloud (5s) with merge into parsed anchors → local prompt palette fallback (never random vibe)
- **UX:** Design Your Vybe timeout 30s → 12s; toast on instant brand/prompt match
- **Verified:** `npm run build` PASS
- **You:** Hard refresh staging · test prompts like "Nike black orange", "#FF0000 and black", "sunset vibes", "Spotify green"

## Bug monitor triage + DM/cache fixes (2026-06-17)
- **handleWarm is not defined:** `ConversationItem` used `handleWarm` without defining it — added callback from `onWarm` prop
- **Admin 403 spam:** Stopped client auto-invoke of `analyze-bug-report`; ignore expected staff 403s in auto reporter; gate `BugRecheck` + `AdminLiveAnalytics` on `isAdminRole`; profiles count fallback for total users
- **Stack overflow /messages:** Stable-reference message cache revive; normalizer try/catch removes corrupt queries; cache buster `vybe-cache-v17`
- **analyzeBugReport:** Accept `bugId` or `report_id` + CORS on callable
- **Verified:** `npm run build` PASS · deployed https://vybe-daaab.web.app + `analyzeBugReport`
- **You:** Hard refresh staging · Lovable Publish vybehub.app (prod still on old Messages bundle) · ensure `user_roles` has owner/admin row for your uid on vybe-daaab · set `GEMINI_API_KEY` on Cloud Functions for AI theme/agent

## Background layer consolidation (2026-06-17)
- **Problem:** ~11 stacked full-screen paints (duplicate `.vybe-bg`, aurora mount fallback gradient, body gradient, 7 liquid sub-layers)
- **Fix:** Single boot `.vybe-bg` only (removed React duplicate); `#root` transparent; empty `#vybe-aurora-mount`; hide `.vybe-bg` when aurora/custom wallpaper active; app-shell aurora = mesh + 2 blobs (no bloom/grain); body liquid fallback = solid `#090812` only
- **VYBE wordmark clip:** PNG export was bottom-cropped — switched to live text (`Vybe Font` / Permanent Marker) + theme gradient + descender padding
- **Verified:** `npm run build` PASS · deployed https://vybe-daaab.web.app
- **You:** Hard refresh staging · Lovable Publish vybehub.app for production

## DM permissions, error monitor, wordmark, staging fixes (2026-06-17)
- **DM permission denied:** Replaced batched `conversations` `.in()` queries (Firestore rules reject list queries) with per-doc reads; membership query uses resolved `profile.id` only; `syncUserAuthIndex` before DM load; stop retries on permission errors; auto-report to `bug_reports`
- **Add friends slow:** Parallel profile + request lookups; `createDmChat` instead of heavy RPC; fire-and-forget notification insert
- **Error monitor empty:** `AdminErrorsSection` was filtering to AI-verified only — now shows all pending reports; DM/permission errors reported via `reportAppCrash`
- **VYBE wordmark:** Text + `dm-title` gradient (user theme primary/accent); extra bottom padding — no PNG clip
- **get_auth_users_count:** New callable `getAuthUsersCount` with `cors: true` + client RPC; `authLoginNotify`/`authLoginApproval` CORS enabled
- **OneSignal staging:** Skip web SDK on `vybe-daaab.web.app` / preview hosts
- **Verified:** `npm run build` PASS
- **You:** Deploy functions (`getAuthUsersCount`, auth CORS) · hard refresh · sign out/in if DM still denied (refreshes `user_auth_index`)

## App-wide black flicker / repaint guard (2026-06-17)
- **Symptom:** Center content flashes black on navigate, panel open, scroll, admin section change; side rails stable but main pane repaints
- **Cause:** `popLayout` route transitions, `#0B0B10` Suspense/loader fallbacks, opaque `bg-background` shells, `layoutId` on nav rails, `transition-all` on large containers
- **Fix:** Permanent `.vybe-bg` (index.html + App shell); `src/styles/repaint-guard.css` (page-shell, vybe-glass, vybe-loading-shell, scroll containment, repaint hints); opacity-only route transitions (`AnimatedRoutes`, `PageTransition`); stable Suspense fallbacks; `AppLayout` main-content shells; memo `DesktopLeftSidebar`/`DesktopRightSidebar`; removed `layoutId` from BottomNav/Sidebar; admin/Messages stable backgrounds
- **Verified:** `npm run build` PASS
- **You:** Chrome DevTools → Rendering → Paint flashing (only clicked elements should flash) · hard refresh · Lovable Publish vybehub.app · `npx -y firebase-tools@latest deploy --only hosting --project vybe-daaab` for staging

## DM crash + flicker fix — React Query loop (2026-06-25)
- **Symptom:** "Couldn't load Messages" + `RangeError: Maximum call stack size exceeded` in `setQueryData`; black flicker on swipe/drag
- **Cause:** `installQueryCacheNormalizer` re-wrote DM/stories cache on every update (always new array refs) → infinite `setQueryData` loop; error boundary called `reviveQueriesInCache` making it worse
- **Fix:** Stable-reference cache revival (`dmConversationListNeedsRevive`, `storyGroupsNeedRevive`); re-entrancy guards; write guard only normalizes corrupt data; `recoverDmQueryCache` for soft recovery; realtime message payload sanitization; GPU compositor layers on DM swipe/shell (transform+opacity only)
- **Verified:** `npm run build` PASS · deploy vybe-daaab.web.app
- **You:** Hard refresh · VYBE AI still needs `GEMINI_API_KEY` on Cloud Functions or BYOK in Settings

## DM page crash fix — route error on /messages (2026-06-25)
- **Symptom:** "This page couldn't load" when opening DMs (route ErrorBoundary, not inbox fallback)
- **Cause:** Corrupt persisted DM rows (object `name` / `display_name` rendered as React children); hooks in `Messages()` sat outside child error boundary; heavy `ChatView` static import
- **Fix:** Always normalize DM list rows; `asDisplayLabel` for conversation names; `useAppBackgroundSafe` (no throw); `MessagesInner` inside `SmartErrorBoundary`; lazy `ChatView`; `LocalErrorBoundary` + `DmInboxSafeList` fallback; cache buster `vybe-cache-v16`
- **Verified:** `npm run build` PASS · deploy vybe-daaab.web.app

## Multi-fix batch — media, hubs, DMs, listings, monitoring, wordmark (2026-06-25)
- **Media/images/video:** Firebase `?alt=media` URLs without tokens now resolve via `getDownloadURL` (`firebaseStorageNeedsToken` + `useFastSignedUrl`); extra storage prefixes (`hubs/`, `servers/`, `listings/`); `ChatMediaBubble` audio path normalized
- **Hubs sidebar:** `useMyServers` two-step fetch (memberships → servers) — fixes `?` placeholders from broken nested join
- **Listing delete:** `useDeleteListing` soft-delete fallback (`status: deleted`) when RLS blocks hard delete
- **DMs:** Swipe-left delete + long-press options on inbox (`SwipeableDmConversationRow`); `hidden_conversations` uses profile id consistently; `DMSafetyGate` skips gate for active threads + friends list cache; friendship status keeps stale data on refetch
- **Add Friends dismiss:** `useDismissedQuickAdd` persists on `user.id` key immediately (survives refresh)
- **Error monitor:** Auto bug reports opt-out (`consent !== false`) instead of opt-in only
- **VYBE wordmark:** `VybeWordmark` + Permanent Marker brush font + neon gradient (logo, inbox, headers); cache buster `vybe-cache-v15`
- **Verified:** `npm run build` PASS
- **You:** Hard refresh · Lovable Publish vybehub.app · test media in feed + DMs, hub sidebar, swipe delete on Messages

## DM inbox redesign — glass cards + sections (2026-06-25)
- **New:** `DmInboxView` — gradient VYBE hero, search, All/Unread chips, VYBE-AI + New chat lanes, sectioned list (New / Pinned / This week / Earlier), glass conversation cards with unread glow + timestamps
- **Primary path:** `/messages` uses `DmInboxView` (stable + beautiful); old `ConversationList` kept in repo for swipe/pins/notes re-integration later
- **Deployed:** https://vybe-daaab.web.app · `npm run build` PASS

## Messages reliability v5 — fail-soft + minimal fallback (2026-06-25)
- **User report:** Every DMs tap → "Couldn't load Messages" for all users
- **Fix:**
  - `useDMConversations` never throws (`throwOnError: false`) — network errors show empty/retry, not crash
  - `ConversationListMinimal` — if full list throws, users still see chats (LocalErrorBoundary fallback)
  - `prepareMessagesRoute` on /messages mount — revive cache + seed + prefetch
  - Membership query failure → `listUserChats` fallback before giving up
  - Disabled `useStories` on DM list (persisted story cache crash vector)
  - DMsHeader wrapped in LocalErrorBoundary; cache buster `vybe-cache-v13`
- **Verified:** `npm run build` PASS · deployed https://vybe-daaab.web.app
- **You:** Hard refresh once · Lovable Publish vybehub.app for production users

## Messages crash v4 — friends/streaks `{}` cache (2026-06-25)
- **Still broken:** `friends` + `streaks` persisted as `{}` → `.forEach`/`.filter` throw in `useStreakMap` / `useOnlineFriends` (not in prior revive list)
- **Fix:** Smarter `ensureArray` (coerce corrupt IDB objects); revive `friends`/`streaks`/friend-requests; hook `select` guards; `listUserChats` fallback when membership query empty; NotesRow boundary; cache buster `vybe-cache-v12`
- **Verified:** `npm run build` PASS
- **You:** Hard refresh (Cmd+Shift+R) or Messages Reload once → list should paint · Firebase staging redeploy if testing vybe-daaab.web.app

## Messages video fixes — stories crash, previews, media (2026-06-25)
- **Video issues:** Home sidebar "No messages yet" on real DMs; Messages left pane "Couldn't load Messages" while chat worked; reload stuck skeleton + generic "Chat" header; media bubbles orange gradient placeholders
- **Root cause (list crash):** `useStories` in `ConversationList` — persisted `group.stories` as `{}` → `.filter` throw; unsafe `group.user.id`
- **Fix:** `normalizeStoryGroups` + hardened `stripUploadingStories`; safe `userStoryMap`; `LocalErrorBoundary` on Quick Add + story viewer; sidebar uses `formatDmPreviewContent`; `ChatMediaBubble` runs `normalizeMediaUrl` before signing; `hasCachedList` includes sync cache read; `useConversationDetail` `initialData` from DM cache; cache buster `vybe-cache-v11`
- **Verified:** `npm run build` PASS
- **You:** Hard refresh once → `/messages` list + open thread · Lovable Publish vybehub.app

## Messages instant load (2026-06-25)
- **Problem:** DM list blocked on profile resolve + empty cache threw away stale data; skeleton showed even when cache had rows
- **Fix:** `readDmConversationsCache` / `seedDmConversationsCache` — sync read from any warm key; `useAuthProfileId` (no query-disable gap); `initialData` + cache-first `isLoading`; background refresh when cache hit; Messages mount seeds + prefetches; cache buster `vybe-cache-v10`
- **Verified:** `npm run build` PASS
- **You:** Hard refresh once → Messages should paint list immediately from cache, then refresh in background

## Messages crash — permanent fix v3 (2026-06-25)
- **Still crashing:** `getQueryData()?.find()` on corrupt `{}` cache (not null — truthy object without `.find`) + `views?.some` / `reactions?.find` on `{}` message rows
- **Fix:** `readQueryArray` / `findInQueryArray` for all DM cache reads; `safeMessageViews` / `safeMessageReactions`; `normalizeDmConversationList` on hook output; cache buster `vybe-cache-v9`; revive on Messages mount + on error boundary catch
- **Verified:** `npm run build` PASS
- **You:** Hard refresh once (clears v8 IDB) → Messages → open a chat

## Messages crash — permanent fix v2 (2026-06-25)
- **Chat open crash (remaining):** `ConversationItem` + `dmMemberResolve` still called `.find`/`.filter` on `members` when persisted cache had `{}` — list loaded, thread open threw
- **Permanent patch:**
  - `safeDmMembers()` used across DM stack (list rows, ChatView, hooks, realtime, load paths)
  - `installQueryCacheWriteGuard` — normalizes every `setQueryData` for dm/messages/stories/Set/Map keys
  - `SmartErrorBoundary`: custom fallback shows immediately (no 3× auto-reset flash loop)
  - Cache buster `vybe-cache-v8`; `reviveQueriesInCache` on chat open in `Messages.tsx`
- **Verified:** `npm run build` PASS
- **You:** Hard refresh (or Reload on error screen once) → open a DM · Lovable Publish vybehub.app

## Messages crash — permanent fix (2026-06-25)
- **List crash:** `stories` / `statusMap` persisted as plain objects
- **Chat open crash:** `conversation.members` and `messages` as `{}` → `.filter` / `.map` / `for…of` throw when opening a thread
- **Permanent patch:** `normalizeDmConversation` + `normalizeMessagesCache`; cache normalizer handles `conversation-detail` + `messages`; ChatView uses `safeConversation`; cache buster `vybe-cache-v7`
- **Deployed:** https://vybe-daaab.web.app
- **You:** Hard refresh → open a DM · tap Reload once if needed · Lovable Publish vybehub.app

## Messages crash hotfix (2026-06-25)
- **Root cause:** `DMsHeader` called `statusMap.get()` on React Query persisted cache — `Map` deserializes as a plain object before revive → `TypeError: statusMap.get is not a function` → SmartErrorBoundary "Couldn't load Messages"
- **Fix:** `useBatchUserStatuses` always returns `normalizePersistedMap`; `DMsHeader` + conversation rows use `safeMapGet`; message `views`/`reactions` normalized after cache merge
- **Deployed:** https://vybe-daaab.web.app
- **You:** Lovable Publish vybehub.app · hard refresh Messages tab

## Production fixes — map, DMs, media, camera (2026-06-25)
- **Media URLs:** `normalizeMediaUrl` resolves bare UUID filenames + `avatar.jpg` to Firebase Storage; fallback bucket `vybe-daaab.firebasestorage.app` when Vite env partial on Lovable; `AvatarImage` no longer falls back to broken relative paths
- **VybeMap:** Discovery drawer `pointer-events-none` on overlay so map pan/zoom works; recenter toasts when GPS missing; canvas `touch-action: none`
- **DMs:** `ChatView` error UI when conversation fails to load; sheet mounts gated on `conversationId`
- **Camera:** hub camera → `/upload`; default **VYBE** (`snap`) filter; story music picker `z-[8000]`; upload camera error toast
- **Friend link:** tap QR → fullscreen enlarge with spring animation
- **Verified:** `npm run debug` PASS (build, lint, CSS, boot, function refs) · `npm run build` PASS
- **Deployed:** Firebase staging https://vybe-daaab.web.app (hosting)
- **You:** Lovable Publish vybehub.app · confirm Lovable secrets `VITE_FIREBASE_*`, `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_FIREBASE_STORAGE_BUCKET=vybe-daaab.firebasestorage.app`
- **Next:** test signed-in Vybe Check on post/story · capture exact DM throw if SmartErrorBoundary still loops on vybehub.app

## Publish (2026-06-17, latest)
- **Git:** pushed to `origin/main` — DM open perf, floating pill header, Gemini AQ key + VYBE AI errors
- **Firebase staging:** https://vybe-daaab.web.app — hosting deployed ✓
- **You — Lovable Publish vybehub.app:** [Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) after git sync
- **Lovable env:** confirm `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_FIREBASE_*` in project secrets

## DM open perf + UI (2026-06-17)
- **Open lag:** scoped mark-read cache updates; shared `loadConversationMessages` + `prefetchQuery`; hover/touch warm; skip redundant profile enrich; conversation detail `offlineFirst`; message skeleton while loading; lighter `AnimatePresence`
- **Header:** floating frosted-glass pills (VYBE-AI style); gradient-ring avatar + presence
- **Gemini:** accept `AQ.` access tokens + `AIza` keys; clearer billing errors; `aiChat` redeployed with secret v10
- **Verified:** `npm run build` PASS · Firebase hosting deployed

## UI polish — home bg, DMs, post images (2026-06-17)
- **Colorful background:** feed cards + home widgets use glass (`card/0.58`) so aurora shows through; DM shell/header transparent on liquid bg
- **Post images:** fixed Firebase `resolveDownloadUrl` path doubling (migration `bucket/media/...` artifact) + `normalizeMediaUrl` on PostCard display URL
- **DM composer:** glass redesign; fixed dock rides above keyboard via `--kb-h` + `data-dm-active`; removed duplicate “deletes in 24h” banner above input
- **Ephemeral chip:** tap “24 Hours After Viewing” pill → popover to switch delete timer (Snapchat-style)
- **Deployed:** https://vybe-daaab.web.app · `npm run build` PASS

## Home crash fix — vybe-daaab.web.app (2026-06-17)
- **Root cause:** `/home` ErrorBoundary — `DesktopLeftSidebar` hub list did `server.name[0]` when `name` was undefined (desktop layout, lg+ width)
- **Fix:** `server.name?.[0]` + `HeaderSearch` `result.title?.[0]`; `normalizeMediaUrl` strips doubled Firebase bucket prefix on storage URLs (403 avatars/media)
- **Deployed:** Firebase hosting https://vybe-daaab.web.app (`AppLayout-8j1_810H.js`)
- **Verified:** `npm run build` PASS
- **Still noisy (non-fatal):** OneSignal domain lock (`vybehub.app` only), `authLoginNotify` CORS on staging origin, PWA manifest icon
- **Next:** hard-refresh staging `/home` · Lovable Publish vybehub.app · add `vybe-daaab.web.app` to OneSignal allowed domains if push needed on staging

## AI secrets + Vybe AI wiring (2026-06-17)
- **Gemini redeploy:** `npm run setup:gemini-secrets -- --deploy-only` — 37 GEMINI-bound functions updated (`aiChat`, `aiCatchUp`, `generateCaption`, `startVybeCheck`, etc.)
- **Vybe Check fix:** `startVybeCheck` now binds `OPENAI_API_KEY` (moderation + video STT); redeployed
- **Map intel:** `researchMapLocation` added to gemini deploy list + redeployed
- **Debug probe:** `checkDebugSecrets` now reports `has_openai_key`
- **Local `.env`:** synced 16 server secrets from Firebase (`GEMINI_API_KEY`, `OPENAI_API_KEY`, LiveKit, Stripe, etc.) — reload editor from disk if stale
- **Verified:** GEMINI key HTTP 200 against Gemini API · `npm run build` PASS · functions deploy complete
- **Next:** sign in → VYBE AI chat test · Vybe Check on a video post · Lovable Publish + `VITE_MAPBOX_ACCESS_TOKEN`

## Publish (2026-06-17)
- **Git:** `ab8c442b` pushed to `origin/main` — VybeMap v2–5, Vybe Check background publish, area intelligence
- **Firebase staging:** https://vybe-daaab.web.app (hosting + functions already deployed)
- **You — Lovable Publish vybehub.app:** [Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) after git sync
- **Lovable env (required for 3D map + routing):** `VITE_MAPBOX_ACCESS_TOKEN`

## VybeMap polish — routing & UX (2026-06-17)
- **Unified live routing:** all Directions buttons → in-map Mapbox route + ETA bar; Google Maps fallback when no token
- **Meetup map pins:** tappable labeled markers on canvas (replaced invisible circle layer)
- **Route UX:** fit bounds on route, loading spinner, dismiss sheets when navigating, squad exit chip
- **Callable routing:** explicit `researchMapLocation` / `logMapAccess` overrides in functionsService
- **Intel refresh:** force-refresh hook + failed-state UI in LocationIntelPanel
- **Verified:** build + lint PASS · deployed staging hosting

## VybeMap Phase 5 — Area Intelligence (2026-06-17)
- **Vybe Area Intelligence:** Gemini 2.5 + Google Search researches locations for safety, trespassing, private property, access rules, crime context, hazards
- **Labels:** trespassing, private_property, no_trespassing, construction, closed_area, high_crime, flood_zone, military_restricted, + parking/hours/accessibility tips
- **Verdicts:** safe / caution / avoid with safety score 0–100; 7-day Firestore cache (`map_location_intel`)
- **UI:** `LocationIntelPanel` on place pages, meetups, spot drop, live route bar; ⚠️/🚫 badges on map spot markers
- **Guardrails:** Spot drop + meetup create require acknowledgment when verdict is `avoid`
- **Callable:** `researchMapLocation` (12/hr rate limit); updates `map_places.intel_summary` when placeId provided
- **Verified:** `npm run build` PASS · `npm run lint` PASS
- **Deployed:** staging hosting + rules + `researchMapLocation`
- **Next:** batch intel prefetch for trending spots; Lovable Publish vybehub.app

## VybeMap Phase 4 — social maps (2026-06-17)
- **Squad Maps:** `GroupMapSheet` — create/list crew maps; `map_group_maps` + `map_group_members`; squad layer highlights members on map
- **Live routing:** Mapbox Directions ETA bar (`MapRouteBar`); route line on map; friend card + meetup "Route" uses in-app ETA (falls back to Google Maps without token)
- **Map waves:** `sendMapWave` → push + bell (`map_wave`); wave button on friend card
- **Heading toward you:** bearing/speed detection banner on friend card + pulse on map marker
- **Meetup push:** `onMapMeetupCreated` Cloud Function notifies friends (`map_meetup`); push trigger routes to `/map`
- **Dock:** Squads tab in `MapBottomDock`
- **Verified:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Deployed:** https://vybe-daaab.web.app — hosting + Firestore indexes + `onMapMeetupCreated`
- **Next:** periodic ETA refresh; invite friends to squad from chat; Lovable Publish vybehub.app + `VITE_MAPBOX_ACCESS_TOKEN`

## VybeMap Phase 3 — clean & fresh (2026-06-17)
- **Meetups:** `MeetupSheet` (join/leave, directions, distance); `MeetupCreateSheet`; member counts; calendar FAB on map
- **Place social:** threaded comments on place posts; Vybe Check on posts + comments
- **Map polish:** friend marker clustering at low zoom; removed dead time-machine + groups layer stubs
- **Cleanup:** deleted `PlaceCardSheet`; stripped dead Vybe Check overlay from `DesktopCreateStudio`
- **Firestore:** `map_place_post_comments` rules + indexes; `map_check_ins`, `map_meetup_members` indexes
- **Verified:** `npm run build` PASS · deployed staging https://vybe-daaab.web.app
- **Next:** group maps layer, Mapbox Directions ETA, meetup push notifications

## Publish (2026-06-17)
- **Firebase staging live:** https://vybe-daaab.web.app — hosting + Firestore rules/indexes + `startVybeCheck` / `getVybeCheckStatus`
- **Vybe Check fn:** Gemini 2.5 deployed; OpenAI secret not set (add `OPENAI_API_KEY` for moderation + video STT)
- **Production vybehub.app:** Push git → **Lovable → Share → Publish** (agents cannot click this)
- **Lovable env:** Add `VITE_MAPBOX_ACCESS_TOKEN` if map 3D not loading on production

## Vybe Check upgrade (2026-06-17)
- **Server pipeline:** Gemini 2.5 Flash on all text + vision frames (not borderline-only); SafeSearch + OpenAI moderation; `needs_review` blocks publish
- **Canonical client:** `runPublishVybeCheck` — NSFWJS pre-filter → server invoke; fail-closed when unavailable
- **Background publish:** Mobile + Desktop media posts → `enqueuePostUpload` (Vybe Check stage first, then optimize/upload/publish); `UploadProgressBanner` shows status
- **Wired everywhere:** `useCreatePost`, `postUploadPipeline`, `useContentSafety`, `StoryCreator`, `CameraShareSheet` (story/clip/DM)
- **Mobile composer:** Share dismisses immediately; pre-scan badge while editing; full check runs in background queue
- **Verified:** `npm run build` PASS, `npm run lint` PASS, `functions` tsc PASS
- **You:** Deploy `startVybeCheck` + `getVybeCheckStatus` functions (`GEMINI_API_KEY`, `OPENAI_API_KEY` secrets); Lovable Publish vybehub.app

- **Mapbox token:** `VITE_MAPBOX_ACCESS_TOKEN` in local `.env` + `vite.config.ts` define; **add same var in Lovable** for vybehub.app production
- **Unified map:** `/map` (FriendMap → VybeMap) now Mapbox-first; Leaflet lazy-loaded fallback only without token
- **Phase 2 — Vybe Local:** `map_place_posts` feed per spot; friend check-in activity bar + discovery section; check-ins bump place count
- **Firestore:** rules + indexes for `map_place_posts`, `map_check_ins`
- **Deployed:** staging hosting + rules + indexes
- **Security:** Rotate Mapbox token if exposed publicly; never commit `.env`

## VybeMap v2 foundation (2026-06-23)
- **Mapbox GL JS:** 2D / 3D / satellite / terrain / hybrid styles; 3D buildings + terrain DEM; gyro compass bearing
- **HUD:** Bottom dock (Layers, Friends, Events, Hotspots, Profile), map style sheet, enhanced ghost mode (15m–24h timers)
- **Markers:** Live avatar friends w/ username + activity; interpolated positions (existing rAF); color-zone heatmap (blue→red)
- **Places:** `PlacePageSheet` with live vibe score (Busy/Active/Chill/Quiet), crowd estimate, check-in
- **Location:** Faster upserts while moving (3s vs 5s foreground)
- **Fallback:** Leaflet remains when `VITE_MAPBOX_ACCESS_TOKEN` unset + setup banner
- **Stack note:** Spec lists Expo/RN — production app is React web + Capacitor; Mapbox via `mapbox-gl` on web (native Mapbox SDK = future Capacitor plugin or RN app)
- **Verified:** `npm run build` PASS
- **Roadmap phases:** place feeds/comments, group maps, meet-up routing, Vybe Intelligence callables, marker clustering at scale, full Snap-grade 3D globe

## Bug-fix + features batch (2026-06-23 batch 5)
- **Firebase staging deployed:** https://vybe-daaab.web.app — hosting + Firestore rules (map_places creator updates)
- **Background upload pipeline:** `postUploadPipeline.ts` + `uploadQueue.ts` + global `UploadProgressBanner` — optimize → Vybe Check → upload → publish; composer dismisses after Share
- **VybeMap social spots:** `SpotDropSheet` (drop hangout/food/view/party spots with photo), `PlaceCardSheet`, richer spot markers on map, discovery drawer shows descriptions
- **Verified:** `npm run build` PASS, `npm run lint` PASS
- **You:** Lovable Publish vybehub.app; test post upload banner + map spot drop on phone

## Bug-fix batch (2026-06-23 batch 4)
- **Post images:** `resolveMediaUrl` refreshes expired Firebase Storage tokens; `PostCard` shows skeleton while URL resolves.
- **Home scroll:** Disabled `content-visibility` on media; semi-opaque `#main-content` over liquid bg; freeze swipe parallax while scrolling.
- **Voice notes:** `AudioMessage` uses signed URL + `playsInline` + play error handling.
- **Saved message icon:** `rpcToggleMessageSaved` returns full saved-state object (was boolean — wiped UI on mobile).
- **24h expiry:** Timer starts on open (`useMarkMessageViewed`), not send (`expiresAtForViewMode` returns null for `24h`).
- **Ephemeral UI:** `EphemeralChatNotice` in DMs/group chats (Snap-style banner).
- **Find Friend:** Find My–style overlay — radar rings, compass, high-accuracy GPS.
- **VybeMap gyro:** `deviceorientation` → `map.setBearing()` via `leaflet-rotate`.
- **Verified:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Roadmap (not this batch):** Snap 3D world map, map hangout social feed, background upload + Vybe Check publish pipeline, full Snap group chat chrome + presence pills.

## Publish (2026-06-23 batch 3)
- **Git:** `90228bff` pushed to `origin/main` — VybeMap full-viewport fix, home scroll flicker patch, VybeMap Firestore indexes
- **Firebase staging:** https://vybe-daaab.web.app (hosting + indexes redeployed)
- **You:** Lovable → Share → Publish for **vybehub.app**; hard refresh on phone

## Home scroll flicker fix (2026-06-23)
- **Bug:** Dark angular patches flickered while scrolling Home (desktop) — `content-visibility: auto` on `.scroller` children + feed images left unpainted holes over the aurora mesh.
- **Fix:** Removed blanket scroller content-visibility; disable CV on liquid/wallpaper routes; freeze aurora parallax during scroll; wider mesh bleed (`inset -20%`); `#main-content` scroll hooks `is-scrolling`.
- **Verified:** `npm run build` PASS
- **Deployed:** https://vybe-daaab.web.app

## VybeMap load fix (2026-06-23)
- **Bug:** `/map` rendered blank — new `VybeMap` used `h-full` without a sized parent; Leaflet container was 0px tall.
- **Fix:** Restored full-viewport shell (`fixed inset-0`, z-index 9999) like legacy FriendMap; `map.invalidateSize()` after init.
- **Indexes:** Added Firestore composite indexes for `user_live_locations`, `map_meetups`, `location_history`.
- **Verified:** `npm run build` PASS
- **Deployed:** Firebase hosting + indexes on https://vybe-daaab.web.app
- **You:** Lovable Publish vybehub.app; hard refresh `/map`

## Firebase-only cutover (2026-06-23)
- **Removed:** entire `supabase/` folder, `@supabase/supabase-js`, `src/integrations/supabase/`, legacy shim files
- **Client:** `legacyAuthStorage.ts` (session migration), Firebase `invokeFunction` for all admin/debug calls
- **Functions:** `emailUnsubscribeToken` callable for unsubscribe page
- **Verified:** `npm run build` PASS, `npm run lint` PASS

## VybeMap platform (2026-06-23) — Firebase only
- **Storage:** Firestore (`user_live_locations`, `map_*`, `heatmap_tiles`, etc.) — **no Supabase/SQL migration**
- **Service:** `src/lib/vybemap/firestore.ts` — native Firestore reads/writes + `onSnapshot` realtime
- **Rules:** `firestore.rules` — VybeMap collections + privacy (ghost hides from public reads)
- **Functions:** `functions/src/vybemap.ts` — heatmap aggregation, rate limits, emergency ghost
- **Code:** `src/pages/VybeMap.tsx`, `src/lib/vybemap/*`, `src/hooks/vybemap/*`, `src/components/vybemap/*`
- **Location engine:** 5s GPS upserts via `useBackgroundLocation` → `upsertLiveLocation`
- **Verified:** `npm run build` PASS
- **You:** Deploy Firestore rules + `vybemap` functions; Lovable Publish vybehub.app

## DM UX batch (2026-06-23)
- **Vybe snap:** rAF + GPU progress bar; mark viewed on open (persists `message_views`); can't reopen after leaving chat
- **24h mode:** Default send mode `24h`; composer banner explains auto-delete after open
- **Voice notes:** Redesigned pill player with deterministic waveform + smooth scrubbing
- **Unsend:** Direct Postgres soft-delete (fixes `internal` Firebase callable error)
- **VybeMap:** Sharing defaults on; immediate location upsert; clearer empty state + quick enable
- **Cameras:** Double-tap preview flips front/back (VybeSnap, Snap, Create, Camera, CameraWithSound)
- **Verified:** `npm run build` PASS

## Chat shield flicker fix (2026-06-23)
- **Bug:** Screen recording / macOS capture UI caused chat panel to flash black in a loop (resize heuristics + duplicate blackout + rapid restore).
- **Fix:** `chatScreenShield.ts` — resize blackout mobile-only; min 1.2s blackout + generation-guarded restore; desktop skips hiding chat root. `ChatView.tsx` — no second blackout on desktop capture events (keyboard shield still flashes curtain).
- **Verified:** `npm run build` PASS
- **Next:** Firebase hosting deploy + Lovable Publish vybehub.app

## Publish (2026-06-23 batch 2)
- **Git:** `f2bf2a64` — active dot polish, LiveKit default calls, sticker Firestore rules, Vybe Check fail-closed, snap gradient UI, notification chime, OneSignal auto-permission on login
- **Deployed:** Firebase hosting + **Firestore rules** (`user_stickers`) on https://vybe-daaab.web.app
- **Redeploy:** hosting refreshed again same commit
- **You:** Lovable Publish vybehub.app; redeploy `startVybeCheck` after `OPENAI_API_KEY` secret set; test call + sticker + push with phone locked

## Publish (2026-06-23)
- **Git:** `0d3862a5` pushed to `origin/main` — chat screenshot blocking, presence accuracy, screenshot notifier
- **Firebase staging:** https://vybe-daaab.web.app (hosting redeployed)
- **vybehub.app:** Still needs **Lovable → Share → Publish** (Cursor cannot click this)
- **After publish:** Hard refresh on phone; native Despia app pulls OTA from vybehub.app

## Chat presence + screenshot notifier (2026-06-17)
- **Presence accuracy:** Stale detection (12s) on Firestore `users/{id}`; heartbeat every 4s while in chat; `pagehide`/`freeze`/background sets `offline` and clears `active_conversation`; broadcast peers expire after 8s unless Firestore confirms.
- **Screenshot notifier:** Instant DM broadcast (`screenshot` event) + in-chat banner/toast + system message; Vybe viewer screenshots notify sender via `onScreenshotDetected`.
- **Screenshot blocking:** `useChatScreenShield` + `chatScreenShield.ts` — Despia native `screenshield://` schemes (Android/iOS black capture) + instant web blackout curtain on capture signals; active in all DMs + Vybe viewer.
- **Files:** `usersPresenceDoc.ts`, `useChatPresence.ts`, `dmBroadcast.ts`, `useMessages.ts`, `ChatView.tsx`, `VybeViewer.tsx`, `chatScreenShield.ts`, `useChatScreenShield.ts`, `CaptureShield.tsx`
- **Verified:** `npm run build` PASS
- **Next:** Lovable Publish vybehub.app; test screenshot block in Despia app (should save black); web browser is best-effort blackout

## Task batch complete (2026-06-22)
- **DM send:** Fixed duplicate message doc id (`newDocumentId`) — new messages no longer overwrite same bubble
- **DM list refresh:** Faster parallel load, 35s timeout, cached-chats banner auto-retry
- **Push:** OneSignal secrets on `sendPushNotification`/`sendBriefNotification`; auth-uid alias fallback; link only under `profiles.id`; typing push no spurious bell row
- **VYBE AI:** BYOK key lookup falls back to auth uid; client no longer hard-blocks chat on quota when key may exist; clearer invalid-key errors
- **Marketplace/clips:** Heart crash fix, listing photo required, safe dates/prices/avatars on Market + ListingDetail + MobileShortCard
- **Story:** Vybe Check before post; 24h DM default; saved chat green styling; typing push; purgeExpiredMessages scheduled fn
- **Verified:** `npm run build` PASS, `npm run lint` PASS (warnings only)
- **Deployed:** Firebase hosting + push/AI functions on https://vybe-daaab.web.app
- **You:** Lovable Publish vybehub.app; re-enable push in Settings on device; test DM + VYBE AI with your API key

## Publish (2026-06-22)
- **Git:** `0ac62d59` pushed to `origin/main`
- **Firebase staging:** https://vybe-daaab.web.app (hosting redeployed)
- **vybehub.app:** Still needs **Lovable → Share → Publish** (Cursor cannot click this)
- **After publish:** Hard refresh on phone; verify `curl -s https://vybehub.app/despia/local.json | head -3` shows fresh `deployed_at`

## DM list "cached chats — refresh failed" (2026-06-22)
- **Symptom:** Amber banner on Messages: "Showing cached chats — refresh failed."
- **Root cause:** Background `loadDMConversations` often hit 15s timeout or redundant async profile resolve; large conversation batches used slow fallbacks.
- **Fix:** Skip re-resolve when profile id already cached; parallel membership + hidden/trash + profile prefetch; chunked conversation `.in()` queries; 35s timeout; stale-id fallback when membership empty; reactive soft-error + auto-retry once.
- **Files:** `src/lib/loadDMConversations.ts`, `src/hooks/useDMConversations.ts`
- **Verified:** `npm run build` PASS
- **Deployed:** Firebase hosting https://vybe-daaab.web.app
- **You:** Hard refresh Messages on phone; banner should clear after load (or after one silent retry)

## Password reset fix (2026-06-22)
- **Symptom:** "Send Reset Link" failed with generic error.
- **Root cause:** Cloud Function `requestPasswordReset` crashed — `recovery.html` (and other email templates) live in `functions/src/` but `tsc` never copied them to `lib/`, so production threw `ENOENT` on send.
- **Fix:** `functions/scripts/copy-static-assets.mjs` + `npm run build` copies `*.html` into `lib/_shared/emailTemplates/`; redeployed `requestPasswordReset`.
- **Verified:** Callable returns `{ ok: true }` for real email (was `INTERNAL` before deploy).
- **You:** Test Forgot password on login; check inbox/spam for branded VYBE email from `no-reply@vybehub.app`.

- **Symptom:** Google OAuth failed or bounced back to login (especially mobile redirect).
- **Root cause:** `Landing.tsx` cleared `vybe-oauth-pending` when URL hash lacked Supabase `access_token` — Firebase redirect never uses hash tokens, so spinner/login loop before `getRedirectResult()` finished.
- **Fix:** Wait for `authReady` + user (15s timeout); surface `vybe-oauth-error` from `auth.tsx` redirect handler; popup-blocked → redirect fallback; clearer Firebase auth error messages in `errorUtils`.
- **Files:** `src/pages/Landing.tsx`, `src/lib/auth.tsx`, `src/lib/errorUtils.ts`
- **Verified:** `npm run build` PASS
- **You:** Test Google on mobile Safari + desktop; ensure `vybehub.app` is in Firebase Auth authorized domains; Lovable Publish for vybehub.app

## Phase 4 QA — DMs, calls, notifications (2026-06-22)
- **Automated:** `test:conversation-load` 15/15 PASS, `test:dm-send` 3/3 PASS, `test:social-permissions` 15/15 PASS
- **Cloud Functions (vybe-daaab):** `sendDmMessage`, `startDmCall`, `livekitToken`, `giphySearch`, `aiSmartReplies` deployed (400/403 without auth = expected)
- **Lint:** Fixed `GlobalCallOverlay` prefer-const; `npm run lint` 0 errors, `npm run build` PASS
- **Data:** DM import done (269 members); notifications crash fix shipped (`5f3d88e3`)
- **Manual (two devices):** DM list → open thread → send text/image/GIF → read receipts → call ring/answer → bell/notifications tab

## DM conversation import — all users (2026-06-22)
- **Script:** `npm run migrate:firebase:import-dms` (`scripts/migrate-firebase/import-all-dm-conversations.mjs`)
- **Ran live:** 56 conversations reconciled; 56 new membership rows (auth uid variants); 149 updated; 0 users with messages missing membership
- **Firestore totals:** 226 conversation_members, 56 conversations, 890 messages
- **You:** Hard refresh DMs on phone — every user who ever chatted should see their threads

## Notifications mobile crash fix (2026-06-17)
- **Symptom:** Tapping bell / Alerts on mobile showed route error boundary "This page couldn't load".
- **Root cause:** Render crashes on `/notifications` — unsafe `n.actor.id` in grouping, avatar `username[0].toUpperCase()` on empty names, `formatDistanceToNow` on Firestore Timestamp / invalid `created_at`.
- **Fix:** `src/lib/parseApiDate.ts`; normalize dates in `useNotifications`; hardened `groupNotifications`, avatar fallbacks, `SmartPingCard` date label.
- **Verified:** `npm run build` PASS
- **Deployed:** Firebase hosting https://vybe-daaab.web.app
- **Git:** `5f3d88e3` pushed to `main` — ready for Lovable Publish

## Stripe live — secrets + 17 Cloud Functions (2026-06-17)
- **Secrets (Firebase Secret Manager):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_THIN`, `PUBLIC_SITE_URL` (vybehub.app).
- **Webhooks:** Auto-created in Stripe → `stripeWebhook`, `connectV2WebhookThin` on us-central1.
- **Deployed:** 17 Stripe functions (Connect V2, checkout, tips, payouts, webhooks). `npm run setup:stripe-secrets` for re-runs.
- **Still needed:** `pk_live_…` publishable key in Admin → Settings → Stripe (or `STRIPE_PUBLISHABLE_KEY=… npm run setup:stripe-secrets`).
- **Security:** Rotate `STRIPE_SECRET_KEY` in Stripe Dashboard (was pasted in chat).

## Phase 7 — List presence + clips media + secret audit (2026-06-17)
- **DM list presence:** `useConversationListPresence` — Firestore live activity on sidebar rows (typing, In chat, In Snap, call, upload); `PresenceAvatar` + preview subtitle via `activityPreviewLabel`.
- **Shared presence utils:** `src/lib/presenceActivity.ts` — `uiActivityFromState` + preview labels (deduped from `useChatPresence`).
- **Clips media:** `ensureMediaUrlsReady()` in `signedUrlCache` — batch sign + Firebase `resolveMediaUrl` fallback; used by `ClipsViewer` + `useInfinitePosts`.
- **Secret audit:** `npm run audit:secrets` checklist; `checkDebugSecrets` callable binds GEMINI/GIPHY/LIVEKIT/STRIPE/Spotify/OneSignal/Resend.
- **Conv list load:** Batch `.in('id')` for conversation docs (was N parallel reads); 15s timeout; list retry x2; cached-chats warning banner; `useConversationDetail` waits for profileId.
- **Verified:** `npm run build` PASS; `audit:secrets` — STRIPE_SECRET_KEY missing (optional premium path).
- **Deployed:** Firebase hosting + `checkDebugSecrets` on https://vybe-daaab.web.app
- **You:** Lovable Publish → open DMs with friend online → verify list pills + clips feed; set STRIPE secret if checkout needed

## Optional Phase 8+ (not started — polish / long-tail)
| Track | Scope |
|-------|--------|
| **DM polish** | Group read "Opened" per-member; legacy Supabase media bulk migrate; message search |
| **Platform** | Delete `supabase/` + shim layer; direct Firestore hooks (drop realtime shim); stub Cloud Functions (~70) |
| **Commerce** | ~~`STRIPE_SECRET_KEY`~~ done — add `pk_live` in Admin Settings |
| **Go-live** | Lovable Publish vybehub.app; App Check enforce; two-device regression checklist |

## Phase 6 — Group polish + full GEMINI redeploy (2026-06-21)
- **Group header:** `GroupPresenceBar` — live typing / in-chat / Snap activity under group title.
- **Group dock:** Composer `ChatPresenceDock` for the most active group member (typing, Snap, upload, etc.).
- **Group receipts:** Delivered/Opened on own group messages; `ReadReceipts` avatars when views exist.
- **GEMINI:** Redeployed 36 GEMINI-bound Cloud Functions (`setup-gemini-secrets.mjs --deploy-only`).
- **Deployed:** Git `f30c131a` → Firebase hosting + 36 AI functions on https://vybe-daaab.web.app
- **You:** Lovable Publish → test group header + VYBE-AI smart replies

## Phase 5 — Group presence + read receipts (2026-06-21)
- **Group presence:** `useChatPresence` accepts multiple peer ids; Firestore + broadcast listeners per member; `ChatPresenceIndicator` shows who's in the thread.
- **Read receipts:** `usePeerLastReadAt` live listener on peer `conversation_members`; Snapchat-style Delivered/Opened via `SnapchatStatus` on 1:1 own messages.
- **Deployed:** Git `0bacf04d` → Firebase hosting on https://vybe-daaab.web.app

## DMs media GIFs instant send read persistence (2026-06-21)
- **Media/clips:** Public storage URLs load directly (no broken signing); Firebase `resolveMediaUrl` fallback when signed URL fails.
- **GIFs:** `giphySearch` returns normalized `{ results, next }` (matches client); client normalizes legacy raw Giphy payloads too.
- **Instant send:** Composer clears immediately on send (no await); bubble still optimistic.
- **Unread badges:** `markConversationReadForViewer` writes `last_read_at` on profile + auth uid membership docs; unread count uses max `last_read_at` across duplicate rows.
- **Verified:** `npm run build` PASS
- **Deployed:** Git `d9d84aa1` → Firebase hosting + `giphySearch` on https://vybe-daaab.web.app
- **You:** Set `GIPHY_API_KEY` secret for GIF picker → Lovable Publish → hard refresh → test clips + DMs + badge after refresh

## ChatView presence TDZ hotfix (2026-06-21)
- **Root cause:** Snap-camera `useEffect` referenced `setLiveTakingPhoto` / `setSendingVybe` before `useChatPresence()` defined them → TDZ `ReferenceError` → desktop "Couldn't load Messages" fallback.
- **Fix:** Call `useChatPresence` right after `otherMember`; move snap-camera effect below hook destructuring.
- **Verified:** `npm run build` PASS; Git `95ab8b4f` pushed
- **Deployed:** Firebase hosting on https://vybe-daaab.web.app
- **You:** Lovable Publish for vybehub.app → hard refresh → open DM (e.g. MrAssBurgers)

## Phase 4 — Snapchat presence + call defaults (2026-06-21)
- **Presence:** Firestore `users/{profileId}` doc with onSnapshot listener (no polling); activity states (viewing, typing, Snap, upload, in-call); header pfp + composer dock.
- **Calls default:** Free **P2P** mode by default; LiveKit persistent only via Stay On Call toggle.
- **LiveKit race fix:** `rescanRemoteTracks` on connect/participant join + delayed retries; `[CallMedia]` structured logging.
- **Rules:** `users` collection read/write for signed-in users.
- **Verified:** `npm run build` PASS
- **Deployed:** Git `0595f107` → Firebase hosting + Firestore rules + `startDmCall` on https://vybe-daaab.web.app; GEMINI secret v6 + `aiChat` live
- **You:** Lovable Publish for vybehub.app → hard refresh → test presence + VYBE-AI + P2P calls

## Phase 3 — Calling rebuild (2026-06-21)
- **Signaling:** `callSignaling.ts` + `callRinging.ts` — Firestore `call_signals` audit trail; 30s ring timeout; distinct decline vs missed states.
- **Incoming reliability:** 500ms foreground poll; UPDATE listener on `calls`; auto-timeout + native bridge uses `timeoutIncoming`.
- **LiveKit quality:** 1080p / 5Mbps simulcast; improved audio capture (no DTX); adaptive reconnect policy.
- **P2P fallback:** 1080p constraints + post-ICE HD upgrade; existing Metered TURN retained.
- **Diagnostics:** `CallDiagnosticsPanel` (dev + `?callDebug=1`) — connection, ICE, bitrate, packet loss, resolution.
- **Presence:** 15s heartbeat; `profiles.last_active_at` mirror on each ping.
- **DM send log:** `logDmSend()` ring buffer in `dmSendCore.ts` (sessionStorage + console).
- **Verified:** `npm run build` PASS
- **Deployed:** Git `6cb845e8` → Firebase hosting + `startDmCall` on https://vybe-daaab.web.app
- **You:** Lovable Publish for vybehub.app → two-device call test (foreground + background + decline + timeout)

## Phase 2 — Notifications (2026-06-21)
- **Single push path:** DMs/calls push-only (no bell row); social bell rows trigger `onSocialNotificationCreated` push.
- **Foreground DMs:** Removed duplicate global messages listener; alerts via `foregroundDmNotification` + dedupe.
- **Bell toasts:** Skip `message`/`missed_call`; View action deep-links via `buildNotificationRoute`.
- **Docs:** `docs/NOTIFICATIONS.md`
- **Deploy:** `functions:onSocialNotificationCreated` + redeploy DM/call triggers on `vybe-daaab`

## Phase 1 — DM single source of truth (2026-06-21)
- **Canonical send:** `src/lib/dmSendCore.ts` (`insertDmMessage`, retry, cloud fallback) — used by `useInstantSend`, `dmOutbox`, Vybe send, share-to-DM.
- **Removed duplicates:** deleted `useOptimisticMessages`, removed dead `useSendMessage`, dropped duplicate message UPDATE listener from `useRealtimeMessages` (reactions/views only).
- **Realtime fix:** skip Firestore INSERT echo for own messages while viewing thread (stops double-bubble glitches).
- **Docs:** `docs/MESSAGING.md` + two-device test checklist.
- **Verified:** `npm run build` PASS
- **You:** Lovable Publish → two-device test instant send + offline queue + Vybe snap

## Spotify UI + notifications + calls + push routing (2026-06-21)
- **Spotify pill:** `spotifyNowPlaying` now upserts `live_music_presence` + returns `{ connected, is_playing, title, … }` (was raw Spotify JSON → pill never showed). Added Firestore rules for `live_music_presence` read/write.
- **Notifications menu:** Removed `missed_call` rows from bell feed + stopped inserting them on dismiss; missed calls stay as DM `call_event` only. Fixed tap crash when actor missing username; safe `/home` fallback; native push uses SPA `navigateFromNotification` (no full reload "page can't load").
- **Calls:** Incoming ring still via OneSignal/`onCallCreated` push (phone notification) — ensure push enabled in Settings + Despia linked.
- **Gemini AI:** `GEMINI_API_KEY` secret v6 set + `aiChat` redeployed (2026-06-21). Hard refresh VYBE-AI; Clear Chat to drop old error bubbles.
- **Deployed:** Git `8f8d0031` → Firebase hosting + Firestore rules on `vybe-daaab.web.app`; `GEMINI_API_KEY` secret + `aiChat` redeployed
- **You:** Lovable Publish for vybehub.app → connect Spotify in Settings → test now-playing pill → test notification taps on mobile

## Instant send + presence + Vybe camera fix (2026-06-21)
- **Send glitch:** Stopped duplicate append on own Firestore INSERT + broadcast while viewing; `resolveSenderIdForSend` no longer waits 12s on membership repair inflight.
- **Presence dock:** Relaxed `showPeerPresence`; `chat_presence.activity` field cross-device; fixed profile fetch in `useChatPresence`; peer falls back to viewing from presence poll.
- **Vybe camera:** Open Snap with front camera only (removed environment preload); sync facingMode from stream; cloud `sendDmMessage` first after upload.
- **You:** Deploy + hard refresh → two-device test typing dock + instant send + Vybe snap

## Presence dock + Vybe snap fix (2026-06-21)
- **Presence:** Removed typing/viewing/Snap indicators from header avatar; new `ChatPresenceDock` above composer (mini pfp + eye / slow typing dots / camera bubble).
- **Vybe:** Membership repair + `sendDmMessage` cloud fallback on permission denied; no stray text under Vybe cards; clean failed-send chip.
- **Roles:** `useAllUserRoles` merges `user_roles` + `user_roles_auth` with profile enrichment; search dropdown shows full @username.
- **Deployed:** Git `59d53034` → Firebase hosting on vybe-daaab.web.app
- **You:** Lovable Publish for vybehub.app → two-device test presence + Vybe snap send

## Chat load TDZ hotfix (2026-06-21)
- **Root cause:** `showPeerPresence` referenced `isGroupChat` before its `const` (line 237 vs 385) → `ReferenceError` on every DM open → SmartErrorBoundary "Couldn't load Messages".
- **Fix:** Hoist `isGroupChat` immediately after `useConversationDetail`; per-message `LocalErrorBoundary`; `formatDmPreviewContent` for call-event previews (sidebar no longer shows raw JSON).
- **Verified:** `npm run build` PASS; Git `b83bed23` pushed; Firebase hosting deployed
- **You:** [Lovable → Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) for vybehub.app → hard refresh → open DM

## Instant DMs presence call logs HD video (2026-06-21)
- **Messages:** Scoped Firestore listeners per conversation (global unfiltered query was rules-blocked); broadcast path patches conv list too.
- **Presence:** Firestore rules for `typing_indicators` + `chat_presence`; broadcast `viewing` on chat open; typing → viewing (not idle).
- **Calls:** Snapchat-style `call_event` rows in thread; two-way remote video attach fix; LiveKit 1440p / 5Mbps.
- **Deployed:** Git `d309ec2f` → Firebase hosting ~863KB + Firestore rules on `vybe-daaab`
- **You:** [Lovable → Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) for vybehub.app (~814KB still stale) → two-device test DMs + video call

## DMs Calls Presence Push perfection (2026-06-21)
- **Call crash:** Fixed `initialMode is not defined` (TDZ bug); instant incoming ring stub + 500ms poll fallback.
- **Presence:** New `PresenceAvatar` on chat header + conv list — typing ring, reading pulse, Snap camera badge; broadcast-first via `dmBroadcast`.
- **Avatars/history:** `SignedAvatar` + sender profile enrichment; membership repair on empty message fetch; conv detail profile hydration.
- **Push:** Eager `DespiaOneSignalSync`; OneSignal enabled on `vybe-daaab.web.app`; server respects `dms_enabled`/`calls_enabled`.
- **Deployed:** Firebase hosting ~859KB + push functions
- **You:** Lovable Publish for vybehub.app → enable push in Settings → test DM/call on two devices

## Chat crash hotfix (2026-06-21)
- **Root cause:** `registeredConvoRef` used at line 176 before declared at line 356 → ReferenceError on every chat open → SmartErrorBoundary "Couldn't load Messages".
- **Fix:** Moved `setCurrentConversationId` into `useEffect([conversationId])`; removed render-time ref access.
- **Deployed:** Firebase hosting
- **You:** Hard refresh or Lovable Publish for vybehub.app

## Chat load + call camera + Friend Link parity (2026-06-21)
- **Chat "can't load":** `useConversationDetail` always returns placeholder/cached convo (never null); `offlineFirst` network; messages fall back to cache on fetch error; removed full-page error gates in ChatView.
- **Instant open:** `initialData` from message cache; synthetic conversation shell from deterministic id when list cache misses.
- **Call camera bias:** Removed `warmCallMedia` for LiveKit (caller device was blocked 12s); `clearWarmCallMedia` + release preview before connect; h1080 + 2.5Mbps publish defaults.
- **Friend Link sync:** Owner waits for scanner's `syncStartAt` event (no duplicate local schedule); hide sheet during full-screen swap animation so both users see identical NFCSwapAnimation.
- **Verified:** `npm run build` PASS
- **You:** Test vybe-daaab.web.app → open DM, video call both ways, Friend Link QR scan; Lovable Publish for vybehub.app

## Snapchat-grade DMs + push + calls pass (2026-06-21)
- **Chat load:** Non-blocking message fetch; cached conversation opens instantly; relaxed skeleton gates; GlobalRT mounts immediately (no idle defer).
- **Realtime:** Optimistic broadcast on send; sync `setCurrentConversationId`; activity/typing broadcasts for live presence.
- **Avatars:** Signed URLs + member profile fallback on message bubbles.
- **Presence:** Header shows typing / in chat / in Snap; inline activity bubble; camera mode broadcasts `taking_photo`.
- **Push:** `linkOnesignalUser` calls OneSignal API; `onCallCreated` + DMs use OneSignal secrets; call push includes OneSignal.
- **Calls:** Faster incoming poll (2min lookback on first poll); call overlay preloaded after auth.
- **Deployed:** Firebase hosting ~845KB + `onDmMessageCreated`, `onCallCreated`, `linkOnesignalUser`
- **You:** Lovable Publish for vybehub.app → Settings → Notifications → enable push → force-quit → test DM + call on two devices

## Sent bubble vanish fix (2026-06-21)
- **Root cause:** `useRealtimeMessages` hard-deleted messages on `is_deleted` UPDATE, racing GlobalRT failed-bubble logic; optimistic `sender_id` could mismatch insert id so temp wasn't replaced cleanly.
- **Fix:** Match GlobalRT failed-bubble handling in ConvRT; resolve sender before optimistic add; use `appendIncomingMessage` for temp→real swap; removed pre-confirm optimistic broadcast.
- **Deployed:** Firebase hosting ~837KB on vybe-daaab.web.app
- **You:** Lovable Publish for vybehub.app → force-quit → send DM (bubble should stay)

## Instant chat + Snapchat typing/presence (2026-06-17)
- **Root cause:** Receiver waited for Firestore INSERT + profile fetch; broadcast only fired after server confirm; GlobalRT deferred 1.2s; header had `isTyping={false}` hardcoded.
- **Fix:** Optimistic `dm-broadcast` on send (before server); shared `dmBroadcast.ts` channel; sync message append (profile enrich async); typing via broadcast + faster presence poll; LivePresenceBar wired to real typing/in-chat state.
- **Verified:** `npm run build` PASS
- **You:** Deploy Firebase hosting or Lovable Publish → open same DM on two devices → type + send

## Call connect fix (2026-06-21)
- **Root cause:** 1:1 calls defaulted to P2P (NAT/mobile failure); incoming ring missed when `receiver_id` used auth uid vs profile id; call insert skipped membership repair.
- **Fix:** Default all calls to LiveKit (`persistent`); dual incoming listeners (profile + auth uid); `repairConversationForSend` before call insert; `startDmCall` Cloud Function fallback; instant LiveKit fallback on ICE fail.
- **Deployed:** `startDmCall`, `livekitToken` (secrets OK), Firebase hosting ~837KB
- **You:** Test at **vybe-daaab.web.app** now; Lovable Publish for vybehub.app

## DM send deep fix (2026-06-21)
- **Scan:** debug/build PASS; `test:social-permissions` 15/15; client insert E2E OK; prod `app.js` stale (~791KB vs ~836KB).
- **Root cause:** Client membership seed used wrong auth uid for peer rows; server verify too aggressive; no fallback when Firestore rules reject legacy chats.
- **Fix:** `sendDmMessage` Cloud Function (deployed `vybe-daaab`) repairs membership + writes message; client falls back via `sendDmViaCloudFunction`; fixed `ensureConversationMembershipVariants`; 10× server confirm backoff; auth-aware other-member resolve.
- **Verified:** `npm run build` PASS; `test:social-permissions` 15/15; `functions:sendDmMessage` deployed
- **You:** Lovable Publish → force-quit → send DM (new + existing chat)

## DM send failure fix (2026-06-20)
- **Root cause:** Send blocked when membership looked ready in local Firestore cache but wasn't on server; `ensureSendReady` threw before insert; single retry on permission-denied; new DMs missing auth-uid composite membership rows.
- **Fix:** Server-verify composite membership before marking ready; 3-attempt insert with forced repair; longer server confirm backoff on message insert; `createDmChat` seeds auth uid + `user_auth_index`; soft-fail pre-send repair (inline retry on insert).
- **Verified:** `npm run build` PASS; `test:social-permissions` 15/15 PASS
- **You:** Commit/push → Lovable Publish → force-quit → send DM

## DM send bubble vanish — display + send order (2026-06-20)
- **Root cause:** Input cleared before optimistic bubble pinned; `sendText` could return early without throwing; UI read stale `query.data` instead of merged cache; skeleton hid in-flight sends.
- **Fix:** Clear input only after optimistic add; throw if send can't start; `useMessages` merges cache on every render; failed sends recreated if cache wiped; softer skeleton gate.
- **Verified:** build PASS; `test:social-permissions` 15/15 PASS
- **You:** Lovable Publish (prod still ~790KB vs ~836KB local) → force-quit → send DM

## DM send bubble vanish — server verify (2026-06-20)
- **Root cause:** Firestore `setDoc` resolved on local cache; GlobalRT stripped the optimistic `temp-*` bubble on local INSERT, then server rule rejection fired DELETE → empty thread. Prefetch race was a secondary cause (fixed in `4ae4a437`).
- **Fix:** Verify message inserts on server (`waitForPendingWrites` + `getDocFromServer`); stop stripping sender temps in GlobalRT; DELETE marks recent own sends as failed instead of wiping; mark-viewed patches cache (no global messages invalidate).
- **Verified:** `npm run build` PASS; `test:social-permissions` 15/15 PASS
- **You:** Commit/push → Lovable Publish → force-quit app → send DM

## DM send bubble vanish (2026-06-20)
- **Root cause:** `useChatPrefetch` blind-replaced the messages cache when a prefetch finished right after send — wiped the optimistic `temp-*` bubble before the server row arrived.
- **Fix:** Prefetch now uses `mergeMessagesWithLocalCache`; GlobalRT temp dedupe matches auth uid vs profile id + trimmed content.
- **Verified:** `npm run build` PASS; `test:social-permissions` 15/15 PASS
- **You:** Commit/push → Lovable Publish → force-quit app → open DM → send (bubble should stay)

## DM send fix (2026-06-20)
- **Root cause:** Fast send marked chats "ready" without verified Firestore membership; many DMs had no `conversations/{id}` doc → rules denied message insert.
- **Fix:** `repairConversationForSend()` creates missing conv doc, syncs `user_auth_index`, seeds composite membership, only marks ready when verified. Wired into `useInstantSend`, outbox, share-to-DM.
- **Removed:** False `messagesReady` flag on failed fast repair.
- **Verified:** build PASS; `test:social-permissions` 15/15 PASS
- **You:** Lovable Publish → force-quit app → send DM

## Instant boot + DM send + reload nag (2026-06-20)
- **Black/stuck splash:** Returning users skip splash; dismiss is immediate (no paint wait); native preloader instant; static boot hidden early
- **Can't message on phone:** Send always runs membership repair + `user_auth_index` sync; 1:1 chat create uses Firebase `createDmChat` (not missing Supabase RPC)
- **Reload conversations nag:** Removed "Couldn't refresh chats" + slow-load Retry banners; self-heal refetches stale only (no full invalidate)
- **Verified:** `npm run build` PASS; `test:social-permissions` 15/15 PASS
- **You:** Lovable **Publish** → force-quit app → reopen → test Messages send

## App-wide perf pass (2026-06-20)
- **Reconnect:** stale-only refetch (no invalidate+refetch storm on focus/blip)
- **DMs:** 180s list cache, idle-deferred friend auto-create, capped presence/status batch (40), fast message prepare, offlineFirst message cache, startTransition on realtime list patches, deferred GlobalRT subscribe (1.2s idle)
- **Presence:** 30s web / 45s native heartbeat (was 20s)
- **Git:** `a2258710` pushed → Lovable Publish

## Next 3 Tasks
1. Lovable Publish → feel test: Home scroll, Messages tab, send DM, call
2. Hard refresh phone after publish
3. Profile any remaining laggy screen by name

## DM perf + message vanish + call permission (2026-06-20)
- **Root cause (lag):** DM list ran `ensureConversationReady` on every conversation on every load; message refetches re-ran 4× membership repair loops.
- **Root cause (vanish):** Reaction/view invalidations refetched messages and dropped recently sent rows not yet in fetch; sender realtime skipped own INSERT.
- **Root cause (call):** `caller_id` used cached profile id without session resolve + membership repair before insert.
- **Fix:** Fast list load (`fetchConversationMetaForList`), session cache for `prepareConversationForMessages`, merge local sent messages on refetch, GlobalRT pins sender row, callStore resolves caller + repairs membership, silent conv timestamp update.
- **Git:** `98b74a65` pushed → Lovable **Publish** → hard refresh

## Next 3 Tasks
1. Lovable Publish → test send (bubble stays), call MrAssBurgers, DM list speed
2. Hard refresh phone after publish
3. Rotate OneSignal key if exposed in terminal

## DM list Unknown + calls receiver fix (2026-06-20)
- **Root cause (Unknown rows):** DM list only matched `user_id !== profileId`; when membership rows were self-only (auth uid vs profile id mismatch) or `member_ids` weren't merged, profiles never attached → every row showed "Unknown".
- **Fix client:** `dmMemberResolve.ts` — auth-aware member matching, merge `member_ids` + deterministic conv id, `getDocument` profile fallback; wired into `loadDMConversations`, `ConversationList`, `ChatView` (calls need resolved `otherMember.id`).
- **Fix AI preview:** VYBE-AI row hides GEMINI error text in list preview; run `npm run setup:gemini-secrets` for server AI.
- **Verified:** `npm run build` PASS; `test:social-permissions` 14/14 PASS
- **Git:** `9b5e14cf` pushed → Lovable **Publish** → hard refresh

## Next 3 Tasks
1. Lovable Publish → DMs show real names/avatars (not Unknown); send + call from chat
2. `GEMINI_API_KEY=… npm run setup:gemini-secrets` for VYBE-AI
3. Hard refresh / clear site data on phone after publish

## Lovable publish gate (2026-06-20)
- Client fixes are **not done** until pushed to `origin/main` with commit SHA in handoff.
- Never tell user to Lovable Publish without confirming GitHub has the commit.
- vybehub.app stale check: `curl -s https://vybehub.app/assets/app.js | wc -c` should match local build (~832KB).

## DM send + push (2026-06-20)
- **Send:** `useInstantSend` waits for session profile + `prepareConversationForMessages` before insert
- **Push:** Firebase `onDmMessageCreated` + OneSignal fan-out (Despia/native) via `onesignalPush.ts`
- **Deploy:** `firebase deploy --only functions:onDmMessageCreated,functions:sendPushNotification` + OneSignal secrets on `vybe-daaab`

- **Root cause:** Users had `conversation_members` rows but **could not read** `conversations/{id}` until composite membership seeded → list silently empty + ChatView "Couldn't load this conversation"
- **Fix:** `fetchConversationForViewer()` repairs + synthetic DM metadata; index-free message fetch; member fallback from `member_ids`
- **Git:** pushed → Lovable **Publish** → hard refresh

## Publish prep — Spotify + Notifications Requests (2026-06-20)
- **Spotify:** OAuth redirect `/spotify/callback`; Firebase callback forward; auth-uid connect; `npm run setup:spotify-secrets` (terminal env or flags)
- **Notifications Requests tab:** `friend_requests` query dropped Firestore `orderBy` (missing index) → client sort; indexes deployed
- **Git:** push then Lovable **Share → Publish** → hard refresh

## Next 3 Tasks
1. Lovable Publish → Notifications → Requests + Settings → Connect Spotify
2. Run Spotify secrets if not done: `SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… npm run setup:spotify-secrets`
3. Hard refresh vybehub.app

## Deep scan — Add Friend + start chat (2026-06-20)
- **Root cause (chat):** Messages query uses `orderBy('created_at')` → Firestore composite index **never deployed** (`firebase.json` missing `indexes` key) → `failed-precondition` → "Couldn't load this conversation."
- **Fix client:** `fetchRecentConversationMessages()` — try ordered query, fallback to index-free fetch + client sort; applied in `useMessages`, `loadDMConversations`, `useChatPrefetch`
- **Fix infra:** `firebase.json` now references `firestore.indexes.json`; indexes deployed to `vybe-daaab`
- **Verified:** live index-free query OK (15 msgs); `npm run build` PASS
- **You:** Lovable **Share → Publish** → hard refresh → Message

## Next 3 Tasks
1. Lovable Publish → retest Add Friend + profile Message
2. Hard refresh / clear site data if old bundle cached
3. Commit + push local fixes if not already on `main`

## Social + vibe status root fix (2026-06-20)
- **Root cause (vibe):** `user_statuses` had **no Firestore rules** → catch-all deny on read/write → "Could not update vibe"
- **Root cause (DM):** `ensureConversationReady` threw on legacy conv repair; membership seed failures blocked chat load
- **Root cause (Add Friend):** Stale `user_auth_index` + legacy query errors aborting mutation (partially fixed earlier)
- **Fix rules:** Added `user_statuses` read/write rules (deployed `vybe-daaab`)
- **Fix client:** Auth profile persist syncs `user_auth_index`; vibe uses `resolveSessionProfileId`; DM repair non-throwing + message query retry; members query soft-fail
- **Verified:** `test:social-permissions` 11/11 PASS (includes user_statuses)
- **You:** Lovable **Share → Publish** → hard refresh → Add Friend, Message, Set vibe

## Next 3 Tasks
1. Lovable Publish → test Quick Add, profile Message, Vibe Check
2. Hard refresh / clear site data if errors persist
3. Run `npm run test:social-permissions` after smoke test

## Social DM + Add Friend — orphan conv fix (2026-06-20)
- **Root cause (chat):** `ensureConversationReady` threw when patching `member_ids` on legacy conversations created by the other user. Chat opened but messages query failed → "Couldn't load this conversation."
- **Root cause (friends):** Legacy `friend_requests` list lookups could surface permission errors and abort the mutation.
- **Fix client:** Non-throwing `mergeConversationMemberIds`; seed own composite membership even when peer seed fails; return legacy conversation id from DM RPC; sync `user_auth_index` on profile resolve.
- **Fix rules:** Conversation update allows self-join via `member_ids`; friend request create uses `ownsProfileId(sender_id)`.
- **Verified:** orphan participant messages OK; `test:social-permissions` 9/9; `test:conversation-load` OK; rules deployed `vybe-daaab`
- **You:** Lovable **Share → Publish** → hard refresh → Add Friend + Message

## Next 3 Tasks
1. Lovable Publish → profile Message loads chat; Add Friend works
2. Hard refresh / clear site data if still on old bundle
3. Re-run social permission tests if any user still blocked

## Conversation load after Message — REAL FIX (2026-06-20)
- **Root cause:** Legacy migrated DMs use random `conversation_members` doc IDs; rules `isMember()` only matched composite `${convId}_${profileId}` or `member_ids` on conversation doc (often missing on orphans). Message RPC succeeded but `/messages/:id` failed on members/messages queries → "Couldn't load this conversation."
- **Fix rules:** `isConversationParticipant` includes `isConversationCreatorOf` (creator can read members/messages even without composite doc).
- **Fix client:** `ensureConversationReady()` repairs composite membership + `member_ids` before chat reads; DM RPC returns deterministic chat id and repairs legacy + canonical conv.
- **Verified:** `test:social-permissions` 9/9 PASS, `test:conversation-load` legacy chat OK
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Git:** pushed to `origin/main`
- **You:** Lovable **Share → Publish** → hard refresh → Message + Add Friend

## Next 3 Tasks
1. Lovable Publish → profile Message loads chat (not error screen)
2. Add Friend from profile (no permission blocked)
3. Re-run `npm run test:social-permissions` + `test:conversation-load` if issues persist

## Publish prep — social client (2026-06-20)
- **Client:** Skip illegal peer `conversation_members` query in Add Friend; legacy membership lookup try/catch; dev-only permission context in dataClient
- **Git:** pushed to `origin/main` (after this commit)
- **Rules:** already live on `vybe-daaab`
- **Tests:** `npm run build` PASS, `test:social-permissions` 9/9 PASS
- **You:** Lovable **Share → Publish** → hard refresh → Add Friend + Message

## Permission denied on Message / Add Friend — REAL FIX (2026-06-20)
- **Root cause:** Firestore `get()` on **non-existent** docs evaluated read rules using `resource.data` (null) → `permission-denied` instead of "not found". Broke `friend_requests` duplicate check (Add Friend) and `conversation_members` existence check (Message RPC).
- **Fix rules:** `canReadMissingDoc()` guard on `friend_requests`, `message_requests`, `conversations`, `conversation_members` reads; creator can seed peer members via `isConversationCreatorOf` on create.
- **Fix client:** Repair `member_ids` on legacy DM before membership seed in `rpcCreateDmConversation`.
- **Verified:** `node scripts/test-social-permissions.mjs` — 9/9 PASS against live `vybe-daaab` rules (bakrix custom token).
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Tests:** `npm run build` PASS
- **You:** Lovable **Share → Publish** (client RPC tweak) → hard refresh

## Next 3 Tasks
1. Lovable Publish → profile Message + Add Friend
2. Run `npm run test:social-permissions` after publish smoke test
3. Repair orphan conversations in prod if any users still stuck (admin script)

## Permission denied on Message / Add Friend (2026-06-20) — superseded
- Earlier orphan-conversation theory was partial; **missing-doc read rules** were the primary blocker.

## Friend/DM + stories + onboarding (2026-06-20)
- **DM retry bug:** Partial failed chats blocked `setDocument` on `conversations` (update denied) — RPC now skips recreate, creator can update, seeds membership for profile id **and** auth uid
- **Friend requests:** Normalize receiver to canonical `profiles.id` via `getUserProfile`
- **Onboarding "Design your VYBE":** Profile refresh redirected to `/home` before `AIVybeDesigner` mounted — fixed with `pendingDesignerRef` + `showAIDesigner` guard
- **Stories:** Unviewed tiles use uploader theme gradient veil (image hidden/blurred until viewed); ring still uses uploader `equipped_profile_theme`
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **You:** Lovable **Share → Publish** → hard refresh → Add Friend, Message, onboarding finish, story rings

## Friend + DM fix (2026-06-20)
- **Root cause (DMs):** `conversation_members` create rule required `profileId()` ∈ `member_ids`, but rules `profileId()` falls back to auth uid while `member_ids` stores profile UUIDs → **permission denied** when seeding peer membership
- **Fix rules:** `canSeedFlatConversationMember` — creator, member_ids match (profile id or uid), or conversation `created_by`
- **Fix RPC:** `create_dm_conversation` syncs `user_auth_index`, uses resolved profile ids
- **Friend requests:** Deterministic doc id `{sender}_{receiver}`; normalize receiver profile id; resolve sender via `resolveSessionProfileId`; legacy random-id fallback; notification insert non-blocking
- **useCreateConversation:** Resolved profile id for membership repair
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **You:** Lovable **Share → Publish** → hard refresh → Add Friend + Message on a profile

## Next 3 Tasks
1. Lovable Publish → add friend from profile → open DM
2. Messages → Add Friends → search → start chat
3. Confirm friend request appears in Notifications for receiver

## Social discovery fix (2026-06-20)
- **VYBE score:** `vybe_scores` / `vybe_score_events` had no Firestore rules (catch-all deny) — added read rules; score hook tries doc id + profile_id
- **useAuthProfileId:** Returned `undefined` during profile resolve → blocked search, Quick Add, friend requests — now falls back to cached/live profile id
- **Quick Add:** Firestore query mixed `neq` + `orderBy` (invalid) → empty suggestions — client-side filter + sort fix in dataClient
- **Hidden discovery:** Defensive filter so broken `.or()` can't hide all users
- **Friend requests:** Insert now sets `status: 'pending'` + timestamps (Firestore has no column defaults)
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **You:** Lovable **Share → Publish** → hard refresh; test profile VYBE score, search, Quick Add, add friend, Message

## Next 3 Tasks
1. Lovable Publish → search user → add friend → open DM
2. Profile page → VYBE score visible on other users
3. Messages → Quick Add shows suggestions

## Publish prep (2026-06-19)
- **Git:** `84c7e7cf` on `origin/main` (dataClient + calling fixes)
- **Firebase:** Firestore rules deployed; `livekitToken` deployed with LIVEKIT secrets
- **Build:** `npm run build` PASS
- **You:** Lovable → **Share → Publish** → hard refresh `vybehub.app`

## Next 3 Tasks
1. Lovable Publish → test search, friend requests, reactions, voice/video call
2. Hard refresh on phone (or clear site data) after publish
3. Native NFC / Despia features still need a Despia rebuild (not web publish alone)

## Deep scan — dataClient + calling (2026-06-17)
- **dataClient:** Fixed `gte`/`lte` (were `>`/`<`); `count: 'exact'` without `head`; updates apply same client filters as deletes (`.or()` / `.ilike()`); join FK resolution (`profiles!posts_author_id_fkey` → `author_id`); inner joins
- **Calling P2P:** `realtimeService.ts` now broadcasts WebRTC signals via Firestore `webrtc_signals` (was no-op stub)
- **Firestore rules:** `calls` use `receiver_id` + `ownsProfileId`; added `webrtc_signals`; expanded `call_signals`; `missed_call` notification type
- **livekitToken CF:** Room `call-${conversationId}`, identity = profile id, returns `roomName` (code ready; deploy blocked — see blockers)
- **callStore:** Missed-call notification goes to caller (not callee)
- **livekitCallToken:** Normalizes `roomName` from `room`; clearer error when LiveKit secrets missing
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Blockers:** `livekitToken` deploy needs Firebase Secret Manager: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`
- **You:** Lovable **Share → Publish** + hard refresh; test search, friend requests, clip reactions, voice/video calls

## Next 3 Tasks
1. Lovable Publish → smoke-test search, Quick Add, friend request, reactions
2. Firebase Secret Manager → add LiveKit secrets → `firebase deploy --only functions:livekitToken`
3. Test P2P call signaling + LiveKit group call after secrets deployed

## Published prep (2026-06-19)
- **Git:** `91025ba6` pushed to `origin/main`
- **Firestore rules:** deployed to `vybe-daaab` (marketplace_purchases)
- **Build:** `npm run build` PASS
- **You:** Lovable → **Share → Publish** → hard refresh `vybehub.app`

## Token Shop purchase fix (2026-06-17)
- **Root cause:** `purchase_marketplace_item` + `check_rate_limit` RPCs existed only in Supabase — Firebase client returned null → "Purchase failed"
- **Fix:** Client-side Firestore RPC in `tokenRpc.ts` (deduct balance, write `token_transactions` + `marketplace_purchases`); wired in `dataClient.ts`
- **Rules:** Added `marketplace_purchases` collection rules — **deployed** to `vybe-daaab`
- **UX:** `PurchaseSuccessModal` with sparkle animation + **Equip now** / **Save to locker**; purchases keyed by profile id (matches locker + token balance)
- **Tests:** `npm run build` PASS
- **You:** Lovable **Share → Publish** + hard refresh → Token Shop → buy a theme or frame

## Next 3 Tasks
1. Lovable Publish → buy item in Token Shop → success modal → Equip now
2. Profile locker → purchased item appears
3. Prior mobile UX items (reactions, story rings) if not yet published

## Mobile UX + data restore sweep (2026-06-19, uncommitted)
- **Story rings:** Animated gradient outline from uploader's `equipped_profile_theme` (not viewer theme)
- **Notifications:** Centered transition overlay (fixed Framer vs CSS translate conflict); actor profile lookup via `fetchMemberProfiles`; DM open normalizes auth uid → profile id; fallback to profile if chat fails
- **Scroll hide:** Bottom nav + Friend Link stay hidden after scroll-down until deliberate scroll-up (~28px accumulated); ignores iOS bounce
- **Clips follow +:** Shrunk to ~18px TikTok-style badge
- **Profile posts:** Author join fallback when `author_id` is auth uid
- **DMs:** Membership query merges profile id + auth uid rows (restores pre-migration conversations)
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **You:** Lovable **Share → Publish** + hard refresh on Samsung

## Next 3 Tasks
1. Lovable Publish → tap notifications (centered animation, no User not found)
2. Scroll Home — nav + Friend Link stay down until scroll up
3. Open old friend profile + DMs — posts and chat history visible

- **DM create:** Firestore rules allow creating peer membership + reading all participants in a thread; `create_dm_conversation` finds legacy UUID chats and repairs flat membership docs
- **Profile posts:** Query waits for profile id; matches both profile id + auth uid as `author_id`; profile join fallback by `user_id`
- **Daily brief / AI:** Client `fetchDailyBrief()` assembles stats from Firestore + cloud fallback; `aiCatchUp` Cloud Function returns full BriefData shape (deployed)
- **Tests:** `npm run build` PASS
- **Deploy:** Firestore rules + `functions:aiCatchUp` → `vybe-daaab` SUCCESS
- **You:** Lovable **Share → Publish** + hard refresh; test Message on a profile, profile posts grid, Daily Brief

## Next 3 Tasks
1. Lovable Publish → open profile → Message → chat loads with history
2. Scroll profile posts — only that user's posts, stable (no flash of all posts)
3. Home → Daily Brief → content + trending items load

- **Ad tokens:** Client `earn_vybe_tokens` RPC writes `vybe_tokens` + `token_transactions`; hooks use profile id; progression only advances after successful earn
- **Toast spam:** Realtime skips first snapshot; friend requests toast only when `pending`; notifications toast only if created in last 45s
- **removeChild crash:** Removed `AnimatePresence` from notification mouth-zoom overlays; clear overlay before navigate
- **Notifications load:** Client-side sort (no composite index); Firestore rules for profile-id paths
- **Posts:** `PostDetail` resilient fetch + separate profile lookup
- **Clips:** Feed filters to video-only
- **Communities:** Fixed `useMyCommunities` broken join; server read rules for members
- **Followers:** Tap Followers/Following on profile opens list sheet
- **Friend link:** Removed live-sync-unavailable toast spam; NFC session unchanged (needs Despia native on device)
- **Avatar:** `ProfileAvatarImage` + localStorage cache on profile persist; wired in nav/settings
- **Firestore rules:** `vybe_tokens`, `token_transactions`, `login_streaks`, `notifications`, server member reads — **deployed** to `vybe-daaab`
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Blockers:** Spotify OAuth — set `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` in Firebase Secret Manager then redeploy `spotifyOauthStart`; AI server features need `GEMINI_API_KEY` on Cloud Functions + user key in Settings → VYBE AI
- **You:** Lovable **Share → Publish** + hard refresh on Samsung
- **Git:** `e2542024` pushed to `origin/main` (2026-06-19)

## Next 3 Tasks
1. Lovable Publish → smoke-test ads (tokens stick), notifications (no toast flood), open a post, clips feed, communities
2. Firebase Secret Manager → add Spotify secrets → `firebase deploy --only functions:spotifyOauthStart`
3. Settings → save Gemini API key → test AI chat / brief

- **DM open failure:** Migrated `conversation_members` used random doc IDs; message rules expected `${conversationId}_${profileId}`. Added `ensureFlatConversationMembership()` repair on chat open/prefetch; expanded `isConversationParticipant` rules (flat member + conversation `member_ids` + subcollection).
- **DM profiles:** `fetchMemberProfiles()` resolves members by profile id OR auth uid (fixes Unknown User / missing avatars).
- **Test push:** Client now awaits OneSignal link before send; `pushDeliveryErrorMessage` understands `{ ok, sent }`; callable returns `success: sent > 0`.
- **Scroll / background:** Settings + DMs shells transparent under aurora; removed `contain: strict` on native scroll shell; chat scroll only jumps on open/new messages; app scroll restore skips chat threads; settings scroll-to-top only on category change.
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **You:** Lovable **Share → Publish** + hard refresh; open a DM, send test push, scroll Settings

## Next 3 Tasks
1. Deploy Firestore rules + Lovable Publish → open DM on Samsung, confirm messages load
2. Settings → Send test push after toggling notifications on
3. Scroll Settings + Home — confirm colorful aurora (no black gaps / jump to top)

## Splash stuck + story posting lock fix (2026-06-19)
- **Splash stuck at 100%:** Hard-cap dismiss at ~650ms (was waiting up to 3.2s for paint); `teardownAllSplashLayers()` removes static + React splash; removed default `body.splash-visible` from `index.html`; failsafe DOM cleanup on splash exit
- **Story "Posting…" stuck:** Strip optimistic/uploading rows from persisted stories cache (serialize + restore + boot purge); auto-clear orphaned uploads in `StoriesBar`; 90s mutation timeout reset
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **You:** Lovable **Share → Publish** + hard refresh

## Next 3 Tasks
1. Lovable Publish → confirm splash dismisses and story ring no longer stuck on Posting
2. Post a new story end-to-end
3. Full smoke test from prior bug list

## CORS, splash, story posting fix (2026-06-19)
- **CORS noise:** Login streak + challenge sync RPCs run Firestore client-side only (no cloud callable preflight to `updateLoginStreak` / `syncMyChallengeProgress`)
- **Login streak:** Real Firestore logic in `socialRpc.ts` (`login_streaks` collection)
- **Story posting:** `publishStoryMedia` resolves Firebase download URLs (not `gs://`); optimistic upload cleared on error/settled; `mediaUrl` + `useFastSignedUrl` pass through Firebase URLs
- **Splash:** Inline flex centering on `SplashScreen`; static boot overflow/height in `index.html`; `hideStaticBootSplash()` on dismiss
- **Permission spam:** `onSnapshot` silently ignores permission-denied; removed unfiltered `messages` INSERT listener; DM convos fetched one-by-one
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **You:** Lovable **Share → Publish** + hard refresh; post a new story + confirm splash centered

## Next 3 Tasks
1. Lovable Publish → smoke-test splash, story post, console (no CORS streak errors)
2. Repair old story rows with bad `gs://` URLs if any still stuck
3. Lovable Publish → full smoke test from prior bug list

## Console spam fix — SW + Firestore indexes (2026-06-19)
- **SW spam:** singleton `registerVybeServiceWorker()` (deduped promise + log once); push hook uses `getVybeServiceWorkerRegistration()` + `profile?.id` dep (not whole profile object)
- **Index errors:** `user_warnings` + `user_bans` queries sort client-side (no composite index required); indexes added to `firestore.indexes.json` as backup
- **Tests:** `npm run build` PASS
- **You:** Lovable **Share → Publish** + hard refresh

## Permission spam fix — DMs, presence, warnings (2026-06-19)
- **Root cause:** `user_presence` + `user_warnings` had no Firestore rules (catch-all deny); conversation reads failed when membership doc IDs used profile UUIDs but rules only checked auth uid paths
- **Rules:** Added `user_presence`, `user_warnings`, expanded `isMember` / conversation read (member_ids + profileId + uid); staff can manage bans/warnings
- **Client:** `warnOnce` dedupes permission-denied console spam (presence 20s interval, warnings 30s refetch, DM load)
- **Deploy:** Firestore rules → `vybe-daaab` SUCCESS
- **Tests:** `npm run build` PASS
- **You:** Lovable **Share → Publish** + hard refresh; confirm console no longer floods permission errors

## Next 3 Tasks
1. Lovable Publish → smoke-test DMs load, online presence, warning popup (if any)
2. Lovable Publish → full smoke test from prior bug list (market, connections, uploads)
3. Redeploy `functions:spotifyOauthStart` if Spotify still fails

## Prod bug sweep — notifications, market, connections, settings (2026-06-18)
- **Notifications UI:** fixed overlapping empty/error/list states (`AnimatePresence mode="wait"`); error banner only when truly empty; @username labels (not display_name / user_* placeholders)
- **Marketplace:** resilient listings fetch (client sort/filter + batched seller profiles — no broken join/order)
- **Connections:** Spotify OAuth via HTTP `spotifyOauthStart?uid=`; profile-id lookups for spotify/music_settings; Google/Apple `linkIdentity` already in authService (needs Lovable Publish)
- **Settings saves:** Firestore rules for `user_preferences`, `ai_brief_preferences`, `servers`, `server_members`; sanitize undefined fields before `setDoc` (server create, upserts)
- **Challenges:** tab label clip fix; expired daily/weekly deleted from Firestore on rotate; desktop sidebar Ranks link removed (Ranks tab stays in Challenges hub)
- **Scroll / boot:** stronger anti-black-flash CSS during scroll; hide `VybePageLoader` while boot splash visible (no double VYBE logo)
- **Cameras:** default front camera + mirror on selfie components
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **Deploy:** Firestore rules deployed to `vybe-daaab`
- **You:** Lovable **Share → Publish** + hard refresh; smoke-test notifications, market, connections, customize layout save, create server, post upload

## Next 3 Tasks
1. Lovable Publish → full smoke test from user bug list
2. Redeploy `functions:spotifyOauthStart` if Spotify still fails (callback URL fix)
3. Set `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` on Firebase if Spotify internal error persists

## Mobile scroll flash + clip upload spinner (2026-06-18)
- **Bug 1 — scroll black flash:** `is-scrolling` painted opaque `hsl(--background)` on transparent app shells, hiding the aurora mesh; `body.has-liquid-bg` was fully transparent; `content-visibility: auto` on feed posts/scroller children left unpainted holes. Fixed: static purple mesh fallback on body (`#0B0B10` gradient), removed opaque scroll overlay, excluded main scroll container from content-visibility, removed PostCard inline `contentVisibility`.
- **Bug 2 — clip upload infinite spinner:** Video frame extraction / Vybe Check / Firestore insert could hang with no timeout or error UI. Fixed: timeouts on `extractVideoFrames`, `vybeCheckClient`, `VybeCheckOverlay`, pre-scan + publish in `MobilePostComposer`, post insert in `useCreatePost`; error phase + toast on scan failure; Share disabled while pre-scan running.
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **Git:** `1bd74b56` on `origin/main`
- **You:** Lovable **Share → Publish** + hard refresh; smoke-test Home scroll (no black flash) + post a clip (completes or shows error within ~3 min)

## Next 3 Tasks
1. Lovable Publish → smoke-test scroll background + clip upload on vybehub.app mobile
2. Confirm clip appears in `/clips` after successful publish
3. Apply `PENDING_20260530.sql` on prod if still needed for missing Supabase RPCs

## Meme ban expiry fix (2026-06-18)
- **Root cause:** Firebase `dataClient.or()` is a no-op during migration — `.or(is_permanent.eq.true,expires_at.gt.now)` never filtered; `useBanStatus` + `auth.tsx` returned the newest `user_bans` row even when `expires_at` was in the past (founder @mrassburgers meme ban from 2026-02-02 still displayed in June 2026)
- **Fix:** `src/lib/banUtils.ts` (`isBanActive`, `pickActiveBan`, `filterActiveBans`); client-side active-only filtering in `useBanStatus`, `auth.tsx` `checkBanStatus`, `useAllBans`, `useUserBans`, `useIsUserBanned`
- **DB repair:** `scripts/repair-expired-bans.mjs` — deleted 2 expired `user_bans` in Firestore (`vybe-daaab`), including founder `e78010f2-d5f1-428b-b5df-8fc6b768772d`
- **Tests:** `npm run build` PASS
- **Git:** pushed to `origin/main`
- **You:** Lovable **Share → Publish** + hard refresh; smoke-test founder login (no meme ban screen)

## Next 3 Tasks
1. Lovable Publish → smoke-test founder login + admin bans list (expired bans hidden)
2. Lovable Publish → smoke-test Forgot password branded email + `/reset-password` on vybehub.app
3. Apply `PENDING_20260530.sql` on prod if still needed for missing Supabase RPCs

## Publish-ready (2026-06-19)
- **Git:** `1cf08b3c` on `origin/main` (synced; no push needed)
- **Build:** PASS — local `dist/assets/app.js` md5 `5a7ecf84cbd056aeaee9deb8187b9851`; prod etag `a1c86c6fe328da4bd58ff4c103301133` (mismatch → publish required)
- **You:** Lovable **Share → Publish** → hard refresh https://vybehub.app

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`
## Branded password reset email (Resend-only) (2026-06-18)
- **Root cause (ugly Firebase email):** (1) Client `authReset.ts` fell back to Firebase SDK `sendPasswordResetEmail` when callable failed → plain text from `noreply@vybe-daaab.firebaseapp.com`; (2) Server fell back to Identity Toolkit `sendOobCode` when Resend failed → same default mailer
- **Fix:** Resend-only path — Admin `generatePasswordResetLink` + `recovery.html`; `toCleanPasswordResetLink` → `https://vybehub.app/reset-password?oobCode=…`; client fallback removed; server `sendOobCode` fallback removed
- **From:** `VYBE <no-reply@vybehub.app>` via Resend (requires domain verified in Resend dashboard)
- **Tests:** `functions/` tsc PASS, `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Deploy:** `functions:requestPasswordReset` — SUCCESS (us-central1, 2026-06-18 redeploy)
- **Probe:** callable HTTP 200 `{"ok":true}` for nonexistent email
- **Git:** `3dacdf22` on `origin/main`
- **You:** Lovable **Share → Publish** (client must ship without SDK fallback) + hard refresh; smoke-test Forgot password → branded dark HTML email → `/reset-password` custom UI

## Next 3 Tasks
1. Lovable Publish → smoke-test Forgot password branded email + `/reset-password` on vybehub.app
2. Confirm Resend domain verified if mail does not arrive (check spam)
3. Apply `PENDING_20260530.sql` on prod if still needed for missing Supabase RPCs


## Custom password reset UI (2026-06-18)
- **Root cause:** Firebase reset links used `handleCodeInApp: false` / `canHandleCodeInApp: false` → users landed on `vybe-daaab.firebaseapp.com` default change-password UI instead of VYBE `/reset-password`
- **Fix:** Server (`passwordResetEmail.ts`, `firebaseAuthEmail.ts`) + client SDK fallback (`authService.ts`) now set `handleCodeInApp: true`; continue URL stays `https://vybehub.app/reset-password`; early boot redirect in `bootstrapAuthStorage.ts`; `ResetPassword.tsx` shows account email + friendly errors
- **Tests:** `npm run build` PASS, `npm run lint` PASS; `functions/` tsc PASS
- **Deploy:** Redeploy `functions:requestPasswordReset` for server-side link fix; Lovable Publish for client
- **You:** Lovable **Share → Publish** + hard refresh; smoke-test Forgot password → email link → custom dark reset page (not firebaseapp.com)

## Next 3 Tasks
1. Lovable Publish → smoke-test Forgot password → `/reset-password` custom UI on vybehub.app
2. Redeploy `functions:requestPasswordReset` (`npx firebase deploy --only functions:requestPasswordReset --project vybe-daaab`)
3. Apply `PENDING_20260530.sql` on prod if still needed for missing Supabase RPCs

## Debug scan + Welcome back overlay fix (2026-06-18)
- **Scan:** `npm run debug` — build PASS, lint PASS, CSS PASS, boot PASS; edge fn refs OK; prod RPCs `is_username_available` + `create_dm_conversation` MISSING (Firebase fallbacks OK); vybehub.app bundle HTTP 200
- **Welcome back glitch:** post-login `WelcomeBackSplash` exit used scale/blur while home feed rendered underneath — avatar appeared pinned at top and clipped header/content; fixed with body portal, scroll lock, solid `#0B0B10` backdrop, safe-area padding, opacity-only exit (matches boot splash), burst after dismiss
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Git:** pushed to `origin/main`
- **You:** Lovable **Share → Publish** + hard refresh; smoke-test login → welcome overlay → home feed

## Next 3 Tasks
1. Lovable Publish → smoke-test login welcome overlay + For You scroll on vybehub.app
2. Smoke-test Forgot password on vybehub.app with a real account (check inbox/spam); confirm Resend domain verified
3. Apply `PENDING_20260530.sql` on prod if still needed for missing Supabase RPCs

## Resend password reset (2026-06-18)
- **Secrets:** `RESEND_API_KEY` + `EMAIL_FROM` (`VYBE <no-reply@vybehub.app>`) set in Firebase Secret Manager (`vybe-daaab`)
- **Code:** `requestPasswordReset` binds both secrets in `functions/src/auth.ts`
- **Deploy:** `functions:requestPasswordReset` — SUCCESS (us-central1)
- **Probe:** callable HTTP 200, `ok: true` (nonexistent test email)
- **Branded reset:** Resend path active when user exists; verify domain `vybehub.app` in Resend dashboard if mail does not arrive
- **Tests:** `npm run build` in `functions/` PASS

## Debug scan + mobile fixes (2026-06-18)
- **FYP scroll "page error":** route `ErrorBoundary` ("This page couldn't load") triggered when a single `PostCard` / ad slot threw during infinite scroll — per-post `ErrorBoundary` in feed; removed nested `contentVisibility` wrapper; throttled visibility observer; filter posts missing `author.id`; prefetch null-row guard in `useInfinitePosts`
- **Forgot password:** `authReset.ts` requires `data?.ok === true`; Resend secrets + redeploy done — see **Resend password reset** section above; branded HTML via Resend when account exists
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **Git:** pushed to `origin/main`
- **You:** Lovable **Share → Publish** + hard refresh; optional branded reset:
  ```bash
  npx firebase-tools functions:secrets:set RESEND_API_KEY --project vybe-daaab
  npx firebase-tools functions:secrets:set EMAIL_FROM --project vybe-daaab
  ```
  Then add `secrets: ['RESEND_API_KEY', 'EMAIL_FROM']` to `requestPasswordReset` in `functions/src/auth.ts` and redeploy.

## Next 3 Tasks
1. Lovable Publish → smoke-test For You scroll (10+ posts) + Forgot password on vybehub.app
2. Smoke-test Forgot password on vybehub.app with a real account (check inbox/spam); confirm Resend domain verified
3. Apply `PENDING_20260530.sql` on prod if still needed for missing Supabase RPCs

## Publish prep (2026-06-18)
- **Ready:** splash boot fix on `main` (pending push) — static HTML splash replaces plain "VYBE" placeholder before React mounts
- **Local build:** `npm run build` PASS, `npm run lint` PASS
- **You:** [Lovable → Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) then hard refresh once

## Current Focus (2026-06-18 — boot splash placeholder fix)
- **Root cause:** `#vybe-static-boot` in `index.html` was a minimal centered "VYBE" text shown until React mounted; the real `SplashScreen` only appeared after the JS bundle loaded
- **Fix:** Replaced static placeholder with full HTML/CSS splash (logo, gradient title, progress bar, "Waking up…"); `data-vybe-boot-screen` + `body.splash-visible` from first paint; solid `#0B0B10` background retained
- **Tests:** `npm run build` PASS, `npm run lint` PASS
- **You:** Lovable **Share → Publish** + hard refresh once; cold-load vybehub.app should show animated splash immediately (no plain text screen)

## Publish prep (2026-06-18 — prior)
- **Ready:** `37d2dc45` on `main` (pushed) — auth/DM/profile post-publish fixes
- **Local build:** `npm run build` PASS — `dist/assets/app.js` md5 `6f70abe15f885eaa7332e2e5873b996e` (compare after Lovable Publish)
- **You:** [Lovable → Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) then hard refresh / clear site data once

## Current Focus (2026-06-18 — post-publish bug fixes)
- **Root causes:** (1) OAuth redirect marked `authReady` without hydrating user/session → login loop; (2) migrated users had Firebase auth uid used as `profile.id` in cache → DMs empty + wrong lookups; (3) profile RPC returned object not array → "Profile not found"; (4) admin bug reports used multiple Firestore `!=` filters; (5) `aiChat` needed redeploy with `GEMINI_API_KEY` secret
- **Client fixes:** OAuth session hydrate in `auth.tsx`; profile-id resolution in `useAuthProfileId` / `useDMConversations`; profile lookup fallbacks + case-insensitive username in `useProfile.ts` / `users.ts`; admin bug query client-side filter; story upload UI clipping; scroll black flicker CSS; invite gradient styling; admin mod role via `isModOrAdminRole`
- **Backend:** Redeployed `functions:aiChat` (GEMINI secret bound)
- **Tests:** `npm run build` PASS, `npm run lint` PASS (3 pre-existing warnings)
- **You:** Lovable **Share → Publish** + hard refresh / clear site data once on phone; smoke-test Google login, profile tap, DMs, story post, VYBE-AI chat, admin bug reports

## Current Focus (2026-06-18 — prod bug sweep from screenshots)
- **Fixed:** Firestore query engine — only one inequality filter per query (was breaking admin bug reports, unread counts, feeds with `neq`+`gt`)
- **Fixed:** Profile lookup — direct Firestore read first; auth uid fallback; client-side `claimProfileByEmail` when Cloud Function fails
- **Fixed:** Admin panel — `bug_reports`, `reports`, `content_flags` readable by staff roles (not just Firebase custom claims)
- **Fixed:** DMs — session profile resolve + stale cache clear on sign-in; unread/typing queries no longer use double inequality
- **Fixed:** Scroll black flicker — removed body background swap during `is-scrolling`
- **Fixed:** Invite Friends + story ring — matched `vybe-liquid-button` styling; "Posting…" label no longer clips
- **Deployed:** Firestore rules live on `vybe-daaab`
- **You:** Lovable **Share → Publish** + hard refresh; sign out/in once to refresh profile link

## Current Focus (2026-06-18 — Lovable publish verified)
- **Publish verified (2026-06-18 ~19:17 UTC):** vybehub.app **live** — new deployment `b4009fb3-…`, `app.js` etag `a7d82620…` (was stale `0208ab60…`)
- **Prod probes:** index + app.js HTTP 200; `get_public_user_count` RPC OK; `/despia/local.json` 200
- **Backend:** Firestore social rules deployed (likes, friends, DMs); 152/152 users, 2404/2404 refs
- **You:** Hard refresh once on phone; smoke-test likes, friend requests, DMs, upload

## Current Focus (2026-06-18 — social polish deep scan)
- **Scan (2026-06-18 ~18:35 UTC):** `npm run backend:scan` — **15 pass, 4 warn, 0 fail** (after social rules fix)
- **Critical fixes deployed:** Firestore rules for **`likes`** (was deny-all — likes/reactions broken), **`friend_requests`** (`receiver_id` not `recipient_id`), **`message_requests`**, **`sounds`**, **`vybe_dna`**, **`gifted_premium`** (`user_id`/`gifted_by`); Storage **`announcements`** bucket for admin uploads
- **Data:** `repair-all-users` PASS — 2404/2404 refs, 152/152 auth index, 843 messages, 26 posts
- **WARN:** vybehub.app bundle **STALE** — [Lovable → Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) required
- **You:** Publish + hard refresh once; then test like a post, accept a friend request, send a DM with media

## Current Focus (2026-06-18 — deep scan)
- **Scan (2026-06-18 ~18:11 UTC):** `npm run backend:scan` — **14 pass, 4 warn, 0 fail**
- **Backend OK:** Firebase 152/152 auth+profiles, 2404/2404 refs, Firestore+Storage rules deployed, 80+ Cloud Functions live, Supabase edge fns OK
- **WARN:** vybehub.app bundle **STALE** vs local build — prod is **Lovable Cloud** (`x-deployment-id` header); Firebase Hosting deploy fails (upload timeout) and does **not** serve vybehub.app anyway
- **WARN:** Supabase RPCs `is_username_available`, `create_dm_conversation` missing — Firebase client fallbacks OK
- **You — unblock prod client:** [Lovable → Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) (only way to update vybehub.app)

## Current Focus (2026-06-18 — user data restore / levels + DMs + uploads)
- **Root cause:** Data was **not deleted** — Firestore **catch-all deny** blocked reads on `user_levels`, `login_streaks`, `message_reactions`, `user_badges`, marketplace tables, etc. Levels/DMs looked empty; uploads failed when profile/level reads failed.
- **Live audit (`vybe-daaab`):** 152 profiles, 152 auth index, 843 messages, 71 conversation_members, 26 posts, **6 user_levels** (founder level 23 / 11544 XP intact). @mrassburgers: 16 DMs.
- **Fix:** Added Firestore rules for user-owned collections (`user_levels`, streaks, badges, locations, message_reactions, listings, invites, …); fixed `stories`/`notifications` to use `ownsProfileId`; profile resolve via `user_auth_index` in `fetchProfile` + `resolveSessionProfileId`; `ensure_user_level` uses auth uid; `repair-all-user-data.mjs` run (152 links, 7 `user_id` syncs).
- **Deployed:** `firestore:rules` to `vybe-daaab`
- **Tests:** build PASS, lint PASS
- **You:** Lovable **Share → Publish** (client profile-resolve fixes) + hard refresh / clear site data once on phone

## Current Focus (2026-06-18 — full user-data reconnection)
- **Pipeline:** `npm run migrate:firebase:repair-all-users` → all **152** users (auth index, content refs, verify 100%)
- **Every user on login:** `claimProfileByEmail` redeployed — re-syncs profile + index even when link already exists (OAuth uid drift)
- **Client:** `claim_profile_by_email` runs on every session boot for all signed-in users (needs Lovable Publish)
- **Fixed:** 28 profile-id remaps (push_tokens, bug_reports, roles, invites, notifications); 3 auth-uid normalizations; removed 4 stale rows (deleted bakrix/oxzz duplicates)
- **Verified:** 2404/2404 social refs connected; 152/152 auth index; 26 posts, 843 messages, 71 DMs, 63 badges — all linked to valid profiles
- **Scripts:** `repair-everything.mjs`, `verify-firestore-connections.mjs`, `repair-content-connections.mjs` (expanded)
- **You:** Lovable **Share → Publish** + hard refresh once

## Current Focus (2026-06-18 — content → author connections)
- **Audit:** 26/26 posts `author_id` → valid profile; 843/843 messages; 71/71 DM members; 1393/1394 social refs connected
- **Fix:** `repair-content-connections.mjs` — backfilled `author_username`/`author_avatar_url` on all 26 posts; synced 5 stories; remapped 1 orphan notification (deleted bakrix uid → mrassburgers)
- **Scripts:** `repair-content-connections.mjs`, `repair-all-user-data.mjs`, `restore-founder-level.mjs`

## Current Focus (2026-06-17 — no black screen on refresh / all devices)
- **Root cause:** On refresh, `sessionStorage` skipped splash while lazy routes loaded → transparent `#app-shell` over `#0B0B10` looked like a black void; boot guard marked ready before shell painted
- **Fix:** Hard-reload resets splash (`navigationBoot.ts`); splash stays until `#app-shell` has route content; static `VYBE` placeholder in `#root` before React; solid `#0B0B10` on loaders + `[data-app-shell]`; bfcache re-shows splash if shell empty; SW **v32**; boot-guard checks `app-shell`
- **Tests:** build PASS, lint PASS, `validate:boot` PASS
- **You:** Lovable **Share → Publish** + hard refresh / clear site data once on phone (native OTA via `despia/local.json`)

## Current Focus (2026-06-17 — AI cost controls + BYOK)
- **Done:** Server-enforced daily quotas (`ai_usage` Firestore + `functions/src/_shared/aiQuota.ts`); free limits chat 25 / assist 15 / smart replies 20 per day (higher for VYBE+ / gifted premium); premium checks via `gifted_premium` + `subscriptions`
- **Model:** `gemini-2.5-flash-lite` for `aiChat`, `aiMessageAssist`, `aiSmartReplies` (cheapest tier)
- **BYOK:** Settings → **VYBE AI** — `saveUserAiKey` / `deleteUserAiKey` / `getAiUsage` deployed; keys server-only (`user_ai_keys` deny-all client rules); BYOK skips daily quota, bills user's Google account
- **Client:** All chat via `aiChat` callable (removed client Gemini bypass); DM assist wired to `ai-message-assist` + `ai-smart-replies`; usage banner in `/VYBE-AI`
- **Deployed:** `aiChat`, `aiMessageAssist`, `aiSmartReplies`, `getAiUsage`, `saveUserAiKey`, `deleteUserAiKey`, `firestore:rules`
- **You:** Lovable **Share → Publish** for client UI; test chat limit + add Google AI Studio key in Settings

## Current Focus (2026-06-17 — deep scan / load verification)
- **Deep scan (2026-06-17 ~18:13 UTC):** build PASS, lint PASS (fixed `safetyGemini.ts` prefer-const), CSS PASS, boot entry PASS; edge fn refs OK (73/73 local); vybehub.app `/assets/app.js` HTTP 200 + stable entry; vendor chunks 200
- **Firestore live (`vybe-daaab`):** 2004/2004 refs (100%), 0 orphans; 152 profiles + 152 `user_auth_index`; founder **@mrassburgers** OK (5+ DM memberships); conversations 38 (post ghost cleanup)
- **Supabase prod RPCs:** `is_username_available` + `create_dm_conversation` MISSING — client fallbacks in `dataClient.ts` OK
- **Firebase functions:** `requestPasswordReset`, `aiChat`, `startVybeCheck`, `getVybeCheckStatus` deployed
- **Unpublished local:** Stories tile sizing (`StoriesBar.tsx`, `storyUtils.ts`); prod bundle ~773KB vs local ~786KB — **Lovable Publish** needed
- **You:** Lovable **Share → Publish** + hard refresh; optional `RESEND_API_KEY` for branded reset emails

## Current Focus (2026-06-17 — DMs + page load / Firestore rules)
- **Root cause:** Firestore rules compared `request.auth.uid` to `conversation_members.user_id` / `messages` — but migrated data uses **profiles.id** (legacy UUID). Flat `messages` collection had **no rules** (deny-all). `trashed_conversations` also denied.
- **Fix:** `profileId()` + `ownsProfileId()` helpers; `user_auth_index` collection; rules for flat `messages`, `conversation_members`, `trashed_conversations`; friend_requests/follows use profile ids
- **Data repair (live):** `repair-firestore-social.mjs` — 154 auth indexes, 7 member backfills, 101 ghost conversations deleted, 0 orphan posts
- **Client:** hidden_conversations uses profile id; founder UID updated to `53e0076d-…`
- **You:** Lovable **Share → Publish** + hard refresh / clear site data once

## Current Focus (2026-06-17 — password reset emails)
- **Console lock:** Firebase Auth → Password reset template shows **"This template cannot be edited"** when custom email domain / Identity Platform locks templates — **bypass:** branded HTML via Resend in `passwordResetEmail.ts` (uses Admin `generatePasswordResetLink`, not Console template)
- **Deployed (2026-06-17):** `requestPasswordReset` — fixed duplicate send bug; flow: `getUserByEmail` → `sendPasswordResetEmail` (Resend if key bound, else `sendOobCode` Firebase default)
- **Root cause (redirect):** `getPasswordResetRedirectUrl()` used `window.location.origin` — users on **`www.vybehub.app`** got `UNAUTHORIZED_DOMAIN`; canonical continue URL is `https://vybehub.app/reset-password`
- **You — branded reset (recommended):**
  ```bash
  npx firebase-tools functions:secrets:set RESEND_API_KEY --project vybe-daaab
  npx firebase-tools functions:secrets:set EMAIL_FROM --project vybe-daaab   # e.g. VYBE <no-reply@vybehub.app>
  ```
  Then add `secrets: ['RESEND_API_KEY']` to `requestPasswordReset` in `functions/src/auth.ts` and redeploy.
  Verify **vybehub.app** domain in [Resend](https://resend.com/domains) (SPF/DKIM).
- **You — without Resend:** Firebase sends from `noreply@vybe-daaab.firebaseapp.com`; check spam; user must exist in **Firebase Auth → Users** (not only legacy Supabase)
- **You:** Lovable **Share → Publish** (`authReset.ts`); optional Authorized domains → **`www.vybehub.app`**

## Current Focus (2026-06-17 — Phase 1 Vybe Check + AI stack)
- **Done:** `startVybeCheck` / `getVybeCheckStatus` — SafeSearch frames, OpenAI moderation/STT (when key set), Gemini borderline, Firestore `vybe_checks` statuses
- **AI routing:** `functions/src/_shared/aiRouting.ts` — GPT/OpenAI text, Gemini vision, SafeSearch NSFW (no Hive/Rekognition/Sightengine)
- **Client:** `src/lib/vybeCheck/` frame extraction (1fps / 0.5s short), `VideoUploadScanner` + `useContentSafety` wired
- **You:** `firebase functions:secrets:set OPENAI_API_KEY` → add to `vybeCheck.ts` SECRETS → redeploy `startVybeCheck`; deploy `firestore:rules`; Lovable Publish

## Current Focus (2026-06-17 — Vybe Check Google Safe Search)
- **Done:** Vision Safe Search in `aiSafetyScan` Cloud Function (`visionSafeSearch.ts` + `contentSafety.ts`); pipeline: NSFWJS → Safe Search → Gemini; deployed `aiSafetyScan` + aliases to `vybe-daaab`
- **You:** Lovable Publish; ensure Cloud Functions service account has **Cloud Vision API User** on `vybe-daaab`

## Current Focus (2026-06-17 — AI App Check 401 fix)
- **Root cause:** Client Gemini (Firebase AI Logic) sent invalid App Check token → 401; raw SDK error shown in chat
- **Fix:** Route text chat through `aiChat` Cloud Function first when App Check unverified; v3/Enterprise provider option; debug token works in prod builds; friendly App Check errors
- **You:** Lovable **Share → Publish**; optional Firebase Console → App Check → register `vybehub.app` + match provider (`VITE_FIREBASE_APP_CHECK_PROVIDER`)

## Current Focus (2026-06-17 — stable deploy entry / prod stale bundle)
- **Root cause:** Lovable publish serves stale `index-IRTXwZnk.js` in HTML while new builds emit different hashes → users never get fixes; `/assets/app.js` 404 on prod
- **Fix:** Vite `entryFileNames: assets/app.js`; index.html fallback loader retries stable entry on hash 404; SW **v31** network-first `app.js`; `verify-dist-entry.mjs` in postbuild + `validate:boot`
- **Prod now:** still `index-IRTXwZnk.js` until **Lovable Publish** — after publish, `curl vybehub.app` should show `/assets/app.js`
- **You:** Lovable **Share → Publish** + clear site data once

## Current Focus (2026-06-17 — boot watchdog false positives)
- **Root cause:** Runtime blank-shell watchdog fired during login→home route transitions + auto cache-reload loop (login flash → recovery → reload)
- **Fix:** Startup-only boot guard (stops after first paint); removed ShellVisibilityGuard recovery; `data-vybe-app-ready`; VybePageLoader on Suspense; SW v30
- **Prod still stale:** vybehub.app on `index-IRTXwZnk.js` until Lovable Publish
- **You:** Lovable **Share → Publish** + clear site data once

## Current Focus (2026-06-17 — black screen hardening v2)
- **Root cause:** Boot watchdog treated empty `#app-shell` as success → stopped monitoring → splash faded to transparent void on `#0B0B10`
- **Fix:** Continuous blank-shell detector (never stops); meaningful-content check; `ShellVisibilityGuard`; splash/app-shell solid bg; aurora fallback gradient; SW **v28**
- **Prod note:** vybehub.app was still on old bundle (`index-IRTXwZnk.js`, boot-guard 404) — **must Lovable Publish**
- **You:** Lovable **Share → Publish** + clear site data on phone once

## Current Focus (2026-06-17 — black screen hardening)
- **Done:** Pre-React `boot-guard.js` watchdog (recovery UI + clear cache); `main.tsx` try/catch boot; `BootRecoveryScreen`; SW **v27** network-first `index-*.js`; `npm run validate:boot` in debug scan; splash max 1.5s
- **You:** Lovable **Share → Publish**; clear site data once on phone after publish

## Current Focus (2026-06-17 — black screen fix)
- **Root cause:** `main.tsx` called `isPreviewServiceWorkerDisabled()` without importing it → `ReferenceError` on load (any browser with SW) → black screen before React mounts
- **Fix:** restored import from `serviceWorker.ts`; SW **v26**
- **You:** Lovable **Share → Publish**; on phone clear site data or hard refresh once

## Current Focus (2026-06-17 — deep scan / profile-id fixes)
- **Deep scan (2026-06-17):** build PASS, lint PASS; Firestore connectivity 2004/2004 (100%); no `profiles→users` mapping left; 30 profiles have `id≠user_id` — fixed DM create + social RPCs to resolve `profiles.id` from auth UID
- **Prod Supabase:** `is_username_available`, `create_dm_conversation` RPCs MISSING on hprmic — client fallbacks in `dataClient.ts` OK
- **vybehub.app bundle:** `index-dHUNkP3m.js` (matches debug scan; Lovable Publish needed for new fixes)
- **You:** Lovable **Share → Publish** + hard refresh on phone

## Current Focus (2026-06-17 — mobile load fix / deep scan)
- **Root cause fixed:** Firestore client mapped `profiles` → empty `users` collection — all profile/post/DM lookups returned nothing after migration
- **Also fixed:** `ensure_profile` + roles now resolve migrated `profiles.id` via `user_id` (auth UID); chunked Firestore `.in()` queries (>10 ids); parallel DM load; SW **v25**
- **Deep scan:** build PASS, lint PASS (warnings only); prod Supabase RPCs `is_username_available` / `create_dm_conversation` MISSING — client fallbacks OK
- **You:** Lovable **Share → Publish** + hard refresh on phone (clear site data if feed still empty)
- **Done:** Dismissible migration banner on login (`Landing`) + in-app (`AppLayout`); updated invalid-login copy for Firebase migration; `migrate:firebase:seed-migration-notice` seeds founder announcement `firebase-migration-2026-06`
- **You:** Users on email/password must use **Forgot password** once; OAuth unchanged

## Current Focus (2026-06-17 — Lovable preview = production)
- **Done:** Removed sandbox mode on Lovable preview — signup enabled, maintenance/2FA not bypassed, same UI (liquid, cookies, AI bar, SW v24), same Firebase data as vybehub.app
- **Lovable env:** Must mirror production — all `VITE_FIREBASE_*`, `VITE_MAINTENANCE_MODE=false` on preview AND publish
- **You:** Lovable **Share → Publish** after pull; sign in on preview with real account + Forgot password if needed

## Current Focus (2026-06-17 — publish ready)
- **Pushed:** `3c2b78dd` → `origin/main` (migration notices, Gemini AI client, SW v23)
- **You:** Lovable [Share → Publish](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) — confirm env vars below first
- **Verify after publish:** sign-in banner, AI chat, Forgot password flow on vybehub.app
- **Done (2026-06-17):** `npm run migrate:firebase:import-lovable` → **14,927 docs** across 208 collections into `vybe-daaab`
- **Done:** Auth seed → **152/152** Firebase Auth users (same UIDs as Supabase profiles)
- **Verified:** `--firestore` connectivity scan → **2004/2004 refs (100%)**, 0 orphans; Firestore counts match export (posts 26, messages 843, conversations 139, etc.)
- **Warnings:** 3 `user_backgrounds` docs dropped oversized inline `image_url` fields (>1MB) — rows imported without those fields
- **You:** Users use **Forgot password** once (passwords not exported); Lovable **Share → Publish** for Firebase client; optional `migrate:firebase:public-media` for legacy media URLs

## Current Focus (2026-06-17 — AI chat `internal` error)
- **Done:** AI chat fallback chain — client Gemini → Supabase edge (preview + legacy session only) → Cloud Function; never surfaces raw `internal` in UI (`aiChat.ts`, `aiChatTransports.ts`, `aiChatHistory.ts`); SW **v23**
- **Blocker:** `aiChat` Cloud Function needs **`GEMINI_API_KEY`** or **`LOVABLE_API_KEY`** in Secret Manager + redeploy; client Gemini needs **Firebase AI Logic** enabled (`firebase init ailogic` for web app)
- **You:** Lovable **Share → Publish** after pull; set secret + `firebase deploy --only functions:aiChat --project vybe-daaab`; AI chat ⋮ → **Clear Chat** to drop old error bubbles

## Current Focus (2026-06-17 — go live)
- **Done:** `index.html` `data-vybe-maintenance="false"` · SW **v21**
- **Done:** AI chat fix — `toGeminiHistory()` strips leading assistant welcome + normalizes turns for Gemini (`aiChat.ts`)
- **You:** Lovable env → all `VITE_FIREBASE_*` + `VITE_MAINTENANCE_MODE=false` → **Share → Publish**
- **You:** `firebase deploy --only firestore:rules,storage:rules,functions,firestore:indexes --project vybe-daaab`

## Deep scan (2026-06-17 — full protocol)

| Check | Result | Notes |
|-------|--------|-------|
| `npm run debug` | **PASS** | build, lint, CSS, edge refs OK |
| `npm run build` | **PASS** | |
| `npm run lint` | **PASS** | 4 pre-existing warnings only |
| Edge refs local vs `supabase/functions/` | **PASS** | 73 referenced, 123 local, 0 missing |
| Prod RPC `get_public_user_count` | **PASS** | |
| Prod RPC `sync_signup_username` | **PASS** | |
| Prod RPC `ensure_user_level` | **PASS** | HTTP 400 (auth required) |
| Prod RPC `ensure_profile` | **PASS** | HTTP 400 (auth required) |
| Prod RPC `is_username_available` | **MISSING** | client fallback in `dataClient.ts` |
| Prod RPC `create_dm_conversation` | **MISSING** | client fallback in `dataClient.ts` |
| Prod edge samples (12) | **PASS** | all deployed (401/400 expected) |
| Firestore `--firestore` verify | **PASS** | 2004/2004 refs, 0 orphans; counts match export |
| `TABLE_TO_COLLECTION` / `profiles→users` | **PASS** | empty map; reads use `profiles` collection |
| Auth UID vs `profiles.id` | **FIXED** | 30/153 profiles `id≠user_id`; DM create + social RPCs now resolve profile id |
| Chunked `.in()` (>10) in `dataClient` | **PASS** | `fetchRows` chunks + `applyClientFilters` |
| vybehub.app bundle | **PASS** | `index-dHUNkP3m.js` |

**Fixes this scan:** `rpcCreateDmConversation`, `createDmChat`, `socialRpc` (`currentProfileId` for messages/friends/levels/profile reads).

**Next 3 tasks:** (1) Lovable Share → Publish for profile-id DM fixes, (2) audit hooks still using `user.id` on profile-scoped tables (~30 mismatch users), (3) `firebase deploy --only functions` + set `GEMINI_API_KEY` for AI chat.

## Deep scan (2026-06-17 — migration regression)

| Check | Result | Notes |
|-------|--------|-------|
| `npm run debug` | **PASS** | build, lint, CSS, edge refs OK |
| `npm run build` | **PASS** | |
| `npm run lint` | **PASS** | 4 pre-existing warnings only |
| Feed RPC non-array crash | **PASS** | `feedRpc.ts` + `mapFeedRows` guard arrays; empty feed on failure |
| Firebase lazy init | **FIXED** | `authService.ts`, `storageService.ts` — no import-time throw |
| Missing Firebase env | **FIXED** | `FirebaseConfigScreen` in `main.tsx` (clear error, not white screen) |
| Maintenance gate preview bypass | **PASS** | `index.html` Lovable hosts → `data-vybe-maintenance="false"` |
| Production vybehub.app maintenance | **OFF in repo** | `data-vybe-maintenance="false"` + SW v21 — **Lovable Publish required** |
| Client `functions.invoke` vs `functions/src` | **PASS** | 66 invoked names, 0 missing exports |
| Supabase edge refs (local) | **PASS** | 70 referenced, all exist in `supabase/functions/` |
| Supabase prod RPCs | **PARTIAL** | `is_username_available`, `create_dm_conversation` MISSING on hprmic — **client-side fallbacks in `dataClient.ts` cover these** |
| `VITE_SUPABASE_URL` without fallback | **PARTIAL** | 8 admin/music/Spotify/debug files still direct; `usePresence`, `Unsubscribe` now use canonical fallback |
| Broken media URLs | **DEGRADED** | `SafeMedia`/`MediaFallback` + `normalizeMediaUrl` — UI won't crash |
| Password reset flow | **PASS** | `authReset.ts` → Firebase `sendPasswordResetEmail` + `ResetPassword.tsx` oobCode |
| Founder UID dual honor | **PASS** | `oXZZXoceCdOaCKekqNrDhCfJ90M2` + legacy `703760a8-…` in `previewSandbox.ts` |

**Fixes this scan:** lazy Firebase auth/storage init, `FirebaseConfigScreen`, canonical Supabase fallbacks in `usePresence.ts` + `Unsubscribe.tsx`.

**Next 3 tasks:** (1) Baron: Lovable env + flip maintenance + Publish, (2) `firebase deploy --only functions`, (3) finish storage migration + port remaining 8 Supabase URL callers.

## Current Focus (2026-06-16 — Firebase go-live on vybehub.app)

- **Goal:** Point production at **Firebase `vybe-daaab`** (Firestore ~14,927 docs, Auth 152 seeded UIDs, partial Storage).
- **Local migration done:** Lovable export imported; auth seeded via `scripts/migrate-firebase/seed-firebase-auth-from-profiles.mjs` (no passwords — Lovable platform limit).
- **Prod blockers (vybehub.app):**
  1. **`index.html`** — `data-vybe-maintenance="true"` shows static “Under reconstruction” on vybehub.app (preview hosts bypass).
  2. **Lovable env** — `VITE_FIREBASE_*` not set in Cloud (see checklist below); `.env.example` is source of truth.
  3. **~10 client files** still call **`VITE_SUPABASE_URL`** (admin debug, music providers, Spotify callback, presence REST, PWA icons, Stripe validate) — core feed/DMs/social/AI captions now Firebase; deploy Cloud Functions for full AI/push.
  4. **Media gap** — only 9 agtcyx storage files in Firebase; most legacy media on `eabvbt` / `szthqtnbepupjqjxaduu` not migrated (avatars/posts may 404 until `migrate:firebase:public-media` + agtcyx service_role).
- **Code fix (this session):** Firebase implementation sweep — `socialRpc.ts` client fallbacks (profile, DMs, view counts, streaks), extended `feedRpc.ts` pattern in `dataClient.ts`, `invokeFunction` body unwrap + `not_yet_ported` fail-soft, `posts.ts` denormalized like/bookmark counts, `edgeFeature.ts` helper; migrated 15+ AI/moderation/social callers off `VITE_SUPABASE_URL` fetch to Firebase `invokeFunction`; `shareLinks.ts` → Firebase `sharePreview`; Cloud Functions: `giphySearch` trending + graceful empty, `detectAiContent` no-op.
- **Prior fix:** Lovable preview `/home` crash — `feedRpc.ts`, PostCard author guard; commit `3976d610`.

### End users — reclaim account + content

| Situation | What to do |
|-----------|------------|
| **Email/password (migrated profile exists)** | Go to [vybehub.app](https://vybehub.app) → **Forgot password** → enter same email as before → open email link → set new password → sign in. **UID is preserved** — posts, DMs, profile in Firestore reattach automatically. Old Supabase password does **not** carry over. |
| **Google / Apple sign-in** | Sign in with same provider + email. Firebase links OAuth to the seeded UID when email matches. |
| **New email, never had VYBE** | Sign up normally after maintenance is lifted. |
| **Founder (Bakrix)** | Email: `barron.bakic@gmail.com` · Firebase UID: `oXZZXoceCdOaCKekqNrDhCfJ90M2` · Legacy Supabase UID: `703760a8-1245-4fc1-b242-32619ecc0ef3` · Username: **Bakrix**. Use Forgot password or Google once Firebase is live. Owner role is honored for both UIDs in `previewSandbox.ts` / `ownerBypass.ts`. |
| **Missing photos/videos** | Content rows exist in Firestore; media files may still point at unmigrated Supabase URLs — expected until storage migration completes. |

### Baron — go live checklist (Lovable Publish)

**A. Firebase Console (`vybe-daaab`)**

- [ ] Authentication → Sign-in method: **Email/Password**, **Google** (Apple if used)
- [ ] Authentication → Settings → Authorized domains: **`vybehub.app`**, **`www.vybehub.app`**
- [ ] Authentication → Templates → Password reset action URL: `https://vybehub.app/reset-password`
- [ ] Firestore + Storage rules: `firebase deploy --only firestore:rules,storage:rules`
- [ ] Cloud Functions (stubs): `firebase deploy --only functions` — required for `invokeFunction` callers
- [ ] App Check reCAPTCHA Enterprise registered (needed before enforcing AI Logic)

**B. Lovable → Project → Environment variables** (values from Firebase Console → Project settings → Your apps → Web app; do not commit)

| Variable | Example / notes |
|----------|-----------------|
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `vybe-daaab.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `vybe-daaab` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `vybe-daaab.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `728651793473` |
| `VITE_FIREBASE_APP_ID` | Web app ID (`1:728651793473:web:…`) |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional Analytics |
| `VITE_FIREBASE_FUNCTIONS_REGION` | `us-central1` |
| `VITE_FIREBASE_VAPID_KEY` | Cloud Messaging → Web push key |
| `VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` | App Check site key |
| `VITE_MAINTENANCE_MODE` | `false` |
| `VITE_PUBLIC_WEBAUTHN_RP_ID` | `vybehub.app` |
| `VITE_PUBLIC_WEBAUTHN_RP_NAME` | `VYBE` |
| `VITE_OFFLINE_MODE` | `pwa` |

Optional (legacy edge features until Phase 3): keep `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` pointing at **agtcyx** for AI/moderation/LiveKit calls that still fetch Supabase edge URLs.

**C. Repo (before Publish)**

- [ ] Set `index.html` line 3: `data-vybe-maintenance="false"`
- [ ] Git push → confirm commit in Lovable

**D. Lovable → Share → Publish**

- [ ] Wait for build → confirm [vybehub.app](https://vybehub.app) loads app (not maintenance screen)
- [ ] Hard refresh / clear site data / private window
- [ ] Smoke: Forgot password → reset → login → feed + profile load
- [ ] Optional: `curl -s https://vybehub.app/despia/local.json | head -3`

**E. Post-launch media (optional, local)**

```bash
# agtcyx service_role from Lovable support → then:
npm run migrate:firebase:public-media
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json npm run migrate:firebase:import
```

### Honest gaps

- **Passwords:** Not exportable from Lovable; all email users must **Forgot password** once.
- **Media:** Most storage not in Firebase yet; broken thumbnails until migration.
- **Edge functions:** ~10 direct Supabase URL fetches remain (admin debug, music sync, Spotify OAuth callback, presence REST, PWA icons, Stripe validate). LiveKit/Stripe/Resend need secrets + `firebase deploy --only functions`.
- **DEPLOY.md** still documents Supabase agtcyx — update when cutover is confirmed.

### Next 3 Tasks

1. **Baron:** `firebase deploy --only functions` + Lovable env + flip maintenance + Publish
2. **Baron:** Deploy Firestore composite indexes (friend_requests status, messages conversation_id+created_at)
3. **Phase 3:** Port remaining ~10 `VITE_SUPABASE_URL` callers; finish storage migration

## Prior Focus (2026-06-16 — hprmic → Firebase data migration)
- **Goal:** Gemini via Firebase proxy + App Check; streaming multimodal VYBE AI chat.
- **Done:** `appCheck.ts`, `aiLogic.ts`, `aiSchemas.ts`, `aiChat.ts`; `AIChat.tsx` uses `streamVybeAiChat` (no Supabase `ai-chat` fetch); App Check init in `main.tsx`
- **You:** Firebase Console → register Web App Check (reCAPTCHA Enterprise) → add `VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` to `.env` + Lovable → run `npx firebase-tools init ailogic` if not done → enforce App Check when ready
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## Prior Focus (2026-06-16 — Firebase backend migration)
- **Goal:** Replace Supabase with Firebase (Auth, Firestore, Storage, Cloud Functions, FCM).
- **Project:** `vybe-daaab` — `.env` configured (web API key + app id), `.firebaserc`, `native/android/google-services.json`
- **Done:** `src/lib/firebase/` service layer, `db` client, rules, Cloud Functions stubs, removed `@supabase/supabase-js`
- **You:** Firebase Console → enable Auth (email + Google), Firestore, Storage → `firebase deploy --only firestore:rules,storage:rules,functions` → add same `VITE_FIREBASE_*` in Lovable env → Publish
- **Android (when `npx cap add android`):** copy `native/android/google-services.json` → `android/app/google-services.json`, add Google services Gradle plugin per Firebase docs
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## Prior Focus (2026-06-16 — full agtcyx → hprmic migration prep)
- **Goal:** Import all live data (~31 users, Bakrix, posts, DMs, media) from **agtcyx** into owned **hprmic**, then run app on hprmic only.
- **You:** Add `AGTCYX_SERVICE_ROLE_KEY` to `.env` → run migration commands in `supabase/manual/MIGRATE_agtcyx_to_hprmic.md`
- **Git:** pending push — enhanced migration script + hprmic-primary client + SW v20

## What Changed (2026-06-16 — migration + hprmic primary)
- **`scripts/migrate-agtcyx-to-hprmic.mjs`** — ~130 public tables, auth.users (UUID preserve), storage bucket recursive copy, `--storage-only` / `--tables-only` / `--skip-auth`, before/after row counts, progress logs
- **`MIGRATE_agtcyx_to_hprmic.md`** — foolproof step-by-step + full table coverage list
- **`canonicalSupabase.ts`**, **`vite.config.ts`**, **`index.html`**, **`debug-scan.mjs`** — hprmic canonical; redirect agtcyx/eabvbt → hprmic
- **Removed dual-backend:** `dualSupabase.ts`, `hprmicClient.ts`; reverted `usePosts`, `useStories`, `useInfinitePosts`, `publishStoryMedia`, `signedUrlCache`, `auth.tsx`
- **`supabaseStorageKey.ts`** — purge agtcyx/eabvbt sessions after migration
- **`public/sw.js`** — v20 cache bust
- **hprmic schema (MCP):** key tables + RPCs present; `PENDING_20260530.sql` optional
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## User steps (required)
1. **Get agtcyx service_role** from Lovable support → add to `.env`
2. `npm run migrate:agtcyx -- --verify` → `--dry-run` → `--execute`
3. Forgot password on vybehub.app → confirm Bakrix feed/DMs/media
4. Lovable env → hprmic URL + anon key → **Publish** → clear site data

## Publish required?
**Yes** — hprmic-primary client + SW v20 until Lovable Publish.

## Next 3 Tasks
1. **You:** Run hprmic → Firebase migration locally (`MIGRATE_hprmic_to_firebase.md` Steps 1–6)
2. **You:** Lovable env → all `VITE_FIREBASE_*` → Publish when `VERIFY.json` is green
3. **Phase 3:** Migrate remaining Supabase edge calls + AI Logic (captions, brief, DM assist)

## Current Focus (2026-06-16 — dual Supabase: agtcyx legacy + hprmic new writes)
- **Legacy (read + auth):** `agtcyxjxgkdyoxwxkjth` — existing users, Bakrix, posts, DMs, feed (Lovable live DB).
- **New writes:** `hprmicwhlaaqfgshucec` — owned project for NEW posts/stories going forward.
- **Git:** pending push — dual-client + feed merge + SW v19.
- **Prod now (pre-publish):** bundle `index-DsQgE5tL.js` · preconnect **agtcyx** · SW **v18** (repo **v19**).

## Architecture (dual Supabase)

| Surface | Project | Notes |
|---------|---------|--------|
| Auth / login / passwords | **agtcyx** | `supabase` client + `canonicalSupabase` |
| Profile read, DMs, friends, notifications | **agtcyx** | unchanged |
| Feed read (ranked / following / global) | **agtcyx** | RPCs unchanged |
| **New posts** | **hprmic** | `useCreatePost` → hprmic storage + `posts` |
| **New stories** | **hprmic** | `useCreateStory` + `publishStoryMedia` |
| Own profile feed + For You page 0 | **merged** | agtcyx + user's hprmic posts |
| Own stories ring | **merged** | agtcyx friends + user's hprmic stories |
| DMs / messages | **agtcyx only** | not split (conversations stay legacy) |
| Edge functions / AI | **agtcyx** | `VITE_SUPABASE_URL` still agtcyx |
| hprmic auth | separate localStorage key | synced on email/password sign-in/sign-up |

## What Changed (2026-06-16 — dual Supabase)
- **`canonicalSupabase.ts`** — `NEW_WRITES_*` hprmic constants; `OBSOLETE_AUTH_REFS` (eabvbt only); hprmic no longer purged on boot.
- **`hprmicClient.ts`** — secondary Supabase client (isolated auth storage).
- **`dualSupabase.ts`** — `syncHprmicAuth`, `ensureHprmicWriteReady`, feed merge helpers.
- **`supabaseStorageKey.ts`** — purge/migrate eabvbt only; keep hprmic session for writes.
- **`auth.tsx`** — mirror password login to hprmic; sign out clears hprmic session.
- **`usePosts.ts`**, **`useStories.ts`**, **`publishStoryMedia.ts`** — new content writes to hprmic.
- **`useInfinitePosts.ts`** — merge user's hprmic posts into profile + For You (page 0).
- **`signedUrlCache.ts`**, **`mediaUrl.ts`** — sign/serve hprmic media URLs.
- **`public/sw.js`** — v19 cache bust.
- **Verify:** `npm run build` PASS · `npm run lint` PASS

## Limitations
- **No data migration** — agtcyx keeps all historical data; hprmic starts empty for content.
- **OAuth-only users** (Google/Apple): hprmic write sync needs email/password login once (or future OAuth bridge).
- **DMs** still on agtcyx — new messages not routed to hprmic in this pass.
- **Other users' new hprmic posts** not visible until full cross-project feed merge.
- **hprmic SQL/edge** — paste `supabase/manual/PENDING_20260530.sql` on **hprmic** if `ensure_profile` / RLS missing.

## User steps (required)
1. **Lovable → Share → Publish** (SW v19 + dual-write client).
2. **Clear site data** on vybehub.app (or private window).
3. **Sign in** with **agtcyx password** (barron.bakic@gmail.com / Bakrix) — email/password also mirrors to hprmic.
4. Post a story or feed post → should land on **hprmic** and appear in your feed/profile merge.
5. **Supabase SQL Editor (hprmic):** apply `PENDING_20260530.sql` + deploy edge fns if writes fail.

## Publish required?
**Yes** — dual-write + SW v19 local until Lovable Publish.

## Next 3 Tasks
1. **Lovable Publish** → verify `/sw.js` → `vybe-v19`
2. **barron.bakic@gmail.com:** login (password) → create post → confirm in feed + profile
3. **hprmic:** SQL Editor + smoke test story upload

- **User:** barron.bakic@gmail.com / Bakrix — live data on **agtcyxjxgkdyoxwxkjth** (~31 users).
- **Git:** `main` @ `d8ac21b3` pushed — auth recovery hardening + legacy session purge + SW v18.
- **Prod now (pre-publish):** bundle `index-DsQgE5tL.js` · preconnect **agtcyx** · SW **v17** (repo has **v18**).
- **You:** Lovable → Share → Publish → clear site data → Forgot password OR original agtcyx password.

## Debug scan (2026-06-16 — auth crisis)

| Check | Result |
|-------|--------|
| `npm run build` | PASS |
| `npm run lint` | PASS (3 pre-existing warnings) |
| `npm run validate:css` | PASS |
| Edge fn refs (83 client → 122 local) | PASS |
| Prod RPCs (agtcyx) | PASS — 401 auth-required (deployed, not missing) |
| `ai-chat`, `livekit-token`, `share-preview`, `auth-2fa-preauth` | PASS (deployed) |
| `vybe-agent`, `community-voice-token`, `link-onesignal-user`, `spaces-token` | FAIL — 404 not deployed |
| vybehub.app bundle | **agtcyx** (14 refs) — not hprmic |
| vybehub.app SW | v17 (repo v18 after publish) |
| agtcyx `/auth/v1/recover` (barron.bakic@gmail.com) | PASS `{}` |
| agtcyx `send-reset-email` edge | PASS 200 |
| agtcyx signup (barron.bakic@gmail.com) | `user_already_exists` — account lives on agtcyx |

## Root causes (evidence)

1. **Wrong Supabase project during hprmic migration window** — vybehub.app briefly baked **hprmic**; agtcyx passwords returned `invalid_credentials`. Commit `58e438ce` reverted client to agtcyx; prod bundle now shows agtcyx refs (curl probe 2026-06-16).
2. **Stale hprmic localStorage sessions** — `sb-hprmicwhlaaqfgshucec-auth-token` could linger after revert and confuse cold-start auth. Fixed: `purgeWrongProjectAuthSessions()` + `clearLegacySupabaseAuthStorage()` on boot and on sign-in.
3. **Password reset errors** — client invoked `send-reset-email` after Supabase recover (duplicate email; 500 when Resend missing on sandbox). Fixed: `authReset.ts` uses Supabase `resetPasswordForEmail` only; agtcyx recover probe returns `{}`.
4. **Recovery link hijacked by OAuth** — hash/query recovery tokens on `/auth/callback` consumed as login. Fixed: `AuthCallback` + `passwordRecoveryUrl` redirect to `/reset-password`; PKCE `?code=` on reset path detected.
5. **Debug instrumentation in prod path** — agent `fetch` logs to `127.0.0.1:7261` removed from auth/reset/feed.
6. **Content “lost”** — not deleted; user was on wrong project (hprmic empty) or not signed in to agtcyx. Bakrix profile/posts remain on agtcyx once logged in with correct account.

## What Changed (2026-06-16 — auth crisis fix)
- **`bootstrapAuthStorage.ts`**, **`main.tsx`** — purge wrong-project + legacy hprmic/eabvbt keys before Supabase client init.
- **`supabaseStorageKey.ts`** — `purgeWrongProjectAuthSessions()`; repair calls purge first.
- **`authReset.ts`** — Supabase recover only (no duplicate `send-reset-email` invoke).
- **`passwordRecoveryUrl.ts`** — PKCE `?code=` on `/reset-password`.
- **`AuthCallback.tsx`** — recovery redirect before OAuth handling.
- **`auth.tsx`**, **`Landing.tsx`** — clear legacy storage on sign-in / failed login.
- **`ForgotPasswordDialog.tsx`** — `getUserFriendlyError` for reset toasts.
- **`ResetPassword.tsx`**, **`useInfinitePosts.ts`** — remove debug logs.
- **`public/sw.js`** — v18 cache bust.
- **Verify:** `npm run build` PASS · `npm run lint` PASS
- **Git:** `d8ac21b3` pushed (excludes `.env`)

## User steps (required)

1. **Lovable → Share → Publish** (agents cannot click Publish).
2. **Clear site data** on vybehub.app (or private window): Application → Clear storage — removes old hprmic SW/cache.
3. **Sign in** barron.bakic@gmail.com with **original agtcyx password** OR **Forgot password** → email link → `/reset-password` → set new password.
4. If you used **Google/Apple** for Bakrix, use that provider — password login will not work.
5. Confirm Home feed + Profile **Bakrix** load after login.

## Publish required?
**Yes** — SW v18 + auth purge/recovery fixes are local until Lovable Publish. Prod already on agtcyx bundle but needs v18 bump.

## Next 3 Tasks
1. **Lovable Publish** → verify bundle hash changes + `/sw.js` → `vybe-v18`
2. **barron.bakic@gmail.com:** Forgot password → reset → login → confirm Bakrix feed/profile
3. **Optional SQL (agtcyx):** paste `supabase/manual/PENDING_20260530.sql` for missing RPCs; deploy `vybe-agent` edge fn

## Current Focus (2026-06-16 — revert to Lovable live backend)
- **User:** restore working auth + Bakrix/live data → point client back at **`agtcyxjxgkdyoxwxkjth`** (Lovable production DB, ~31 users).
- **`canonicalSupabase.ts`**, **`vite.config.ts`**, **`index.html`**, **`debug-scan.mjs`**, **`DEPLOY.md`**, **`AGENTS.md`** — agtcyx canonical; redirect hprmic/eabvbt → agtcyx.
- **`loginErrors.ts`**, **`errorUtils.ts`** — remove hprmic migration copy.
- **`public/sw.js`** — v17 cache bust.
- **You:** Lovable → Share → Publish → sign out / clear site data → log in with **original agtcyx password** (Bakrix account).

## Publish prep (2026-06-15 — user requested ship)
- **Git:** `main` @ `94c35fd7` synced with `origin/main` (login UX + hprmic switch + auth fixes)
- **Build:** `npm run build` PASS · local main `index-B5IgHIXw.js` · Landing `Landing-CjCJmolp.js` (has migration login copy)
- **Prod now (pre-publish):** `index-Ct8Z2p_t.js` · Landing `Landing-Avt62Skb.js` · SW **v13** · Supabase preconnect **hprmic** only
- **Gap:** prod Landing chunk missing `No matching account on VYBE…` toast + SW still v13 (repo has v14) → **publish required**
- **Automated publish:** none in repo (`DEPLOY.md` — Lovable Share → Publish only; agents cannot trigger)
- **After publish expect:** new `index-*.js` hash (≠ `Ct8Z2p_t`) · Landing chunk includes migration login copy · `/sw.js` → `vybe-v14` · `despia/local.json` `deployed_at` bumps

## Current Focus
- **You:** Lovable → Share → Publish → hard refresh / private window on vybehub.app

## Next 3 Tasks
1. **Lovable Publish** → verify bundle hash changes + SW v14 + Landing migration toast
2. **barron.bakic@gmail.com:** Forgot password on vybehub.app → set hprmic password → login
3. **Supabase SQL Editor (hprmic):** paste `supabase/manual/PENDING_20260530.sql` + deploy edge functions

## What Changed (login instant invalid creds — hprmic migration — 2026-06-15)
- **Root cause:** `barron.bakic@gmail.com` (and ~31 live accounts) exist on **agtcyx** auth; vybehub.app + local bundle correctly target **hprmic** (`index-Ct8Z2p_t.js` prod · `index-DIjNgQr7.js` local). `signInWithPassword` → `invalid_credentials` is expected when using an agtcyx-only password — not a premature client error or wrong URL/key in the published bundle.
- **Probe (curl):** agtcyx signup → `user_already_exists` · hprmic signup → new account creatable (separate auth DB) · prod JWT ref = `hprmicwhlaaqfgshucec` only.
- **`loginErrors.ts`** — shared `isInvalidLoginCredentialError` + migration-aware message.
- **`Landing.tsx`** — invalid-creds toast with **Forgot password** action; purge legacy agtcyx/eabvbt localStorage on failed login.
- **`supabaseStorageKey.ts`** — `clearLegacySupabaseAuthStorage()`.
- **`errorUtils.ts`**, **`ForgotPasswordDialog.tsx`** — aligned copy + normalized email on reset.
- **`public/sw.js`** — v14 cache bust.
- **Verify:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Git:** commit + push (excludes `.env`)

## Current Focus
- **You:** Lovable → Share → Publish → hard refresh vybehub.app
- **You (barron.bakic@gmail.com):** **Forgot password** on vybehub.app (sets password on hprmic) OR **Sign up** same email on hprmic — agtcyx password does not carry over

## Next 3 Tasks
1. **Lovable Publish** → confirm bundle hash changes from `index-Ct8Z2p_t.js`
2. **barron.bakic@gmail.com:** Forgot password on vybehub.app → set new password on hprmic → login
3. **Supabase SQL Editor (hprmic):** paste `supabase/manual/PENDING_20260530.sql` + deploy edge functions

## What Changed (canonical Supabase → hprmic only — 2026-06-15)
- **User directive:** remove all `agtcyxjxgkdyoxwxkjth` production assumptions; user owns only `hprmicwhlaaqfgshucec`.
- **`canonicalSupabase.ts`** — canonical project = hprmic; legacy redirect from agtcyx/eabvbt baked env → hprmic URL + anon key.
- **`vite.config.ts`** — build define uses hprmic defaults; redirects legacy agtcyx/eabvbt → hprmic (removed agtcyx auth redirect).
- **`index.html`** — preconnect/dns-prefetch → hprmic Supabase.
- **`scripts/debug-scan.mjs`** — production probes target hprmic only.
- **`AGENTS.md`**, **`DEPLOY.md`**, **`docs/ARCHITECTURE_ROADMAP.md`**, **`docs/IOS_SETUP.md`** — hprmic as sole project.
- **`mediaUrl.ts`**, **`signedUrlCache.ts`** — agtcyx kept in legacy media rewrite list only (old stored URLs).
- **Migrations/manual SQL:** unchanged (historical agtcyx URLs in SQL left as-is per scope).
- **Verify:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Git:** commit + push (excludes `.env`, `.tmp-*`, accidental migration edits).

## Current Focus
- **You:** ensure Lovable Cloud `VITE_SUPABASE_*` env vars point at **hprmic** → Lovable Publish
- **You:** apply pending SQL + deploy edge functions on **hprmic** (see Next 3 Tasks)

## Next 3 Tasks
1. **Supabase SQL Editor (hprmic):** paste `supabase/manual/PENDING_20260530.sql` + any missing RPC migrations
2. **Deploy edge functions on hprmic:** `ai-chat`, `vybe-agent`, `auth-2fa-preauth`, etc. — set secrets (`LOVABLE_API_KEY`, `RESEND_API_KEY`)
3. **Lovable → Share → Publish** → hard refresh vybehub.app → smoke login/signup on hprmic

## What Changed (auth login/signup deep scan — 2026-06-15)
- **Root cause (signup):** `is_username_available` RPC **MISSING** on agtcyx → `signUp()` hard-failed with "Unable to verify username"; same RPC blocked onboarding username picker.
- **Root cause (login UX):** Logged-in users with slow/missing profile hydration stayed on auth form (Landing required `authProfile.username` before redirect spinner).
- **`usernameAvailability.ts`** — shared fail-soft check: RPC when deployed; optimistic proceed when PGRST202/404 (DB unique constraint still catches duplicates).
- **`auth.tsx`** — signUp uses fail-soft check; `fetchProfile` tries `ensure_profile` then `claim_profile_by_email` (was claim-only).
- **`Landing.tsx`** — any signed-in user gets redirect spinner; navigate to Home even when profile still loading; generated usernames → onboarding.
- **`UsernameSetup.tsx`** — fail-soft availability check.
- **`public/sw.js`** — v13 cache bust for publish.
- **Scan (agtcyx, 2026-06-15):** build/lint/CSS PASS · bundle local `index-BN9lJxzU.js` · prod `index-DcpMikVv.js` (pre-fix) · auth endpoint OK (400 invalid creds) · RPCs MISSING: `get_public_user_count`, `sync_signup_username`, `is_username_available`, `create_dm_conversation` · RPCs OK: `ensure_profile`, `ensure_user_level` · edge OK: `auth-2fa-preauth`, `ai-chat`, `livekit-token` · edge MISSING: `vybe-agent`, `community-voice-token`, `link-onesignal-user`, `spaces-token`
- **Verify:** `npm run build` PASS · `npm run lint` PASS (3 pre-existing warnings)
- **Git:** local only (not committed)

## Current Focus
- **You:** Lovable → Share → Publish (required for vybehub.app auth fixes)
- **Optional SQL (agtcyx):** paste `supabase/manual/PENDING_20260530.sql` for `sync_signup_username` + `is_username_available` (client now works without them)

## Next 3 Tasks
1. **Lovable → Share → Publish** → hard refresh vybehub.app (bundle should change from `index-DcpMikVv.js`)
2. Smoke: **login** existing agtcyx account → lands on Home (not stuck on auth form)
3. Smoke: **signup** new email → onboarding (even before SQL applied)

## What Changed (VYBE AI talk + agent — 2026-06-13)
- **`ai-chat` edge fn** — use `LOVABLE_API_KEY` (Lovable gateway) when `GEMINI_API_KEY` missing; fix profile lookup via `user_id`
- **`vybe-agent`** — fix profile lookup via `user_id`
- **`AIChat.tsx`** — always try agent path; local fallback for "open messages" / theme when `vybe-agent` not deployed; canonical edge URLs
- **`localAgentCommands.ts`** — offline navigate/theme commands
- **Verify:** `npm run build` PASS
- **You:** Lovable Backend deploy on **agtcyx**: `ai-chat`, `vybe-agent` → Lovable Publish → sign in → open /VYBE-AI and send a message

## What Changed (login direct auth — 2026-06-13)
- **`Landing.tsx`** — bypass `auth-2fa-preauth` on vybehub.app; direct `signInWithPassword` only (preauth edge still stale on prod)
- **`loginEmail.ts`** + **`auth.tsx`** — trim/lowercase email before auth
- **`public/sw.js`** — bump to v10 so cached old login bundle clears after publish
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → hard refresh vybehub.app → sign in (or Forgot password / Google if OAuth account)

## What Changed (production login fix — 2026-06-13)
- **Root cause:** Client auth targeted `hprmicwhlaaqfgshucec` (~1 auth user) while live accounts are on `agtcyxjxgkdyoxwxkjth` (31+ users). Canonical rewrite `agtcyx→hprmic` made correct passwords return `invalid_credentials`. Secondary: `auth-2fa-preauth` forced email codes on every login (ignored `email_2fa_enabled`); `email_failed` blocked sign-in with no fallback.
- **`canonicalSupabase.ts`** — live auth project is `agtcyx`; redirect baked `hprmic`/`eabvbt` env to agtcyx URL + anon key
- **`vite.config.ts`** — build define mirrors agtcyx auth redirect (stop rewriting agtcyx→hprmic)
- **`client.ts`** — uses `getCanonicalSupabaseUrl()` / `getCanonicalPublishableKey()` (same as runtime-client)
- **`auth-2fa-preauth` + `auth-2fa-request`** — email 2FA only when user opted in (`email_2fa_enabled`)
- **`Landing.tsx`** — `gateOpened` flag fixes stale `gatePending` clear; `email_failed` falls back to `signInWithPassword`
- **`index.html`** — preconnect/dns-prefetch to agtcyx Supabase
- **Verify:** `npm run build` PASS · dist bundle contains only `agtcyxjxgkdyoxwxkjth.supabase.co`
- **You:** Lovable Backend deploy `auth-2fa-preauth` + `auth-2fa-request` on **agtcyx** → Lovable Publish → sign in on vybehub.app with a known agtcyx account

## Current Focus
- **You:** Lovable Backend deploy on **agtcyx** + Lovable Publish (client fixes below are local until publish)

## What Changed (prod triage DMs/stories/AI — 2026-06-14)
- **Debug scan (`scripts/debug-scan.mjs`)** — probes **agtcyx** (not hprmic); adds `ai-chat`, `vybe-agent`, `create_dm_conversation`, bundle hash
- **`resolveSessionProfileId.ts`** — call `ensure_profile` RPC when profile row missing (fixes DMs spinner when signup lag)
- **`useStories.ts`** — retry insert without `poll_data` if column missing; clearer RLS/author_id errors; lint fix
- **`useDMConversations.ts`** — skip auto-create when `create_dm_conversation` RPC missing (PGRST202)
- **`auth.tsx`** — remove empty `SIGNED_OUT` block (lint)
- **Scan (agtcyx, 2026-06-14):** build/lint/CSS PASS · bundle `index-DcpMikVv.js` · RPCs MISSING: `get_public_user_count`, `sync_signup_username`, `is_username_available`, `create_dm_conversation` · edge MISSING: `vybe-agent` (404), `community-voice-token`, `link-onesignal-user`, `spaces-token` · `ai-chat` deployed (401 anon)
- **Verify:** `npm run build` PASS · `npm run lint` PASS
- **Git:** local only (not committed/pushed)

## Next 3 Tasks
1. **Supabase SQL Editor (agtcyx):** paste `supabase/manual/PENDING_20260530.sql` + `20260108184952_*create_dm_conversation*.sql` + `20260613150000_stories_upload_android_fix.sql`
2. **Lovable Backend deploy (agtcyx):** `ai-chat`, `vybe-agent` — set `LOVABLE_API_KEY` secret on agtcyx
3. **Lovable → Share → Publish** → smoke: Messages list, post story, VYBE-AI send "hi"

## What Changed (publish prep — 2026-06-14)
- **`auth.tsx` / `Landing.tsx`** — fail-soft `sync_signup_username`; normalize signup email; terms toast
- **`ChatView.tsx` / `Messages.tsx`** — fix desktop right-pane skeleton on stale `/messages/:id`
- **`public/sw.js`** — v12 cache bust; removed debug instrumentation
- **Git:** pushed `0470b47f` · `npm run build` PASS · production still `index-BW3exuY_.js` until Publish

## Next 3 Tasks
1. **Lovable → Share → Publish** (required for vybehub.app)
2. Hard refresh vybehub.app — bundle hash should change from `index-BW3exuY_.js`
3. Smoke: login → Messages (desktop empty pane) → VYBE-AI

## What Changed (Friend Link sheet polish v2 — 2026-06-13)
- **`AutoFriendDrop.tsx`** — unified handle + title header (no border); tighter padding; close pinned top-right; `reduceMotion` passed to content; maxHeight 68vh for no-scroll QR on iPhone
- **`FriendLinkSheetContent.tsx`** — text-only Phone Tap / QR Scan tabs; smaller tap hero; 144px scanner; white QR tile only; removed neon scanner brackets; muted phase states
- **`FriendLinkTapAnimation.tsx`** — neutral phone/wifi styling (no primary/accent glow)
- **`index.css`** — compact `--sheet` tap sizing; subtle tab active state; softer scanner pulse + scan line
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → Friend Link on Home; QR + camera visible without scroll; tab switch clear

## What Changed (Friend Link sheet redesign — 2026-06-13)
- **`AutoFriendDrop.tsx`** — full-width liquid-glass bottom sheet (slide-up spring) anchored above bottom nav; drag handle + header; z-index 10080/10081 unchanged
- **`FriendLinkSheetContent.tsx`** — Tap/Scan tabs with framer-motion crossfade; QR hero (white tile + full-width scanner); clean phase states
- **`FriendLinkTapAnimation.tsx`** — softer scene styling; `--sheet` size variant
- **`index.css`** — scanner pulse + scan line; `--sheet` tap sizing; tab glass styles
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → Friend Link on Home; confirm bottom sheet, QR scannable, camera visible without scroll

## What Changed (Friend Link sheet UI polish — 2026-06-13)
- **`AutoFriendDrop.tsx`** — centered modal (not bottom sheet); removed redundant in-sheet tips; fixed Phone Tap / QR Scan segmented control (no sliding glow bleed); centered title + decorative handle
- **`FriendLinkTapAnimation.tsx`** — tighter scene sizing and border for tap illustration
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → open Friend Link on Home; confirm centered modal + clean tab switcher

## What Changed (onboarding once-only cache fix — 2026-06-13)
- **Root cause:** Disk-cached profile kept stale `onboarding_completed: false` after DB was `true`; auth hydrated false before fetch, trapping users on `/onboarding` and blocking story publish
- **`profileCache.ts`** — never persist `false` to disk; ignore legacy disk `false` on read; `stripStaleOnboardingFlagFromDisk()` on sign-in/hydrate
- **`auth.tsx`** — only trust cached `onboarding_completed: true`; strip stale disk flag on SIGNED_IN + hydrate
- **`InviteRedeem.tsx`** — stage machine uses `refreshProfile()` (fresh DB) instead of stale auth context
- **`GreetingWidget.tsx`** — align cache read with trust-only-true rule
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → sign in as onboarded user; confirm no `/onboarding` bounce; post story from Home

## What Changed (publish prep — 2026-06-13)
- **Git:** pushed `a7d0eaea` to `main` (onboarding once-only + story publish + profile audit migration)
- **Supabase:** applied `fix_profile_audit_change_type` on `hprmicwhlaaqfgshucec` via MCP
- **Build:** `npm run build` PASS
- **You:** Lovable → Share → Publish (see DEPLOY.md) — agents cannot click Publish

## Current Focus
- **You:** Lovable Publish → smoke test onboarding once-only + story publish on vybehub.app

## Next 3 Tasks
1. Lovable Publish → sign in as completed user; should land on Home, never `/onboarding`
2. New signup → complete onboarding (full + skip paths); should stay on Home after
3. Post story from Home stories bar after publish

- **Root cause:** Share stayed disabled until profile ID loaded; story insert used stale/missing author id; stories bar query did not refetch after publish
- **`StoryCreator.tsx`** — Share enabled when media ready; `resolveStoryAuthorProfileId()` on submit; refetch stories after success
- **`useStories.ts`** — resolve author at insert time; fix cache for first story; use `useAuthProfileId` for query key; force refetch after publish
- **`publishStoryMedia.ts`** — shared storage upload helper
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → post a story from Home stories bar

## What Changed (onboarding loop fix — 2026-06-12)
- **Root cause:** `handleFinish` / `handleDesignerComplete` saved `onboarding_completed: true` to DB but never called `refreshProfile()` — auth context stayed stale (`onboarding_completed: false`) so Home/Landing redirected back to `/onboarding`
- **`Onboarding.tsx`** — `await refreshProfile()` after successful save and before navigating home; profile update now uses `.select().maybeSingle()` and throws if zero rows updated
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → complete onboarding end-to-end; should land on Home without bounce-back

## Current Focus
- **You:** Lovable Publish → smoke test onboarding + VYBE AI

## Next 3 Tasks
1. Lovable Publish → complete onboarding (full path + skip path)
2. Confirm no redirect loop to `/onboarding` after AI designer step
3. Smoke test VYBE AI + auth persistence on vybehub.app

## What Changed (VYBE AI timeout + legacy URL fix — 2026-06-13)
- **Root cause:** prod bundle still baked `eabvbt` Supabase URL → edge calls hit wrong project / 401 JWT mismatch; text chat tried `vybe-agent` first (25–60s) before `ai-chat`, doubling latency; `AbortError` surfaced as generic timeout instead of session/refresh errors
- **`canonicalSupabase.ts`** — runtime + build canonicalize legacy refs → `hprmicwhlaaqfgshucec` URL + anon key
- **`functionAuth.ts`** — canonical edge URLs; auth header cache (30s); `AuthRefreshTimeoutError` + clearer `formatAiChatError`
- **`runtime-client.ts` + `vite.config.ts`** — Supabase client + build define use canonical hprmic even when Lovable injects `eabvbt`
- **`aiChatRouting.ts`** — skip `vybe-agent` for greetings/first short message; skip agent 30m after 401
- **`AIChat.tsx`** — direct `ai-chat` for "yo"/"hi"; stream idle bailout (35s)
- **`useVybeAgent.ts`** — agent fetch timeout 25s; record auth failures
- **Verify:** `npm run build` PASS (legacy env build → only `hprmic` URLs in bundle)
- **You:** Lovable Publish → `/VYBE-AI` send "yo"; sign out/in once if session-expired message

## Current Focus
- **You:** Lovable Publish → smoke test VYBE AI text chat + auth persistence

## Next 3 Tasks
1. Lovable Publish → `/VYBE-AI` send “yo” — should reply via ai-chat in ~2–5s
2. Sign out/in once if you see session-expired message (legacy JWT not portable to hprmic)
3. Smoke test agent actions (navigate, theme) after publish

## What Changed (VYBE AI no-response fix — 2026-06-13)
- **Root cause:** prod edge logs show paired `401 Invalid token` on `vybe-agent` then `ai-chat`; client fell back to ai-chat on agent 401 and called `getFunctionAuthHeaders()` again — `refreshSession()` had no timeout and could hang indefinitely (typing dots forever, no bubble)
- **`functionAuth.ts`** — `refreshAuthSessionWithTimeout()` (8s cap); shared `formatAiChatError()` with AgentRequestError status support
- **`useVybeAgent.ts`** — timed refresh on agent 401 retry; **no ai-chat fallback on 401 / Not authenticated** (same JWT gate)
- **`AIChat.tsx`** — `appendAssistantReply()` on every exit path; auth header failure caught before ai-chat fetch
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish → `/VYBE-AI` send text; expired session should show in-chat “Session expired…” not infinite loading

## Current Focus
- **You:** Lovable Publish → smoke test VYBE AI text chat + auth persistence

## Next 3 Tasks
1. Lovable Publish → `/VYBE-AI` send “hi” — should reply or show clear in-chat error
2. Sign out/in once if you see session-expired message (legacy JWT not portable to hprmic)
3. Smoke test agent actions (navigate, theme) after publish

## What Changed (auth session persistence — 2026-06-13)
- **Root cause:** mixed Supabase project refs in localStorage (`eabvbt`/`agtcyx` vs canonical `hprmic`); `hasStoredSupabaseSession` counted wrong-project tokens; `isFatalRefreshError` treated generic "expired"/"jwt expired" as fatal → local sign-out; Supabase `SIGNED_OUT` on transient refresh failure cleared React auth state
- **`supabaseStorageKey.ts`** — JWT project-ref validation, legacy key migration, canonical-only session detection
- **`supabaseAuthStorage.ts`** — migrate on read, ignore wrong-project tokens
- **`bootstrapAuthStorage.ts` + `main.tsx`** — repair/migrate before Supabase client init
- **`auth.tsx`** — narrower fatal refresh errors; recover from unexpected `SIGNED_OUT` when stored token exists
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish + test sign-in → close tab → reopen; Despia cold start if applicable

## Current Focus
- **You:** Lovable Publish → smoke test auth persistence (close/reopen tab, Despia cold start)

## Next 3 Tasks
1. Lovable Publish → sign in, close tab, reopen — should stay logged in
2. Despia WebView: force-quit app, reopen — session should restore (may need slow-network patience)
3. Users on legacy `eabvbt`/`agtcyx` sessions must sign in once on `hprmic` (tokens not portable)

## What Changed (AI chat timeout fix — 2026-06-13)
- **Root cause:** prod bundle still baked `eabvbt` Supabase URL; `vybe-agent` fails → ai-chat fallback hit **404 on hprmic** (fn not deployed) or wrong legacy project
- **Deployed edge on `hprmicwhlaaqfgshucec`:** `ai-chat` (streaming fallback now live)
- **`vite.config.ts`** — build fallback defaults → canonical `hprmicwhlaaqfgshucec` (was `agtcyx`)
- **`functionAuth.ts`** — `getEdgeFunctionUrl()` + `isLegacySupabaseProject()` for consistent fn URLs
- **`AIChat.tsx`** — actionable errors (404/auth/timeout/legacy), 120s fetch + 180s stream budget, no silent fallback when agent error is non-recoverable
- **`useVybeAgent.ts`** — uses `getEdgeFunctionUrl('vybe-agent')`
- **Verify:** `npm run build` PASS
- **You:** Lovable Publish so vybehub.app bundle stops using legacy `eabvbt` URL

## Current Focus
- **You:** Lovable Publish (fixes baked Supabase URL) + smoke test VYBE AI text chat

## Next 3 Tasks
1. Lovable Publish → open VYBE AI, send text — should reply (agent or chat fallback)
2. Confirm prod bundle uses `hprmicwhlaaqfgshucec` in JS (not `eabvbt`)
3. Smoke test agent actions (navigate, theme) after publish

## What Changed (full scan + edge deploy — 2026-06-13)
- **`npm run debug`:** build/lint/CSS PASS; RPCs OK on hprmic; all client edge refs exist locally
- **Deployed edge on `hprmicwhlaaqfgshucec`:** `giphy-search`, `ai-catch-up`, `community-voice-token` (GIF picker, AI brief, community voice)
- **Prior same session:** `livekit-token`, `share-preview` deployed
- **DB verified:** `notification_preferences` Snapchat columns present on prod
- **Debug scan:** expanded edge probe list (push, OneSignal link, spaces-token)
- **Still needs Lovable Publish:** client AI chat URL fix + error handling (see git status)

## Current Focus (prior)
- **You:** Deploy `vybe-agent` edge fn + Lovable Publish (unified AI agent Phase 1)

## What Changed (VYBE AI agent Phase 1 — 2026-06-13)
- **`supabase/functions/vybe-agent`** — merged chat + commander + `navigate` tool
- **`supabase/functions/_shared/agentToolSchema.ts`** — canonical OpenAI tool JSON (`vybe_agent_act`)
- **`src/lib/agent/`** — zod schema, risk tiers, **AgentActionBus** + handler registry
- **`AgentActionBusProvider`** in `App.tsx`; handlers: navigate, theme, widgets
- **`AIChat.tsx`** — text → vybe-agent → bus; images → `ai-chat` stream
- **`VYBECommandBar`** — FAB → `/VYBE-AI`
- **Docs:** `src/lib/agent/README.md`
- **Verify:** `npm run build` PASS

## Current Focus (prior)
- **You:** Lovable → Share → Publish (calls, share links, story bake, UI cleanup)

## Next 3 Tasks
1. Lovable Publish → smoke test 1:1/group call (livekit-token now deployed on hprmic)
2. Share a post → link opens vybehub.app / OG preview works
3. Story camera text + gallery pick end-to-end

## What Changed (prod fixes + UX — 2026-06-13)
- **Deployed edge on `hprmicwhlaaqfgshucec`:** `livekit-token`, `share-preview` (calls + share OG previews unblocked)
- **`src/lib/livekitCallToken.ts`** — centralized call token invoke + clear deploy error
- **`callStore.tsx` / `GlobalCallOverlay.tsx`** — use `invokeLiveKitCallToken`
- **`shareLinks.ts`** — share-preview when project ref set; vybehub.app fallback
- **UI cleanup:** removed fake Lenses button (`Camera.tsx`), Share-to-story stub (`ShareSheet.tsx`), Sounds search tab stub (`Search.tsx`)
- **Ops:** `AGENTS.md`, `scripts/debug-scan.mjs`, `supabase/config.toml`, `.env.example` → canonical prod ref `hprmicwhlaaqfgshucec`
- **Verify:** `npm run build` PASS

## What Changed (story creator fix — 2026-06-13)
- **`src/lib/bakeCameraEdits.ts`** — bakes CameraEditor text, stickers, image overlays, and draw paths onto photos (no filter re-apply); video best-effort via `flattenVideo`
- **`Camera.tsx`** — `onSave` async bakes edits before `onCapture` / share; loading state on Continue; revokes stale blob URLs
- **`CameraEditor.tsx`** — passes editor display size for object-contain coord mapping; disabled Continue while saving
- **`StoryCreator.tsx`** — validating spinner on select screen; file input reset in `finally` (incl. early returns)
- **Verify:** `npm run build` PASS

## What Changed (Snapchat deploy — 2026-06-13 live)
- **Applied on `hprmicwhlaaqfgshucec`:** prefs columns, quiet hours, `should_send_push`, Snapchat DM/social/call triggers, story like/view triggers, push_tokens RLS, stories bucket MIME
- **Deployed edge:** `send-push-notification` @ hprmicwhlaaqfgshucec
- **Optional:** OneSignal dashboard DM/Social Android channel IDs → edge secrets

## What Changed (Snapchat-style notifications — 2026-06-13 code)
- **DB** `20260613160000_snapchat_style_notifications.sql` — prefs (`show_message_preview`, `calls_enabled`, etc.), `is_in_quiet_hours` / `should_send_push`, Snapchat DM/social/call triggers, story like/view notifications, `fire_push_notification` `p_data`
- **Edge** `send-push-notification` — OneSignal thread/grouping, sender avatar, DM/social channel IDs
- **SW** `public/sw.js` — Snapchat-style DM/social/story display + collapse tags
- **Client** — `useAppIconBadge`, `appIconBadge.ts`, settings toggles, `AppIconBadgeMount` in `App.tsx`
- **Verify:** `npm run build` PASS

## Current Focus (prior)
- **You:** Lovable → Share → Publish (login instant-load fix + prior push/story commits)

## Next 3 Tasks
1. Lovable Publish → log in fresh: feed/DMs/notifications should load immediately (no app-switch needed)
2. Android: post story + push toggle test
3. Confirm `push_tokens` row after push re-enable

## What Changed (login instant load — 2026-06-13)
- **`src/lib/auth.tsx`** — `bootstrapSessionData()` on sign-in: resolve profile id → warm home caches → refetch active queries (same repaint path as app resume/focus)
- Clears `resolveSessionProfileId` memo on sign-out / user change
- **Verify:** `npm run build` PASS

## What Changed (publish prep — 2026-06-13 Android)
- **`b2b93cc8`** — story upload: contentType, Android MIME inference, gallery `capture` removed, bucket 3gp/heic, story RLS
- **`af7465d5`** — Android push: linkOneSignalUser import fix, platform settings copy, longer Despia waits
- **`92510eed`** — push linking edge fn + push_tokens RLS
- **Already live on Supabase:** push triggers, story bucket MIME, story RLS migrations
- **Verify:** `npm run build` PASS

## Current Focus (prior)
- **You:** Lovable → Share → Publish (git pushed @ `fcbb04bb`)

## What Changed (push trigger fix — 2026-06-13)
- **DB migration** `20260613130000_fix_push_trigger_supabase_url.sql` — `get_supabase_project_url()`, `get_push_service_role_key()`, fixed `fire_push_notification`, `notify_push_on_notification`, `notify_message_recipients`, `notify_push_on_call` (was `agtcyxjxgkdyoxwxkjth`)
- **Vault** — `service_role_key` updated to `hprmicwhlaaqfgshucec` JWT (was legacy project ref)
- **Edge** — `send-push-notification` accepts service-role JWT by project ref (DB triggers no longer 401)
- **Secrets** — `ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY` set to Despia app `85bcf4b4-…`
- **Verified** — `net._http_response` id 7 → HTTP 200 from edge; delivery blocked until OneSignal user exists (external_id not linked yet)

## Current Focus (prior)
- **Published** @ `34f54756` — prod verified 2026-06-13

## Publish verification (2026-06-13)
- **https://vybehub.app** — HTTP 200, fresh Lovable deployment
- **Supabase in HTML** — preconnect to `hprmicwhlaaqfgshucec.supabase.co` (correct project)
- **Lazy chunks** — `Settings-CU-cdOVG.js` (test push UI), `edgeFunctionResponse-QBY6ra2O.js` (`pushDeliveryErrorMessage`, OTP errors), `usePushNotifications-CHph0EPO.js`
- **SW** — `vybe-v9` / cache buster `vybe-cache-v5`

## What Changed (publish prep — 2026-06-13)
- **OTP paste/autofill** — `LoginGateModal`, `PhoneNumberCard`, `EmailVerification` use `InputOTP` + `one-time-code` autofill (fixes SMS paste filling only first digit)
- **Push test honesty** — `NotificationsSection` parses edge response; `usePushNotifications` waits for Despia OneSignal link; `pushDeliveryErrorMessage()` helper
- **DB migration** — `20260613120000_push_tokens_update_policy.sql` (UPDATE RLS for upsert; apply on `hprmicwhlaaqfgshucec` if not yet)
- **Git:** `main` @ `34f54756` pushed to origin
- **Verify:** `npm run build` PASS · lint PASS (3 pre-existing warnings)

## Current Focus (prior)
- **You:** Lovable Publish — user-reported bug fix batch (below)

## Next 3 Tasks
1. Lovable Publish → smoke test story upload, DMs vibe edit, VYBE AI chat, friend-request dismiss/tap
2. Apply prod SQL: `20260612120000_friend_request_sender_notified.sql` (sender can dismiss accepted-request rows)
3. Apply `PENDING_20260530.sql` on prod; deploy `community-voice-token`

## What Changed (user-reported bug fixes — 2026-06-12)
- **Stories upload stuck** — `StoryCreator` storage uploads use `withTimeout` (120s/60s); `useCreateStory` uses `useAuthProfileId`, clears optimistic `isUploading` on success; `StoriesBar` shows upload state
- **DMs vibe edit** — `DMsHeader` status lookup uses `profiles.id` (not auth uid); `useSetStatus`/`StatusPicker` use cached profile id + error toasts
- **VYBE AI typing bubble** — `AIChat` uses `fetchWithTimeout` (90s), handles non-SSE JSON responses, timeout/empty-reply fallbacks
- **VYBE AI Designer removed** — unmounted `VYBECommandBar` from `App.tsx`; removed AI redesign banners from `HomeGridEditor` + `HomeWidgetCustomizer`
- **Accepted friend dismiss (X)** — RLS migration for sender `notified_at` update; optimistic cache + localStorage fallback in `useDismissAcceptedRequest`; X visible on mobile
- **Friend request tap** — `AcceptedFriendChatRow` opens DM first; `Notifications` friend_request → profile, friend_accepted → chat; requests tab rows tappable
- **Verify:** `npm run build` PASS

## Current Focus
- **You:** Lovable Publish — call instant-connect + Snapchat-style incoming preview

## Next 3 Tasks
1. Lovable Publish → test 1:1 audio/video call (caller connects immediately; callee sees live camera before accept)
2. Smoke test Friend Link QR sync animation + DM open
3. Apply `PENDING_20260530.sql` on prod; deploy `community-voice-token`

## What Changed (Snapchat-style calls — 2026-06-12)
- **`p2pConnection.ts`** — `connectPreview()` (callee receive-only before accept) + `attachLocalMedia()` (upgrade on accept)
- **`GlobalCallOverlay.tsx`** — removed accept-wait blocking; caller connects P2P immediately; incoming preview effect; live caller video on incoming screen; camera/mic toggles work during `joining`; remote video re-binds after accept
- **`callStore.tsx`** — P2P `startCall` uses `connectStage: 'signaling'` (not `ringing`) so WebRTC starts in parallel with ring
- **Verify:** `npm run build` PASS

## Debug scan (2026-06-13 — post stability polish `c999a15b`)
- **Command:** `npm run debug` (build, lint, CSS, edge-fn refs, prod RPC/edge probes)
- **Frontend:** build PASS · lint PASS (3 pre-existing warnings in `queryRefetchPolicy.ts`) · CSS PASS · `tsc --noEmit` PASS
- **Edge fn refs:** 88 client refs → all 120 local functions OK
- **Production RPCs (`agtcyxjxgkdyoxwxkjth`):** `get_public_user_count` MISSING · `sync_signup_username` MISSING · `ensure_user_level` HTTP 400 (auth required — OK)
- **Production edge samples:** `livekit-token`, `generate-advanced-theme`, `ai-catch-up`, `share-preview` deployed; `community-voice-token` **404 NOT DEPLOYED** (fallback: `livekit-token` / `spaces-token`)
- **Code regression review (`dfbdd341` → `c999a15b`):** no TS/lint errors in changed files; no broken imports; `useAuthProfileId` consistent on user-facing hooks; feed hooks use `getEffectiveProfileId` (sync cache — intentional)
- **Git:** `main` @ `c999a15b`, clean vs `origin/main` (untracked `.tmp-recording/` only)
- **In-repo fixes:** none required
- **Unblock (prod backend):**
  1. Paste `supabase/manual/PENDING_20260530.sql` into prod SQL Editor (`agtcyxjxgkdyoxwxkjth`)
  2. Lovable Backend deploy for `community-voice-token` (or `supabase functions deploy community-voice-token`)
  3. Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after crash-prevention hardening (below)

## Next 3 Tasks
1. Lovable Publish (cache buster bumped to `vybe-cache-v5` — clears bad persisted Set/Map)
2. Smoke test major tabs after publish — confirm no blank panels on error
3. Apply `PENDING_20260530.sql` on prod; deploy `community-voice-token`

## What Changed (crash prevention hardening — 2026-06-12)
- **`persistedCollections.ts`** — global Set/Map revival on persist restore; `safeSetHas` / `safeMapGet` helpers; query-key registry for persisted collections
- **`queryPersister.ts`** — custom `deserialize` revives Set/Map before React Query hydrates
- **`App.tsx`** — root `SmartErrorBoundary` always gets `AppErrorFallback`; `reviveQueriesInCache()` on persist restore; cache buster `vybe-cache-v5`
- **`AnimatedRoutes.tsx`** — route-level `ErrorBoundary` + `AppErrorFallback` (Try again / Reload / Go Home)
- **`AppErrorFallback.tsx`** — shared fallback UI for root, routes, and feature boundaries
- **Hooks** — `select: normalizePersistedSet` on `useDismissedProfiles`, `useHiddenConversations`, `useTrashedConversationIds`, `useMyFeatureVotes`, consolidated duplicates in outgoing/trashed hooks
- **Defensive reads** — `DMsHeader` (`safeMapGet`), `MutualFriendsQuickAdd` (`safeSetHas`)
- **Verify:** `npm run build` PASS

## What Changed (blank black DMs fix — 2026-06-12)
- **`SmartErrorBoundary`** — on error, render `fallback` prop (or inline Retry UI) instead of `return null`; reset loop now keeps `hasError` and shows fallback; `handleRetry` clears reset counter
- **Root crash:** `DMsHeader` called `statusMap.get()` on persisted React Query cache that deserializes `Map` → plain object → `TypeError` → boundary returned null → permanent blank panel after 3 crashes
- **`useBatchUserStatuses`** — `select: normalizePersistedMap` via new `src/lib/persistedCollections.ts`
- **`useOutgoingRequestUserIds`** — `select: normalizePersistedSet`
- **`DMsHeader`** — defensive `instanceof Map` before `.get()`
- **`loadDMConversations`** — `hidden_conversations` filter uses auth user id (schema: `auth.users.id`), not profile id
- **`useConversationDetail`** — `enabled` gated on `useAuthProfileId()` instead of sync-only cache id
- **Verify:** `npm run build` PASS

## What Changed (social app polish pass — 2026-06-12)
- **Profile hydration** — migrated user-facing hooks to `useAuthProfileId()` / auth-user fallback: `useSavedPosts`, `useBlockedUsers`, `useBanStatus`, `useCommunities`, `useServers`, `useChallenges`, `useMarketplace`, `useSharedThemes`, `useStreaks` (map helpers), `useSounds`, `useVybePass` unclaimed rewards, `useRankedFeed`, `useInfinitePosts`, `useLocalFeed`
- **networkMode: 'always'** — first-load critical queries: blocked users, saved posts, communities/servers lists, marketplace browse, challenges, feeds (personalized/following/local/ranked), search hooks, public communities
- **Loading UX** — cache-first skeleton gates on Market, Search, Community, Profile; Retry on error for Search, Market, Profile
- **ChatView** — voice upload uses `user?.id` fallback when `profile.user_id` not hydrated yet
- **Build:** `npm run build` pass · **Lint:** pass (3 pre-existing warnings in `queryRefetchPolicy.ts`)

## Publish status (2026-06-12 — social app polish)
- **Git:** pending push to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## Next 3 Tasks
1. Lovable Publish + force-quit app on iPhone to bust cache
2. Smoke test: Home feed first load, Explore/Search, Profile, Market browse
3. Smoke test: Communities tab, Challenges hub, saved posts on profile

## What Changed (app stability audit — 2026-06-12)
- **Auth hydration** — `useAuthProfileId()` on Friends discovery (`useOutgoingRequests`, `useDismissedProfiles`), streaks, announcements, accepted-friend rows, NewMessage search, `useConversations` / `useMessages`
- **networkMode: 'always'** — chat messages (empty-cache hang fix), notifications, friend requests, message requests, discovery hidden-set queries
- **Admin staff gates** — `isStaffQueryEnabled` now uses cached profile id via `useAuthProfileId` in dashboard, moderation hooks, Live Analytics, Appeals, Announcements, Submissions; section loading only when cache empty
- **useModeration.ts** — removed duplicate import; `useUserRole` uses `useAuthProfileId`
- **Build:** `npm run build` pass · **Lint:** pass (3 pre-existing warnings in `queryRefetchPolicy.ts`)

## Publish status (2026-06-12 — stability audit)
- **Git:** pending push to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## Next 3 Tasks
1. Lovable Publish + force-quit app on iPhone to bust cache
2. Smoke test: Messages list + open chat; Notifications tab; Add Friends search
3. Smoke test: Admin panel sections (Live Analytics, Reports, Error Monitor, Submissions)

## What Changed (admin + Messages loading fix — 2026-06-12)
- **`adminAccess.ts`** — `hasStaffIdentity` / `isStaffQueryEnabled` for cached-profile boot (auth ready without live `user`)
- **`AdminDashboard.tsx`** — staff gate uses cached profile id; dashboard queries `networkMode: 'always'`
- **`useModeration.ts` / `useModerationActions.ts`** — reports/flags/warnings/bans enable on cached profile; `networkMode: 'always'`
- **`AdminLiveAnalytics.tsx`** — staff-gated queries with `networkMode: 'always'`
- **`useAuthProfileId.ts`** — async session profile resolve (shared `session-profile-id` query key)
- **`useDMConversations.ts`** — restored `networkMode: 'always'` on DM list (fixes perpetual spinner regression from b2547a24)
- **`useMessages.ts`** — unread badge uses `useAuthProfileId()`
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — admin + Messages loading)
- **Git:** `dfbdd341` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## What Changed (Messages cluster hardening — 2026-06-09)
- **`invalidateConversationCaches.ts`** — central helper to sync `dm-conversations` + `conversations` caches
- **`useMessageRequests.ts` / `useTrashedConversations.ts` / `useHiddenConversations.ts`** — `useAuthProfileId()` during hydration; dual-cache invalidation
- **`DesktopRightSidebar.tsx`** — uses `useDMConversations` (was duplicate `useConversations` fetch)
- **`ChatView.tsx`** — send/read/view guards use cached `profileId` (not live `profile?.id`)
- **`useTabNotificationBadge.ts` / `useQuickAddSuggestions.ts`** — cached profile id for badges + Quick Add
- **`NewMessage.tsx`** — search loading only on first fetch (not background refetch)
- **Invalidation audit** — group chat, share, friends, profile updates, etc. now invalidate both list caches
- **Build:** `npm run build` pass

## Publish status (2026-06-09 — Messages cluster)
- **Git:** `b2547a24` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app
- **After publish:** force-quit app; hard-refresh browser

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## What Changed (Messages stabilization — 2026-06-09)
- **`resolveSessionProfileId.ts`** — single deduped session profile lookup for DMs/messages/chat
- **`loadDMConversations.ts`** — fail-soft loader returns `{ data, error, profileId }`; `syncDmListCaches()` write-through
- **`useDMConversations.ts`** — uses resolver + fail-soft fetch; `offlineFirst`; soft-error banner when stale list shown; simplified `isLoading`
- **`ConversationList.tsx`** — shell always visible; skeleton only on true first load; inline stale-list Retry banner; removed 8s refetch loop
- **`profileCache.ts`** — allow legacy disk cache missing `user_id` (instant boot)
- **`useMessages.ts` / `useConversationDetail`** — `resolveSessionProfileId`; `offlineFirst` for cached threads
- **Build:** `npm run build` pass

## Publish status (2026-06-09 — Messages stabilize)
- **Git:** uncommitted locally — commit + push, then Lovable → Share → Publish → https://vybehub.app

## Current Focus
- **You:** Lovable Publish after push (one click — agent cannot trigger this)

## What Changed (ChatView conversation load fix — 2026-06-12)
- **`useConversationDetail`** — new hook reads `dm-conversations` cache or fetches members/profiles for ChatView
- **`ChatView.tsx`** — uses conversation detail hook + `useAuthProfileId()` (was empty "Chat" / offline header)
- **`useMessages.ts`** — resolve viewer profile from session; `networkMode: 'always'`
- **`useDMConversations.ts`** — sync `conversations` cache alongside `dm-conversations`
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — ChatView)
- **Git:** `5cee531e` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs perpetual skeleton fix — 2026-06-12)
- **`ConversationList.tsx`** — skeleton only on first fetch (`!isFetched`), not background refetch; removed mount refetch loop
- **`queryRefetchPolicy.ts`** — empty DM list no longer uses `refetchOnMount: 'always'` (was re-skeletoning forever)
- **`loadDMConversations.ts`** — resolve profile id from auth session; members fetch non-fatal
- **`useDMConversations.ts`** — migrate query cache when session profile id differs from stale key
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs skeleton)
- **Git:** `05ea633a` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs loading spinner fix — 2026-06-12)
- **`useDMConversations.ts`** — bootstrap profile id from auth user when profile state missing; `networkMode: 'always'` (was pausing forever offlineFirst); clearer isLoading gate
- **`ConversationList.tsx`** — removed orphan `!isFetched` spinner; skeleton covers all pending states; profile-missing Retry UI
- **`profileCache.ts`** — reject disk cache entries missing `user_id` when auth user is known
- **`useAcceptedFriendRequests.ts`** — uses `getEffectiveProfileId()` for query enable/key
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs loading)
- **Git:** `e96cae1c` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs blank list P0/P1 fix — 2026-06-12)
- **`ConversationList.tsx`** — `AcceptedFriendChatRow` uses `acceptedBy` (was broken `sender` field); never render blank `: null` empty state; Retry button on fetch error; 8s refetch even after empty success
- **`loadDMConversations.ts`** — throw on membership/conversations/members errors so React Query surfaces Retry (was swallowing errors as `[]`)
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs P0/P1)
- **Git:** `cc379c37` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs + bug reports + Friend Link opacity — 2026-06-12)
- **`ConversationList.tsx`** — skeleton only on first fetch; refetch when profile id ready; removed perpetual loading loop
- **`useDMConversations.ts`** — isLoading gated on `!isFetched` (not every background refetch)
- **`AdminBugReports.tsx` / `AdminErrorsSection.tsx`** — split reporter fetch (no brittle FK join); fixed loading gate with `isLoading`
- **`adminAccess.ts`** — staff gate waits for auth identity
- **`AutoFriendDrop.tsx` + `index.css`** — opaque Friend Link sheet/backdrop (fixes see-through on custom home bg)
- **Build:** `npm run build` pass

## Publish status (2026-06-12)
- **Git:** `936396ae` pushed to `origin/main`
- **Web:** Lovable → Share → Publish → https://vybehub.app

## What Changed (DMs load + poster stories resize — 2026-06-12)
- **`ConversationList.tsx`** — no full-page skeleton; header/AI row always visible; inline list loading; `useAuthProfileId()` throughout
- **`useDMConversations.ts`** — clearer loading state; `useMarkConversationRead` uses cached profile id
- **`useMessages.ts` / `useGlobalRealtimeMessages.ts`** — conversation cache keys aligned on `getEffectiveProfileId()`
- **`selfHealingMonitor.ts` / `GlobalErrorHandler.tsx`** — removed "VYBE AI is fixing this…" toast spam; silent heuristics only
- **`StoriesBar.tsx` / `StoryPoster.tsx` / `storyUtils.ts`** — bigger default posters (84×112); scale with home grid colSpan/rowSpan + ResizeObserver
- **`HomeWidgetRenderer.tsx`** — passes widget size into StoriesBar for resize-in-edit-mode
- **Build:** `npm run build` pass

## Publish status (2026-06-12 — DMs + poster stories)
- **Git:** `3a5032de` pushed to `origin/main`
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **After publish:** force-quit iPhone app; hard-refresh browser

## Current Focus
- **You:** Lovable Publish (one click — agent cannot trigger this)

## What Changed (Friend Link add-friend fix — 2026-06-09)
- **`useFriends.ts`** — `useSendFriendRequest` / respond / cancel / unfriend use `getEffectiveProfileId()` during auth hydration
- **`useFriendDropSync.ts`** — create/scan/realtime use cached profile id
- **`FriendDropLink.tsx`** — `useAuthProfileId()`; no infinite "Connecting…" spinner; scan uses profile id
- **`AddFriend.tsx`** — profile-id self-check + Quick Add exclude id fix
- **`AutoFriendDrop.tsx`** — create drop + QR/NFC self-checks use cached profile id
- **Build:** `npm run build` pass

## Publish status (2026-06-09 — Friend Link fix)
- **Git:** `8e5e15ea` pushed to `origin/main` (Friend Link add-friend hydration fix)
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **After publish:** force-quit iPhone app; hard-refresh browser
- **Verify:** `curl -s https://vybehub.app/despia/local.json | head -3` — `deployed_at` should change

## Current Focus
- **You:** Lovable Publish (one click — agent cannot trigger this)

## What Changed (loading audit + bug reports fix — 2026-06-09)
- **`AdminBugReports.tsx`** — fixed infinite loading (use `isPending` + role gate); retry on error; correct `resolved_by` profile id
- **`AdminErrorsSection.tsx`** — admin-gated fetch, proper loading/error/retry states
- **`AdminDashboard.tsx`** — shared staff gate via `isStaffGateLoading`
- **`useUserRole`** — uses cached profile id during auth hydration
- **`useAuthProfileId`** — new hook for tab queries during boot
- **`useNotifications` / `useFriends` / `useUnreadMessagesCount`** — queries enable from cached profile id
- **`adminAccess.ts`** — shared admin/mod role helpers
- **Build:** `npm run build` pass

## Current Focus
- **Publish** — push loading audit + Lovable Publish

## What Changed (DMs not loading fix — 2026-06-09)
- **`profileCache.ts`** — validate disk cache with `getStoredAuthUserId()` when live auth user id isn't set yet (fixes infinite skeleton on Messages tab)
- **`auth.tsx`** — hydrate cached profile + set auth user id on all getSession/refresh success paths
- **`ConversationList.tsx`** — skeleton only while auth loading or first fetch, not forever when profile id missing
- **Build:** `npm run build` pass

## Current Focus
- **Publish** — push DMs fix + Lovable Publish

## What Changed (Snapchat poster stories + smooth clip progress — 2026-06-09)
- **`StoryPoster.tsx`** — rounded poster tiles (Snapchat-style) replace circular `StoryRing`
- **`StoriesBar.tsx`** — shows story cover thumbnails with yellow unviewed border; avatar only on empty “add story” tile
- **`StoryCreator.tsx`** — auto-generates cover on pick/capture; manual cover via frame scrub or upload
- **`storyUtils.ts`** — `generateStoryThumbnail`, `getStoryPosterUrl`, thumbnail upload helpers
- **`useStories.ts`** — `thumbnail_url` on create + optimistic UI
- **`ClipVideoProgress.tsx`** — rAF + GPU `scaleX` progress (no janky width transitions); subtle 8-bar audio waveform when unmuted
- **`MobileShortCard.tsx`** — passes `isMuted` to progress component
- **Migration:** `20260609120000_story_thumbnail_url.sql` — `stories.thumbnail_url`
- **Build:** `npm run build` pass

## Publish status (2026-06-09)
- **Git:** `eb2d7d1c` pushed to `origin/main` (poster stories, clip progress, profile cache fix)
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **DB:** Run on prod Supabase (`agtcyxjxgkdyoxwxkjth`) before/after publish:
  ```sql
  ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
  ```
- **After publish:** force-quit iPhone app; hard-refresh browser
- **Build:** `npm run build` pass

## Current Focus
- **You:** Lovable Publish + apply `thumbnail_url` migration in Supabase SQL editor

## What Changed (Friend Link QR + iPhone perf — 2026-06-09)
- **`FriendDropLink.tsx`** — scan deep link uses `profile.id` (not auth `user.id`); fixed self-check vs owner profile
- **`AddFriend.tsx`** — self-check compares profile id to URL id
- **`AutoFriendDrop.tsx`** — QR only after drop session created; profile id in NFC/scan paths; lighter jsQR loop + downscaled decode on native; skip backdrop-blur / infinite tap animations / `position:fixed` body lock on native
- **`FriendDrop.tsx`** — same profile-id URL fixes for legacy component
- **Build:** `npm run build` pass

## What Changed (phone verify, theme safety, VYBE AI — 2026-06-09)
- **`PhoneVerifyGate.tsx`** — centered modal; X dismisses for current session (`sessionStorage`); returns on next login session
- **`useCustomTheme.ts`** — `sanitizeThemeTokens()` clamps AI palettes for contrast, visible borders, safe native perf
- **`AIVybeDesigner.tsx`** — applies sanitized tokens before preview
- **`VYBECommandBar`** — remounted in `App.tsx`; generate-theme commands now apply the returned theme
- **Build:** `npm run build` pass

## What Changed (Friend Link tap animation — 2026-06-09)
- **`FriendLinkTapAnimation.tsx`** + **`index.css`** — CSS-only phone tap loop (smooth on iPhone)
- **`AutoFriendDrop.tsx`** — new animation; emerald LIVE badge when tap session active

## Publish status (2026-06-09)
- **Git:** `277614ca` pushed to `origin/main` (includes Friend Link, phone verify, themes, VYBE AI, DMs, tap animation)
- **Web:** Click **Lovable → Share → Publish** → https://vybehub.app
- **After publish:** force-quit iPhone app; hard-refresh browser
- **Build:** `npm run build` pass

## What Changed (stale profile cache fix — 2026-06-09)
- **`profileCache.ts`** — `setActiveAuthUserId()` rejects disk cache from a different auth user; `getEffectiveProfileId()` no longer returns wrong-user ids
- **`auth.tsx`** — clears mismatched profile on account switch; hydrates cache only after auth user id is known
- **`supabaseStorageKey.ts`** — `getStoredAuthUserId()` for sync boot validation
- **`AppLayout.tsx`** — resets stuck `inDesigner` / theme preview lock / scroll-hide on route change
- **Build:** `npm run build` pass

## Current Focus
- **Publish** — push stale-profile fix + Lovable Publish
- **Despia** — confirm Native Advanced unit `5403238592` in dashboard; rebuild native shell

## Next 3 Tasks
1. Lovable Publish + force-quit app on iPhone to bust cache
2. Smoke test: Admin panel sections load (Live Analytics, Reports, Error Monitor)
3. Smoke test: Messages tab loads conversation list on tap

## What Changed (ads, DMs, FAB — 2026-06-11)
- **`despiaRewardedAds.ts`** — 45s timeout, dismiss recovery via visibility/focus, broader status parsing
- **`nativeFeedAds.ts` + `FeedAdCard.tsx`** — in-feed Native Advanced (`5403238592`); removed interstitial-on-scroll
- **`scrollHideSync.ts`** — shared scroll hide for BottomNav + floating FABs (fixes Designer FAB stuck)
- **`useMessages` / `ChatView`** — slimmer fetch (50 msgs), offline-first, cache-first skeleton
- **`useChatPrefetch` + `ConversationList`** — prefetch messages on touch before navigate
- **`VYBECommandBar`** — CSS translate hide (no conflicting Framer `y` animation)
- **Build:** `npm run build` pass

## What Changed (cache-first home Phase 0+1 — 2026-06-11)
- **`warmHomeCaches.ts`** — single boot warm path: feeds, DMs, stories, notifications, user meta, avatar signing
- **`cacheFirstLoading.ts`** — skeleton only when zero posts + pending; `FeedRefreshingBanner` when cache visible
- **`Home.tsx` / `HomeWidgetRenderer`** — `isPending`-based loading; no skeleton when cached posts exist
- **`GreetingWidget`** — pre-sign cached avatar on mount
- **`auth.tsx`** — `warmHomeCachesForProfile` when profile persists
- **`useAppPreloader`** — delegates to `warmHomeCaches` (removed duplicate warm helpers)
- **`App.tsx`** — cache buster `vybe-cache-v4`
- **Build:** `npm run build` pass

## What Changed (posts/DMs not loading — 2026-06-09)
- **`queryRefetchPolicy.ts`** — empty feed/DM caches return `refetchOnMount: 'always'` (boolean `true` was blocked by staleTime)
- **`profileCache.ts`** — `getEffectiveProfileId()` so feeds/DMs run during auth hydration
- **`useInfinitePosts` / `Home`** — use cached profile id; show skeleton while auth + no profile id
- **`useDMConversations` / `loadDMConversations`** — cached profile id; fail-soft on errors; loading while refetching empty list
- **`App.tsx`** — cache buster `vybe-cache-v3`
- **Build:** `npm run build` pass

## What Changed (instant load — DMs, level, feed — 2026-06-10)
- **`userLevelCache.ts`** — disk cache so home never flashes fake Lv.1
- **`useVybePass`** — fixed `ensure_user_level()` call (no invalid param); offline-first placeholder
- **`GreetingWidget` / `XPStreakWidget`** — hide level badge until real data; skeleton instead of Lv.1
- **`loadDMConversations`** — two-phase load (list shell → previews); per-conv last message (not 200-row scan)
- **`useAppPreloader`** — warm `personalized-feed-v2` + proper user_levels fetch on boot
- **`auth`** — prefetch DMs when profile hydrates; clear level cache on sign-out
- **Debug scan:** build PASS; prod still missing `get_public_user_count` / `sync_signup_username` RPCs
- **Build:** `npm run build` pass

## What Changed (splash / onboarding loading glitch — 2026-06-10)
- **`SplashScreen`** — removed scale exit (fragmented V logo); faster fade; hides app shell during splash
- **`splashSession.ts`** — sessionStorage flag so refresh on `/onboarding` skips replaying boot splash
- **`useAppPreloader`** — instant ready on setup routes (`/onboarding`, `/auth`, etc.)
- **`Onboarding`** — blocking "Saving…" overlay on Skip/Finish (no mystery reload)
- **`UsernameSetup`** — removed duplicate subtitle line
- **Build:** `npm run build` pass

- **`despiaRewardedAds.ts`** — central `displayrewardedad://` bridge + `updateRewardedStatus` handler; documents Android AdMob IDs
- **`main.tsx`** — registers rewarded callback at boot (before React)
- **`useRewardedAd`** — uses Despia bridge only; `canUseDespiaRewardedAds` (no RC/age spinner block)
- **`useAdEligibility`** — exports `canUseDespiaRewardedAds` for Wallet Watch & Earn
- **`ADMOB_SETUP.md`** — rewritten for Despia dashboard (not Capacitor)
- **Build:** `npm run build` pass

## What Changed (debug scan — 2026-06-10)
- **`npm run debug`** — full scan script (build/lint/CSS, edge fn refs, production probes)
- **`AGENTS.md`** — "do a debug" protocol for future sessions
- **Scan results:** frontend PASS; production missing RPCs `get_public_user_count`, `sync_signup_username`; `ensure_user_level` OK (auth required); `community-voice-token` edge fn not deployed (livekit-token fallback OK)
- **Blocker:** apply `supabase/manual/PENDING_20260530.sql` on prod `agtcyxjxgkdyoxwxkjth`; Lovable Backend deploy for new edge functions
- **Git:** `0d66fdd5` pushed — awaiting Lovable Publish

## What Changed (location + welcome/marketing preview — 2026-06-10)
- **Location** — no GPS prompt on app boot; only watches position on `/map`; Local feed asks when that tab is opened; onboarding permissions unchanged
- **`AppWelcome`** — phone screenshots use `object-cover` + eager load
- **`VybeHome`** — marketing device PNGs via `publicAsset()`; hero phones animate on mount (fixes Lovable preview `whileInView` miss)
- **`AIVybeDesigner`** — live preview cards no longer stuck invisible when animation gate fails
- **`useActivityStats`** — fail-soft on preview DB (home “Live” ticker always renders)
- **Build:** `npm run build` pass

## What Changed (home boot — missing nav + skeleton hang — 2026-06-10)
- **`BottomNav`** — show nav while profile loads; only hide when `onboarding_completed === false` (was hiding on undefined)
- **`profileCache` / `auth`** — persist `user_id` + `onboarding_completed`; hydrate cached profile on boot; backfill auth user id
- **`useUserLevel`** — query with `user.id` fallback so XP/level load without waiting on full profile
- **Splash CSS** — stop forcing nav `opacity: 0` during splash (was leaving nav invisible after fast dismiss)
- **Build:** `npm run build` pass

## What Changed (boot speed — 2026-06-10)
- **`useAppPreloader`** — instant ready for any returning user (stored session or cached profile); shorter persist gate; no blocking level/prefs wait; skip progress animation on exit
- **`App.tsx`** — shorter auth/splash caps (2s web max); optimistic session when token in storage
- **`BottomNav`** — boot grace 2.8s → 600ms
- **`auth.tsx`** — faster getSession safety timeout
- **Build:** `npm run build` pass

## What Changed (boot nav + profile hydration — 2026-06-10)
- **Bottom nav** — sync mobile detection on first paint; boot grace period; force-show after splash; main-tab recovery
- **Splash CSS** — removed `#app-shell visibility:hidden` (fixed black screen / missing nav)
- **Auth** — profile from disk cache on boot; rejects `user_xxxx` placeholders; greeting/XP skeletons while loading
- **Build:** `npm run build` pass

## What Changed (instant feed + Friend Link gate — 2026-06-10)
- **`authReady.ts`** — `isFullyLoggedIn()` helper (auth settled + real profile)
- **Friend Link** — pill, spotlight, shake, and sheet only for logged-in users
- **Home feed** — skeleton only when zero posts + loading; warm Following + For You on boot
- **`usePrefetchPosts`** — caches `personalized-feed-v2` + `infinite-following-posts`
- **Build:** `npm run build` pass
- **Git:** `0a291286` pushed — awaiting Lovable Publish

## Next 3 Tasks
1. User: Lovable → Share → Publish (loading fix — cache v3)
2. Force-quit app once after publish; verify home posts + Messages list load
3. Manual test cold start as `@mrassburgers` — For You, Global, DMs
2. User: paste `PENDING_20260530.sql` into prod SQL Editor (`agtcyxjxgkdyoxwxkjth`)
3. Device test — feed instant, no Friend Link for guests, DMs + level on cold start

## What Changed (instant DMs + onboarding — 2026-06-09)
- **`loadDMConversations.ts`** — shared fetch + nav/app prefetch for conversation list cache
- **`Messages.tsx`** — removed artificial mount skeleton delay
- **`useDMConversations`** — show cached list immediately; don't block on friends load
- **`ConversationList`** — skeleton only when no cached conversations
- **`useAppPreloader` / `routePreloader`** — prefetch DMs right after profile + on Messages tab hover
- **`Onboarding.tsx`** — Skip/Finish use `ensure_profile` + update (RLS-safe on production)
- **Build:** `npm run build` pass

## What Changed (incoming calls — 2026-06-09)
- **`GlobalCallOverlay`** — Snapchat-style full-screen incoming UI (portal → `document.body`, blurred caller wallpaper, slide-to-answer + Accept/Decline, locks scroll)
- **`nativeIncomingCall.ts`** + **`NativeIncomingCallBridge`** — Capacitor `@capgo/capacitor-incoming-call-kit` for iOS CallKit + Android full-screen intent; Despia `scanningmode://auto` during ring
- **`callStore`** — presents/dismisses native UI on ring/accept/decline; `vybe:incoming-call` event for push deep links
- **`NotificationActionRouter`** — tapping call notification surfaces full overlay before poll catches it
- **`send-push-notification`** — `ios_interruption_level: time_sensitive` for calls; optional `ONESIGNAL_CALL_CHANNEL_ID`
- **`DespiaOneSignalSync`** — requests incoming-call permissions on login
- **`index.css`** — `body.vybe-incoming-call-active` hides app chrome under overlay
- **Build:** `npm run build` pass

## What Changed (stability + UX pass — 2026-06-09)
- **DM refresh loop** — `ChatView` mark-read patches React Query cache instead of invalidating; `useMessages`/`useConversations` `refetchOnMount: false`
- **DM list density** — removed edge mask gradient; compact `.dm-convo-row`; smaller avatars; removed composer bottom shadow/fade
- **Bottom nav stuck** — `navVisibility.forceShow()` + scroll-hide reset on main tab routes
- **Splash preload** — warms user level, preferences, DNA settings before dismiss
- **Login approval** — `LoginGateModal` uses `activeChallengeId`; session retry on approve; push uses `profiles.id`
- **OneSignal push** — `send-push-notification` resolves auth uid → profile id for OneSignal lookup
- **Clips scroll** — removed `contentVisibility: auto`; explicit `touchAction: pan-y`; `vybe-clips-page` on ClipsViewer
- **Vybe DNA** — instant cache from preloader + localStorage actions cache

## What Changed (notifications — 2026-06-09)
- **`NotificationActionRouter`** — unified handler for Despia taps, OneSignal web clicks, service worker actions, and deep links (`?call=`, `?login-approval=`)
- **Call push** — Answer/Decline buttons on OneSignal Android; accept joins call instantly; decline updates DB
- **`send-push-notification`** — VAPID optional when OneSignal delivers to native; always sends `path` + `url` for Despia routing; profile-id resolution
- **Login approval push** — deep link `/?login-approval={id}` opens approval sheet on trusted device
- **Service worker** — call accept uses `?call=&action=accept`; posts `NOTIFICATION_CLICK` to app for decline

## What Changed (realtime hardening — app-wide)
- **`subscribePostgresChannel`** — migrated every remaining raw `.channel().on('postgres_changes')` across hooks, `callStore`, admin/auth components (~30 files)
- **`useServers`** — replaced anti-pattern `useQuery` subscription for channel messages with proper `useEffect`
- **`useFriendDropSync`** — stable channel name (removed `Date.now()` suffix that leaked channels)
- Broadcast/signaling channels (`useInstantSend`, `p2pConnection`, `LoginGateModal`, DM broadcast) intentionally unchanged

## What Changed (stability audit)
- **`spaces-token` community voice** — membership + LiveKit identity use `profiles.id` (was auth uid → 403 / missing avatars)
- **`RoomChat`** — removed nav cleanup that re-showed bottom nav when switching text → voice
- **`CommunityChannelSidebar`** — fixed nested `<button>` invalid HTML
- **`RootBottomNavMount`** — hide nav on all `/messages/*` sub-routes

## Publish log
- **2026-06-10** — Pushed `9e2b3ef8` to `main`: onboarding skip RLS fix, instant DM prefetch/cache. Build pass. **Lovable Publish pending** — production still serving `index-BfmVdKUH.js` (pre-9e2b3ef8).
- **2026-06-09** — Pushed `7f32cabf` to `main`: app-wide `subscribePostgresChannel` hardening, community voice ID fix, Vybe Map + friends polish, bottom nav immersion. Build + lint pass. **Lovable Publish pending** (user action).
- **2026-06-09** — Pushed `4d295871` to `main`: Discord-style communities shell, LiveKit voice (`community-voice-token`, `useCommunityVoice`), theme equip persistence, home/DM polish. Build + lint pass. Edge fn deploy blocked (Supabase CLI 403 — needs login or Lovable deploy). **Lovable Publish pending.**
- **2026-06-10** — Home iconic redesign: aurora hero card (spinning avatar ring, gradient greeting), spring feed tabs, quick-access cards, customize pill. DM convo: removed header/composer backdrop-blur seam — solid gradient fade header + opaque composer. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — Settings visual system pass: new `SettingsUI.tsx` (`SettingsSectionCard`, `SettingsPanel`, `SettingsToggleRow`, `SettingsActionRow`, `SettingsStatusCard`); Security/Privacy migrated; Notifications/Appearance/Help fully refactored; glass inset panels (`.settings-panel`), action rows, segment pickers, FAQ items; Themes CTA + MyCurrentVybeCard liquid glass; SubscriptionSection glass; ARCHITECTURE_ROADMAP Supabase ref fix. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — Scan pass 2: mobile settings detail gets a sticky horizontal category strip (switch sections without going home); theme preview lock on Gallery/Marketplace apply; useLearningSignals profile lookup fixed (`user_id` not `id`); PostCarousel lazy-load ready; sidebar scrollbar hidden. **Lovable Publish pending.**
- **2026-06-09** — Deep scan fixes: settings sidebar now pinned while scrolling (self-scrolling sticky + breakpoint aligned with AppLayout); theme preview lock kills the old-theme flicker after generating a vybe (AIVybeDesigner/ThemeCustomizer/DesignYourVybe vs useApplyUserTheme race); DM avatar story tap opens StoryViewer inline (was navigating to nonexistent /stories → 404); "Create Post" CTA → /upload, welcome "Shape what we build" → /roadmap (both 404'd); feed images lazy-load except first 2 (all were eager+high priority); invite stats polling 1s→15s with batched profile fetch (~13 req/s → ~0.2). **Lovable Publish pending.**
- **2026-06-09** — Settings total redesign: removed ugly spinning-square header icon; mobile is now an iOS-style grouped home list (profile hero card, grouped categories with colored tiles, red Log Out row, slide home↔detail navigation with back bar); desktop is a sticky grouped sidebar + content layout with sign-out under the nav. `?tab=` deep links still work. **Lovable Publish pending.**
- **2026-06-09** — Settings revamp: iOS-style colored icon tiles in nav (mobile dropdown + desktop pills with animated sliding active pill), aurora header with conic-gradient settings icon, theme-tinted card hairlines + hover glow on every settings card (scoped `.settings-shell` CSS so all 35 section components are lifted at once), gradient section-header icon tiles in 8 sections, redesigned Profile Settings card (aurora glows + gradient-ring avatar), polished footer. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — CRITICAL: reverted `.env` + `config.toml` to production Supabase `agtcyxjxgkdyoxwxkjth`. They had been switched to `hprmicwhlaaqfgshucec` ("VYBE-Social"), an almost-empty project (8 tables, 5 migrations) — onboarding "Design your VYBE" failed because `profiles.bio` etc. don't exist there. NOTE: today's `spaces-token`/`generate-advanced-theme` deploys + recent migrations went to that wrong project; they're all in the repo, so Lovable Publish will deploy/apply them to production. **Lovable Publish pending.**
- **2026-06-09** — AI Vybe Designer: fixed "try again later" (function `generate-advanced-theme` was never deployed to `hprmicwhlaaqfgshucec` — deployed now with curated no-AI-key fallback + client-side local themes per vibe so it never dead-ends). Full UI redesign: aurora backdrop that morphs to selected vibe, animated headlines, springy vibe cards, gradient CTAs, clean preview. NOTE: set `GEMINI_API_KEY` or `LOVABLE_API_KEY` secret to enable true AI generation. **Lovable Publish pending.**
- **2026-06-09** — Mobile header polish: background now fades into the page theme (28px gradient mask, no hard black edge); streak badge on Challenges icon is now a flame (orange→red gradient + count). **Lovable Publish pending.**
- **2026-06-09** — App-wide safe-area pass: global `pt-safe`/`safe-area-*` utilities + all inline `env(safe-area-inset-top)` now use measured `--sat` var (env() = 0 in WebViews); added missing top safe areas to SpaceRoom, Community, Sounds, SoundDetail, Watch, camera editors, video preview, offline banner, toasts (sonner offset), pull-to-refresh, About/Contact, AdminDashboard. Headers keep themed bg so notch strip matches user theme. **Lovable Publish pending.**
- **2026-06-09** — Clips header safe area: `ClipsFeedHeader`/`ClipsViewer` now use measured `--app-header-safe` var (raw `env()` reported 0 in WebViews, header sat under the notch). **Lovable Publish pending.**
- **2026-06-02** — Spaces live audio (LiveKit) + raise-hand/mute persistence; `spaces-token` edge function deployed. **Lovable Publish pending.**
- **2026-06-02** — Phase 2 content unification (/shorts redirect, ranked Watch browse, ClipsViewer v2). **Lovable Publish pending.**
- **2026-06-02** — Messaging Polish Phase 1 (snap drag parity, outbox/call resume, voice scrub). **Lovable Publish pending.**
- **2026-06-09** — Vybe Snap text drag 1:1 finger tracking fix (local, publish pending)
- **2026-06-09** — production perfection pass pushed. **Lovable Publish pending.**

## What Changed (Spaces live audio — Phase 5 early)
- **`spaces-token` edge function** — role-aware LiveKit tokens for `space-{id}` rooms (speakers publish, listeners subscribe-only); deployed to `hprmicwhlaaqfgshucec`
- **`useSpaceAudio`** — LiveKit room connect, remote audio playback, active-speaker tracking, app-resume recovery; reconnects on listener→speaker promotion
- **`SpaceRoom`** — real mic mute (LiveKit + DB), raise-hand persists (`role: requested` so host sees it), audio status pill + retry, speaking ring from live audio
- **`useSpaces` fix** — host/participant profiles joined by `profiles.user_id` (was wrongly `profiles.id`, broke avatars/usernames)

## What Changed (Phase 2 — Content unification)
- **`/shorts` → `/clips` redirect** — one canonical clips route; `/shorts/:postId` deep links redirect too
- **Watch browse (`VideoBrowse`)** — now uses `get_ranked_feed_v2` ("For You" default) with load-more pagination; Trending/Recent re-sort loaded pages
- **`ClipsViewer`** — upgraded from legacy `get_ranked_feed` (v1) to `get_ranked_feed_v2`
- **Bottom nav** — Clips tab highlights on `/watch` + `/watch/:id` (Videos lives inside Clips)
- **Locales** — removed unused `allowDuet` ("Allow Duet/Remix") promise from all 20 locale files (feature not implemented)

## What Changed (Messaging Polish — Phase 1)
- **`SnapOverlayDraggable`** — shared 1:1 drag component for `VybeSnapEditor` + legacy `SnapCamera`
- **DM outbox** — flush on `visibilitychange` + `app-resumed` (background resume)
- **Send UX** — toast when message queued offline; vybe upload already marks `_failed` for retry
- **Calls** — `GlobalCallOverlay` listens for `app-resumed`; P2P waits out post-camera acquire
- **Voice notes** — waveform scrubbing on `AudioMessage`
- **Roadmap doc** — `docs/ARCHITECTURE_ROADMAP.md` (Phases 2–6 sequenced)

## What Changed (Vybe Snap text drag fix)
- **Text overlay drag** — removed Framer `drag="y"` + delta state double-move; new `SnapOverlayBar` uses start+delta touch math (1:1 finger tracking)
- **Trash zone** — still works during drag; position commits to state only on pointer/touch end

## What Changed (native black screen fix)
- **Native aurora restored** — static mesh gradient on Home/Explore/DMs (was flat `#0B0B10`)
- **Removed `vybe-stable-background`** from native boot — aurora mount no longer hidden
- **Clips/Watch** — aurora suppressed on immersive routes (intentional black player)
- **Splash dismiss** — `ensureAppShellVisible()` clears stuck `#root` visibility
- **Clips loading** — 10s timeout shows retry UI instead of infinite black skeleton

## What Changed (production perfection pass)
- **After publish** — clips → `/clips`, long videos → Videos tab; feeds invalidate instantly
- **No duplicate** “Post created” toast on upload
- **Email verify** — auth state + app resume detection (faster onboarding)
- **Watch** — mobile autoplay (muted), immersive layout, bottom nav hidden
- **Clip deep links** — `/clips/:id` redirects long videos to `/watch/:id`
- **Header/nav** — hidden on clips, watch, and clip viewer routes

## What Changed (clips perfection pass)
- **Videos tab header** — readable on light background (was invisible white-on-white)
- **Clips scroll** — stable intersection observer, no reconnect jank per swipe
- **Watch page** — mobile controls, view counts, related videos feed, short→clips redirect
- **Bottom nav** — Clips tab highlights on `/clips/*`; safe nav order fallback
- **Double-tap like** — fixed stale handler on clip cards

## What Changed (long-form Videos tab)
- **Clips → Videos tab** — YouTube-style grid browse inside Clips; tap opens `/watch/:id`
- **Sort chips** — For You, Following, Trending, Recent (type `video` posts)
- **Upload** — Mobile videos **>60s** auto-publish as `video` (long), shorter as `short` (clip)

## What Changed (VYBE-branded clips flow)
- **Same TikTok flow** — Clips tab, Following | For You, full-screen swipe, progress bar, sound pill
- **VYBE skin** — gradient tabs, VybeMiniIcon, aurora hearts, story-ring avatars, primary progress bar
- **Home feed** — rounded VYBE cards restored (removed flat Instagram-style overrides on native)

## What Changed (TikTok-style clips)
- **Bottom nav** — Clips is a primary tab (Film icon); Explore still available via search on clips header
- **Clips page** — Full-screen `100dvh` feed with bottom nav overlay (TikTok-style)
- **Following | For You** tabs at top; Following uses `get_following_posts_with_counts`
- **MobileShortCard** — Progress bar, spinning sound pill, expandable caption, TikTok layout offsets
- **ClipsFeedHeader** — Search shortcut to Explore

## What Changed (Instagram-ready polish)
- **`instagram-ready` document class** on native shell alongside perf mode
- **Clips** — no pre-roll on native; mid-feed ads after 4 clips; instant snap scroll; swipe hint once
- **Feed** — double-tap to like on touch; flat card separators on native
- **PWA banner** — hidden in Despia/native shell
- **Post publish** — faster return to feed on native (~900ms)

## What Changed (Instagram-ready foundation)
- **Auth keepalive** — periodic + resume refresh; `wasLoggedIn` flag synced on restore/sign-out
- **AppLayout** — don’t blank screen while auth loads if stored token exists; native scroll shell
- **Feed perf** — native `content-visibility`, no backdrop-blur on native, swipe transform off
- **Signup email** — auto-detect verification + spam-folder copy on auth screen

## What Changed (auth hardening)
- **getSession errors** — refresh stored token instead of clearing session on native cold start
- **App resume** — refresh on `visibilitychange`, `app-resumed`, iOS `pageshow` bfcache
- **AuthCallback** — detect `token_hash` / `refresh_token`; don’t bounce valid email links
- **Password reset** — always uses `https://vybehub.app/reset-password` on native shells

## What Changed (PWA default)
- **`VITE_OFFLINE_MODE=pwa`** — service worker caches shell; skip `despia/local.json` unless `despia-local`
- **`registerVybeServiceWorker`** — works on vybehub.app in browser + Despia URL mode
- **`manifest.webmanifest`** — local PNG icons + `id` for installability
- **`DEPLOY.md`** — Despia dashboard: disable local server, use URL mode

## Publish log (prior)
- **2026-06-09** — pushed `b4330cbb`. **Lovable Publish pending.**

## What Changed (`b4330cbb`)
- **Signup → onboarding** — `waitForAuthSession`, email verification screen, `ProtectedRoute` race fix
- **Mobile header** — cleaner full-width bar redesign
- **Despia local OTA** — `@despia/local` in dependencies, `postbuild`, `DEPLOY.md` troubleshooting

## Despia local server (handoff)
- **`@despia/local`** in `dependencies` + Vite plugin + `postbuild: despia-local dist index.html`
- **Production manifest:** https://vybehub.app/despia/local.json (`deployed_at` drives OTA)
- **Despia URL must be `vybehub.app`** — preview `*.lovableproject.com` redirects to auth; offline validator fails
- **OTA path:** Lovable Publish → manifest updates → native app background download → next launch
- **Store build only when:** new Despia native features / permissions / plugins (not for web UI fixes)

## Publish log
- **2026-06-02** — pushed `cc046265` (header gap + safe-area fallbacks, floating pill bar). **Lovable Publish pending.**
- **2026-06-08** — pushed `e7c8d285` (status bar clearance, header polish). **Lovable Publish pending.**

## What Changed (header below camera — `cc046265`)
- **`safeAreaInsets.ts`** — `--app-header-top` / `--app-header-gap`; higher iOS/Android Despia fallbacks; visualViewport offset
- **`index.css`** — header height = safe top + gap + toolbar + tail; CSS fallbacks before JS
- **`MobileHeader`** — dead zone under notch; floating rounded pill bar; compact streak badge
- **`HeaderSearch`** — full-width pill in header; overlay positioned below header

## What Changed (brief settings + header polish — `318e40e8`)
- **`AIBriefCustomizePanel`** — inline in brief sheet (no nested dialog); load/save `finally` fixes infinite spinner
- **`MobileHeader`** — lower compact bar via `--app-header-*` CSS vars; streak hides on narrow screens

## Publish log
- **2026-06-08** — pushed brief settings + header polish. **Lovable Publish pending.**
- **2026-06-08** — pushed `d1ebdbd9` (DM scroll fix + header redesign)
- **2026-06-08** — pushed `edbf9205` / `28cdf141` (Realtime crash fix)
- **2026-06-08** — pushed `5fa238d3` (mobile safe area, brief, AI keyboard, Friend Link, nav liquid, ads gating). Supabase auth/SMS/email/push functions deployed (user CLI). Redeploy `auth-2fa-request` after resend fix.
- **2026-06-02** — pushed `e489cfa2` (native perf mode). Web publish: pending Lovable.

## What Changed (realtime crash fix — `edbf9205`)
- **`realtimeChannel.ts`** — remove stale channels by topic before `.on()` / `.subscribe()` (fixes `postgres_changes after subscribe()` crashes)
- **`auth.tsx`** — single ban-status subscription via safe helper
- **`useBanStatus.ts`** — removed duplicate ban realtime (auth owns it)
- **`useGridLayout` / `useHomeLayout`** — removed no-op autopilot-grid/layout subscriptions (were duplicated per widget mount)
- **`useGlobalRealtimeMessages.ts`** — stable channel names, generation guard for async setup, safe teardown
- **`AppBackground.tsx`** — fail soft on `user_backgrounds` query errors (57014 timeout)

## What Changed (console error cleanup — `29b17a08`)
- **`mediaUrl.ts`** — rewrite legacy Supabase hosts, block Pexels 403 URLs, resolve bare filenames safely
- **Preload hooks** — skip dead URLs; removed `<link rel=preload>` spam
- **`get_public_user_count`** — fail soft when RPC missing (Lovable preview DB)
- **YouTube embed** — pass `origin` to fix postMessage mismatch
- **`index.html`** — removed unused GPT Engineer font preload

## What Changed (mobile polish batch — `5fa238d3`)
- **Safe area** — `--app-header-height` CSS var; AppLayout/Messages/ChatView respect notch; removed body safe-area padding that broke fixed headers
- **MobileHeader** — removed blur blobs that rendered as grey circles on WebKit
- **Verification email** — `auth-2fa-request` resend now matches preauth (no silent skip); LoginGateModal surfaces resend failures
- **Daily brief** — unified cache slots (`morning/lunch/dinner`); refresh keeps content visible; settings load via `.maybeSingle()` + error toast
- **Friend Link** — removed `animate-ping` grey ring; simplified phone-tap ripples (no conic-gradient mask)
- **VYBE AI chat** — composer uses `--kb-h` keyboard offset + scroll-on-focus
- **Bottom nav Create** — uses login-style `vybeLiquid` button
- **Ads** — no longer blocked while age RPC loads; Despia AdMob init on shell startup

## What Changed (native perf mode — prior)
- **`nativePerfMode.ts`** — Despia/Capacitor store shell gets static colorful aurora (mesh only), no touch ripples, reduced Framer motion, no contrast DOM scans
- **`VybeLiquidBackground`** — skips animated blobs, bloom, grain, device tilt, and pointer FX on native
- **`AnimatedRoutes`** — plain route shell on native (no `AnimatePresence popLayout`)
- **`main.tsx`** — `native-perf-mode` + `reduce-motion` classes before first paint; skip animation warmup on native
- **`index.css`** — native overrides beat immersive aurora/touch CSS

## What Changed (launch polish — prior local)
- Safari vs WebView detection — iPad Safari no longer mis-detected as native app
- Auth `getSession` — late responses no longer ignored after timeout
- `RootGate` — orientation/resize-aware mobile routing
- `PublicOnlyRoute` — waits for auth before redirect (no flash to sign-in)
- Friend Link pill visible on iPad (`useIsMobileOrTablet`)
- Shared `detectIsIPad` in `deviceDetection.ts` + `use-mobile.tsx`

## What Changed (iPad launch fix — pushed `94b22cad`)
- **`deviceDetection.ts`** — iPad/Macintosh UA + embedded WebView heuristics
- **`RootGate`** — iPad always gets mobile intro/Landing (not desktop `VybeHome`)
- **`despiaBridge`** — native shell detection for iPadOS desktop-class UA
- **`auth.tsx`** — 6s auth safety timeout + 5s `getSession` race
- **`App.tsx`** — clear stuck `#root` visibility after splash dismiss
- **`PublicOnlyRoute`** — iPad redirects to `/auth` instead of marketing pages

## What Changed (colorful background restore — prior local)
- **`STABLE_APP_BACKGROUND = false`** — liquid aurora + touch ripples back app-wide (Home, Clips, Explore, auth Landing)
- App shell transparent again; `VybeLiquidTouchShell` remounted in `App.tsx`
- Custom wallpaper still overrides aurora when set

## What Changed (App Store rejection fixes — prior local)
- **2.1(a) ATT:** splash absolute max 6.5s (was 3.5s early dismiss); post-ATT poll until auth+preload ready; staggered WebView recovery; consent poll after resume
- **2.1(a) routes:** loaders instead of blank null; stale token → `/auth`; local signOut on refresh timeout
- **2.1 NFC:** `docs/APP_STORE_RESUBMIT.md` — demo video script + App Review notes to paste (video still required manually)
- **AR filters:** lite CPU on all phones, overlay/zoom alignment, color filters without face lock
- **Stability:** Friend Link perf, cold start hardening (prior batch)

## What Changed (AR filters — prior local)
- **AR on all phones:** lite CPU profile no longer blocked by missing WebGL
- **Overlay alignment:** selfie roll corrected when mirrored; video + AR share pinch-zoom wrapper
- **Color AR filters:** golden hour / midnight / noir work without a detected face (fallback + no scan reticle)
- **Tracking lifecycle:** survives camera flip/restart; session AR retry when opening AR tab
- **AR tab default:** first free face filter (Neon Eyes), not premium Holographic

## What Changed (smoothness + bug pass — prior)
- ATT resume only after real backgrounding (no cold-load splash skip)
- IndexedDB restore 600ms cap so cold start never hangs
- PublicOnlyRoute loader instead of blank null during auth
- Friend Link: lighter QR scan (every 2nd frame), native NFC stop on close, duplicate-add guard

## What Changed (App Store ATT fix — prior)
- No duplicate tracking dialog on Despia native — uses `despia.trackingDisabled` only
- `attResumeRecovery.ts` clears stuck splash/body lock after system permission sheets
- Landing/RootGate never render blank during auth redirect (iPad review device)

## What Changed (Friend Link + Create camera — prior)
- **Friend Link:** single shake listener; iOS motion on pill tap + coach “Got it”; instant X close; activation hints (pill coach, sheet tips, feed spotlight); `AutoFriendDrop` mounted app-wide (pill only on `/home`); NFC/tap auto-add now calls `runAutoFriendAdd`
- **Create camera:** Snapchat-style bottom stack (lenses → shutter → modes), glass top controls, viewfinder grid, one-time `CreateCameraCoach`

## What Changed (AR — prior)
- Mobile AR enabled: `arEngine.ts` lite profile (CPU, 320px, smoothed landmarks)
- AR composited into photos (`arCapture.ts`); scan reticle while finding face
- Friend Link QR scanner: orbital sweep + target pulse animation
- `SnapARProvider` mounted in App (needs Snap token for full lens library)

## What Changed (platform polish)
- Lazy i18n: English only in main bundle; 19 locales on demand (`i18nLoadLocale.ts`)
- Offline feed: empty-state when no cache; “saved feed” banner when offline with cache
- Friend Link spotlight on Home + `openFriendLink()` → AutoFriendDrop sheet
- Mobile intro: Friend Link slide (`VYBE_INTRO_VERSION` 3)

## What Changed (perf + offline)
- Preloader waits for IndexedDB persist restore; skips heavy work when warm cache exists
- Home: tab-gated feeds; Global/Local only after first visit
- No full cache wipe on sign-in; deferred realtime/presence + animation warmup
- `offlineCacheProbe.ts`, `persistRestoreGate.ts`

## What Changed (aurora/touch — prior)
- `#vybe-aurora-mount` behind `#root`; portaled aurora + transparent app shells
- `VybeLiquidTouchOverlay` / `VybeLiquidTouchShell` — global tap ripples (Landing z-25, app z-5010)
- `vybeLiquid` buttons trigger same touch animation; blob pull via bridge
- Custom wallpaper gate: `hasUserWallpaper` + `isBackgroundResolved` hide aurora/touch; `stripLiquidShellDocumentState()` on upload

## Current Status
- Done: Snapchat-style full-screen incoming call overlay; native CallKit bridge wired; build pass
- **Your turn:** Despia native rebuild (Capacitor plugin) + Lovable Backend deploy `send-push-notification` → test locked-phone incoming call

## Next 3 tasks
1. Despia rebuild with `@capgo/capacitor-incoming-call-kit` (`npx cap sync` + native build); create OneSignal Android channel → set `ONESIGNAL_CALL_CHANNEL_ID`
2. Lovable Backend deploy `send-push-notification` → Publish → smoke test: locked phone incoming call (Answer/Decline from notification + full-screen UI)
3. Lovable Backend deploy `livekit-token` with LIVEKIT secrets → test community voice

## Publish log
- **2026-06-02** — pushed `edbf9205` (Realtime crash fix on Home). **Lovable Publish pending.**
- **2026-06-05** — smoothness/ATT resume + Friend Link perf — **Publish in Lovable + Despia now**
- **2026-06-02** — commit `ee375394` — ATT blank-screen fix
- **2026-06-02** — commit `934af286` — Friend Link polish + Create camera revamp
- **2026-06-02** — commit `686f01c0` — mobile AR + Friend Link QR scanner
- **2026-06-01** — commit `601ebb39` — perf, offline UX, lazy i18n, Friend Link spotlight
- **2026-06-01** — commit `821c373d` — liquid FAB + auth liquid UI
- **2026-06-01** — commit `6f265956` — auth liquid UI, Welcome heading

## Verification Checklist
- [x] `npm run build` passes
- [ ] Friend Link pill + shake on Home; X closes instantly
- [ ] Friend Link spotlight → opens tap sheet
- [ ] Offline: no cache → helpful empty state; with cache → banner + posts
- [ ] Lovable Publish completed
- [ ] `vybehub.app` Home aurora + tap verified
- [ ] `vybehub.app` Login tap + Log In button verified
- [ ] Custom wallpaper hides aurora (Settings → Background)

---

## 2026-06-16 — Supabase → Firebase migration complete (Phases 1-8)

All eight migration phases complete. See `.lovable/plan.md` for per-phase detail.

**What shipped:**
- Phase 1: Google/Apple sign-in moved to Firebase Auth.
- Phase 2-3: Data export script + Firestore importer (`scripts/import-firebase.mjs`).
- Phase 4: `firestore.rules`, `storage.rules`, `firestore.indexes.json` translated from Supabase RLS.
- Phase 5: P0 Cloud Functions (`ai.ts`, `auth.ts`, `push.ts`, `realtime.ts`, `social.ts`) live.
- Phase 6: client `supabase.functions.invoke(...)` calls auto-routed to camelCase Firebase callables via `functionsService.ts`.
- Phase 7: long-tail port — `email.ts` (Resend), `stripe.ts` (Connect V2 + webhooks), `spotify.ts`, `passkeys.ts`, `briefs.ts` (scheduled), `aiExtras.ts`. FCM web push wired (`public/firebase-messaging-sw.js` + `src/lib/firebase/messaging.ts`).
- Phase 8: `index.html` preconnects switched to Firebase endpoints. Shim layer `src/integrations/supabase/` retained as deprecation seam.

**Verification:**
- `cd functions && npx tsc --noEmit` → 0 errors.
- `npm run build` runs clean.

**Blockers / next 3 tasks:**
1. Configure Cloud Function secrets in Firebase Console (full list in `.lovable/plan.md` Phase 8).
2. `firebase deploy --only firestore:rules,storage,firestore:indexes,functions,hosting`.
3. Bootstrap first admin via Firebase Console → Auth → Custom Claims `{ "admin": true }`, then publish web app via Lovable → Share → Publish.

**Residual work (non-blocking):**
- Swap presence/typing hooks from legacy realtime shim to direct Firestore `onSnapshot` (small perf win).
- Delete `supabase/` folder + `src/integrations/supabase/` shim once Firebase impl is battle-tested in production.

---

## 2026-07-12 — OAuth recovery + concept DM inbox

### What changed
- **OAuth (`9eb8e763`)** — mobile Safari redirect-return URLs now use the extended Firebase Auth recovery window; Landing and AuthCallback perform a final capture before clearing pending state; the service worker bypasses OAuth-bearing `/auth` responses.
- **DM inbox (`24c8da12`)** — added `src/features/dms/` as the production inbox layer with normalized Firebase previews, persisted glass tabs, 96px neon rows, delivery/streak status, presence/typing, per-row snap camera, preserved swipe actions, virtual slicing, skeletons, and the scroll-aware compose FAB.
- `Messages.tsx` now mounts `DMInboxPage`; legacy `dm-inbox` entry points remain as thin compatibility re-exports.

### Verification
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — 10 files / 64 tests passed.
- `npm run build` — passed.
- `npm run validate:css` — passed (two pre-existing Tailwind ambiguity warnings).

### Blockers / manual checks
- Device-only QA remains: iPhone Safari private-tab Google OAuth, safe-area/header, tab persistence, swipe/camera, FAB clearance, and 40+ row scrolling.
- Confirm `vybehub.app` and `vybe-daaab.web.app` are listed under Firebase Auth Authorized domains.
- `vybehub.app` still requires Lovable → Share → Publish after the pushed client commit.

### Next 3 tasks
1. Hard-refresh iPhone Safari and complete Google sign-in from `/auth`.
2. Run the inbox interaction checklist on iPhone and tablet.
3. Publish `origin/main` through Lovable and smoke-test `vybehub.app`.

---

## 2026-07-12 — Messages redesign Phase 3 (interactions/theming/VFX) + Phase 4 (Add Friends)

### What changed
**Phase 3**
- `SwipeableDmConversationRow.tsx` — swipe reworked: right swipe toggles read/unread via `useDmInboxActions().toggleRead`; left swipe reveals a Pin/Mute/Archive tray that snaps open; a deeper left swipe past the tray arms a delete zone that requires release + an `AlertDialog` confirmation before trashing. Row tap, avatar/profile routing, haptics, long-press options sheet, and camera routing untouched.
- `useDmInboxActions.ts` — added `markRead` mutation (wraps `useMarkConversationRead`) and a `toggleRead(currentlyUnread)` helper.
- `ConversationOptionsSheet.tsx` — added Block and Report actions (existing `blocked_users` / `reports` collections, matching field names used elsewhere in the app) alongside existing Pin/Mute/Mark-unread/Archive/Delete/Lock/Clear/Best-Friend actions.
- `dmThemeTokens.ts` (new) + `index.css` — semantic `--dm-theme-*` CSS vars (elevated/surface/glass/divider/glow/unread/online/story-ring/sent/received/composer/nav/shadow/overlay) scoped under `.dm-inbox`/`.dm-thread`, derived from existing theme vars; inbox/thread components migrated to consume them.
- Controlled VFX (transform/opacity only) added: `.dm-vfx-press` on buttons across `DMHeader`, `DMComposeButton`, `DMConversationRow`, and the new swipe tray buttons; story-ring pulse on unviewed avatar rings; new-message sweep on `DMConversationRow`. All respect `prefers-reduced-motion` / `.reduce-motion`.
- Removed the old "quick reply" right-swipe affordance (`onQuickReply` prop and call sites) from `DMConversationList`, `DmInboxSafeList`, and `DMInboxPage`.

**Phase 4**
- `src/pages/AddFriendsPage.tsx` (new) — `/friends/add` route with `Add Friends` / `Requests` tabs. Add Friends: debounced search (`useSearchPeople`, extracted to `src/hooks/useSearchPeople.ts` from `Search.tsx`) with quick-add suggestions (`useQuickAddSuggestions`, `useDismissedQuickAdd`) fallback. Requests: existing `FriendRequestsList` (Incoming/Sent) plus a new "Accepted recently" section backed by `useRecentlyAcceptedFriends` (added to `useFriends.ts`).
- Route wired in `AnimatedRoutes.tsx` as a lazy, `ProtectedRoute` + `RouteBoundary`-wrapped route, matching existing route conventions. `DMHeader`'s friend-add button already pointed at `/friends/add`.

### Verification
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run test` — 12 files / 82 tests passed.
- `npm run lint` — passed.

### Blockers
- None. Device QA for swipe gestures (tray snap, delete-zone threshold feel) and VFX (reduced-motion) still recommended on a real touch device before Lovable Publish.

### Next 3 tasks
1. Manual QA: swipe interactions (read toggle, tray snap, delete confirm), long-press options sheet, camera routing, and `/friends/add` tabs on a touch device.
2. Commit and push to `origin/main` when ready (not yet committed).
3. Publish via Lovable → Share → Publish and smoke-test `vybehub.app` for both phases.
