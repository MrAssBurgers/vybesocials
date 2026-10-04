namespace Vybe.Integration;

// These public values intentionally contain no bearer token, device secret or Firebase identity.
public sealed record DeviceLink(string UserCode, Uri VerificationUri, Uri VerificationUriComplete,
    DateTimeOffset ExpiresAt, int IntervalSeconds);
public sealed record Authorization(string ConnectionId, DateTimeOffset ExpiresAt, IReadOnlyList<string> Scopes);
public sealed record CaptureReceipt(string CaptureId, string Status, string GameId, string GameName,
    string ContentType, int ByteSize, string Caption, IReadOnlyList<string> Tags,
    DateTimeOffset ExpiresAt, string? PostId, Uri ReviewUri);
public sealed record CaptureProgress(string Phase, int UploadedBytes, int TotalBytes);

/// <summary>A sanitized protocol failure. Response bodies and underlying transport exceptions are never exposed.</summary>
public sealed class VybeException : Exception
{
    public string Code { get; }
    public int Status { get; }
    public int? RetryAfterSeconds { get; }
    internal static readonly IReadOnlyDictionary<string, string> Messages = new Dictionary<string, string>
    {
        ["authorization_pending"] = "Waiting for the player to approve in Vybe.",
        ["slow_down"] = "Wait longer before checking the connection again.",
        ["access_denied"] = "This connection was declined or cannot perform that action.",
        ["expired_token"] = "The link code expired. Start linking again.",
        ["invalid_grant"] = "Start a new link request.",
        ["invalid_token"] = "The connection expired or was revoked. Link Vybe again.",
        ["insufficient_scope"] = "This connection does not have the required permission.",
        ["not_found"] = "This capture is unavailable to this connection.",
        ["conflict"] = "The capture changed or its key was reused for different content.",
        ["expired_capture"] = "This capture has expired.",
        ["payload_too_large"] = "Captures must be no larger than 48 MiB.",
        ["invalid_request"] = "Vybe could not accept this request.",
        ["rate_limited"] = "A request or capture limit was reached. Try again later.",
        ["unavailable"] = "Vybe is temporarily unavailable.",
        ["network_error"] = "The request could not reach Vybe. Retry with the same capture key.",
        ["invalid_response"] = "Vybe returned an unexpected response.",
        ["authorization_changed"] = "The connected account changed. Start this action again."
    };
    internal VybeException(string code, int status = 0, int? retryAfter = null)
        : base(Messages.TryGetValue(code, out var message) ? message : Messages["invalid_request"])
    { Code = Messages.ContainsKey(code) ? code : "invalid_request"; Status = status; RetryAfterSeconds = retryAfter; }
}
