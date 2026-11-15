# Inbox follow-up QA — 2026-11-14

The continuing browser audit found recent chats displaying “You: You:” because a server-formatted projection was treated as raw message text. Projection stubs now retain their formatted display text explicitly; actual messages beginning with “You:” remain unchanged.

Archiving the final synthetic conversation showed a success toast but left the row visible. Settled empty results now clear retained rows. Known hidden, trashed and locked IDs are excluded from both projection and legacy rows, including their retained display rows during refresh. Archive optimism updates the viewer's exact hidden-ID cache; rejected writes restore its prior value and row without overwriting a later cache replacement.

Retained/deferred inbox rows are bound to user/profile/session epoch. Projection responses are scoped during render and callbacks, reject foreign viewer rows, accept confirmed empty snapshots, and cannot overwrite a fresh subscription with a late initial fetch. This covers consumers such as Search that do not remount with the main inbox account boundary.

Concurrent main `3dab96c` was merged before publication. Its delayed-code login recovery, lighter mobile authentication rendering, acknowledged membership writes, private cache keys and captured mutation wrapper are preserved. Archive optimism now uses that wrapper's exact user/profile/session hidden key and the existing guarded hide service. Both sets of regression tests pass together; the merged client is revalidated below.

## Verification

- Two prefix regressions failed before repair; raw literal text already passed. Four empty/account-retention regressions also failed before their repair.
- Full final merged suite: 540 files passed, one skipped; 5,229 tests passed, six skipped; 212.05 seconds with four workers.
- Typecheck, lint (zero warnings/errors), production build, boot/native entry, CSS and bundle budget pass. Entry app-Cl8cSmra.js: 858.6 KB raw / 262.0 KB gzip.
- Actual demo Firebase Auth/sendDmMessage and the actual server rebuildConversationInbox generated the preview. Browser Search displayed exactly “You: Preview prefix repair”. Archive with projection enabled removed the final row and then displayed “No chats yet”.
- Synthetic archive markers were removed after the walkthrough. Demo rollout configuration is restored after visual evidence is saved. No production content, settings or preferences were changed.
- Read-only production browser: two consecutive clips played with readyState4 while off-screen videos paused; 390px document width had no horizontal overflow. This is a bounded browser observation, not a sustained performance or physical-device certification.

## Remaining work

The complete app audit remains active. Subscription/marketplace reachability, remaining provider/permission journeys, native lifecycle/performance and dependency audit findings remain open as listed in the earlier QA record. The demo has both UID and profile membership aliases; rebuilding projections revealed a pin/mute preference reconciliation concern to test before certifying reload persistence. No unreviewed backend rollout was included.

## Verified publication

Source `55714c551606356411d530620d7d32a4147c7934` was published through Lovable deployment `d0521fae-7da9-4eb7-8d91-9d2dab20bda3`. At 2026-11-15T01:05:52.392Z, vybehub.app served exact tested fingerprint `fa929d413cf2084fd853d4f2e92d940128c8adc469ae889b93ed52a8d6035153` / 2661 files. Source parts/config/public/runtime identity, the published entry digest, ten route shells and all709 native manifest assets passed. See `verification-public.json`.

Hosted entry `/assets/app-BKKtcdAT.js` has SHA256 `e108a5db2efec54d511976a491173998dc35aebbebefdc722708fe7312975526`; native deployed_at is `1794704692261`. The hosting build's entry differs from the local build; its exact source/runtime identity and own entry hash are verified.

Fresh signed-in production Search displayed the recent conversations with “You: VYBE”, replacing the earlier observed “You: You: VYBE”, and retained its correct title. Evidence screenshot is kept locally in ignored `work/live-search-repaired.jpg`; no private conversation image is committed. Temporary QA tab closed and viewport overrides reset. Physical shell adoption and the wider remaining audit are still open.
