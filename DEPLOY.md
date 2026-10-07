# DEPLOY — VYBE (`vybehub.app`)

The backend is **Firebase only**: Firebase Auth, Firestore, Cloud Functions and Cloud Storage in project **`vybe-daaab`**. `.firebaserc`, `firebase.json`, `functions/package.json` and the exports in `functions/src/index.ts` are the deployment sources of truth. Historical Supabase instructions are obsolete; do not use SQL migrations or Supabase deployment commands for this app.

Production web hosting is **Lovable**, with custom domain **`vybehub.app`**. Lovable GitSync follows **`origin/main`**. A GitHub push updates source/preview; production and the Despia web bundle require **Lovable → Share → Publish**.

| Environment | URL / scope |
|-------------|-------------|
| Production web | https://vybehub.app |
| Lovable preview | https://416714c8-d013-4aff-984d-522418a9bbc7.lovableproject.com |
| Lovable editor | https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7 |
| Firebase Hosting staging frontend | https://vybe-daaab.web.app — shares the production Firebase project; not an isolated data environment |
| Isolated local QA | `demo-vybe-preview`; follow [LOCAL_PREVIEW_QA.md](docs/LOCAL_PREVIEW_QA.md). Never deploy its configuration or fixtures. |

## Shared theme service recovery (2026-10-06)

Scoped existing-flow client release is live: [readiness release](releases/readiness-client-20261006/README.md), source `2a56bf63196261f29c5e1dafee0e7b41bd8e00c1` on `release/readiness-20261006`, deployment `cad160d0-f3e4-42bd-af0d-21d966639bb1`. It starts from verified live1213702 and includes only tested auth/profile/post/GPS/Clips client fixes. Production source fingerprint7acb3cd0f310809a42b67752ee7f36f613659232c254615a55a379aa6ddd51fb and entry/assets/app-lUua0SI4.js match; nine route shells and all628phone manifest assets verified. GitSync temporarily selected the reviewed release branch for publication and has returned to main for development. Do not use main as this release's source identity: pending parental/safety/export/deletion protocols are excluded and still need coordinated rollout. Firebase services/Rules/IAM/data/dependencies/native shell unchanged; actual installed adoption and signed-in user flows remain open.

Account data tools candidate: checked export and deletion request/status/cancel require the exact changed existing `manageAccount` and matched client. `security/account-deletion-authority-candidate.rules` is an isolated patch to the currently deployed discovery baseline: raw deletion-request access closes and `_account_deletion_receipts` is private. No new export, scheduler, secret, index or TTL is required. Do not deploy the root Rules or publish the entire staged branch as finished; the documented current-session/HTTP admission and other matched authority prerequisites remain open. There is no permanent deletion worker yet. The UI truthfully records a review request eligible after 30 days; it does not promise automatic erasure or email. See [account settings contracts](docs/ACCOUNT_SETTINGS_STABILITY.md) for the full remaining cleanup requirement and exact evidence. This checkpoint has not changed production services, Rules, IAM, Auth, data or the Play Store bundle.

Native dependency patch: Android/iOS/core/CLI exact8.4.3 align in npm/Bun and the checked-in iOS manifest/vendor-tag pin. The critical Capacitor audit entries are removed locally. Follow [native security patch verification](docs/NATIVE_SECURITY_PATCH.md): Windows lacks Xcode, SwiftPM resolution/native archives and installed provider/store binary versions are unverified. Lovable publication is not native binary delivery. Preserve existing signing/distribution and other native pins; do not claim phone remediation without rebuilding/verifying that actual shell.

Existing community room messages: the one additive `channel_messages` index `(channel_id ASC, is_deleted ASC, created_at ASC)` is READY. All four exact queries for the checked designated owner previously failed with an index-required error and now succeed, returning the preserved message. See [the scoped index release](releases/community-message-index-20261006/README.md). Rules, Functions, Auth, records and client runtime unchanged. Preserve all other indexes; do not deploy the complete root manifest or delete unrelated resources. This administrative read proof does not establish owner-admission recovery, current-client adoption or phone rendering.

Later scoped existing friend discovery recovery: `getDiscoveryProfiles` is ACTIVE and all five exact indexes in [the discovery release](releases/people-discovery-20261006/README.md) are READY. Canonical private birthday get/create/update was missing from the active baseline. Released only the complete baseline-preserving candidate; current Firestore Rules SHA256f7be92e5abb8fa5fb8c8a9fc263440a3478a0e9829b92c84d0085402df999f78, ruleseta1e2c40a-f544-4155-8f7b-f6c7e5317923. Preserve this later baseline. Storage unchanged. Named service performance update and matched client35eaa676 publication are verified; do not deploy broader root Rules or all indexes/services. Browser/phone adoption remains open.

The exact three existing theme services and matched resources are released. See [shared theme release record](releases/shared-theme-recovery-20261006/README.md). That checkpoint's Firestore Rules SHA2568c9ac23dca7994c7093d1168998366588b0ca2e39ab753f9facd3e9581ef069b is retained as the discovery candidate's exact baseline above. Actual signed-in community and saved theme reads work. No client publication, historical migration, Auth change or new feature was included in the theme checkpoint. Older mounted release adoption and physical-phone Firebase map/clip/network behavior remain unverified.

## Production stability release (2026-10-05)

User-authorized scoped post/feed/comments/follow/stories/streak/sound deployment is now live. See [exact release record](releases/post-loading-20261005/README.md) and firebase.post-loading.json for the 28-function slice, baseline-preserving Firestore/Storage candidates and additive resources. Actual Lovable production manifest confirms main 0503197824f066dc05b775b435e3675aa32f5064; latest client/auth motion is published. The previously blocked narrow sign-in/Home Rules candidate is also released; older 503 and auth2faRequest hold descriptions below describe earlier checkpoints, superseded only for the explicitly reviewed ordinary sign-in slice. Other documented matched release prerequisites remain applicable. No whole Functions/Rules deploy, new game platform, tokenMarketplace or native persistence certification is implied.

