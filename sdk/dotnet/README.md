# Vybe for .NET games, mods and tools

This pilot library targets **.NET 8** and has no third-party runtime packages or Firebase dependency. It is a separate partner integration from the trusted first-party Unity/Firebase example. It has not been certified in Unity, Unreal, Godot, console platforms or any mod loader. A .NET 8 host is required; this assembly is not a drop-in Unity/Mono package.

Build and verify from the repository root:

```sh
dotnet build sdk/dotnet/Vybe.Integration/Vybe.Integration.csproj -c Release
dotnet run --project sdk/dotnet/Vybe.Integration.Checks -c Release
dotnet pack sdk/dotnet/Vybe.Integration/Vybe.Integration.csproj -c Release -o work/dotnet-package
```

The NuGet package is local only, not published to a registry. Add a project reference or install the resulting package from a local package source. Use a fixed, trusted partner endpoint and your registered public client ID. Never accept either from uploaded content, chat, or untrusted mini-app code. Never embed a service account, Firebase user token, password or client secret.

```csharp
using Vybe.Integration;

using var vybe = new VybeClient(trustedPartnerEndpoint, registeredClientId);
// Run from an explicit Connect button. Display UserCode and let the player
// choose to open VerificationUriComplete using your host's external browser API.
var link = await vybe.StartLinkAsync(cancellationToken);
ShowConnectCode(link.UserCode, link.VerificationUriComplete);
var connection = await vybe.WaitForAuthorizationAsync(cancellationToken);

// Run after the player chooses the encoded screenshot/video and confirms upload.
// Keep this key and exact bytes/metadata for retrying an uncertain result.
var key = Guid.NewGuid().ToString("N");
var capture = await vybe.StageCaptureAsync(encodedMediaBytes, "image/png", key,
    caption: "My latest adventure", tags: new[] { "gaming" },
    onReserved: receipt => RememberPendingCapture(receipt.CaptureId),
    cancellationToken: cancellationToken);
ShowReviewButton(capture.ReviewUri); // Explicit player action; never auto-open/publish.
```

`ShowConnectCode`, `RememberPendingCapture` and `ShowReviewButton` are your host UI methods. The SDK itself opens no windows, records no gameplay, accesses no local files and publishes no social post. Supply already-encoded PNG/JPEG/WebP/MP4/WebM, 12 bytes through 48 MiB. Captures are private until the player reviews and publishes in Vybe. Backend signature checks are not full codec validation or malware scanning.

Progress callbacks (`preparing`, `uploading`, `verifying`, `ready`) and the reservation callback run inline on the async continuation, **not necessarily on your game's main thread**. Marshal UI work to the host dispatcher and do not throw from callbacks. Do not block the render loop with `.Result` or `.Wait()`. Memory is snapshotted before upload; allow up to 48 MiB of additional media memory plus transport overhead.

## Recovery and lifetime

- One client represents one player connection. A new link, local clear, or disposal invalidates previous in-flight results. Switching players must clear/dispose the old client; call `RevokeAsync` when the player explicitly disconnects. `ClearLocalAuthorization` only forgets local credentials and does not revoke on the server.
- Pass cancellation tokens when a scene, upload panel, or game session ends. `Dispose` cancels active transport and waits. Local clear/relink rejects old results but does not undo a request already accepted by the server. A failed/cancelled upload can still have a private reservation or ready capture; retain its ID/key, check status and offer retry/discard.
- `GetCaptureAsync(id)` resolves uncertain finish results; `DiscardCaptureAsync(id)` discards an unpublished capture. Published captures return a conflict and are managed in Vybe. Cancellation/discard does not refund quotas.
- Retry uses the same key, bytes, caption and tags on the same connection. Relinking creates a different connection and cannot adopt the previous connection's captures. Review older captures in Vybe. Do not silently create a fresh key after an uncertain response.
- Bearer/device credentials remain private in process memory and expire in at most ten minutes. No refresh token exists. Authorization receipts do not contain credentials. There is no persistence API. Avoid HTTP body/header logging or memory dumps in production.
- Transient upload/status calls retry at most twice, respecting the longer body/header Retry-After. Waits above 60 seconds are returned to the host; surface `RetryAfterSeconds` to the player. Device polling follows the server interval and stops at link expiry. Token exchange is one-time: a lost response may require a new link.
- Errors use sanitized `VybeException.Code`, `Status`, `RetryAfterSeconds`; underlying server/transport messages are discarded. Caller cancellation uses standard `OperationCanceledException`, disposal uses `ObjectDisposedException`. If revoke fails, local credentials are still cleared, but server revocation is **unconfirmed**; use Vybe Settings to disconnect.
- Production transport requires HTTPS, rejects redirects, disables cookies/default credentials, caps JSON at 256 KiB and times out each complete response after 30 seconds. Explicit HTTP loopback is for emulator tests only. Never disable TLS certificate validation.

