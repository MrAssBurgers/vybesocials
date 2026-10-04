using System.Net.Http.Headers;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Vybe.Integration;

/// <summary>Scoped partner API client. No Firebase dependency, password handling or automatic publishing.</summary>
public sealed class VybeClient : IDisposable
{
    public const int ChunkBytes = 8 * 1024 * 1024;
    public const int MaxCaptureBytes = 48 * 1024 * 1024;
    private const string VerifyUrl = "https://vybehub.app/connect/game";
    private static readonly string[] Scopes = ["capture:write", "capture:status"];
    private static readonly string[] MimeTypes = ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"];
    private readonly object gate = new();
    private readonly HttpClient http;
    private readonly string endpoint, clientId;
    private readonly Func<DateTimeOffset> now;
    private readonly Func<TimeSpan, CancellationToken, Task> delay;
    private readonly CancellationTokenSource lifetime = new();
    private long generation;
    private bool disposed;
    // Ordinary classes avoid synthesized record ToString() exposing secrets in a debugger/log.
    private sealed class Session(string token, Authorization authorization, long generation)
    { internal readonly string Token = token; internal readonly Authorization Authorization = authorization; internal readonly long Generation = generation; }
    private sealed class Pending(string code, DeviceLink link, long generation)
    { internal readonly string Code = code; internal readonly DeviceLink Link = link; internal readonly long Generation = generation; internal bool Polling; }
    private Session? session;
    private Pending? pending;

