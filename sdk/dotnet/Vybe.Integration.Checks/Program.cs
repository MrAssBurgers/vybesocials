using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Vybe.Integration;

if (args.SequenceEqual(new[] { "--emulator" })) { await EmulatorCheck.Run(); return; }
if (args.Length != 0) throw new Exception("Unknown check mode");

var count = 0;
async Task Test(string name, Func<Task> run) { await run(); count++; Console.WriteLine("PASS " + name); }
void Assert(bool condition) { if (!condition) throw new Exception("Check failed"); }
async Task Error(string code, Func<Task> action)
{ try { await action(); } catch (VybeException error) { Assert(error.Code == code); Assert(!error.ToString().Contains("SECRET")); return; } throw new Exception("Expected " + code); }

await Test("reject unsafe endpoints, client ids and path injection", async () =>
{
    foreach (var url in new[] { "http://example.test", "https://user:SECRET@example.test", "https://example.test?SECRET", "https://example.test/#SECRET", "file:///tmp/api" })
        await Error("invalid_request", () => { using var client = new VybeClient(url, "qa-game"); return Task.CompletedTask; });
    await Error("invalid_request", () => { using var client = new VybeClient("https://example.test", "qa-game\n"); return Task.CompletedTask; });
    await Error("invalid_request", () => { VybeClient.GetReviewUri(new string('a', 48) + "\n"); return Task.CompletedTask; });
});
await Test("link projects public data and reconstructs official URLs", async () =>
{
    using var f = new Fixture(); f.Handler.Add(_ => Fixture.Json(f.Device())); var link = await f.Client.StartLinkAsync();
    Assert(link.VerificationUriComplete.AbsoluteUri == "https://vybehub.app/connect/game?code=ABCD-2345");
    Assert(!JsonSerializer.Serialize(link).Contains("vyd_"));
    f.Handler.Add(_ => Fixture.Json(f.Token())); var auth = await f.Client.WaitForAuthorizationAsync();
    Assert(auth.ConnectionId == Fixture.Connection && f.Delays.SequenceEqual(new[] { 5d }));
    Assert(!JsonSerializer.Serialize(auth).Contains("vyp_")); Assert(f.Client.Authorization == auth);
});
await Test("device schema and token scopes fail closed", async () =>
{
    using var f = new Fixture(); var bad = f.Device(); bad["verificationUri"] = "https://example.test/SECRET";
    f.Handler.Add(_ => Fixture.Json(bad)); await Error("invalid_response", () => f.Client.StartLinkAsync());
    f.Handler.Add(_ => Fixture.Json(f.Device())); await f.Client.StartLinkAsync();
    var token = f.Token(); token["scopes"] = new[] { "capture:write", "capture:write" };
    f.Handler.Add(_ => Fixture.Json(token)); await Error("invalid_response", () => f.Client.WaitForAuthorizationAsync()); Assert(f.Client.Authorization == null);
});
await Test("pending, slowdown and Retry-After headers control polling", async () =>
{
    using var f = new Fixture(); f.Handler.Add(_ => Fixture.Json(f.Device())); await f.Client.StartLinkAsync();
    f.Handler.Add(_ => Fixture.Json(new { error = "authorization_pending" }, 400));
    f.Handler.Add(_ => { var response = Fixture.Json(new { error = "slow_down", retryAfter = 6 }, 400); response.Headers.RetryAfter = new(TimeSpan.FromSeconds(12)); return response; });
    f.Handler.Add(_ => Fixture.Json(f.Token())); await f.Client.WaitForAuthorizationAsync(); Assert(f.Delays.SequenceEqual(new[] { 5d, 5d, 12d }));
});
await Test("polling expires without another request", async () =>
{
    using var f = new Fixture(); var device = f.Device(); device["expiresIn"] = 5; f.Handler.Add(_ => Fixture.Json(device)); await f.Client.StartLinkAsync();
    await Error("expired_token", () => f.Client.WaitForAuthorizationAsync()); Assert(f.Handler.Requests == 1);
});
await Test("relink invalidates late code response", async () =>
{
    using var f = new Fixture(); var release = new TaskCompletionSource<HttpResponseMessage>();
    f.Handler.AddAsync((_, _) => release.Task); var old = f.Client.StartLinkAsync();
    f.Handler.Add(_ => Fixture.Json(f.Device())); await f.Client.StartLinkAsync(); release.SetResult(Fixture.Json(f.Device()));
    await Error("authorization_changed", () => old);
});
await Test("concurrent poll is rejected and caller cancellation clears link", async () =>
{
    using var f = new Fixture(); await f.Start(); using var cancel = new CancellationTokenSource();
    var entered = new TaskCompletionSource(); f.DelayOverride = async (_, token) => { entered.SetResult(); await Task.Delay(Timeout.Infinite, token); };
    var polling = f.Client.WaitForAuthorizationAsync(cancel.Token); await entered.Task;
    await Error("invalid_request", () => f.Client.WaitForAuthorizationAsync()); cancel.Cancel();
    try { await polling; throw new Exception("Expected cancellation"); } catch (OperationCanceledException) { }
    await Error("invalid_grant", () => f.Client.WaitForAuthorizationAsync());
});
await Test("chunked snapshot upload validates hashes and ignores server review URL", async () =>
{
    using var f = new Fixture(); await f.Connect(); var source = new byte[VybeClient.ChunkBytes + 12]; Random.Shared.NextBytes(source); var snapshot = source.ToArray();
    var release = new TaskCompletionSource<HttpResponseMessage>();
    f.Handler.AddAsync(async (request, _) =>
    {
        var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
        Assert(body.RootElement.GetProperty("contentSha256").GetString() == Fixture.Hash(snapshot)); return await release.Task;
    });
    var receipts = new List<CaptureReceipt>(); var phases = new List<string>();
    var upload = f.Client.StageCaptureAsync(source, "video/mp4", "snapshot_key", onReserved: receipts.Add, onProgress: value => phases.Add(value.Phase));
    Array.Fill(source, (byte)0);
    for (var i = 0; i < 2; i++)
    {
        var index = i; f.Handler.AddAsync(async (request, _) =>
        {
            var chunk = await request.Content!.ReadAsByteArrayAsync(); Assert(chunk.SequenceEqual(snapshot.Skip(index * VybeClient.ChunkBytes).Take(VybeClient.ChunkBytes)));
            Assert(request.Headers.GetValues("X-Chunk-SHA256").Single() == Fixture.Hash(chunk)); Assert(request.Headers.Authorization?.Parameter == Fixture.AccessToken);
            return Fixture.Json(new { index, byteSize = chunk.Length, sha256 = Fixture.Hash(chunk) });
        });
    }
    f.Handler.Add(_ => Fixture.Json(f.Receipt("ready", snapshot.Length, "video/mp4")));
    release.SetResult(Fixture.Json(f.Receipt("uploading", snapshot.Length, "video/mp4"))); var result = await upload;
    Assert(result.ReviewUri.AbsoluteUri == "https://vybehub.app/game-capture/" + Fixture.Id && receipts.Count == 1);
    Assert(phases.SequenceEqual(new[] { "preparing", "uploading", "uploading", "verifying", "ready" }));
});
await Test("lost finish acknowledgement retries same capture without republishing", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => Fixture.Json(f.Receipt("uploading")));
    f.Chunk(); f.Handler.Add(_ => throw new HttpRequestException("SECRET")); f.Handler.Add(request => { Assert(request.RequestUri!.AbsolutePath.EndsWith("/" + Fixture.Id + "/finish")); return Fixture.Json(f.Receipt("ready")); });
    Assert((await f.Client.StageCaptureAsync(new byte[12], "image/png", "retry_key")).Status == "ready"); Assert(f.Delays.Last() == .25);
});
await Test("already-ready retry skips all media transfer", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => Fixture.Json(f.Receipt("ready")));
    Assert((await f.Client.StageCaptureAsync(new byte[12], "image/png", "retry_key")).Status == "ready"); Assert(f.Handler.Requests == 3);
});
await Test("bad chunk acknowledgement stops before finish", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => Fixture.Json(f.Receipt("uploading")));
    f.Handler.Add(_ => Fixture.Json(new { index = 0, byteSize = 12, sha256 = "wrong" }));
    await Error("invalid_response", () => f.Client.StageCaptureAsync(new byte[12], "image/png", "retry_key")); Assert(f.Handler.Requests == 4);
});
await Test("Unicode tags and trimmed metadata match backend normalization", async () =>
{
    using var f = new Fixture(); await f.Connect(); var receipt = f.Receipt("ready"); receipt["caption"] = "hello"; receipt["tags"] = new[] { "遊戲", "𝔄" };
    f.Handler.AddAsync(async (request, _) =>
    {
        using var data = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
        Assert(data.RootElement.GetProperty("caption").GetString() == "hello" && data.RootElement.GetProperty("tags").GetArrayLength() == 2); return Fixture.Json(receipt);
    });
    Assert((await f.Client.StageCaptureAsync(new byte[12], "image/png", "unicode_key", caption: "\uFEFF hello  ", tags: new[] { "遊戲", "𝔄", "遊戲" })).Caption == "hello");
});
await Test("malformed unauthorized response still forgets credentials", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("SECRET") });
    await Error("invalid_token", () => f.Client.GetCaptureAsync(Fixture.Id)); Assert(f.Client.Authorization == null);
});
await Test("non-JSON unavailable response honors header cooldown", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ =>
    {
        var response = new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) { Content = new StringContent("SECRET") };
        response.Headers.RetryAfter = new(TimeSpan.FromSeconds(120)); return response;
    });
    try { await f.Client.GetCaptureAsync(Fixture.Id); throw new Exception("Expected unavailable"); }
    catch (VybeException error) { Assert(error.Code == "unavailable" && error.RetryAfterSeconds == 120); }
    Assert(f.Handler.Requests == 3);
});
await Test("local disconnect in reservation callback stops upload", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => Fixture.Json(f.Receipt("uploading")));
    await Error("authorization_changed", () => f.Client.StageCaptureAsync(new byte[12], "image/png", "retry_key", onReserved: _ => f.Client.ClearLocalAuthorization())); Assert(f.Handler.Requests == 3);
});
await Test("foreign receipt, unexpected identity and size fail closed", async () =>
{
    foreach (var field in new[] { "gameId", "captureId", "byteSize" })
    {
        using var f = new Fixture(); await f.Connect(); var receipt = f.Receipt("ready"); receipt[field] = field == "byteSize" ? 1 : "foreign";
        f.Handler.Add(_ => Fixture.Json(receipt)); await Error("invalid_response", () => f.Client.GetCaptureAsync(Fixture.Id));
    }
});
await Test("long quota wait is returned without automatic retry", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ =>
    {
        var response = Fixture.Json(new { error = "rate_limited", retryAfter = 2, message = "SECRET" }, 429);
        response.Headers.RetryAfter = new(f.Now.AddHours(1)); return response;
    });
    try { await f.Client.GetCaptureAsync(Fixture.Id); throw new Exception("Expected quota"); }
    catch (VybeException error) { Assert(error.Code == "rate_limited" && error.RetryAfterSeconds == 3600 && !error.ToString().Contains("SECRET")); }
    Assert(f.Handler.Requests == 3);
});
await Test("bounded retries sanitize transport failures", async () =>
{
    using var f = new Fixture(); await f.Connect(); for (var i = 0; i < 3; i++) f.Handler.Add(_ => throw new HttpRequestException("SECRET"));
    await Error("network_error", () => f.Client.GetCaptureAsync(Fixture.Id)); Assert(f.Handler.Requests == 5);
});
await Test("redirects and oversized streaming bodies are rejected", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => { var response = Fixture.Json(new { }, 307); response.Headers.Location = new Uri("https://example.test/SECRET"); return response; });
    await Error("invalid_response", () => f.Client.GetCaptureAsync(Fixture.Id));
    f.Handler.Add(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new MemoryStream(Encoding.UTF8.GetBytes(new string('x', 256 * 1024 + 1)))) });
    await Error("invalid_response", () => f.Client.GetCaptureAsync(Fixture.Id));
});
await Test("unauthorized responses clear credentials", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => Fixture.Json(new { error = "invalid_token" }, 401));
    await Error("invalid_token", () => f.Client.GetCaptureAsync(Fixture.Id)); Assert(f.Client.Authorization == null);
});
await Test("expired session sends no request", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Now = f.Now.AddMinutes(11); await Error("invalid_token", () => f.Client.GetCaptureAsync(Fixture.Id)); Assert(f.Handler.Requests == 2);
});
await Test("revoke forgets credentials even when acknowledgement is lost", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(_ => throw new HttpRequestException("SECRET"));
    await Error("network_error", () => f.Client.RevokeAsync()); Assert(f.Client.Authorization == null && f.Handler.Requests == 3);
});
await Test("discard acknowledgement and published conflict", async () =>
{
    using var f = new Fixture(); await f.Connect(); f.Handler.Add(request => { Assert(request.Method == HttpMethod.Delete); return Fixture.Json(new { ok = true }); }); await f.Client.DiscardCaptureAsync(Fixture.Id);
    f.Handler.Add(_ => Fixture.Json(new { error = "conflict" }, 409)); await Error("conflict", () => f.Client.DiscardCaptureAsync(Fixture.Id));
});
await Test("dispose cancels active transport and prevents reuse", async () =>
{
    var f = new Fixture(); await f.Connect(); var entered = new TaskCompletionSource();
    f.Handler.AddAsync(async (_, token) => { entered.SetResult(); await Task.Delay(Timeout.Infinite, token); return Fixture.Json(new { }); });
    var request = f.Client.GetCaptureAsync(Fixture.Id); await entered.Task; f.Dispose();
    try { await request; throw new Exception("Expected disposal"); } catch (ObjectDisposedException) { }
    Assert(f.Client.Authorization == null);
});
await Test("cancellation from ready callback cannot report upload success", async () =>
{
    using var f = new Fixture(); await f.Connect(); using var cancel = new CancellationTokenSource();
    f.Handler.Add(_ => Fixture.Json(f.Receipt("ready")));
    try
    {
        await f.Client.StageCaptureAsync(new byte[12], "image/png", "cancel_key", onProgress: progress =>
        {
            if (progress.Phase == "ready") cancel.Cancel();
        }, cancellationToken: cancel.Token); throw new Exception("Expected cancellation");
    }
    catch (OperationCanceledException) { }
});
await Test("public HTTP transport sends no cookies and refuses redirects", async () =>
{
    using var portReservation = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0); portReservation.Start();
    var port = ((IPEndPoint)portReservation.LocalEndpoint).Port; portReservation.Stop();
    using var listener = new HttpListener(); var endpoint = $"http://127.0.0.1:{port}/"; listener.Prefixes.Add(endpoint); listener.Start();
    using var f = new Fixture(); using var client = new VybeClient(endpoint, "qa-game", true);
    var server = Task.Run(async () =>
    {
        for (var index = 0; index < 2; index++)
        {
            var context = await listener.GetContextAsync().WaitAsync(TimeSpan.FromSeconds(10));
            Assert(context.Request.Headers["Cookie"] == null); Assert(context.Request.Headers["Authorization"] == null);
            if (index == 0)
            {
                context.Response.Headers.Add("Set-Cookie", "SECRET=blocked; Path=/"); context.Response.ContentType = "application/json";
                await context.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(f.Device())));
            }
            else { context.Response.StatusCode = 307; context.Response.RedirectLocation = endpoint + "must-not-follow"; }
            context.Response.Close();
        }
    });
    await client.StartLinkAsync(); await Error("invalid_response", () => client.StartLinkAsync()); await server;
});
await Test("preview scope is explicit and cannot be silently added or removed", async () =>
{
    using var basic = new Fixture(); await basic.Connect();
    await Error("insufficient_scope", () => basic.Client.GetCapturePreviewAsync(Fixture.Id)); Assert(basic.Handler.Requests == 2);
    using var f = new Fixture(true);
    f.Handler.AddAsync(async (request, _) =>
    {
        using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
        Assert(body.RootElement.GetProperty("scopes").EnumerateArray().Select(value => value.GetString()).SequenceEqual(new[] { "capture:write", "capture:status", "capture:preview" })); return Fixture.Json(f.Device());
    });
    await f.Client.StartLinkAsync(); var token = f.Token(); token["scopes"] = new[] { "capture:write", "capture:status" };
    f.Handler.Add(_ => Fixture.Json(token)); await Error("invalid_response", () => f.Client.WaitForAuthorizationAsync()); Assert(f.Client.Authorization == null);
    await basic.Start(); var expanded = basic.Token(); expanded["scopes"] = new[] { "capture:write", "capture:status", "capture:preview" };
    basic.Handler.Add(_ => Fixture.Json(expanded)); await Error("invalid_response", () => basic.Client.WaitForAuthorizationAsync());
});
await Test("gallery continues after an empty page using an opaque cursor", async () =>
{
    using var f = new Fixture(); await f.Connect();
    f.Handler.Add(_ => Fixture.Json(new { captures = Array.Empty<object>(), nextCursor = Fixture.Id }));
    var first = await f.Client.ListCapturesAsync(); Assert(first.Captures.Count == 0 && first.NextCursor == Fixture.Id);
    var row = f.Receipt("ready"); row["captureId"] = new string('b', 48);
    f.Handler.Add(request => { Assert(request.RequestUri!.Query == "?cursor=" + Fixture.Id); return Fixture.Json(new { captures = new[] { row }, nextCursor = (string?)null }); });
    var last = await f.Client.ListCapturesAsync(first.NextCursor); Assert(last.Captures.Count == 1 && last.NextCursor == null);
});
await Test("gallery rejects duplicate, reversed, oversized and foreign pages", async () =>
{
    foreach (var variant in new[] { "duplicate", "reversed", "oversized", "foreign", "backward-cursor", "row-after-cursor", "non-object" })
    {
        using var f = new Fixture(); await f.Connect(); var one = f.Receipt("ready"); var two = f.Receipt("ready"); two["captureId"] = new string('b', 48);
        object[] rows = [one]; string? cursor = null;
        if (variant == "duplicate") rows = [one, one];
        if (variant == "reversed") rows = [two, one];
        if (variant == "oversized") rows = Enumerable.Repeat((object)one, 21).ToArray();
        if (variant == "foreign") one["gameId"] = "other-game";
        if (variant == "backward-cursor") { rows = []; cursor = new string('0', 48); }
        if (variant == "row-after-cursor") { rows = [two]; cursor = Fixture.Id; }
        if (variant == "non-object") rows = [123];
        f.Handler.Add(_ => Fixture.Json(new { captures = rows, nextCursor = cursor }));
        await Error("invalid_response", () => f.Client.ListCapturesAsync(variant == "backward-cursor" ? Fixture.Id : null));
    }
});
await Test("preview verifies all chunks and whole-file digest", async () =>
{
    using var f = new Fixture(true); await f.Connect(); var bytes = new byte[VybeClient.ChunkBytes + 17]; Random.Shared.NextBytes(bytes);
    f.Preview(bytes, "video/mp4"); using var preview = await f.Client.GetCapturePreviewAsync(Fixture.Id);
    Assert(preview.Capture.ContentType == "video/mp4" && preview.Bytes.Span.SequenceEqual(bytes)); Assert(f.Handler.Requests == 5);
});
await Test("preview rejects wrong lengths, ranges, MIME and checksums", async () =>
{
    foreach (var variant in new[] { "short", "extra", "range", "mime", "digest", "changed-digest", "redirect" })
    {
        using var f = new Fixture(true); await f.Connect(); var bytes = Enumerable.Repeat((byte)7, variant == "changed-digest" ? VybeClient.ChunkBytes + 12 : 12).ToArray();
        f.Handler.Add(_ => Fixture.Json(f.Receipt("ready", bytes.Length)));
        f.Handler.Add(_ =>
        {
            var chunk = bytes.Take(VybeClient.ChunkBytes).ToArray();
            var response = Fixture.Binary(variant == "short" ? chunk[..^1] : variant == "extra" ? [.. chunk, (byte)7] : chunk, bytes.Length, 0, Fixture.Hash(bytes), "image/png");
            response.Content.Headers.ContentLength = chunk.Length;
            if (variant == "range") response.Content.Headers.ContentRange = new(1, chunk.Length, bytes.Length + 1);
            if (variant == "mime") response.Content.Headers.ContentType = new("text/html");
            if (variant == "digest") { response.Headers.Remove("X-Capture-SHA256"); response.Headers.Add("X-Capture-SHA256", new string('0', 64)); }
            if (variant == "redirect") response.StatusCode = HttpStatusCode.TemporaryRedirect;
            return response;
        });
        if (variant == "changed-digest") f.Handler.Add(_ => Fixture.Binary(bytes.Skip(VybeClient.ChunkBytes).ToArray(), bytes.Length, VybeClient.ChunkBytes, new string('0', 64), "image/png"));
        await Error("invalid_response", () => f.Client.GetCapturePreviewAsync(Fixture.Id));
    }
});
await Test("published captures do not download original media", async () =>
{
    using var f = new Fixture(true); await f.Connect(); f.Handler.Add(_ => Fixture.Json(f.Receipt("imported")));
    await Error("not_found", () => f.Client.GetCapturePreviewAsync(Fixture.Id)); Assert(f.Handler.Requests == 3);
});
await Test("clear, disposal, revoke and replacement zero retained preview memory", async () =>
{
    foreach (var action in new[] { "clear", "dispose", "revoke", "replace", "discard", "expiry" })
    {
        using var f = new Fixture(true); await f.Connect(); var bytes = Enumerable.Repeat((byte)9, 12).ToArray(); f.Preview(bytes);
        using var preview = await f.Client.GetCapturePreviewAsync(Fixture.Id); var retained = preview.Bytes;
        if (action == "clear") f.Client.ClearLocalAuthorization();
        if (action == "dispose") f.Client.Dispose();
        if (action == "revoke") { f.Handler.Add(_ => Fixture.Json(new { ok = true })); await f.Client.RevokeAsync(); }
        if (action == "replace") { f.Preview(bytes); using var next = await f.Client.GetCapturePreviewAsync(Fixture.Id); }
        if (action == "discard") { f.Handler.Add(_ => Fixture.Json(new { ok = true })); await f.Client.DiscardCaptureAsync(Fixture.Id); }
        if (action == "expiry") { f.Now = f.Now.AddMinutes(11); try { _ = preview.Bytes; throw new Exception("Expected expiry"); } catch (ObjectDisposedException) { } }
        Assert(retained.ToArray().All(value => value == 0));
        try { _ = preview.Bytes; throw new Exception("Expected disposal"); } catch (ObjectDisposedException) { }
    }
});
await Test("failed access recheck clears visible encoded preview and preserves cooldown", async () =>
{
    using var f = new Fixture(true); await f.Connect(); f.Preview(Enumerable.Repeat((byte)4, 12).ToArray());
    using var preview = await f.Client.GetCapturePreviewAsync(Fixture.Id); var retained = preview.Bytes;
    f.Handler.Add(request => { Assert(request.Method == HttpMethod.Head); return new HttpResponseMessage(HttpStatusCode.NoContent); });
    await f.Client.CheckCapturePreviewAsync(Fixture.Id); Assert(preview.Bytes.Length == 12);
    f.Handler.Add(_ => { var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests); response.Headers.RetryAfter = new(TimeSpan.FromSeconds(120)); return response; });
    try { await f.Client.CheckCapturePreviewAsync(Fixture.Id); throw new Exception("Expected cooldown"); }
    catch (VybeException error) { Assert(error.Code == "rate_limited" && error.RetryAfterSeconds == 120); }
    Assert(retained.ToArray().All(value => value == 0));
});
await Test("concurrent previews are rejected and late account data is discarded", async () =>
{
    using var f = new Fixture(true); await f.Connect(); var release = new TaskCompletionSource<HttpResponseMessage>();
    f.Handler.AddAsync((_, _) => release.Task); var downloading = f.Client.GetCapturePreviewAsync(Fixture.Id);
    await Error("invalid_request", () => f.Client.GetCapturePreviewAsync(Fixture.Id));
    f.Client.ClearLocalAuthorization(); release.SetResult(Fixture.Json(f.Receipt("ready")));
    await Error("authorization_changed", () => downloading); Assert(f.Handler.Requests == 3);
});
await Test("authorization deadline clears encoded bytes without another API call", async () => {
    var bytes = Enumerable.Repeat((byte)6, 12).ToArray();
    var capture = new CaptureReceipt(Fixture.Id, "ready", "qa-game", "QA", "image/png", 12, "", Array.Empty<string>(), DateTimeOffset.UtcNow.AddDays(1), null, VybeClient.GetReviewUri(Fixture.Id));
    using var lease = new CapturePreview(capture, bytes, DateTimeOffset.UtcNow.AddMilliseconds(50), () => DateTimeOffset.UtcNow);
    var deadline = DateTimeOffset.UtcNow.AddSeconds(5);
    while (bytes.Any(value => value != 0) && DateTimeOffset.UtcNow < deadline) await Task.Delay(20);
    Assert(bytes.All(value => value == 0));
});
await Test("late access failure cannot clear a newly linked account preview", async () => {
    using var f = new Fixture(true); await f.Connect(); f.Preview(Enumerable.Repeat((byte)1, 12).ToArray());
    using var old = await f.Client.GetCapturePreviewAsync(Fixture.Id);
    var release = new TaskCompletionSource<HttpResponseMessage>(); f.Handler.AddAsync((_, _) => release.Task);
    var check = f.Client.CheckCapturePreviewAsync(Fixture.Id);
    await f.Connect(); var freshBytes = Enumerable.Repeat((byte)2, 12).ToArray(); f.Preview(freshBytes);
    using var fresh = await f.Client.GetCapturePreviewAsync(Fixture.Id);
    release.SetResult(new HttpResponseMessage(HttpStatusCode.Unauthorized));
    await Error("authorization_changed", () => check); Assert(fresh.Bytes.Span.SequenceEqual(freshBytes));
});
await Test("cancelled preview body releases the download slot for retry", async () => {
    using var f = new Fixture(true); await f.Connect(); using var cancel = new CancellationTokenSource();
    var entered = new TaskCompletionSource();
    f.Handler.Add(_ => Fixture.Json(f.Receipt("ready")));
    f.Handler.Add(_ => {
        var response = Fixture.Binary(new byte[12], 12, 0, Fixture.Hash(new byte[12]), "image/png");
        response.Content = new StreamContent(new WaitingStream(entered)); response.Content.Headers.ContentLength = 12;
        response.Content.Headers.ContentType = new("image/png"); response.Content.Headers.ContentRange = new(0, 11, 12); return response;
    });
    var pending = f.Client.GetCapturePreviewAsync(Fixture.Id, cancel.Token); await entered.Task; cancel.Cancel();
    try { await pending; throw new Exception("Expected cancellation"); } catch (OperationCanceledException) { }
    f.Preview(new byte[12]); using var retried = await f.Client.GetCapturePreviewAsync(Fixture.Id); Assert(retried.Bytes.Length == 12);
});
await Test("gallery accepts 40 Unicode scalar tag letters and rejects 41", async () => {
    using var f = new Fixture(); await f.Connect(); var tag = string.Concat(Enumerable.Repeat("𝔄", 40));
    var row = f.Receipt("ready"); row["tags"] = new[] { tag };
    f.Handler.Add(_ => Fixture.Json(new { captures = new[] { row }, nextCursor = (string?)null }));
    Assert((await f.Client.ListCapturesAsync()).Captures.Single().Tags.Single() == tag);
    row["tags"] = new[] { tag + "𝔄" }; f.Handler.Add(_ => Fixture.Json(new { captures = new[] { row }, nextCursor = (string?)null }));
    await Error("invalid_response", () => f.Client.ListCapturesAsync());
    await Error("invalid_request", () => f.Client.StageCaptureAsync(new byte[12], "image/png", "long_tag_key", tags: new[] { tag + "𝔄" }));
});
Console.WriteLine($"{count} compiled .NET checks passed.");

