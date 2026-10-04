# Embed a VYBE capture gallery in an app or mod

The universal SDK can display the current connection's private captures inside a trusted browser app, game overlay or mod WebView. Users can load their captures, preview an image or video, and explicitly open VYBE to review or publish. This is a capture gallery, not a Home feed, messaging API or native-engine certification. General social browsing still needs a viewer-aware feed contract and a separately reviewed host bridge.

## Use the gallery

For native .NET 8 hosts, the [C# pilot](../sdk/dotnet/README.md#native-capture-gallery-02-pilot) offers `ListCapturesAsync`, `GetCapturePreviewAsync` and `CheckCapturePreviewAsync`. It verifies the assembled media digest and exposes a disposable encoded-buffer lease. The host supplies its own native UI/decoder and clears decoded copies on lifecycle changes. The browser component below remains the ready-made WebView UI option.

```ts
import { VybeIntegration } from '@vybe/integration-sdk';
import { mountCaptureGallery } from '@vybe/integration-sdk/gallery';

const vybe = new VybeIntegration({
  clientId: REGISTERED_CLIENT_ID,
  apiBaseUrl: FIXED_TRUSTED_ENDPOINT,
  previewCaptures: true,
  host: YOUR_TRUSTED_HOST_ADAPTER,
});
const gallery = mountCaptureGallery(document.getElementById('vybe-gallery')!, vybe);
// Use the normal explicit beginLink / openLink / waitForLink flow.
// Mounting performs no request and opens no window.
// Before replacing the account/host, clear synchronously:
gallery.clear();
// On actual teardown:
gallery.dispose();
vybe.dispose();
```

The uppercase values above are integration configuration, not SDK globals. The runnable `sdk/examples/file-picker` example wires capture, consent, gallery and teardown together. Configure only its public registered client ID and fixed backend endpoint. Its checked-in configuration remains unset; no production endpoint is implied.

The component uses open Shadow DOM for style isolation and accessibility tooling. This is not a security boundary against the host. Mount it only in trusted host UI; do not share its renderer with untrusted mod scripts, remote pages or user-generated executable content. It does not create an iframe or accept `postMessage`, tokens in URLs, Firebase sessions or arbitrary navigation commands. Native bridges, origin-checked frame embedding, capture codecs and physical game/mod certification remain separate work.

## Permission and backward compatibility

Default clients continue requesting `capture:write` and `capture:status`. `previewCaptures: true` requests those two plus `capture:preview`. The server stores that exact request on the device record. The consent page shows media preview in its permission list and sends the reviewed `approvedScopes` on approval. Old consent clients that omit this acknowledgement cannot approve preview access. Unknown, duplicate, incomplete or unexpectedly changed scopes are rejected. Tokens inherit the approved scope set, never a new permission added silently during exchange.

Preview access lasts no longer than the existing ten-minute connection. Relinking creates a separate capture namespace; it does not expose the account's previous captures or another app's content. Listing uses `capture:status`; bytes and access rechecks require `capture:preview`. Connected-game settings show the additional permission. Revocation stops subsequent reads; bytes a recipient has already received cannot be recalled.

## HTTP and SDK contract

Every private call uses `Authorization: Bearer <opaque partner token>`, no cookies, and `Cache-Control: private, no-store`. Tokens and private Storage paths never appear in responses or URLs.

| Operation | Contract |
| --- | --- |
| `GET /v1/captures?cursor=<optional capture ID>` | `{captures, nextCursor}`; at most 20 receipts, ordered by capture ID; only this connection's rows. |
| `GET /v1/captures/:id/preview?chunk=0` | One verified binary chunk, at most 8 MiB; zero-based index 0–5. |
| `HEAD /v1/captures/:id/preview` | 204 only while current preview authority remains valid. No media bytes. |
| `vybe.listCaptures({cursor?, signal?})` | Validates and projects the bounded receipt page. |
| `vybe.getCapturePreview(id, {signal?})` | Loads validated receipt metadata, then ordered chunks into one in-memory Blob. |
| `vybe.checkCapturePreview(id, {signal?})` | Checks current access without downloading the media again. |

An empty page may have a next cursor when scanned rows expired or were discarded. Continue using that cursor. Do not treat it as authority or persist private pages to shared disk. The gallery exposes Load more for this case. Published captures display their status and an explicit VYBE action; original media is unavailable through this preview API after publication. Deleted/expired/discarded captures are excluded or denied.

Chunk responses include exact `Content-Length`, `Content-Type`, `Content-Range` and `X-Capture-SHA256`. The SDK bounds body reads as they arrive, checks offsets/total size/MIME, and requires a matching whole-file checksum identifier across chunks. It rejects redirects, wrong lengths, non-progressing cursors, foreign receipts and late results after an account change. JSON bodies are bounded while streaming too. The 8 MiB response size stays below [Firebase HTTP response limits](https://firebase.google.com/docs/functions/quotas) while retaining the existing 48 MiB capture limit. This release fetches and verifies the full stored object for each requested preview chunk; it favors verification over bandwidth efficiency. Preview GETs are limited to 12/minute/account, in addition to the shared API limit.

The server checks current token, connection, registration, capture ownership/status and publication before downloading. Storage reads pin the object's generation and verify MIME, size, file signature and whole-file checksum. It repeats authorization after the read and before returning bytes. The upload assembler now writes verified ordered chunks to a create-only destination rather than relying on a compose operation unsupported by the local emulator. The same bounded write runs in production and tests; no emulator-only success path exists. Peak memory and deployed throughput still require staging measurement.

## Private UI lifecycle

No preview loads automatically. The gallery uses text nodes for captions, an image or non-autoplaying video backed by a Blob URL, and one visible preview at a time. It revokes that URL on close, page hiding, account change, reload/error or disposal. Access is rechecked every 15 seconds while a preview is visible; failed checks clear private content. The local account is checked every second, and host connection controls clear synchronously. Browser scheduling can delay timers. Pending results are ignored after cancellation; no durable background persistence is promised.

The gallery has rounded surfaces, visible keyboard focus, 44px controls, polite status messages and reduced-motion styling. It does not take over the game's audio or autoplay clips. The host owns its native focus, input capture, pause behavior and unload hook.

## Verification and release

Tests cover explicit additional consent, old-client denial, account/connection isolation, pagination through expired rows, changed metadata/bytes, multi-chunk assembly, concurrent completion, current publication, revocation during actual Storage reads, stalled/oversized responses, private DOM cleanup and stale results. `scripts/test-partner-gallery-backend.mjs` runs only on isolated demo emulators, never the retained interactive preview. It is included in Creator Platform Rules QA.

Deploy only the reviewed partner API/consent changes with the updated consent UI and SDK after staging validation. Existing two-scope clients remain compatible. No production deployment, public package publication, real partner registration or engine certification is part of this source checkpoint.
