# Existing clip native foreground continuity

Tested source: `3fb5e216e36f2bb52f8d709e166fe9f546b768e0`. Publication job: `ae58994c-75c6-4495-b44c-4eaa314c1a00`.

Newly mounted clip cards previously forgot a native pause delivered before their mount, allowing loading/playback in a background WebView that still reported visible. Both existing mobile and desktop cards now consume the existing shared foreground phase. Their own autoplay, mute and explicit pause policies remain unchanged. No new feature, Firebase backend, Rules, Auth, user content or location changes.

Two added hook regressions fail before the fix and pass afterward. All four visibility and ten buffering recovery checks pass. Full tests: 4,771 pass, six skipped; app/native build, type checks and bundle limits pass. Lint has zero errors and five existing warnings. Browser verification exercised the actual visibility hook with synthetic native events: pause, remount remains ineligible, resume becomes eligible. This does not certify physical phone video playback or performance.

The hosting UI confirmed “Your website was updated.” Canonical production metadata, runtime dependency versions, entry bytes and nine route entry references match the tested source. The secondary Lovable address redirects to the canonical domain; it is not independent hosting-origin evidence. See `verification.json`. Mounted old clients and real phone location, clips, session/network behavior remain open checks.
