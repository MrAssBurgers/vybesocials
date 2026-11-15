# Existing-app QA and inbox repairs — 2026-11-14

This is an ongoing whole-app audit, not a claim that every feature is perfect.

## Client repairs

- Reviewed and merged Lovable candidate `6eb9a99a` while preserving current main and the separately published shared-preview recovery.
- Inbox actions capture the initiating account/session before queued work begins. Optimistic updates, rollback, read clearing, lock/archive and preference writes use exact owned profile/UID/session keys. Retired controls and callbacks cannot update a later account incarnation.
- Pin/mute labels, edited message text and refreshed peer profiles now update without requiring a new message. The actual browser exposed stale derived preview rows; three regression cases reproduced and now cover those failures.
- Navigation titles follow the incoming route. Lazy outgoing page cleanup no longer overwrites Search or Clips, and unread tab badges follow current metadata. Tab flashing respects reduced motion.
- Removed five unused lint suppressions in the reviewed Lovable candidate. No visual redesign or new feature was added.

## Verification

| Area | Evidence |
| --- | --- |
| Complete unit suite | 535 files passed, one skipped; 5,188 tests passed, six skipped; 242.86 seconds with four workers |
| Client checks | Typecheck, lint (zero warnings/errors), build, boot/native entry validation, CSS and bundle budget passed |
| Build size | app-DNofLTLy.js: 857.7 KB raw / 261.6 KB gzip, below existing 1125/335 KB budgets |
| Actual local UI | Synthetic signed-in message send; pin → Unpin, mute → Unmute, read clearing; Search/Clips navigation titles; mobile action sheet screenshot in ignored work/inbox-controls.jpg |
| Actual Firebase SDK/HTTP | 58 checks: message send/dedup/ownership (5), game capture bytes/private access (7), story replay/audience/removal (7), Storage proxy bytes/metadata/access (10), private community attachment and current membership/privacy (6), DM members (12), call history (11) |
| Production backend | Two exact live-baseline rule optimizations activated and read back; fresh owner Messages reload has no new captured warning/error |

The five existing integration scripts were rerun against the final combined live-baseline rules candidate, not just the broader pending root rules. Fixtures and credentials stay in demo-vybe-preview. No production content or user settings were edited for these tests.

## Remaining work

- Current production preflights: checkPremiumSubscription returns 403 without CORS; tokenMarketplace, tokenMarketplace2 and checkStreamSubscription return 404. Reachable OPTIONS do not establish authenticated functionality.
- Complete the remaining real signed-in feature journeys and provider integrations, including payments, external OAuth, AI/media generation, notifications, calling, maps/location and moderation. Keep real-user communications, spending and sensitive permissions within the user's authorization.
- Verify actual Android/iOS installation, cold launch, lifecycle, keyboard, GPS, camera/microphone, push and sustained media/animation performance. Browser/emulator tests and Lovable web publication cannot certify the native binary.
- Review dependency audit findings separately; no blanket dependency upgrade was applied.

Initial client source `4185e9cf556663317f2247a1e206936ae9a3e295` was published through Lovable deployment `42bb4262-5c75-482e-80a3-c5b9a03f8a7b`. At 2026-11-15T00:35:16.069Z the public verifier confirmed exact source fingerprint `0fb931dabcb2252b48ec49e1ceaac6cb028700776a173720266c6aa57cdae0ea` / 2655 files, matching source parts/config/public files and runtime dependencies, the published entry hash, ten route shells and all 709 native manifest assets. See `verification-public.json`. A normal signed-in browser reload and navigation showed the corrected Search title. The later inbox polish release is recorded separately.