    public VybeClient(string apiBaseUrl, string clientId, bool allowInsecureLoopback = false)
        : this(apiBaseUrl, clientId, allowInsecureLoopback,
            new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, UseDefaultCredentials = false },
            () => DateTimeOffset.UtcNow, Task.Delay)
    { }

    // Test-only transport/time seam; public callers cannot accidentally supply an auto-redirecting handler.
    internal VybeClient(string apiBaseUrl, string clientId, bool allowInsecureLoopback,
        HttpMessageHandler handler, Func<DateTimeOffset> now, Func<TimeSpan, CancellationToken, Task> delay)
    {
        if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var uri) || uri.UserInfo.Length != 0
            || uri.Query.Length != 0 || uri.Fragment.Length != 0
            || (uri.Scheme != "https" && !(allowInsecureLoopback && uri.Scheme == "http"
                && new[] { "localhost", "127.0.0.1", "[::1]" }.Contains(uri.Host)))
            || !Match(clientId, "^[a-z0-9][a-z0-9_-]{2,63}$"))
        { handler.Dispose(); throw new VybeException("invalid_request"); }
        endpoint = uri.AbsoluteUri.TrimEnd('/'); this.clientId = clientId; this.now = now; this.delay = delay;
        http = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
    }

    public Authorization? Authorization
    {
        get { lock (gate) { if (disposed || session?.Authorization.ExpiresAt <= now()) session = null; return session?.Authorization; } }
    }

    /// <summary>Forget local credentials. This does not claim to revoke the connection on the server.</summary>
    public void ClearLocalAuthorization() { lock (gate) { EnsureAlive(); generation++; session = null; pending = null; } }

    public async Task<DeviceLink> StartLinkAsync(CancellationToken cancellationToken = default)
    {
        long epoch;
        lock (gate) { EnsureAlive(); epoch = ++generation; session = null; pending = null; }
        var data = await RequestAsync("/v1/device/code", HttpMethod.Post, epoch, null,
            new { clientId }, cancellationToken: cancellationToken).ConfigureAwait(false);
        var code = Text(data, "deviceCode"); var userCode = Text(data, "userCode");
        var expires = Integer(data, "expiresIn"); var interval = Integer(data, "interval");
        Require(Match(code, "^vyd_[A-Za-z0-9_-]{43}$") && Match(userCode, "^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$")
            && Text(data, "verificationUri") == VerifyUrl && expires is > 0 and <= 600 && interval is >= 5 and <= 60);
        var link = new DeviceLink(userCode, new Uri(VerifyUrl), new Uri(VerifyUrl + "?code=" + Uri.EscapeDataString(userCode)), now().AddSeconds(expires), (int)interval);
        lock (gate) { Check(epoch); cancellationToken.ThrowIfCancellationRequested(); pending = new Pending(code, link, epoch); }
        return link;
    }

    public async Task<Authorization> WaitForAuthorizationAsync(CancellationToken cancellationToken = default)
    {
        Pending device;
        lock (gate)
        {
            EnsureAlive(); device = pending ?? throw new VybeException("invalid_grant");
            if (device.Polling) throw new VybeException("invalid_request"); device.Polling = true;
        }
        var interval = device.Link.IntervalSeconds;
        try
        {
            while (true)
            {
                Check(device.Generation); cancellationToken.ThrowIfCancellationRequested();
                var remaining = device.Link.ExpiresAt - now();
                if (remaining <= TimeSpan.Zero) throw new VybeException("expired_token");
                await WaitAsync(TimeSpan.FromSeconds(Math.Min(interval, remaining.TotalSeconds)), cancellationToken).ConfigureAwait(false);
                Check(device.Generation);
                if (now() >= device.Link.ExpiresAt) throw new VybeException("expired_token");
                JsonElement data;
                try
                {
                    data = await RequestAsync("/v1/device/token", HttpMethod.Post, device.Generation, null,
                    new { clientId, deviceCode = device.Code }, cancellationToken: cancellationToken).ConfigureAwait(false);
                }
                catch (VybeException error) when (error.Code == "authorization_pending") { continue; }
                catch (VybeException error) when (error.Code is "slow_down" or "rate_limited" or "network_error" or "unavailable")
                { interval = Math.Max(interval + (error.Code == "slow_down" ? 5 : 0), error.RetryAfterSeconds ?? 5); continue; }
                var token = Text(data, "accessToken"); var connection = Text(data, "connectionId");
                var expires = Integer(data, "expiresIn"); var expiry = Timestamp(data, "expiresAt"); var scopes = Strings(data, "scopes", 2, 32);
                Require(Match(token, "^vyp_[A-Za-z0-9_-]{43}$") && Text(data, "tokenType") == "Bearer"
                    && Match(connection, "^[a-f0-9]{32}$") && expires is > 0 and <= 600 && expiry > now()
                    && scopes.Count == 2 && scopes.Order().SequenceEqual(Scopes.Order()));
                var auth = new Authorization(connection, expiry < now().AddSeconds(expires) ? expiry : now().AddSeconds(expires), scopes);
                lock (gate) { Check(device.Generation); cancellationToken.ThrowIfCancellationRequested(); session = new Session(token, auth, device.Generation); pending = null; }
                return auth;
            }
        }
        finally { lock (gate) { if (ReferenceEquals(pending, device)) pending = null; } }
    }

    /// <summary>Stage already-encoded media privately. Keep the same key and bytes for an uncertain-response retry.</summary>
    public async Task<CaptureReceipt> StageCaptureAsync(ReadOnlyMemory<byte> source, string contentType, string idempotencyKey,
        string caption = "", IReadOnlyList<string>? tags = null, Action<CaptureProgress>? onProgress = null,
        Action<CaptureReceipt>? onReserved = null, CancellationToken cancellationToken = default)
    {
        var active = RequireSession(); cancellationToken.ThrowIfCancellationRequested();
        var copiedTags = tags?.ToArray() ?? [];
        if (source.Length is < 12 or > MaxCaptureBytes || !MimeTypes.Contains(contentType)
            || !Match(idempotencyKey, "^[A-Za-z0-9_-]{8,128}$") || caption is null || caption.Length > 2200
            || copiedTags.Length > 10 || copiedTags.Any(tag => !ValidTag(tag))) throw new VybeException("invalid_request");
        copiedTags = copiedTags.Distinct(StringComparer.Ordinal).ToArray();
        // Match the API's ECMAScript trim and insertion-order tag deduplication.
        caption = caption.Trim("\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF".ToCharArray());
        // Snapshot caller-owned memory before the first await, so mutation cannot change reserved content.
        var bytes = source.ToArray();
        void Progress(string phase, int uploaded) { Check(active.Generation, active); cancellationToken.ThrowIfCancellationRequested(); onProgress?.Invoke(new(phase, uploaded, bytes.Length)); Check(active.Generation, active); cancellationToken.ThrowIfCancellationRequested(); }
        Progress("preparing", 0);
        var data = await RequestAsync("/v1/captures", HttpMethod.Post, active.Generation, active,
            new { idempotencyKey, contentType, byteSize = bytes.Length, caption, tags = copiedTags, contentSha256 = Hash(bytes) },
            retry: true, cancellationToken: cancellationToken).ConfigureAwait(false);
        var receipt = Receipt(data);
        void Validate(CaptureReceipt value) => Require(value.ByteSize == bytes.Length && value.ContentType == contentType
            && value.Caption == caption && value.Tags.SequenceEqual(copiedTags));
        Validate(receipt); onReserved?.Invoke(receipt); Check(active.Generation, active); cancellationToken.ThrowIfCancellationRequested();
        if (receipt.Status is "ready" or "imported") { Progress("ready", bytes.Length); return receipt; }
        Require(receipt.Status == "uploading");
        for (var offset = 0; offset < bytes.Length; offset += ChunkBytes)
        {
            var chunk = bytes.AsMemory(offset, Math.Min(ChunkBytes, bytes.Length - offset)); var checksum = Hash(chunk.Span); var index = offset / ChunkBytes;
            var ack = await RequestAsync($"/v1/captures/{receipt.CaptureId}/chunks/{index}", HttpMethod.Put, active.Generation, active,
                chunk: chunk, checksum: checksum, retry: true, cancellationToken: cancellationToken).ConfigureAwait(false);
            Require(Integer(ack, "index") == index && Integer(ack, "byteSize") == chunk.Length && Text(ack, "sha256") == checksum);
            Progress("uploading", offset + chunk.Length);
        }
        Progress("verifying", bytes.Length);
        var finished = Receipt(await RequestAsync($"/v1/captures/{receipt.CaptureId}/finish", HttpMethod.Post,
            active.Generation, active, new { }, retry: true, cancellationToken: cancellationToken).ConfigureAwait(false), receipt.CaptureId);
        Validate(finished); Require(finished.Status is "ready" or "imported"); Progress("ready", bytes.Length); return finished;
    }

    public async Task<CaptureReceipt> GetCaptureAsync(string captureId, CancellationToken cancellationToken = default)
    {
        ValidId(captureId); var active = RequireSession();
        var receipt = Receipt(await RequestAsync($"/v1/captures/{captureId}", HttpMethod.Get, active.Generation, active,
            retry: true, cancellationToken: cancellationToken).ConfigureAwait(false), captureId);
        Check(active.Generation, active); cancellationToken.ThrowIfCancellationRequested(); return receipt;
    }
    public async Task DiscardCaptureAsync(string captureId, CancellationToken cancellationToken = default)
    {
        ValidId(captureId); var active = RequireSession();
        var data = await RequestAsync($"/v1/captures/{captureId}", HttpMethod.Delete, active.Generation, active,
            cancellationToken: cancellationToken).ConfigureAwait(false);
        Require(data.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True);
    }
    public async Task RevokeAsync(CancellationToken cancellationToken = default)
    {
        var active = RequireSession();
        try
        {
            var data = await RequestAsync("/v1/connection/revoke", HttpMethod.Post, active.Generation, active,
            new { }, cancellationToken: cancellationToken).ConfigureAwait(false);
            Require(data.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True);
        }
        finally { lock (gate) { if (ReferenceEquals(session, active)) { generation++; session = null; pending = null; } } }
    }
    public static Uri GetReviewUri(string captureId) { ValidId(captureId); return new Uri("https://vybehub.app/game-capture/" + captureId); }

    private CaptureReceipt Receipt(JsonElement data, string? expectedId = null)
    {
        var id = Text(data, "captureId"); var status = Text(data, "status"); var game = Text(data, "gameId"); var name = Text(data, "gameName");
        var type = Text(data, "contentType"); var size = Integer(data, "byteSize"); var caption = Text(data, "caption"); var tags = Strings(data, "tags", 10, 40);
        Require(data.TryGetProperty("postId", out var post));
        var postId = post.ValueKind == JsonValueKind.Null ? null : Text(data, "postId");
        Require(Match(id, "^[a-f0-9]{48}$") && (expectedId == null || id == expectedId)
            && new[] { "uploading", "ready", "imported", "cancelled", "expired" }.Contains(status) && game == clientId
            && name.Length is > 0 and <= 200 && MimeTypes.Contains(type) && size is >= 12 and <= MaxCaptureBytes
            && caption.Length <= 2200 && (postId == null || postId.Length is > 0 and <= 256));
        return new(id, status, game, name, type, (int)size, caption, tags, Timestamp(data, "expiresAt"), postId, GetReviewUri(id));
    }

    private async Task<JsonElement> RequestAsync(string path, HttpMethod method, long epoch, Session? active,
        object? body = null, ReadOnlyMemory<byte>? chunk = null, string? checksum = null, bool retry = false,
        CancellationToken cancellationToken = default)
    {
        var json = body == null ? null : JsonSerializer.Serialize(body);
        for (var attempt = 0; ; attempt++)
        {
            Check(epoch, active); cancellationToken.ThrowIfCancellationRequested();
            VybeException failure;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, lifetime.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            try
            {
                using var request = new HttpRequestMessage(method, endpoint + path);
                request.Headers.CacheControl = new CacheControlHeaderValue { NoStore = true };
                if (active != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", active.Token);
                if (chunk.HasValue) { request.Content = new ReadOnlyMemoryContent(chunk.Value); request.Content.Headers.ContentType = new("application/octet-stream"); request.Headers.Add("X-Chunk-SHA256", checksum); }
                else if (json != null) request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false);
                Check(epoch, active); cancellationToken.ThrowIfCancellationRequested();
                var status = (int)response.StatusCode;
                if (status == 401 && active != null) { lock (gate) { if (ReferenceEquals(session, active)) session = null; } }
                if (status is >= 300 and < 400 || (response.RequestMessage?.RequestUri != null && response.RequestMessage.RequestUri != request.RequestUri)) throw new VybeException("invalid_response", status);
                JsonElement data;
                try
                {
                    if (response.Content.Headers.ContentLength > 256 * 1024) throw new VybeException("invalid_response", status);
                    using var stream = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false);
                    using var buffer = new MemoryStream(); var scratch = new byte[8192];
                    while (true)
                    {
                        var count = await stream.ReadAsync(scratch, timeout.Token).ConfigureAwait(false); if (count == 0) break;
                        if (buffer.Length + count > 256 * 1024) throw new VybeException("invalid_response", status); buffer.Write(scratch, 0, count);
                    }
                    using var parsed = JsonDocument.Parse(buffer.ToArray(), new JsonDocumentOptions { MaxDepth = 32 });
                    Require(parsed.RootElement.ValueKind == JsonValueKind.Object); data = parsed.RootElement.Clone();
                }
                catch (JsonException) { throw new VybeException(status == 401 ? "invalid_token" : status >= 500 ? "unavailable" : "invalid_response", status, RetryAfter(default, response)); }
                Check(epoch, status == 401 ? null : active); cancellationToken.ThrowIfCancellationRequested();
                if (!response.IsSuccessStatusCode)
                {
                    var code = data.TryGetProperty("error", out var field) && field.ValueKind == JsonValueKind.String ? field.GetString() : null;
                    if (code == null || !VybeException.Messages.ContainsKey(code)) code = status >= 500 ? "unavailable" : status == 401 ? "invalid_token" : "invalid_request";
                    throw new VybeException(code, status, RetryAfter(data, response));
                }
                return data;
            }
            catch (VybeException error) { failure = error; }
            catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException)
            { failure = new VybeException("network_error"); }
            Check(epoch); cancellationToken.ThrowIfCancellationRequested();
            if (!retry || attempt >= 2 || failure.RetryAfterSeconds > 60 || failure.Code is not ("network_error" or "unavailable" or "rate_limited")) throw failure;
            Check(epoch, active);
            await WaitAsync(failure.RetryAfterSeconds.HasValue ? TimeSpan.FromSeconds(failure.RetryAfterSeconds.Value)
                : TimeSpan.FromMilliseconds(250 * (1 << attempt)), cancellationToken).ConfigureAwait(false);
        }
    }

    private int? RetryAfter(JsonElement data, HttpResponseMessage response)
    {
        double seconds = 0;
        if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty("retryAfter", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number)) seconds = Math.Max(0, number);
        var header = response.Headers.RetryAfter;
        if (header?.Delta != null) seconds = Math.Max(seconds, header.Delta.Value.TotalSeconds);
        if (header?.Date != null) seconds = Math.Max(seconds, (header.Date.Value - now()).TotalSeconds);
        return seconds > 0 ? (int)Math.Min(86400, Math.Ceiling(seconds)) : null;
    }
    private async Task WaitAsync(TimeSpan duration, CancellationToken token)
    { using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, lifetime.Token); await delay(duration, linked.Token).ConfigureAwait(false); }
    private Session RequireSession() { lock (gate) { EnsureAlive(); if (session == null || session.Authorization.ExpiresAt <= now()) { session = null; throw new VybeException("invalid_token"); } return session; } }
    private void Check(long epoch, Session? active = null)
    {
        lock (gate)
        {
            EnsureAlive(); if (epoch != generation) throw new VybeException("authorization_changed");
            if (active != null && !ReferenceEquals(active, session)) throw new VybeException("authorization_changed");
            if (active != null && active.Authorization.ExpiresAt <= now()) { session = null; throw new VybeException("invalid_token"); }
        }
    }
    private void EnsureAlive() { ObjectDisposedException.ThrowIf(disposed, this); }
    private static void Require(bool condition) { if (!condition) throw new VybeException("invalid_response"); }
    private static bool Match(string? value, string pattern) => value != null && Regex.IsMatch(value, pattern.Replace("$", "\\z"), RegexOptions.CultureInvariant | RegexOptions.NonBacktracking);
    private static bool ValidTag(string? tag) => tag != null && tag.Length is > 0 and <= 40 && tag.EnumerateRunes().All(rune => rune.Value is '_' or '-'
        || Rune.GetUnicodeCategory(rune) is UnicodeCategory.UppercaseLetter or UnicodeCategory.LowercaseLetter or UnicodeCategory.TitlecaseLetter
            or UnicodeCategory.ModifierLetter or UnicodeCategory.OtherLetter or UnicodeCategory.DecimalDigitNumber or UnicodeCategory.LetterNumber or UnicodeCategory.OtherNumber);
    private static void ValidId(string id) { if (!Match(id, "^[a-f0-9]{48}$")) throw new VybeException("invalid_request"); }
    private static string Hash(ReadOnlySpan<byte> bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static string Text(JsonElement data, string name) { Require(data.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String); return value.GetString()!; }
    private static long Integer(JsonElement data, string name) { Require(data.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number); Require(value.TryGetInt64(out var number)); return number; }
    private static DateTimeOffset Timestamp(JsonElement data, string name) { var value = Integer(data, name); Require(value is >= 0 and <= 253402300799999); return DateTimeOffset.FromUnixTimeMilliseconds(value); }
    private static IReadOnlyList<string> Strings(JsonElement data, string name, int count, int length)
    {
        Require(data.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array && value.GetArrayLength() <= count);
        var result = new List<string>(); foreach (var item in value.EnumerateArray()) { Require(item.ValueKind == JsonValueKind.String); var text = item.GetString()!; Require(text.Length <= length); result.Add(text); }
        return result.AsReadOnly();
    }
    public void Dispose()
    {
        lock (gate) { if (disposed) return; disposed = true; generation++; session = null; pending = null; }
        lifetime.Cancel(); http.Dispose(); /* Keep the cancelled token source valid for racing continuations. */
    }
}
