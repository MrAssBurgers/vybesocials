# Inbox follow-up QA — 2026-11-14

The continuing browser audit found recent chats displaying “You: You:” because a server-formatted projection was treated as raw message text. Projection stubs now retain their formatted display text explicitly; actual messages beginning with “You:” remain unchanged.

Archiving the final synthetic conversation showed a success toast but left the row visible. Settled empty results now clear retained rows. Known hidden, trashed and locked IDs are excluded from both projection and legacy rows, including their retained display rows during refresh. Archive optimism updates the viewer's exact hidden-ID cache; rejected writes restore its prior value and row without overwriting a later cache replacement.

Retained/deferred inbox rows are bound to user/profile/session epoch. Projection responses are scoped during render and callbacks, reject foreign viewer rows, accept confirmed empty snapshots, and cannot overwrite a fresh subscription with a late initial fetch. This covers consumers such as Search that do not remount with the main inbox account boundary.

## Verification

- Two prefix regressions failed before repair; raw literal text already passed. Four empty/account-retention regressions also failed before their repair.
- Full final suite: 537 files passed, one skipped; 5,204 tests passed, six skipped; 212.08 seconds with four workers.
- Typecheck, lint, production build, boot/native entry, CSS and bundle budget pass. Entry app-Bm1quQse.js: 857.8 KB raw / 261.6 KB gzip.
- Actual demo Firebase Auth/sendDmMessage and the actual server rebuildConversationInbox generated the preview. Browser Search displayed exactly “You: Preview prefix repair”. Archive with projection enabled removed the final row and then displayed “No chats yet”.
- Synthetic archive markers were removed after the walkthrough. Demo rollout configuration is restored after visual evidence is saved. No production content, settings or preferences were changed.
- Read-only production browser: two consecutive clips played with readyState4 while off-screen videos paused; 390px document width had no horizontal overflow. This is a bounded browser observation, not a sustained performance or physical-device certification.

## Remaining work

The complete app audit remains active. Subscription/marketplace reachability, remaining provider/permission journeys, native lifecycle/performance and dependency audit findings remain open as listed in the earlier QA record. The demo has both UID and profile membership aliases; rebuilding projections revealed a pin/mute preference reconciliation concern to test before certifying reload persistence. No unreviewed backend rollout was included.

Publication and exact public source/native delivery will be recorded after verification.
