I found the most likely crash source: the recent APK push fix calls native Despia push commands too aggressively. Despia’s current docs say native push registration happens automatically at launch; the app should only link the logged-in user with `setonesignalplayerid://`. Our code currently also calls `registerpush://` and can auto-open phone settings from app boot, which can make the APK look like it crashes or instantly exits.

Do I know what the issue is? Yes, enough to make a targeted fix: remove the unsupported/unsafe native push bridge call and stop launching settings automatically on boot. Then harden the calling path separately so video/audio call setup is safer on Android.

Plan:

1. Fix APK crash from push setup
   - Remove `despia('registerpush://')` from the push toggle flow.
   - Keep only the documented `setonesignalplayerid://?user_id=...` call on authenticated loads.
   - Stop `DespiaOneSignalSync` from opening Android settings automatically during app startup.
   - Make the push toggle explicitly check permission and show a clean message if disabled, without force-opening settings unless the user taps enable from settings.
   - Make Despia detection consistent (`despia` or `vybeapp`) and wrap all native bridge calls with safe guards/timeouts so a native bridge failure cannot crash React.

2. Fix native push delivery targeting
   - Update the backend push sender to use Despia’s documented OneSignal targeting format for native APK users: `include_external_user_ids: [userId]`.
   - Keep web push delivery for browser/PWA tokens.
   - Ensure fake marker tokens like `despia:<id>` are not parsed as web push JSON or deleted as invalid web tokens.
   - Keep Smart Pings / Daily Brief notifications deep-linking into `/p/:id`, stories, or the brief view.

3. Harden call connection for APK smoothness
   - Keep `stopCameraStream()` before call startup.
   - Add defensive checks before `navigator.mediaDevices.getUserMedia` so unsupported/missing Android WebView media APIs fail gracefully instead of crashing.
   - Keep Android/Despia staged media startup: audio first, then video upgrade.
   - Reduce video upgrade constraints on APK to mobile-safe defaults instead of jumping to 1280x720 immediately.
   - Add clearer call connection states and timeout handling so users see “connecting/retrying” instead of a dead screen.

4. Verify call signaling and fallback behavior
   - Check P2P signaling setup for race conditions around ready/offer/answer.
   - Ensure incoming call records, realtime subscriptions, and polling fallback all still work.
   - Keep LiveKit/persistent fallback for failed P2P where configured, but show a clean error if backend call-room secrets are missing.

5. Add lightweight crash diagnostics for native-only failures
   - Add safe console/error breadcrumbs around native push setup and call media setup.
   - Ensure these errors are captured by the existing bug report system without causing another crash.

Testing I can run after approval:
   - Browser/app regression checks for settings push toggle UI.
   - Static verification of the Despia/native bridge calls.
   - Backend function checks for push payload shape.
   - Call flow code checks for audio/video media setup and signaling.

What I cannot fully test from the sandbox:
   - A real two-device APK call connection with microphone/camera hardware.
   - Android OS-level notification permission prompt behavior.

After I apply this, you’ll need to rebuild/hot-update the APK in Despia. If using a local Capacitor build, pull the latest code and run `npx cap sync` before rebuilding.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>