## Phone session repair checkpoint (2026-10-05)

**Live sign-in incident:** read-only inspection on October 5 found `vybehub.app` already serving `ea52a9bf`, while `auth2faVerify` returned a platform 403 and `ensureAccountProfile` a platform 404. The live client/backend are incompatible; another frontend-only publish cannot repair this. The named compatibility preflight is `node scripts/check-auth-release.mjs --project vybe-daaab`. See [SIGN_IN_RECOVERY.md](docs/SIGN_IN_RECOVERY.md) for the six-function sign-in/profile slice, existing private resources, deployment-access blocker and required real-account verification. Review the actual deployed Rules baseline rather than releasing unrelated pending Rules changes. The new consumed-email completion fix adds no new export, namespace, index or TTL; its matching `authLoginNotify` must accompany the existing coordinated email/profile release.

The pending phone-persistence repair requires the matching client, exact updated callable **`authLoginNotify`**, checked account-profile setup and Firestore Rules. Provision the `auth_challenges` index `(user_id ASC, challenge_type ASC, status ASC, expires_at ASC)` first. `_auth_device_session_heads` is server-only durable device-generation evidence with no TTL. Older callers lack the checked account/credential fields; coordinate the cutover with all existing confirmation/approval prerequisites. No new secret, Auth configuration or token-lifetime change is required. This does not lift the `auth2faRequest` deployment restriction.

See [Phone session stability](docs/PHONE_SESSION_STABILITY.md) for the native storage/startup failure paths and physical Android/iOS close/reopen checklist. Browser reloads and simulated bridge tests do not certify a physical phone. Publish the verified commit through Lovable Share → Publish only after the coordinated prerequisites, then verify the Despia manifest and cold-launch update. This guidance does not claim a production publish.

## Post/clip map-pin repair checkpoint (2026-10-05)

The exact new callable is **`manageMapPin`**, dependent on checked account-profile binding and post publication. Release its explicit owner area-sharing/removal controls, checked list/read consumers and both renderer opening paths with the matching Rules. Direct `map_post_pins`, `map_clip_pins`, `_map_pins`, `_map_pin_receipts` and `_map_pin_cursors` access is denied, including raw staff access. Old copied pin rows do not grant consent and are not auto-adopted. Story/event paths remain outside this stage.

Provision the `_map_pins` index `(kind ASC, status ASC, shared_at DESC, __name__ DESC)` and `_map_pin_cursors.expireAt` TTL (10-minute authority lifetime). Keep pin consent/tombstones and receipts durable without TTL. No new secret, Auth configuration, Storage change or provider call is required. See [Post/clip map-pin stability](docs/MAP_PIN_STABILITY.md) for source creation-version checks, current audience/location admission, exact retry semantics and remaining limits. Coordinate the complete client cutover before narrowing raw reads; this section does not deploy or publish production and does not lift the `auth2faRequest` restriction.

## Map Wave repair checkpoint (2026-10-05)

Deploy only the exact new callable **`manageMapWave`** and the changed **`onSocialNotificationCreated`** with the matching tested client and private Rules. Checked account-profile binding and location-sharing authority are prerequisites. Raw `map_wave` notification creation stays denied. `_map_wave_receipts` is durable without TTL; `_map_wave_cooldowns.expireAt` is eligible for cleanup after 24 hours, independent of its enforced 60-second pair cooldown. No new composite index, secret, Auth setting or Storage change is required. See [Map Wave stability](docs/MAP_WAVE_STABILITY.md).

Wave creates a confirmed **in-app bell notification only**. The changed trigger skips device lookup and external push for this type until a separate device-registration repair proves recipient ownership. Existing mutable token rows and client-controlled provider aliases are not that proof; generic push is unchanged and remains unverified. Roll out the trigger restriction before enabling the callable. This guidance is pending, does not publish production and does not lift the `auth2faRequest` deployment restriction.

## Squad Maps repair checkpoint (2026-10-05)

The exact new callable is **`manageMapSquad`**, dependent on checked account-profile binding and the existing location-sharing admission used by map highlights. Deploy its matching client and raw squad restrictions together; old direct `map_group_maps`/`map_group_members` clients are incompatible. Provision the two `_map_squad_members` indexes and `expireAt` TTL on `_map_squad_invites` (24 hours) and `_map_squad_cursors` (10 minutes), as specified in [Squad Maps stability](docs/MAP_SQUAD_STABILITY.md). Retain `_map_squads`, `_map_squad_members`, `_map_squad_receipts` and `_map_squad_recreations` without TTL. All six protected namespaces deny raw client access. Legacy owner review creates a new owner-only squad and preserves historical rows; do not bulk-adopt old membership. No new secrets, Auth settings or Storage changes. This is pending coordinated rollout guidance, not a deployment, and does not lift the `auth2faRequest` restriction.

## Login streak repair checkpoint (2026-10-05)

The checked streak repair adds the exact named callable **`manageLoginStreak`**, with the existing checked account-profile binding as a prerequisite. Release its matching client and Firestore restrictions together: direct `login_streaks`, `_login_streak_state` and `_login_streak_receipts` access is denied. Old raw-reading/writing clients are incompatible. The two private namespaces retain durable state and retry evidence; there are no new indexes, TTL policies, secrets or Auth settings. Historical rows are preserved for bounded display and do not grant restoration. Existing launch-free restoration stays free on the server. See [Login streak stability](docs/LOGIN_STREAK_STABILITY.md) for exact eligibility, calendar, legacy and verification limits. This is pending rollout guidance, not a deployed change, and does not lift the `auth2faRequest` restriction.

## Who deploys what

