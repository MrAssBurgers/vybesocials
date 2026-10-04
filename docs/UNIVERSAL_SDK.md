# VYBE integration SDK for apps, games, mods and tools

Native .NET 8 game/mod/tool hosts can now use the compiled [C# partner library](../sdk/dotnet/README.md). It supports device consent, private image/video staging, same-key retries, status, discard and revocation without Firebase credentials. It is a local NuGet pilot, not engine certification or a Unity/Mono-compatible assembly; native overlays, engine adapters and gallery parity remain follow-up work.

VYBE's partner protocol is usable by any registered application, game, game mod or tool that can call HTTPS and supply an encoded image or video. The new `sdk/universal` facade supplies a consistent host lifecycle around that protocol. This is a locally buildable pilot package, not a published registry package or a claim of native-engine certification.

It provides explicit account linking, private capture upload, retry with the original media, capture status/discard, connection revocation and official VYBE browser entry points. It now includes an opt-in [embedded capture gallery](PARTNER_CAPTURE_GALLERY.md) for trusted host UI. A general social feed, messages, automatic posting, native overlay implementation and browser-frame authentication bridge remain separate work. Open VYBE in the user's browser for full browsing and publishing.

## Build and run the real file-picker example

From the repository in PowerShell:

```powershell
npm run build --prefix sdk
node sdk/examples/file-picker/serve.mjs
```

Open `http://127.0.0.1:4176`. The static server binds loopback and serves an exact file allowlist; it does not proxy requests or browse the filesystem. It makes no provider/API call by itself. Stop it with Ctrl+C.

The first screen asks the operator to edit `sdk/examples/file-picker/config.js` with a registered public client ID and fixed HTTPS `gamePartnerApi` endpoint. No token, password or Firebase session belongs in that file. The example remains unconfigured until those values are supplied; it does not fake a successful connection. Existing partner backend deployment and registration requirements are in [PARTNER_GAME_API.md](PARTNER_GAME_API.md). Do not enter production credentials to test the SDK.

After configuring an authorized environment, the user explicitly clicks **Connect VYBE**, opens the official consent page and matches the displayed code and publisher. They then choose an image/video, upload for review and open the private review page. Retry uses the same prepared draft. Cancel stops the current local action. Discard and Disconnect require actual server acknowledgements. The host capture adapter in this example reads an already encoded file; a mod can replace it with its host's screenshot/replay API. No network call or browser opening occurs on mount.

The browser example renders the capture gallery locally and uses an external tab for consent and review, never an authenticated embedded iframe. It removes `window.opener` before navigating. File selection is explicit; there is no filesystem scan, screen recording or camera permission request.

## Local distribution

```powershell
# Run from the repository; work/ is an ignored local artifact directory.
New-Item -ItemType Directory -Force work | Out-Null
npm pack ./sdk --pack-destination ./work

# Run in your separate app or mod host project, using the actual archive path:
npm install C:/path/to/vybe-integration-sdk-0.1.0-pilot.tgz
```

The private package is `@vybe/integration-sdk`, version `0.1.0-pilot`. It includes dependency-free ESM JavaScript and TypeScript declarations; no CommonJS export is supplied. `prepack` uses this repository's pinned TypeScript compiler and does not download tools. The archive includes compiled SDK files and its README, not the example configuration, Firebase adapter or any credentials. No package is published by these commands.

Exports:

| Import | Purpose |
| --- | --- |
| `@vybe/integration-sdk` | New host-neutral `VybeIntegration`, host/draft types and errors |
| `@vybe/integration-sdk/gallery` | Opt-in browser/overlay capture gallery |
| `@vybe/integration-sdk/partner` | Existing `VybePartnerClient` HTTP API |
| `@vybe/integration-sdk/game` | Existing transport-neutral first-party `VybeGameClient` |

Existing repository `sdk/game` imports remain compatible. The backend registry is still named `game_integrations`; protocol fields such as `gameId` and the consent route `/connect/game` remain unchanged. For a mod, register its actual publisher and client ID; do not borrow the base game's identity or imply its endorsement. Registration is manual in this pilot. The optional gallery adds explicit media-preview consent; existing two-scope integrations remain compatible.

## Host adapter

```ts
import { VybeIntegration, type HostCapture } from '@vybe/integration-sdk';

const vybe = new VybeIntegration({
  clientId: 'your-registered-mod',
  apiBaseUrl: FIXED_TRUSTED_PARTNER_ENDPOINT,
  host: {
    openExternal(url) {
      // Called only by openLink/openReview/openVybe, directly from a user action.
      return modHost.openExternalBrowser(url);
    },
    async capture({ signal }): Promise<HostCapture> {
      // Implement using the host's supported export API; respect its permissions.
      const png: Uint8Array = await modHost.exportScreenshot({ signal });
      return { media: png, contentType: 'image/png', caption: 'A great moment' };
    },
    onDispose(callback) {
      // Return the host's listener cleanup function.
      return modHost.onExtensionDisabled(callback);
    },
  },
});
```

`modHost` and `FIXED_TRUSTED_PARTNER_ENDPOINT` are integration placeholders, not built-in engine APIs. `openExternal` is required and must reject if opening fails. `capture` and `onDispose` are optional. If the host has no unload event, call `vybe.dispose()` explicitly on teardown. If no capture adapter exists, pass bytes to `prepareCapture({media, contentType, caption, tags})` instead.

Keep the adapter and API configuration in trusted host code. A mod sandbox or renderer must not be able to supply arbitrary URLs, API endpoints, request headers or bearer tokens through an unrestricted IPC bridge. The facade only constructs HTTPS navigation URLs on `vybehub.app`; it does not accept a general-purpose navigation URL or follow a receipt's supplied URL. The underlying API rejects redirects, omits cookies, and keeps device/access secrets in private memory.

## Deliberate linking and upload

```ts
// Connect button:
const link = await vybe.beginLink();
showCode(link.userCode, link.expiresAt); // your UI
const awaitingConsent = vybe.waitForLink();

// A separate user click opens the official consent URL:
await vybe.openLink();
await awaitingConsent;

// Capture button, after consent:
const draft = await vybe.captureFromHost();
const cancel = new AbortController();
const receipt = await vybe.stageCapture(draft, {
  signal: cancel.signal,
  onCaptureReserved: id => rememberPublicCaptureId(id),
  onPhase: phase => showPhase(phase),
});

// Review button: nothing above published a post.
await vybe.openReview(receipt.captureId);
// A later retry uses exactly this draft, never a newly captured frame:
// await vybe.stageCapture(draft, { signal: freshController.signal });
```

The separate button/UI functions are host code. The runnable example wires these steps to actual controls. `beginLink()` cancels this instance's previous pending operations, forgets its previous local authorization and releases its old drafts. It does not revoke the old connection on the server. Never automatically open consent or review pages on a timer, receipt callback or mount.

`captureFromHost` requires current consent before invoking the host. Preparation snapshots media and metadata, generates one random key and binds the draft to the current connection. The draft exposes only its key, byte size, MIME type and `dispose()`. Changing the original bytes/caption cannot change a retry. A new link, expired authorization, released draft or another integration instance cannot reuse the draft. Call `draft.dispose()` when no longer needed; that only releases local media and does not cancel an already running upload or delete remote content. Use an AbortController for active work and `discardCapture(id)` for explicit remote discard.

Drafts are memory-only. Unload/process restart cannot recover these facade drafts or credentials; do not claim durable background delivery. Hosts needing their own reviewed persistence can use the lower-level partner client with its documented immutable input/idempotency contract. Current partner access lasts at most ten minutes and has no refresh token; a new connection cannot resume the old connection's capture namespace. An already allocated capture may still be reviewable by its owner in VYBE.

## Lifecycle and truthful outcomes

- `dispose()` is idempotent: abort pending operations, suppress late progress/results, release drafts, forget local authorization and unregister the host listener. It performs no network request. An uncooperative encoder may continue running in its host after cancellation, but its eventual result is ignored.
- `revokeConnection()` explicitly requests server revocation and clears local authorization even if the response is lost. A failed response is not confirmation of revocation; the user can revoke through VYBE's Connected games settings.
- `getCapture(id)` and `discardCapture(id)` retain the existing connection-bound server checks. Local cancellation cannot retract an already accepted request. Retrying an uncertain upload uses the same live draft, or reads the saved capture ID if available.
- Upload progress measures bytes. Only a confirmed `ready` receipt means private review is available. Only `imported` means the user already published in VYBE. The facade has no publish method.
- Host callback failures use fixed `VybeIntegrationError` messages. API failures retain `VybePartnerError` code/status/retryAfter. Do not log raw request headers or bodies from a custom Fetch adapter.

Supported payloads remain PNG/JPEG/WebP/MP4/WebM, 12 bytes through 48 MiB. Hashing and snapshot buffers add memory overhead. The host supplies permission handling, capture/encoding, codec compatibility, audio policy, display/input integration and a safe browser opener. This release does not certify Unity, Unreal, Godot, Fabric/Forge, Lua mod hosts, consoles or physical devices. The existing Unity source example uses first-party Firebase authentication and must not be copied into an untrusted partner mod.

## Validation and remaining work

Focused facade tests use the real partner client with controlled HTTP responses: explicit official navigation, secret-free links, original-byte retry, rejection of foreign/released/old-account drafts, malformed media, unavailable service recovery, callback-triggered unload, stale host results, polling replacement, explicit revoke and disposal. These are protocol/lifecycle regressions, not claims of live partner deployment. Existing partner protocol tests continue to cover checksums, endpoint/redirect guards, backoff and consent errors.

The local package is built and its compiled exports/TypeScript declarations checked. A registered staging endpoint, current backend rollout and actual host integration still need end-to-end certification. The capture gallery now has its own explicit media-read permission. General social-feed embedding and native/mod-specific adapters remain separate work; full VYBE browsing opens externally without exposing the user's Firebase session.
