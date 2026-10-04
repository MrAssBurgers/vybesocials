# VYBE Integration SDK — local pilot package

Native .NET 8 hosts can use the separate compiled [C# partner client](https://github.com/MrAssBurgers/vybesocials/blob/main/sdk/dotnet/README.md) for device consent, private capture upload, retry/status, discard, revocation and an opt-in capture gallery. It has no Firebase dependency. Engine/mod-loader certification and older Unity/Mono compatibility remain outstanding.

This package supplies account consent, private image/video upload and explicit VYBE browser entry points for apps, games, mods and tools. It has no Firebase runtime dependency and never publishes a post on behalf of the user. The user reviews and publishes inside VYBE.

Build from this repository with `npm run build --prefix sdk`. Create a local distribution with `npm pack ./sdk --pack-destination ./work`; this package is private and has not been published to a registry. It provides ESM JavaScript and TypeScript declarations, with no CommonJS export. Install the resulting archive in a host project. Browser hosts need Fetch, AbortController, Blob and secure-context Web Crypto; Node hosts require Node 22 or newer.

```ts
import { VybeIntegration } from '@vybe/integration-sdk';

const vybe = new VybeIntegration({
  clientId: 'your-registered-mod',
  apiBaseUrl: 'https://YOUR_FIXED_ENDPOINT/gamePartnerApi',
  host: {
    openExternal: url => platform.openExternal(url),
    capture: ({ signal }) => platform.getEncodedCapture({ signal }),
    onDispose: listener => platform.onUnload(listener),
  },
});
```

The `platform` above is your trusted host adapter, not an SDK dependency. Call `beginLink()` from Connect, display the public code, call `openLink()` only on a user action, and await `waitForLink()`. After approval, `captureFromHost()` prepares an immutable draft; `stageCapture(draft)` uploads it for review. Retry the same draft. `openReview(receipt.captureId)` and `openVybe()` are explicit user actions. Call `dispose()` on unload; it cancels local work and forgets credentials, but does not imply server revocation or undo a request already accepted.

`@vybe/integration-sdk/partner` exports the existing `VybePartnerClient`; `/game` exports the existing first-party transport-neutral `VybeGameClient`. The Firebase adapter and Unity source example remain separate repository integrations, not part of this dependency-free package. Third-party mods must use partner device consent, never Firebase user tokens.

See the repository's `docs/UNIVERSAL_SDK.md` and runnable `sdk/examples/file-picker` app for the complete lifecycle. A registered integration and reviewed backend rollout are required. Server DTOs and consent pages still use game naming for compatibility. The optional `/gallery` export mounts a private capture gallery in trusted browser/overlay UI when the client requests `previewCaptures: true`. It makes no request on mount; users explicitly load and preview their connection's own captures. Call gallery.clear() before relinking and gallery.dispose() on unload. See docs/PARTNER_CAPTURE_GALLERY.md for consent, HTTP limits and privacy behavior. General in-game social feeds, messaging, capture codecs, native overlays and engine/device certification remain separate work.

Optional JavaScript public browsing is available with `browsePublicFeed: true` and `await vybe.browsePublicFeed({ contentType: "post", signal })` after explicit consent. Requires a registered public-feed capability. See [public browsing and cleanup requirements](https://github.com/MrAssBurgers/vybesocials/blob/main/docs/UNIVERSAL_SDK.md#optional-public-browsing-javascript-pilot). Import mountPublicFeed from @vybe/integration-sdk/feed for the optional web-host browsing panel. The separate .NET 8 client supports public browsing; native host UI remains separate.


A concrete Godot 4.5.1 .NET desktop capture example is available at [sdk/examples/godot](https://github.com/MrAssBurgers/vybesocials/tree/main/sdk/examples/godot). It compiles and passes local engine/headless lifecycle checks; rendered panel/gameplay PNG readback is verified locally; the full engine-to-Vybe upload walkthrough remains unverified. See its README before adapting it.