| Change type | Release path |
|-------------|--------------|
| React UI / `src/` | Tested commit on `origin/main`, then **Lovable → Share → Publish** |
| Cloud Functions | Build `functions/`, review exact exported names, then deploy only those named functions |
| Firestore / Storage rules and indexes | Review the full corresponding files, run relevant isolated emulator tests, then deploy only the required resource targets in the feature's documented order |
| Firebase Hosting staging frontend | Optional `hosting`-only deploy of `dist/`; does not publish `vybehub.app` |
| Play Store / Despia native shell | [PLAY_STORE_GUIDE.md](PLAY_STORE_GUIDE.md); binary changes are separate from web publish |
| Despia local server OTA | Lovable Publish updates `/despia/local.json`; verify native download and cold launch below |

Do not run bare `firebase deploy`, `firebase deploy --only functions`, or `npm --prefix functions run deploy`: that npm script deploys every function. `functions/src/index.ts` still exports pending implementations from `stubs.ts` (Runway, music-provider sync and auth email hook). The explicit live sign-in request was reviewed and the earlier `auth2faRequest` hold superseded **only for the four named services** in [the 2026-10-05 release record](releases/sign-in-20261005/README.md). Other historical exclusions below retain their original scope. Do not change authentication configuration or secret values as a side effect of a release. Publish only a client compatible with the checked deployed sign-in contracts; retain the Rules-service blocker and first-factor/legacy approval limitations in the handoff. First-factor server access remains an explicit MFA blocker.

The current stability checkpoint adds/changes these named resources: `manageSharedTheme`, `readMusicCatalog`, `phoneVerificationState`, `phoneVerifyRequest`, `phoneVerifyConfirm`, `auth2faVerifyPhone`, `authLoginApproval`, and the existing `matchContacts` dependency. Review prior pending Notes/theme resources in WORKLOG too. Deploy the theme reader and matching client with owner-only raw rules and `_shared_theme_cursors.expireAt` TTL; older clients that directly query public themes are incompatible. The TTL does not grant access: expired cursors are rejected immediately even before managed deletion. Phone resources require the existing Twilio secrets and real SMS QA; this release does not change their values or Auth provider settings. Approved preview media must be provisioned deliberately; never deploy local QA records as a music catalog. See [contact/phone contracts](docs/CONTACT_DISCOVERY.md) and [music preview limits](docs/MUSIC_PREVIEWS.md).

Publishing requires access to the appropriate project. Verify current access; do not assume it exists or claim a publish occurred because a build or push passed.

---

This follow-up also repairs existing sound uploads (`uploadSound`, `readSoundLibrary`), comments (`readPostComments`, `readPostCommentCounts`, `readCommentContext`, `managePostComment`) and DNA Apply/Undo (`dnaAutopilot`, `dnaAutopilotRevert`). Review their shared rules and named indexes together: public sound proof listing indexes, comments by parent/time, the existing DNA history index, `_sound_library_cursors.expireAt` and `_comment_cursors.expires_at` TTL policies. Keep private challenge, receipt, plan and cursor namespaces denied. Historical unproven comments/sounds are not automatically attested. Source-object/orphan retention and actual provider/native behavior need operational validation before production certification. No preview fixture or local mail sink belongs in a release.

## Pending existing-feature stability resources (2026-10-04)

No production deployment was performed for this checkpoint. Review these exact changed exports and their matching client before any rollout:

- Checked post reads: `readSocialPostList`, `readSocialFeed`, `readSocialPostPreviews`, `getRankedFeed`, `getRecommendations`, `calculateFeedRanking`, `sharePreview`, `mcp`, and `sitemapDynamic`. Broad signed-in raw post reads are now denied; only canonical owners and staff retain raw read access. The publication repair below additionally requires protected publication evidence for cross-user and public reads. Older unproven posts stay available to their currently claimed canonical owner for deliberate review; there is no bulk historical attestation. Older raw-reader clients are incompatible.
- Saved original audio: `manageSavedSounds` plus the changed `readSoundLibrary`/`uploadSound` module. Deploy the `_saved_sound_refs` owner/active/name index and matching private rules; old direct `user_saved_sounds` access is denied. See [sound contracts](docs/SOUND_UPLOADS.md).
- Account controls: `manageSignInPreferences`, `authSessionRevoke`, `manageNotificationPreferences`, and `muteSmartPings`. Matching rules, session/history indexes, and receipt/limit TTLs are required. See [account contracts](docs/ACCOUNT_SETTINGS_STABILITY.md). This does not lift the `auth2faRequest` deployment restriction or establish server-enforced MFA.
- Notification delivery dependencies: `sendPushNotification`, `sendBriefNotification`, `onDmMessageCreated`, `onConversationMessageCreated`, `onCallCreated`, `onSocialNotificationCreated`, `smartBriefPings`, and `smartPingDispatcher`. Each uses the shared checked preference authority; deploy together with the canonical settings endpoint. No real push/provider delivery was exercised during local QA.

Review the named indexes in `firestore.indexes.json`, including profile/sound/filter post ordering, bookmarks, tagged posts, pins, saved sounds, sessions and login history. New TTL fields are `_social_post_list_cursors.expires_at` and `expireAt` on `_notification_preference_requests`, `_sign_in_preference_receipts`, `_sign_in_preference_limits`, `_auth_session_revocations`, and `_auth_session_revoke_limits`. Expiration is checked before managed cleanup. Preserve earlier pending resources and private namespaces. Do not deploy the local wrapper, fixtures, or emulator configuration. Do not use a broad Functions deploy.

## Post publication and playback checkpoint (2026-10-04)

This is a coordinated compatibility change, not a standalone client release. See [Post publication stability](docs/POST_PUBLICATION_STABILITY.md) for the authority, historical review and retry contracts. No production deployment, Auth configuration change or real AI-provider call was performed for this checkpoint.

Review these exact exported function names. Shared helpers are compiled into their callers; deploying only `managePost` leaves older readers, game acknowledgement and reward paths on their previous authority.

