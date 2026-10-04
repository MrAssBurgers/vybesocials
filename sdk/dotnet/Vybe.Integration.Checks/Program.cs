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
await Test("cancellation from ready callback cannot report upload success", async () => {
    using var f = new Fixture(); await f.Connect(); using var cancel = new CancellationTokenSource();
    f.Handler.Add(_ => Fixture.Json(f.Receipt("ready")));
    try { await f.Client.StageCaptureAsync(new byte[12], "image/png", "cancel_key", onProgress: progress => {
        if (progress.Phase == "ready") cancel.Cancel(); }, cancellationToken: cancel.Token); throw new Exception("Expected cancellation"); }
    catch (OperationCanceledException) { }
});
await Test("public HTTP transport sends no cookies and refuses redirects", async () => {
    using var portReservation = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0); portReservation.Start();
    var port = ((IPEndPoint)portReservation.LocalEndpoint).Port; portReservation.Stop();
    using var listener = new HttpListener(); var endpoint = $"http://127.0.0.1:{port}/"; listener.Prefixes.Add(endpoint); listener.Start();
    using var f = new Fixture(); using var client = new VybeClient(endpoint, "qa-game", true);
    var server = Task.Run(async () => {
        for (var index = 0; index < 2; index++) {
            var context = await listener.GetContextAsync().WaitAsync(TimeSpan.FromSeconds(10));
            Assert(context.Request.Headers["Cookie"] == null); Assert(context.Request.Headers["Authorization"] == null);
            if (index == 0) { context.Response.Headers.Add("Set-Cookie", "SECRET=blocked; Path=/"); context.Response.ContentType = "application/json";
                await context.Response.OutputStream.WriteAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(f.Device()))); }
            else { context.Response.StatusCode = 307; context.Response.RedirectLocation = endpoint + "must-not-follow"; }
            context.Response.Close();
        }
    });
    await client.StartLinkAsync(); await Error("invalid_response", () => client.StartLinkAsync()); await server;
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
    internal Fixture()
    {
        Client = new("https://example.test/api", "qa-game", false, Handler, () => Now, async (duration, token) =>
        {
            token.ThrowIfCancellationRequested(); Delays.Add(duration.TotalSeconds); if (DelayOverride != null) await DelayOverride(duration, token); else Now += duration;
        });
    }
    internal Dictionary<string, object?> Device() => new() { ["deviceCode"] = "vyd_" + new string('B', 43), ["userCode"] = "ABCD-2345", ["verificationUri"] = "https://vybehub.app/connect/game", ["verificationUriComplete"] = "https://example.test/SECRET", ["expiresIn"] = 600, ["interval"] = 5 };
    internal Dictionary<string, object?> Token() => new() { ["accessToken"] = AccessToken, ["tokenType"] = "Bearer", ["connectionId"] = Connection, ["expiresIn"] = 595, ["expiresAt"] = Now.AddSeconds(595).ToUnixTimeMilliseconds(), ["scopes"] = new[] { "capture:write", "capture:status" } };
    internal Dictionary<string, object?> Receipt(string status, int size = 12, string mime = "image/png") => new() { ["captureId"] = Id, ["status"] = status, ["gameId"] = "qa-game", ["gameName"] = "QA Game", ["contentType"] = mime, ["byteSize"] = size, ["caption"] = "", ["tags"] = Array.Empty<string>(), ["expiresAt"] = Now.AddHours(24).ToUnixTimeMilliseconds(), ["postId"] = null, ["reviewUrl"] = "https://example.test/SECRET" };
    internal async Task Start() { Handler.Add(_ => Json(Device())); await Client.StartLinkAsync(); }
    internal async Task Connect() { await Start(); Handler.Add(_ => Json(Token())); await Client.WaitForAuthorizationAsync(); }
    internal void Chunk() { Handler.AddAsync(async (request, _) => { var bytes = await request.Content!.ReadAsByteArrayAsync(); return Json(new { index = 0, byteSize = bytes.Length, sha256 = Hash(bytes) }); }); }
    internal static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
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
