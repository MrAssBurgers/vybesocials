// Integration example for Unity with Firebase Auth, Functions and Storage SDKs.
// Initialize Firebase and sign the player into their VYBE account first.
// This file is a source example; it has not been compiled in a Unity project here.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Functions;
using Firebase.Storage;

public sealed class VybeGameCapture
{
    private readonly FirebaseAuth auth;
    private readonly FirebaseFunctions functions;
    private readonly FirebaseStorage storage;

    public VybeGameCapture(FirebaseApp app)
    {
        auth = FirebaseAuth.GetAuth(app);
        functions = FirebaseFunctions.GetInstance(app, "us-central1");
        storage = FirebaseStorage.GetInstance(app);
    }

    public sealed class Capture
    {
        public string Id;
        public string Status;
        public string StoragePath;
        public string ReviewUrl { get { return "https://vybehub.app/game-capture/" + Id; } }
    }

    // Keep captureKey with the SAME bytes across retries. Generate it once using
    // Guid.NewGuid().ToString("N"). Retain the returned Id before uploading.
    public async Task<Capture> BeginAsync(string gameId, string captureKey, string mime, int byteSize, string caption = "")
    {
        if (auth.CurrentUser == null) throw new InvalidOperationException("Sign in to VYBE first.");
        if (byteSize < 12 || byteSize > 48 * 1024 * 1024) throw new ArgumentOutOfRangeException("byteSize");
        var result = await functions.GetHttpsCallable("createGameCapture").CallAsync(new Dictionary<string, object> {
            { "gameId", gameId }, { "idempotencyKey", captureKey }, { "contentType", mime },
            { "byteSize", byteSize }, { "caption", caption }, { "tags", new string[0] }
        });
        return Parse(result.Data);
    }

    public async Task<Capture> UploadAsync(Capture capture, byte[] bytes, string mime, CancellationToken cancellationToken)
    {
        if (capture.Status == "ready" || capture.Status == "imported") return capture;
        string uid = auth.CurrentUser == null ? null : auth.CurrentUser.UserId;
        if (uid == null || capture.StoragePath != "game-captures/" + uid + "/" + capture.Id)
            throw new InvalidOperationException("This capture belongs to another account.");
        cancellationToken.ThrowIfCancellationRequested();
        var metadata = new MetadataChange { ContentType = mime };
        await storage.GetReference(capture.StoragePath).PutBytesAsync(bytes, metadata, null, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        return await ResumeAsync(capture.Id);
    }

    // After an interrupted upload, call ResumeAsync first. If it reports that
    // upload is required, retry UploadAsync. Never overwrite a completed object.
    public async Task<Capture> ResumeAsync(string captureId)
    {
        if (!Regex.IsMatch(captureId ?? "", "^[a-f0-9]{48}$")) throw new ArgumentException("Invalid capture ID.");
        var result = await functions.GetHttpsCallable("finishGameCapture").CallAsync(new Dictionary<string, object> {
            { "captureId", captureId }
        });
        return Parse(result.Data);
    }

    private static Capture Parse(object payload)
    {
        var data = payload as IDictionary;
        if (data == null) throw new InvalidOperationException("Invalid capture response.");
        var result = new Capture {
            Id = Convert.ToString(data["captureId"]), Status = Convert.ToString(data["status"]),
            StoragePath = Convert.ToString(data["storagePath"])
        };
        if (!Regex.IsMatch(result.Id ?? "", "^[a-f0-9]{48}$")) throw new InvalidOperationException("Invalid capture ID.");
        return result;
    }
}

// Typical game flow (from your own screenshot/replay UI on the main thread):
// byte[] png = screenshotTexture.EncodeToPNG();
// var capture = await vybe.BeginAsync("your-registered-game", savedKey, "image/png", png.Length, "Victory!");
// Persist capture.Id locally before calling UploadAsync so retries can recover.
// capture = await vybe.UploadAsync(capture, png, "image/png", cancellationToken);
// Show an "Open VYBE to review" button; on the next user click:
// UnityEngine.Application.OpenURL(capture.ReviewUrl);
// No publish API or account passwords are embedded in this game.
