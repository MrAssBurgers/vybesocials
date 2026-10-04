using System.Globalization;
using System.Text.Json;

namespace Vybe.Integration;

public sealed partial class VybeClient
{
    /// <summary>Read explicitly public, safe-labelled metadata. Does not fetch media. Clear host copies on disconnect or expiry.</summary>
    public async Task<PublicFeedPage> BrowsePublicFeedAsync(string? contentType = null, string? cursor = null,
        CancellationToken cancellationToken = default)
    {
        var active = RequireSession();
        if (!active.Authorization.Scopes.Contains("feed:read_public")) throw new VybeException("insufficient_scope");
        if (contentType != null && contentType is not ("post" or "short" or "video")
            || cursor != null && !Match(cursor, "^[a-f0-9]{48}$")) throw new VybeException("invalid_request");
        var query = new List<string>();
        if (contentType != null) query.Add("contentType=" + Uri.EscapeDataString(contentType));
        if (cursor != null) query.Add("cursor=" + cursor);
        var data = await RequestAsync("/v1/feed" + (query.Count > 0 ? "?" + string.Join("&", query) : ""),
            HttpMethod.Get, active.Generation, active, retry: true, cancellationToken: cancellationToken,
            jsonLimit: 8 * 1024 * 1024).ConfigureAwait(false);
        ExactFields(data, "connectionId expiresAt contentType nextCursor posts");
        var expiry = Timestamp(data, "expiresAt");
        Require(Text(data, "connectionId") == active.Authorization.ConnectionId && NullableText(data, "contentType") == contentType
            && expiry > now() && expiry <= active.Authorization.ExpiresAt.AddSeconds(1));
        // Token expiresIn rounds down; never extend the earlier local deadline.
        if (expiry > active.Authorization.ExpiresAt) expiry = active.Authorization.ExpiresAt;
        var next = NullableText(data, "nextCursor"); Require(next == null || Match(next, "^[a-f0-9]{48}$") && next != cursor);
        var values = Field(data, "posts"); Require(values.ValueKind == JsonValueKind.Array && values.GetArrayLength() <= 20);
        var seen = new HashSet<string>(); var posts = new List<PublicFeedPost>();
        foreach (var row in values.EnumerateArray())
        {
            ExactFields(row, "id type caption createdAt mediaUrl mediaUrls thumbnailUrl ageRating likeCount commentCount viewCount tags author");
            var id = FeedId(row, "id"); Require(seen.Add(id));
            var type = Text(row, "type"); Require(type is "post" or "short" or "video" && (contentType == null || type == contentType));
            var caption = Text(row, "caption"); Require(caption.Length <= 10000 && Text(row, "ageRating") == "safe");
            var created = Text(row, "createdAt");
            Require(created.Length <= 32 && Match(created, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T")
                && DateTimeOffset.TryParse(created, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _));
            var media = FeedUri(row, "mediaUrl"); var thumbnail = FeedUri(row, "thumbnailUrl");
            Require(media != null || type == "post" && caption.Trim().Length > 0);
            var mediaRows = Field(row, "mediaUrls"); Require(mediaRows.ValueKind == JsonValueKind.Array && mediaRows.GetArrayLength() <= 20);
            var urls = new List<Uri>();
            foreach (var url in mediaRows.EnumerateArray()) { Require(url.ValueKind == JsonValueKind.String); urls.Add(FeedUriValue(url.GetString()!)); }
            var author = Field(row, "author"); ExactFields(author, "id username displayName avatarUrl");
            var username = Text(author, "username"); var display = NullableText(author, "displayName");
            Require(username.Length <= 100 && username.Trim().Length > 0 && (display == null || display.Length <= 200));
            posts.Add(new(id, type, caption, DateTimeOffset.Parse(created, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                media, urls.AsReadOnly(), thumbnail, "safe", FeedCount(row, "likeCount"), FeedCount(row, "commentCount"), FeedCount(row, "viewCount"),
                Strings(row, "tags", 30, 100), new(FeedId(author, "id"), username, display, FeedUri(author, "avatarUrl"))));
        }
        Check(active.Generation, active); cancellationToken.ThrowIfCancellationRequested();
        return new(active.Authorization.ConnectionId, expiry, contentType, next, posts.AsReadOnly());
    }

    private static JsonElement Field(JsonElement data, string key)
    { Require(data.ValueKind == JsonValueKind.Object && data.TryGetProperty(key, out _)); return data.GetProperty(key); }
    private static string? NullableText(JsonElement data, string key)
    { var value = Field(data, key); Require(value.ValueKind is JsonValueKind.Null or JsonValueKind.String); return value.ValueKind == JsonValueKind.Null ? null : value.GetString(); }
    private static void ExactFields(JsonElement value, string keys)
    {
        Require(value.ValueKind == JsonValueKind.Object);
        var expected = keys.Split(' ').ToHashSet(StringComparer.Ordinal);
        foreach (var property in value.EnumerateObject()) Require(expected.Remove(property.Name));
        Require(expected.Count == 0);
    }
    private static string FeedId(JsonElement row, string key)
    { var value = Text(row, key); Require(value.Length is > 0 and <= 1500 && !value.Any(c => char.IsWhiteSpace(c) || c == '/')); return value; }
    private static long FeedCount(JsonElement row, string key)
    { var value = Integer(row, key); Require(value is >= 0 and <= 9007199254740991); return value; }
    private static Uri? FeedUri(JsonElement row, string key)
    { var value = NullableText(row, key); return value == null ? null : FeedUriValue(value); }
    private static Uri FeedUriValue(string value)
    {
        Require(value.Length <= 8192 && Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.UserInfo.Length == 0);
        return new Uri(value, UriKind.Absolute);
    }
}
