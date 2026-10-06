# Mobile media recovery — 2026-10-06

An active clip now retries a network download failure immediately once, instead of waiting for an online/visibility event. Repeated failure still stops automatic retries and offers the existing Retry control. Unsupported/decoder errors, inactive clips, manual pause, hidden pages and offline playback are excluded. The actual card regression now verifies this automatic recovery.

Unresolved Firebase media URLs retry when the native app resumes, including when the WebView does not emit a visibility change. Existing current-source, enabled, foreground, online and teardown guards remain.

Verification: both new reproductions failed before the fixes; full suite 4609 passed / 6 skipped, types and lint passed (five existing warnings), build and native-manifest validation passed. The added actual location-hook regression verifies reconnect requests a fresh GPS sample for an already-approved stationary share without changing consent.

Manual Chrome check used the actual MobileShortCard and location hook with synthetic loopback video/GPS/account. A test button injected MediaError code 2; playback resumed at readyState 4 with no real decoder error. Native pause released the video source and stopped playback; native resume restarted playback and fresh synthetic positioning. Screenshot: `outputs/vybe-mobile-download-recovery-check.png` in the parent workspace. This is desktop browser evidence, not physical-phone codec/FPS/network proof.

Read-only production review: six location services ACTIVE and no ERROR entries in the checked manageLocationSharing log window. Firestore f7be92e5 and Storage a6aa1032 baselines unchanged. No backend, Auth configuration, credentials, GPS permission or sharing-consent changes. Retained live IAB is still running old app-CGCcULTp.js and its friend-location retry remains unverified. The reported phone auth/network-request-failed and smooth playback are still open; device/app-vs-browser clarification pending.

Exact client publication and public source/entry verification are pending. Existing legacy-account/content restoration remains a separate required part of the active goal.