| Changed boundary | Named Functions targets |
|---|---|
| Publication and observed playback | `managePost`, `recordPostView` |
| Feed, list, known-ID and public reads | `readSocialPostList`, `readSocialFeed`, `readSocialPostPreviews`, `getRankedFeed`, `getRecommendations`, `calculateFeedRanking`, `sharePreview`, `mcp`, `sitemapDynamic` |
| Comment parent admission | `readPostComments`, `readPostCommentCounts`, `readCommentContext`, `managePostComment` |
| Existing post AI metadata | `detectAiContent` — exact export casing; delayed results now require the same post/proof versions |
| Game acknowledgement, discard recovery and partner feed/gallery | `getGameCapture`, `completeGameCapture`, `discardGameCapture`, `gamePartnerApi` |
| Post-dependent rewards | `tokenMarketplace`, `incrementChallengeProgress`, `syncMyChallengeProgress`, `claimChallengeReward` |

The existing `createGameCapture`, `finishGameCapture` and `cleanupGameCaptures` endpoints, game registration/consent and Storage rules remain prerequisites for game uploads; this publication change does not replace their rollout checklist. Sound admission, protected following, filters and optional Vybe Check records must also have their matching existing authority deployed. Do not deploy unrelated exports just because they share a source module. In particular, **`auth2faRequest` remains excluded**; the separate email-confirmation release restriction above still applies to the combined client.

Release order for an explicitly reviewed publication rollout:

1. Build the Functions and matching client from the same tested commit. Review the complete Firestore rules/index files, inspect the currently deployed reader/game/reward versions, and arrange a controlled cutover: old raw writers and new strict reader DTOs are incompatible. Record that older unproven posts will disappear from other accounts until their owner deliberately reviews and republishes them. Do not seed proofs from mutable historical authorship fields.
2. Install required indexes and wait for readiness. The pin transaction uses `posts(author_id ASC, is_pinned ASC)`; retain the profile/sound/filter/type/time, bookmark and tagged-post ordering indexes used by checked readers. Install the new TTL policies `_post_view_receipts.expireAt` and `_post_view_limits.expireAt`, preserving the existing reader cursor TTLs. Review the full index target before applying it.
3. Deploy the reviewed named Functions in the table with explicit `functions:<export>` targets, then activate the reviewed Firestore restrictions before reopening the compatible client to users. These source rules deny every direct post create/update/delete, retain canonical-owner/staff raw reads, and deny client access to `_post_publications`, `_post_publication_receipts`, `_post_pin_state`, `_post_view_receipts` and `_post_view_limits`. Verify all named endpoints together; partial deployment is not completion of this boundary.
4. Publish the matching `origin/main` client through **Lovable → Share → Publish**, subject to the other pending prerequisites above. Confirm assets and native hydration as described below. Missing endpoints, stale DTOs or unavailable indexes must remain visible failures; do not add a raw-write/read fallback to keep an old client working.
5. Use designated test accounts to verify create/edit/pin/delete, an intentionally lost reply, stale revision rejection, staff removal, owner-only legacy review, conservative legacy audience, cross-account denial, current follower/block revocation, game acknowledgement, reward admission and playback counts. Verify both the client receipt and current server state. Local fixtures and successful builds do not certify deployed rules, provider behavior or native uploads.

Publication proofs, tombstones and mutation receipts have **no TTL**. Do not expire or delete them as cursor cleanup or rollback: they prevent reused post identities and stale requests from resurrecting content. Their storage and retention policy needs separate operational review. Playback receipts are different: they deduplicate one authenticated account/post per UTC hour; they are eligible for cleanup at the second hour boundary. View-limit records expire roughly two hours after their minute bucket. These are observed playback counters, not verified people or watch time.

Publication evidence binds account intent and fields, **not actual media bytes**. Optional Vybe Check and AI samples do not bind an immutable caption/media digest. Historical private or conflicting audience settings require explicit review and conservative recovery; do not turn them public as a migration shortcut. Previously delivered media URLs/bytes cannot be recalled by a new post rule. Retain these limitations in the release record.

## VybeMap and location-sharing checkpoint (2026-10-04)

See [Location sharing stability](docs/LOCATION_SHARING_STABILITY.md) for direction, precision, expiry, retry and legacy-data contracts. This is a coordinated compatibility cutover; no production deployment or real GPS sharing was performed. Review these exact Functions targets together: `manageLocationSharing`, `createLocationRequest`, `respondLocationRequest`, `stopLocationShare`, `pauseLocationShare`, `emergencyGhostMode`, `syncLocationShareSnapshots`, and `aggregateVybeHeatmap`. The existing wrappers now reject old unbound inputs. The snapshot job only expires/deletes bounded records; the heatmap job removes old global tiles and no longer publishes private coordinates. Do not deploy unchanged AI, notification or map intelligence exports simply because they share a source file.

Install the four `_location_requests`/`_location_grants` indexes listed in the linked document and wait for readiness. Then coordinate named Functions, reviewed rules and the matching **Lovable → Share → Publish** client. Raw current/legacy location rows, global heatmap tiles, and the new `_location_state`, `_location_grants`, `_location_requests`, `_location_receipts` namespaces are denied to clients. Private history retains canonical-owner create/read/delete access only. Old raw-reader/writer clients are incompatible. There is **no new location TTL**: do not delete revision state or durable receipts as cursor cleanup. Historical grants are not consent; fresh request/accept and separate live-sharing enablement are required. Missing endpoints/indexes must remain explicit failures, without a raw fallback.

The map remains **Mapbox 3D by default**: Standard style, globe, pitch and terrain. Explicit existing mode choices remain available; the flat OpenStreetMap view is an optional user-selected fallback. Provider or WebGL failure must show loading/error/Retry rather than silently switching the selected map. Validate the deployed `VITE_MAPBOX_ACCESS_TOKEN` or existing public client-token fallback against the actual web/native origins; a nonempty token does not prove authorization. Do not provision or change secrets as part of this checkpoint.

