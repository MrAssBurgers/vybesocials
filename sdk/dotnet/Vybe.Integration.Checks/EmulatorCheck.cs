using System.Text.Json;
using Vybe.Integration;

internal static class EmulatorCheck
{
    internal static async Task Run()
    {
        foreach (var (name, expected) in new[] { ("GCLOUD_PROJECT", "demo-vybe-preview"), ("FUNCTIONS_EMULATOR_HOST", "127.0.0.1:5101"), ("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9199"), ("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8280"), ("FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9399") })
            if (Environment.GetEnvironmentVariable(name) != expected) throw new Exception("Refusing non-demo target");
        using var client = new VybeClient("http://127.0.0.1:5101/demo-vybe-preview/us-central1/gamePartnerApi", "local-dotnet-mod", true, previewCaptures: true);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        var link = await client.StartLinkAsync(timeout.Token);
        Console.WriteLine(JsonSerializer.Serialize(new { eventType = "link", userCode = link.UserCode }));
        await client.WaitForAuthorizationAsync(timeout.Token);
        // Valid synthetic 1x1 PNG. No filesystem/user media is accessed.
        var bytes = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=");
        var key = Guid.NewGuid().ToString("N");
        var ready = await client.StageCaptureAsync(bytes, "image/png", key, caption: "  Synthetic .NET mod capture — local QA only  ",
            tags: new[] { "遊戲", "dotnet", "dotnet" }, cancellationToken: timeout.Token);
        if (ready.Status != "ready" || ready.Caption != "Synthetic .NET mod capture — local QA only" || ready.Tags.Count != 2) throw new Exception("Bad capture");
        var replay = await client.StageCaptureAsync(bytes, "image/png", key, caption: ready.Caption, tags: ready.Tags, cancellationToken: timeout.Token);
        var status = await client.GetCaptureAsync(ready.CaptureId, timeout.Token);
        if (replay.CaptureId != ready.CaptureId || status.Status != "ready") throw new Exception("Recovery failed");
        var page = await client.ListCapturesAsync(cancellationToken: timeout.Token);
        if (!page.Captures.Any(row => row.CaptureId == ready.CaptureId)) throw new Exception("Capture missing from own gallery");
        using var preview = await client.GetCapturePreviewAsync(ready.CaptureId, timeout.Token);
        var retainedPreview = preview.Bytes;
        if (!retainedPreview.Span.SequenceEqual(bytes)) throw new Exception("Preview bytes differ");
        await client.CheckCapturePreviewAsync(ready.CaptureId, timeout.Token);
        var disposable = await client.StageCaptureAsync(bytes, "image/png", Guid.NewGuid().ToString("N"), cancellationToken: timeout.Token);
        await client.DiscardCaptureAsync(disposable.CaptureId, timeout.Token);
        try { await client.GetCaptureAsync(disposable.CaptureId, timeout.Token); throw new Exception("Discard did not persist"); }
        catch (VybeException error) when (error.Code == "expired_capture") { }
        await client.RevokeAsync(timeout.Token);
        if (client.Authorization != null) throw new Exception("Credentials retained");
        if (retainedPreview.ToArray().Any(value => value != 0)) throw new Exception("Preview retained after disconnect");
        Console.WriteLine(JsonSerializer.Serialize(new { eventType = "complete", captureId = ready.CaptureId, reviewUrl = "http://127.0.0.1:8082/game-capture/" + ready.CaptureId, checks = new[] { "explicit preview consent", "upload", "normalized metadata", "idempotent retry", "status", "own gallery", "preview bytes and hash", "HEAD access check", "discard", "revoke clears preview" } }));
    }
}
