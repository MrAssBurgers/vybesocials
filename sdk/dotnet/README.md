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

The pilot includes capture linking/upload/status/discard/revoke. It does not yet include the optional capture-gallery preview scope, a general social feed, messages, recording codecs, a game overlay or engine-specific lifecycle adapters. See [the universal integration guide](https://github.com/MrAssBurgers/vybesocials/blob/main/docs/UNIVERSAL_SDK.md) and [partner API protocol](https://github.com/MrAssBurgers/vybesocials/blob/main/docs/PARTNER_GAME_API.md) for registration, consent and rollout limits. Production backend/client deployment remains a separate release step.

## Local backend verification

After starting and seeding the isolated preview described in `docs/LOCAL_PREVIEW_QA.md`, build the checks above, then run `node scripts/qa/test-dotnet-preview.mjs` with these exact environment values: `GCLOUD_PROJECT=demo-vybe-preview`, `FUNCTIONS_EMULATOR_HOST=127.0.0.1:5101`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8280`, `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9399`.

The fixture registers only the synthetic `local-dotnet-mod`, approves its code as demo Alice through the real callable, and drives the compiled public client over HTTP. It checks upload, normalized metadata, same-key recovery, status, discard and revocation. It leaves one private synthetic ready capture for browser review and writes its loopback URL to ignored `work/dotnet-preview/result.json`. Each run consumes local quotas; it does not reset them. No social post is published and no production target is accepted.

Transport behavior follows Microsoft's [SendAsync cancellation guidance](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.sendasync?view=net-8.0) and [redirect control](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclienthandler.allowautoredirect?view=net-8.0); the same cancellation deadline covers streaming the response body.