For renderer resource troubleshooting, the isolated QA policy in `vite.config.ts` currently permits these Mapbox network paths: `https://api.mapbox.com/v4/`, `/raster/v1/`, `/rasterarrays/v1/`, `/styles/v1/mapbox/`, `/fonts/v1/mapbox/`, `/models/v1/mapbox/`, `/mapbox-gl-js/`, `/map-sessions/v1`, plus `https://events.mapbox.com/events/v2`. It permits `blob:` workers and images; the explicit flat fallback uses `https://tile.openstreetmap.org`. These are the observed renderer requirements, not a production policy to copy wholesale: QA also allows loopback services and development script settings that must not ship. Review the actual hosted CSP/token origin restrictions separately, including native localhost hydration. Local QA intentionally leaves unrelated geocoding/directions and AI intelligence uncalled.

Verify initial load, mode changes during loading, Retry, unchanged friend/route overlays after style replacement, and paused/resumed camera follow. Verify location request/accept, separate GPS enablement, Ghost, pause/stop, approximate results, expiry and account changes using designated accounts. Already delivered coordinates cannot be recalled; current reads use a short access lease and latest samples expire independently of cleanup. Preserve the separate `auth2faRequest` deployment exclusion and all earlier pending resource requirements above.

## Map check-ins, places, meetups and private research checkpoint (2026-10-05)

See [Map social stability](docs/MAP_SOCIAL_STABILITY.md) for the checked API, legacy review, retry and read-lease contracts. This checkpoint changes exactly **`manageMapSocial`** (new), **`onMapMeetupCreated`** and **`researchMapLocation`**. Their matching client is incompatible with the former direct map writes/reads. This does not change the original Mapbox 3D renderer, approve a broad Functions deploy, or lift the separate `auth2faRequest` exclusion.

Install and wait for these new indexes: `map_meetups(status ASC, created_at DESC)` and `map_check_ins(user_id ASC, created_at DESC)`, retaining existing place-post/comment parent/time indexes. Install `_map_social_cursors.expireAt` TTL (10-minute cursors) and `map_location_intel.expireAt` TTL (seven-day private research cache). Both are cleanup policies; current admission uses a separate 15-second checked lease. Publication, membership, mutation and notification receipts are durable and have **no TTL**. Older global research rows without `expireAt` remain private and are not automatically cleaned or reused.

Build the Functions/client from the same tested commit, review the complete shared rules/index files, then coordinate the three named exports, reviewed restrictions and **Lovable → Share → Publish** in a controlled cutover. Rules deny all client access to `map_places`, `map_check_ins`, `map_place_posts`, `map_place_post_comments`, `map_meetups`, `map_meetup_members`, `map_location_intel`, and the private `_map_social_publications`, `_map_social_memberships`, `_map_social_receipts`, `_map_social_cursors`, `_map_social_notifications` namespaces. Do not reopen raw access to keep an old client working.

Unproven places/meetups remain owner-only until explicit source-revision-bound review/share; counters and historical memberships are not trusted. Other old map social rows are not automatically attested. Research derives admitted place coordinates/name, uses an exact actor/request-bound private cache and rechecks permission after awaits; its 120/minute checked-read quota is separate from 12/hour actual research. Verify lost replies, cross-owner counts, join/leave/rejoin, blocks/unfriend, expiry, legacy review, loading/retry, pagination and account/route retirement on designated accounts. The isolated backend used injected research only; real providers, media and native GPS/file permissions remain separate QA. Story/post/clip pin authority and squad-map membership are explicitly outside this checkpoint. Preserve all earlier pending releases; no production deployment was performed.

## Account profile setup and recovery checkpoint (2026-10-05)

See [Account profile stability](docs/ACCOUNT_PROFILE_STABILITY.md) before publishing this client. The new `ensureAccountProfile` and changed `claimProfileByEmail` require matching UID, current Auth account creation time, request ID and action; the old callable no longer accepts email/name/index hints as ownership authority. Existing uniquely UID-owned migrated profiles retain their exact ID. Ambiguous or changed-UID recovery needs independent historical review, a private approved record and explicit user confirmation. The read-only preparation script does not approve or apply a migration. Do not run the historical ownership repair/merge scripts to unblock a failed setup.

Coordinate both named Functions, reviewed Firestore rules and the matching **Lovable → Share → Publish** client. Direct profile creation and index writes are now server-only; older clients are incompatible. `_account_profile_bindings`, `_account_profile_recovery` and `_account_profile_receipts` are private and have **no TTL**; this checkpoint needs **no new composite index**. Preserve durable retirement and retry records. Do not delete them during rollback or ordinary cleanup.

Staff must complete checked profile setup before relying on late legacy role fallbacks. Their protected binding supplies the candidate without a redundant index read; winning profile/UID grants still check ownership and UID/profile collisions. Two formerly supported unbound cases now require setup: migrated `user_roles_auth` UID `owner` staff reads, and migrated `user_roles_auth` UID `admin` role writes. Both pass after checked binding. Keep these new prerequisites separate from the four inherited migrated late-alias admin/moderator read limits. Existing independent admin custom claims remain subject to retirement denial.

The shared `requireAdmin` retirement check also changes these consumers: `setAdminClaim`, `authQr`, `getAuthUsersCount`, `checkDebugSecrets`, `manageSecrets`, `awardBadge`, `revokeBadge`, `premiumGiftManage`, `checkPremiumSubscription`, `backfillDmInboxEntries`, `scrubProfileDateOfBirth`, `rebuildVybeScoreForUser`, `validateStripeConfig`, `processCreatorPayout`, `previewTransactionalEmail`, `handleEmailSuppression`, `adminAiBuilder`, `adminDebugTools`, `analyzeBugReport`, `analyzeError`, and `vybeCommander`. Review/update the currently deployed consumers with exact `functions:<export>` targets; a helper-only source change does not update a deployed caller. This is not permission to enable undeployed features, alter existing secret bindings or invoke providers. `manageSecrets` stays unimplemented, and **`auth2faRequest` remains excluded**. Other unchecked legacy callables still require an authority audit; this release does not promise universal token or account-incarnation enforcement.