sealed class Fixture : IDisposable
{
    internal const string Id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    internal const string Connection = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    internal static readonly string AccessToken = "vyp_" + new string('A', 43);
    internal DateTimeOffset Now = DateTimeOffset.FromUnixTimeMilliseconds(1800000000000);
    internal readonly List<double> Delays = [];
    internal Func<TimeSpan, CancellationToken, Task>? DelayOverride;
    internal readonly FakeHandler Handler = new();
    internal readonly VybeClient Client;
    private readonly bool previewScopes;
    internal Fixture(bool previewScopes = false)
    {
        this.previewScopes = previewScopes;
        Client = new("https://example.test/api", "qa-game", false, Handler, () => Now, async (duration, token) =>
        {
            token.ThrowIfCancellationRequested(); Delays.Add(duration.TotalSeconds); if (DelayOverride != null) await DelayOverride(duration, token); else Now += duration;
        }, previewScopes);
    }
    internal Dictionary<string, object?> Device() => new() { ["deviceCode"] = "vyd_" + new string('B', 43), ["userCode"] = "ABCD-2345", ["verificationUri"] = "https://vybehub.app/connect/game", ["verificationUriComplete"] = "https://example.test/SECRET", ["expiresIn"] = 600, ["interval"] = 5 };
    internal Dictionary<string, object?> Token() => new() { ["accessToken"] = AccessToken, ["tokenType"] = "Bearer", ["connectionId"] = Connection, ["expiresIn"] = 595, ["expiresAt"] = Now.AddSeconds(595).ToUnixTimeMilliseconds(), ["scopes"] = previewScopes ? new[] { "capture:write", "capture:status", "capture:preview" } : new[] { "capture:write", "capture:status" } };
    internal Dictionary<string, object?> Receipt(string status, int size = 12, string mime = "image/png") => new() { ["captureId"] = Id, ["status"] = status, ["gameId"] = "qa-game", ["gameName"] = "QA Game", ["contentType"] = mime, ["byteSize"] = size, ["caption"] = "", ["tags"] = Array.Empty<string>(), ["expiresAt"] = Now.AddHours(24).ToUnixTimeMilliseconds(), ["postId"] = null, ["reviewUrl"] = "https://example.test/SECRET" };
    internal async Task Start() { Handler.Add(_ => Json(Device())); await Client.StartLinkAsync(); }
    internal async Task Connect() { await Start(); Handler.Add(_ => Json(Token())); await Client.WaitForAuthorizationAsync(); }
    internal void Chunk() { Handler.AddAsync(async (request, _) => { var bytes = await request.Content!.ReadAsByteArrayAsync(); return Json(new { index = 0, byteSize = bytes.Length, sha256 = Hash(bytes) }); }); }
    internal static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    internal static HttpResponseMessage Binary(byte[] bytes, int total, int offset, string checksum, string mime)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) };
        response.Content.Headers.ContentLength = bytes.Length; response.Content.Headers.ContentType = new(mime);
        response.Content.Headers.ContentRange = new(offset, offset + bytes.Length - 1, total); response.Headers.Add("X-Capture-SHA256", checksum); return response;
    }
    internal void Preview(byte[] bytes, string mime = "image/png")
    {
        Handler.Add(_ => Json(Receipt("ready", bytes.Length, mime)));
        for (var offset = 0; offset < bytes.Length; offset += VybeClient.ChunkBytes)
        {
            var position = offset; Handler.Add(request =>
            {
                if (request.RequestUri!.Query != "?chunk=" + position / VybeClient.ChunkBytes) throw new Exception("Wrong chunk");
                return Binary(bytes.Skip(position).Take(VybeClient.ChunkBytes).ToArray(), bytes.Length, position, Hash(bytes), mime);
            });
        }
    }
    internal static HttpResponseMessage Json(object data, int status = 200) => new((HttpStatusCode)status) { Content = new StringContent(JsonSerializer.Serialize(data), Encoding.UTF8, "application/json") };
    public void Dispose() => Client.Dispose();
}
sealed class FakeHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>>> steps = new();
    internal int Requests;
    internal void Add(Func<HttpRequestMessage, HttpResponseMessage> step) => AddAsync((request, _) => Task.FromResult(step(request)));
    internal void AddAsync(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> step) { lock (steps) steps.Enqueue(step); }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    { Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> step; lock (steps) { Requests++; step = steps.Dequeue(); } return step(request, token); }
}

sealed class WaitingStream(TaskCompletionSource entered) : MemoryStream
{
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    { entered.TrySetResult(); await Task.Delay(Timeout.Infinite, cancellationToken); return 0; }
}