The pilot includes capture linking/upload/status/discard/revoke and an optional private capture gallery. It also supports optional public discovery browsing (below). Personal/private feeds, messages, recording codecs, a native game overlay and engine-specific lifecycle adapters remain incomplete. See [the universal integration guide](https://github.com/MrAssBurgers/vybesocials/blob/main/docs/UNIVERSAL_SDK.md) and [partner API protocol](https://github.com/MrAssBurgers/vybesocials/blob/main/docs/PARTNER_GAME_API.md) for registration, consent and rollout limits. Production backend/client deployment remains a separate release step.

## Native capture gallery (0.2 pilot)

The existing three-argument constructor still requests only upload/status permission. To offer media previews, explicitly opt in before starting a new connection:

```csharp
using var vybe = new VybeClient(trustedPartnerEndpoint, registeredClientId,
    allowInsecureLoopback: false, previewCaptures: true);
// Use the same explicit link/code/approval flow above. Vybe shows the additional permission.
var page = await vybe.ListCapturesAsync(cancellationToken: cancellationToken);
// Display receipt text, then load more using page.NextCursor, even for an empty page.
// Never download media merely because a row is listed. Wait for the player's Preview action.
using var preview = await vybe.GetCapturePreviewAsync(selectedCaptureId, cancellationToken);
await vybe.CheckCapturePreviewAsync(selectedCaptureId, cancellationToken);
ShowEncodedPreview(preview.Bytes, preview.Capture.ContentType);
// Keep this lease alive only while visible. Stop playback and dispose decoded host
// textures/buffers on close, hide, scene unload, account change, failed recheck or expiry.
```

`ShowEncodedPreview` is your host's trusted decoder/player, not part of the library. Use safe supported image/video decoders, plain caption text, explicit playback controls and no autoplay/audio takeover. Marshal UI/engine operations onto the main thread. This is a receipt/media API for native UI, not a ready-made game overlay or engine binding.

- Lists require status permission; preview bytes and HEAD checks require the additional `capture:preview` grant. The exact granted scope set must match the request. A new link sees only its own connection's captures. Published originals are unavailable here; offer an explicit official Review action.
- Pages contain at most 20 receipts ordered by ID, not newest-first. Follow the opaque cursor through empty pages; reject non-progressing/malformed pages. Clear host-owned receipt lists on account changes. No disk caching is provided.
- Downloads read one bounded 8 MiB chunk at a time, validate MIME, byte counts, ranges and a consistent digest, then verify the assembled SHA-256 before exposing bytes. At most one preview download can run per client. A new download clears the previously retained preview. These calls do not retry media transfers automatically; surface failures and cooldowns to the player. Allow up to 48 MiB retained media plus one 8 MiB chunk and transport/decoder memory.
- `CapturePreview` owns a shared encoded buffer. `Dispose`, replacing it, local clear, relink, discard, revocation, client disposal, or a failed access recheck zero that buffer. Its expiry timer and `Bytes` getter enforce the authorization deadline. Accessing a disposed/expired lease throws `ObjectDisposedException`. Do not race rendering against disposal: handle teardown on the host UI thread, stop playback first, and release decoded copies too.
- Recheck with `CheckCapturePreviewAsync` before playback, on resume and every 15 seconds while visible; clear host UI on any error. It returns no media. Respect `RetryAfterSeconds`, especially during rate limits. Revocation cannot recall bytes or decoded textures the host copied already. SDK memory cleanup is not a security boundary against code in the same process. Never expose this client to untrusted mod scripts or mini-app code.
- Dispose/cancel when a scene or panel closes. Relink/local clear rejects late downloads; a request already accepted by the server may finish. Clear old host UI immediately, and wait for an in-flight preview cancellation to finish before requesting another.

## Local backend verification

After starting and seeding the isolated preview described in `docs/LOCAL_PREVIEW_QA.md`, build the checks above, then run `node scripts/qa/test-dotnet-preview.mjs` with these exact environment values: `GCLOUD_PROJECT=demo-vybe-preview`, `FUNCTIONS_EMULATOR_HOST=127.0.0.1:5101`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8280`, `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9399`.

The fixture registers only the synthetic `local-dotnet-mod`, explicitly approves all three scopes as demo Alice through the real callable, and drives the compiled public client over HTTP. It checks upload, normalized metadata, same-key recovery, status, its own gallery, exact preview bytes/digest, HEAD revalidation, discard and preview clearing on revocation. It leaves one private synthetic ready capture for browser review and writes its loopback URL to ignored `work/dotnet-preview/result.json`. Each run consumes local quotas; it does not reset them. No social post is published and no production target is accepted.

Transport behavior follows Microsoft's [SendAsync cancellation guidance](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.sendasync?view=net-8.0) and [redirect control](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclienthandler.allowautoredirect?view=net-8.0); the same cancellation deadline covers streaming the response body.

## Public browsing (0.3 pilot)

The previous constructors keep their original capture permissions. Use the explicit five-argument overload to request public browsing; the registry must also enable `public_feed_enabled`.

```csharp
using var vybe = new VybeClient(trustedPartnerEndpoint, registeredClientId,
    allowInsecureLoopback: false, previewCaptures: false, browsePublicFeed: true);
// StartLinkAsync and WaitForAuthorizationAsync: player reviews feed permission.
var page = await vybe.BrowsePublicFeedAsync("post", cancellationToken: cancellationToken);
RenderPlainTextPosts(page.Posts);
if (page.NextCursor != null) {
    var next = await vybe.BrowsePublicFeedAsync("post", page.NextCursor, cancellationToken);
}
```

Omit content type for all supported types; supported values are post, short and video. Preserve the selected type while paging. PublicFeedPage contains the connection, effective expiry, cursor and immutable collections of typed posts/authors. Responses must match the active connection and filter; exact fields, safe rating, HTTPS media URLs, collection/string limits, unique posts and non-repeating cursors are checked. Feed responses are bounded at 8 MiB; other JSON remains limited to 256 KiB. Parsing accepts only the one-second token expiry rounding discrepancy and caps at the earlier local deadline.

No media is downloaded by this method. Render captions/names as text; request media only on explicit selection with no partner bearer attached. Cancel reads when the view closes. Clear all host-retained posts and media on disconnect, expiry, account changes or unload; read-only records cannot erase copies retained by host code. Late results after local authorization changes are rejected. Remote revocation is enforced on subsequent API requests, not by recalling earlier content. On feed_changed, clear the cursor and refresh. Safe labels are metadata, not an independent safety guarantee.

A guarded `--feed-emulator` mode in the compiled checks targets only demo-vybe-preview at loopback 5101/8280. It requires the synthetic local-feed-mod registry/profile fixture and explicit code approval; it performs a real feed read and revokes in finally. It is separate from the existing capture emulator walkthrough and never configures production.


A concrete Godot 4.5.1 .NET desktop capture example is available at [sdk/examples/godot](https://github.com/MrAssBurgers/vybesocials/tree/main/sdk/examples/godot). It compiles and passes local engine/headless lifecycle checks; rendered panel/gameplay PNG readback is verified locally; the full engine-to-Vybe upload walkthrough remains unverified. See its README before adapting it.