Verify isolated Auth/Firestore ownership and exact prior/current Rules compatibility, then designated-account signup, migrated sign-in, OAuth, cold restoration, failure/retry, explicit recovery and onboarding return paths. A successful Auth signup with failed profile setup must remain a recoverable signed-in state. Source ownership snapshots are concurrency checks, not historical proof. Auth and Firestore are not an atomic system, and domain-specific UID-keyed data/entitlements may need separate recovery. Older raw UID membership paths are not all collision-aware; a client profile gate does not close those backend gaps. No production deployment, configuration change or real provider call was performed for this checkpoint.

The map follow-up preserves the selected mode's camera pitch through Wander, north reset and recenter. Users who explicitly choose the flat fallback can return through **Map settings → Return to 3D world map**. Saved alternate map modes are unchanged unless the user deliberately chooses 3D.

## Offline strategy (Despia Native default)

VYBE defaults to **Despia local server** (`@despia/local`) so Offline Support → **Native** works. The binary hydrates from `vybehub.app`, then boots from on-device `http://localhost`.

| Mode | Env | What it does |
|------|-----|--------------|
| **Despia local** (default) | `VITE_OFFLINE_MODE=despia-local` | Build emits `dist/despia/local.json` for Native offline |
| PWA | `VITE_OFFLINE_MODE=pwa` | Selects the client service-worker strategy; the build still emits `dist/despia/local.json` |

### Despia dashboard (Native)

1. App Start URL = **`https://vybehub.app`**
2. Offline Support → **Native**
3. **Lovable Publish** so `https://vybehub.app/despia/local.json` stays fresh
4. **Rebuild** the native binary once after flipping Native (status bar / offline settings are binary-side)

The repo includes `@despia/local`, but that does not prove the published manifest or installed binary is current. Verify the manifest and test a cold launch after publishing/rebuilding.

---

## Despia local server (native iOS / Android OTA)

VYBE uses [@despia/local](https://www.npmjs.com/package/@despia/local) so Despia can cache the web build on-device and serve it from `http://localhost` (cached shell startup). Network-backed features still need connectivity.

**Docs:** [Introduction](https://setup.despia.com/local-server/introduction.md) · [Reference](https://setup.despia.com/local-server/reference.md) · [Index](https://setup.despia.com/llms.txt)

### Already wired in this repo

| Piece | Location |
|-------|----------|
| Vite plugin | `vite.config.ts` → `despiaLocalPlugin({ outDir: 'dist', entryHtml: 'index.html' })` |
| Dependency | `package.json` → `@despia/local` |
| Build output | `dist/despia/local.json` (generated on every `npm run build`) |
| Production URL | https://vybehub.app/despia/local.json |

The manifest includes `entry`, `deployed_at`, and a sorted `assets` list. Despia compares `deployed_at` with the cached value to decide whether to download a new build.

### How updates reach native users

1. **First launch** — Despia hydrates from `vybehub.app` (HTML, CSS, JS, images, fonts only — no native binaries).
2. **Subsequent launches** — App boots from on-device localhost cache (fast, works offline).
3. **After Lovable Publish** — `deployed_at` changes → native app downloads the new build in the background → applies on a later cold launch after the download completes. Verify the installed build rather than assuming an exact number of launches.

**Web-bundle updates:** UI, routing and compatible use of existing native APIs can reach an installed Despia shell through its web update path. Verify the change on each affected native shell; this is not a guarantee of store-review exemption.

**Native-binary updates:** new native permissions, binary-side Despia settings and native plugin/code changes require rebuilding the affected shell and following its store release process.

### Despia dashboard checklist

Confirm in the Despia project (one-time, or when enabling local server):

- [ ] **Local server** enabled for VYBE
- [ ] Hydration / start URL points at **`https://vybehub.app`**
- [ ] Submit **one new store build** after enabling so the binary includes the on-device HTTP server

If local server is off in Despia, the app still runs in URL mode even though `despia/local.json` is published.

### Despia warning: “Native offline support requires…”

Despia shows this when it **cannot fetch a valid** `despia/local.json` from the URL configured in your Despia project, or when the web app is not a client-side SPA build.

**VYBE requirements (all met in repo):**

| Requirement | VYBE |
|-------------|------|
| Client-side SPA (not SSR-only) | Vite + React + `BrowserRouter` |
| `@despia/local` in build | `dependencies` + Vite plugin + `postbuild` script |
| Manifest at `/despia/local.json` | Generated on every `npm run build` |

**Most common fix — wrong URL in Despia:**

Set the Despia app / hydration URL to **`https://vybehub.app`** (production), **not** the Lovable preview URL (`*.lovableproject.com`). Preview URLs may redirect behind auth, so Despia’s validator never sees the manifest.

**Verify Despia can reach the manifest:**

```bash
curl -s https://vybehub.app/despia/local.json | head -3
```

Must return JSON with `entry`, `deployed_at`, and `assets` (HTTP 200, no login redirect).

After changing Despia URL or pushing plugin fixes: **Lovable Publish** once, re-check the curl command, then re-save / rebuild in Despia.

### Verify after Lovable Publish

```bash
curl -s https://vybehub.app/despia/local.json | head -5
# Also inspect /version.json and fetch its exact entry path; URLs do not expand wildcards.
```

Expect HTTP 200 and a fresh `deployed_at` timestamp.

### Force iOS to show a new web build (Despia TestFlight / store)

Despia Offline → **Native** boots from on-device `http://localhost` after hydrating from `vybehub.app`. Publish updates the remote manifest; the binary applies it on a **later cold launch**.

1. Confirm Publish landed: `curl -s https://vybehub.app/despia/local.json | head -3` → new `deployed_at`.
2. On the iPhone: **swipe up → force-quit VYBE** (not just background).
3. Reopen once (may still be old while OTA downloads in background).
4. **Force-quit again**, reopen — second cold launch usually applies the new pack.
5. Optional sanity: Safari → `https://vybehub.app` (not the app) to confirm the web change exists at all.

**MobileIntro / intro UX specifically:** once `vybe_intro_seen` is set, RootGate skips the intro. To re-test:

- Settings → Help → **Replay walkthrough**, or
- Bump `VYBE_INTRO_VERSION` in `src/lib/mobileIntroVersion.ts` (RootGate re-shows for logged-out users when the stored version mismatches), or
- Clear site data / reinstall.

**Logged-in users never see RootGate intro** (they go `/home`) — use Replay walkthrough.

### Cap Simulator vs Despia (different pipelines)

| Shell | What it loads | Does Lovable Publish update it? |
|-------|----------------|----------------------------------|
| **Despia** TestFlight / store (`com.despia.vybe`) | OTA from `vybehub.app` → on-device localhost | **Yes** (after download and a later cold launch; verify on-device) |
| **Capacitor Simulator** default | Bundled `dist/` from last `npx cap sync` | **No** — run `npm run build && npx cap sync ios` |
| **Capacitor** with `CAP_DEV=1` | Live `https://vybehub.app` | **Yes** (same as web; still force-quit / pull-to-refresh) |

Never assume Cap Simulator == TestFlight Despia.

### Play Console notes

- **APK size warnings** are mostly **native shell** code (Despia, WebRTC, RevenueCat, etc.), not the web bundle in the AAB.
- **Web publish** does not change the store binary size; it updates cached web assets via OTA.
- **Debug symbols** — upload native symbol zip from the Android release build (Despia automatic build or local `android/` gradle); see [Google Android deployment](https://setup.despia.com/deployment/google-android/automatic.md).

---

## Standard release

### 1. Review and verify the exact release

Read `WORKLOG.md`, inspect the current branch/diff and identify the client, callable, rules, indexes and native changes included. New feature work is currently deferred until the existing-functionality stability audit passes. Passing unit tests alone does not certify production parity or provider behavior.

Install as CI does (React 18 / `react-leaflet` peer resolution needs the flag):

```sh
npm ci --legacy-peer-deps
npm ci --prefix functions
```

Run the applicable checks from the repo root, including the full app checks after substantive changes:

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm run validate:boot
npm --prefix functions run build
```

CI uses Node 22; `functions/package.json` declares a Node 20 deployed runtime. Do not change the runtime as an incidental release step. Run feature-specific SDK/backend/rules checks when those paths change; [.github/workflows/ci.yml](.github/workflows/ci.yml) and the feature documents list additional checks. Manually test the affected flow in the isolated preview, including failure/retry and account boundaries. Do not point fixture-reset scripts at production or the retained interactive preview.

`npm run build` invokes `postbuild` and emits `dist/version.json`, the hashed app entry and `dist/despia/local.json`. Functions deploy from `functions/lib/index.js`; **`firebase.json` has no functions predeploy build hook**, so rebuild after every backend source change and review generated `functions/lib` changes before deployment.

Use ignored `.env.local` for local client configuration and the project's existing Lovable build environment for production `VITE_*` values. Confirm the production build targets `vybe-daaab` and is not in local-QA/emulator mode. `VITE_*` values are included in the browser bundle: never put Admin credentials or private provider secrets there. Server secrets belong in the existing Google Secret Manager/Firebase Functions configuration and must match the selected function's declared secret bindings. Missing secrets or provider configuration are release blockers for that flow, not permission to copy credentials into source.

### 2. Commit and sync to `main`

Update `WORKLOG.md` with changes, checks, known gaps and next actions. Commit only reviewed files. Lovable follows `main`, so pushing an arbitrary feature branch is insufficient:

```sh
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

Continue only if the ancestor check succeeds. If it fails, integrate current `origin/main`, resolve conflicts without dropping concurrent work, and repeat relevant checks. Then:

```sh
git push origin HEAD:main
git rev-parse HEAD
```

Never force-push. Confirm Lovable GitSync has the intended commit before publishing. If edits originated in Lovable, still identify and verify the resulting `main` commit.

### 3. Roll out named Firebase resources when required

Client-only changes need no Firebase deployment. For a backend change, record the exact target list and compatibility order before executing it. CLI access and deployed inventory can be checked without changing services:

```sh
npx firebase-tools login:list
npx firebase-tools projects:list
npx firebase-tools functions:list --project vybe-daaab
```

If no authorized account/project access is available, the unblock step is `npx firebase-tools login` with an account permitted to deploy `vybe-daaab`. Do not change Firebase Auth providers or app user accounts to fix CLI access.

Use the actual camelCase export names, including re-exports from domain modules; a client invocation or a file's existence does not prove an implementation is exported or deployed. Review the implementation, required indexes, secret bindings and current deployment before choosing it. The following are **separate examples of selective scope, not a batch to run**:

```sh
# Reporting release: requires the complete rollout review linked below.
npx firebase-tools deploy --project vybe-daaab --only functions:reportModeration

# Checked social reader release: deploy only if included in the reviewed release.
npx firebase-tools deploy --project vybe-daaab --only functions:readSocialFeed,functions:readSocialPostPreviews

# Draft admission release: compatible client/rules ordering is documented below.
npx firebase-tools deploy --project vybe-daaab --only functions:saveMiniAppDraft,functions:deleteMiniAppDraft
```

Named `--only` targets avoid replacing unrelated exports; see [Firebase's function deployment guidance](https://firebase.google.com/docs/functions/manage-functions#deploy_functions). Do not deploy the pending exports to make a scanner green. Missing implementations and unavailable providers remain explicit gaps.

Rules and index targets are also separate release operations:

```sh
npx firebase-tools deploy --project vybe-daaab --only firestore:indexes
npx firebase-tools deploy --project vybe-daaab --only firestore:rules
npx firebase-tools deploy --project vybe-daaab --only storage
```

Each command applies the corresponding complete checked-in configuration, not just the lines changed for one feature. Review unrelated pending changes too. Wait for required indexes to become ready before relying on queries. Rules deployments overwrite the corresponding remote rules; follow the [Firebase CLI partial-deploy guidance](https://firebase.google.com/docs/cli#partial_deploys).

The release order is feature-specific; do not apply one blanket ordering:

- [Mini-app drafts and publication](docs/MINI_APPS.md): deploy tested draft callables, publish the compatible client, then install reviewed Firestore restrictions. Include `publishMiniApp` only when that implementation is part of the reviewed release; verify source conflicts, deletion/retry, publication receipts and quotas.
- [Reporting and moderation](docs/REPORT_AUTHORITY.md): coordinate callable, indexes, client and rules. Resolve evidence/audit retention requirements before production rollout. Historical `content_flags` records are not the verified report queue; unavailable or rejected callable submissions must remain visibly unconfirmed.
- [Post publication and reads](docs/POST_PUBLICATION_STABILITY.md): follow the named dependency table and coordinated cutover above. Preserve publication receipts/tombstones, deploy the matching checked reader DTOs and view TTLs, and leave historical recovery explicit and owner-scoped.
- [First-party game SDK](docs/GAME_SDK.md) and [partner API](docs/PARTNER_GAME_API.md): include matching Firestore/Storage authority and cleanup functions before enabling integrations. Registration, CORS, scoped consent, expiry/revocation, cleanup capacity and actual upload/download tests remain separate prerequisites. A built SDK is not a deployed integration.

Record actual CLI results, project, targets, date/time and the tested commit. A local source change, emulator pass or unauthenticated HTTP response does not prove the deployed function version matches that commit.

Optional Firebase Hosting staging release (still uses the production backend unless the build explicitly targets an isolated environment):

```sh
npx firebase-tools deploy --project vybe-daaab --only hosting
```

This publishes `dist/` and the `firebase.json` hosting configuration. Inspect its function rewrites and verify their targets already exist. It does **not** publish `vybehub.app` or update the production Despia hydration URL.

### 4. Publish the web client through Lovable

After any prerequisite backend steps and GitSync verification:

1. Open the [VYBE project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7).
2. Use **Share → Publish**.
3. Wait for the build/publish result and confirm `vybehub.app` still belongs to that project.
4. Inspect [version.json](https://vybehub.app/version.json) and [despia/local.json](https://vybehub.app/despia/local.json). Compare the reported commit, entry path and build/manifest timestamps with the intended release; fetch the exact entry asset to verify it exists.

If `version.json` has an unknown/stale commit, do not infer parity from a fresh timestamp alone: compare build assets and record the uncertainty. Recheck the app after clearing browser cache or using a fresh test window, and follow the native cold-launch steps above for installed Despia apps.

### 5. Verify production behavior and record limits

Use designated test accounts and content for the affected release:

- Landing/login, sign-in/sign-out and account changes; verify password reset through the existing Firebase flow when auth-related paths changed.
- Home, Following and Local feeds with expected visibility/locality; confirm errors are distinguishable from empty results.
- Relevant create/upload/comment/DM flows, including retry, private-data boundaries and media playback.
- Mini apps, games/mod capture consent and provider-backed features if included; test the real deployed path rather than a mocked transport.
- Native app cold launch and the same affected flow on each changed OS; a web-only pass does not certify native permissions, return links or codecs.

For a debug scan, `npm run debug` includes configured Firebase probes. A read-only public health check is available at `https://us-central1-vybe-daaab.cloudfunctions.net/sharePreview?health=1`. A health response proves endpoint availability only. Likewise, callable `UNAUTHENTICATED` proves an auth gate responded; it does not prove signed-in success, rules correctness, provider configuration or current code. Test Firestore/Storage permissions with isolated synthetic fixtures and reviewed account-scoped flows, not by loosening production rules.

Record the publish date/time, commit, exact deployed targets, manual observations and any failures in `WORKLOG.md`. State client publication, backend deployment and native verification separately.

---

## Rollback

**Web:** revert the faulty change in Git, verify the revert with current `main`, push without force, and publish through Lovable. A previously published build may also be restored if Lovable offers that option. Verify the restored assets and native refresh; cached native bundles do not change instantly.

**Functions:** rebuild the compatible known-good implementation and redeploy only its reviewed named targets. Preserve required newer callables while clients transition. Do not delete functions or replace unrelated auth exports as an incidental rollback.

**Rules/data:** prefer a forward fix that preserves access controls. Review the entire rule file before redeploying. Do not reset production Firestore, delete receipt/identity ledgers or run historical migration scripts as a generic rollback. Older clients may be incompatible with newer restrictive rules; for example, rolling back the mini-app client alone after draft rules change prevents legacy saves/deletes.

**Mobile:** a web rollback does not undo native permissions, plugins or binary settings. Rebuild/release the affected native shell when its binary changed.

---

## Before saying “deployed”

1. The tested commit and exact resource scope are recorded in `WORKLOG.md`.
2. Local checks and affected-flow verification passed, with remaining gaps stated.
3. Actual Firebase deployment results are recorded for changed backend resources, or explicitly marked not deployed.
4. Lovable Publish succeeded and production assets match the intended client release, or explicitly marked not published.
5. Production smoke tests and affected native checks are recorded separately; source availability is not runtime certification.

If access is missing, report the concrete next step: **Lovable → Share → Publish** for the web client, or **`npx firebase-tools login` with authorized project access** for named Firebase resources. Do not report either step as completed until verified.
