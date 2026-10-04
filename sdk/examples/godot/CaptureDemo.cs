using Godot;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using Vybe.Integration;

/// <summary>Trusted desktop host example. No requests run before a player action.</summary>
public partial class CaptureDemo : Control
{
    private readonly ConcurrentQueue<Action> mainThread = new();
    private VybeClient? client;
    private CancellationTokenSource? operation;
    private long epoch;
    private bool alive, busy, capturePending;
    private string? connectionId, uploadKey, reservedId;
    private string uploadCaption = "";
    private byte[]? selectedPng;
    private Uri? connectUri, reviewUri;
    private SubViewport game = null!;
    private TextureRect preview = null!;
    private ImageTexture? previewTexture;
    private Label status = null!, code = null!;
    private LineEdit caption = null!;
    private Button connect = null!, browser = null!, capture = null!, upload = null!, review = null!, discard = null!, disconnect = null!, cancel = null!;

    public override void _Ready()
    {
        alive = true;
        ProcessMode = ProcessModeEnum.Always; // Keep cancellation/expiry responsive when a host pauses gameplay.
        var margin = new MarginContainer(); margin.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        foreach (var side in new[] { "left", "top", "right", "bottom" }) margin.AddThemeConstantOverride("margin_" + side, 24);
        AddChild(margin);
        var scroll = new ScrollContainer(); margin.AddChild(scroll);
        var column = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill }; column.AddThemeConstantOverride("separation", 12); scroll.AddChild(column);
        column.AddChild(new Label { Text = "VYBE / GAME MOMENTS", Modulate = new Color("c6b3ff") });
        var title = new Label { Text = "Keep your next great moment." }; title.AddThemeFontSizeOverride("font_size", 28); column.AddChild(title);
        column.AddChild(new Label { Text = "Capture the game below. Preview it, then choose whether to upload.", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        game = new SubViewport { Size = new Vector2I(1280, 720), RenderTargetUpdateMode = SubViewport.UpdateMode.Always };
        AddChild(game); var world = new DemoWorld(); game.AddChild(world);
        var motion = new CheckButton { Text = "Pause scene animation", SizeFlagsHorizontal = SizeFlags.ShrinkBegin }; motion.Toggled += paused => world.Animate = !paused; column.AddChild(motion);
        var gameView = new TextureRect { Texture = game.GetTexture(), CustomMinimumSize = new Vector2(0, 230), ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize, StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered }; column.AddChild(gameView);
        status = new Label { Text = "Connect when you are ready.", AutowrapMode = TextServer.AutowrapMode.WordSmart }; column.AddChild(status);
        code = new Label { AutowrapMode = TextServer.AutowrapMode.WordSmart }; column.AddChild(code);
        var actions = new HFlowContainer(); column.AddChild(actions);
        connect = AddButton(actions, "Connect Vybe", StartConnect);
        browser = AddButton(actions, "Open approval page", () => Open(connectUri));
        capture = AddButton(actions, "Take screenshot", () => { capturePending = true; busy = true; Refresh(); });
        cancel = AddButton(actions, "Cancel request", () => operation?.Cancel());
        caption = new LineEdit { PlaceholderText = "Caption for this moment", MaxLength = 2200, CustomMinimumSize = new Vector2(0, 44) };
        foreach (string state in new[] { "normal", "focus", "read_only" }) caption.AddThemeStyleboxOverride(state, RoundedStyle(new Color("211b30")));
        column.AddChild(caption);
        preview = new TextureRect { CustomMinimumSize = new Vector2(0, 130), ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize, StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered, Visible = false }; column.AddChild(preview);
        var sharing = new HFlowContainer(); column.AddChild(sharing);
        upload = AddButton(sharing, "Upload privately", Upload);
        review = AddButton(sharing, "Review in Vybe", () => Open(reviewUri));
        discard = AddButton(sharing, "Discard private upload", Discard);
        disconnect = AddButton(sharing, "Disconnect", Disconnect);
        column.AddChild(new Label { Text = "Nothing posts automatically. Uploads stay private until you review and publish in Vybe. Closing the game forgets local credentials; Settings in Vybe manages server connections.", AutowrapMode = TextServer.AutowrapMode.WordSmart });
        try
        {
            string endpoint = ProjectSettings.GetSetting("vybe/api_endpoint", "").AsString();
            string id = ProjectSettings.GetSetting("vybe/client_id", "").AsString();
            bool loopback = OS.IsDebugBuild() && ProjectSettings.GetSetting("vybe/allow_local_emulator", false).AsBool();
            if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(id)) status.Text = "Developer setup: configure your registered Vybe client and trusted endpoint in Project Settings.";
            else client = new VybeClient(endpoint, id, loopback);
        }
        catch (VybeException) { status.Text = "Check the trusted Vybe endpoint and registered client configuration."; }
        VisibilityChanged += () => { if (!IsVisibleInTree()) { operation?.Cancel(); if (capturePending) { capturePending = false; busy = false; } ClearImage(true); connectUri = reviewUri = null; code.Text = ""; Refresh(); } };
        Refresh();
        if (OS.GetCmdlineUserArgs().Contains("--vybe-smoke-test")) CallDeferred(nameof(RunSmoke));
        else if (OS.GetCmdlineUserArgs().Contains("--vybe-render-check")) CallDeferred(nameof(RunRenderCheck));
    }

    public async void RunSmoke()
    {
        // Local engine/codec checks only. This mode never connects to a backend.
        try {
            if (client is not null) throw new InvalidOperationException("Smoke mode requires unconfigured defaults.");
            if (!connect.Disabled || !capture.Disabled || !upload.Disabled || !review.Disabled || preview.Visible) throw new InvalidOperationException("Initial controls must be inactive.");
            if (game.Size != new Vector2I(1280, 720)) throw new InvalidOperationException("Game capture viewport changed.");
            using var image = Image.CreateEmpty(16, 16, false, Image.Format.Rgba8);
            image.Fill(new Color("9f7aea"));
            selectedPng = image.SavePngToBuffer();
            if (selectedPng.Length < 12 || selectedPng[0] != 137) throw new InvalidOperationException("PNG codec failed.");
            var ownedBuffer = selectedPng; ClearImage();
            if (ownedBuffer.Any(value => value != 0) || selectedPng is not null) throw new InvalidOperationException("Capture cleanup failed.");
            int thread = System.Environment.CurrentManagedThreadId;
            var dispatched = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            Run(async (_, dispatch) => { await Task.Delay(10); dispatch(() => dispatched.TrySetResult(System.Environment.CurrentManagedThreadId == thread)); return () => { }; });
            if (!await dispatched.Task.WaitAsync(TimeSpan.FromSeconds(3))) throw new InvalidOperationException("Callbacks escaped the engine thread.");
            await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            Run(async (token, _) => { await Task.Delay(Timeout.Infinite, token); return () => { }; });
            operation!.Cancel();
            var deadline = DateTime.UtcNow.AddSeconds(3);
            while (busy && DateTime.UtcNow < deadline) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);
            if (busy) throw new InvalidOperationException("Cancellation did not release the controls.");
            capturePending = true; busy = true; Hide();
            if (capturePending || busy || selectedPng is not null) throw new InvalidOperationException("Hidden capture was not cancelled.");
            GD.Print("PASS Godot scene, controls, isolated viewport, PNG cleanup, engine-thread callbacks, request cancellation and hide cleanup");
            GetTree().Quit(0);
        } catch (Exception error) { GD.PushError(error.Message); GetTree().Quit(1); }
    }

    private Button AddButton(Container parent, string text, Action action)
    {
        var button = new Button { Text = text, CustomMinimumSize = new Vector2(0, 42) };
        foreach (var pair in new[] { ("normal", "382851"), ("hover", "513969"), ("pressed", "62447e"), ("disabled", "211b30") }) button.AddThemeStyleboxOverride(pair.Item1, RoundedStyle(new Color(pair.Item2)));
        var focus = RoundedStyle(new Color(0, 0, 0, 0)); focus.BorderColor = new Color("bca2eb"); focus.SetBorderWidthAll(2); button.AddThemeStyleboxOverride("focus", focus);
        button.AddThemeColorOverride("font_disabled_color", new Color("9c90b0"));
        button.Pressed += action; parent.AddChild(button); return button;
    }

    private static StyleBoxFlat RoundedStyle(Color color) => new() { BgColor = color,
        CornerRadiusTopLeft = 18, CornerRadiusTopRight = 18, CornerRadiusBottomLeft = 18, CornerRadiusBottomRight = 18,
        ContentMarginLeft = 18, ContentMarginRight = 18, ContentMarginTop = 8, ContentMarginBottom = 8 };

    public override void _Process(double delta)
    {
        while (mainThread.TryDequeue(out var action)) action();
        if (connectionId is not null && client?.Authorization?.ConnectionId != connectionId)
        {
            connectionId = null; ClearImage(true); reviewUri = null; reservedId = null;
            status.Text = "Your connection expired. Connect again; older private captures remain in Vybe."; Refresh();
        }
        // Read the preceding rendered game frame. The separate viewport excludes all account UI.
        if (capturePending)
        {
            capturePending = false;
            try
            {
                ClearImage(); using var image = game.GetTexture().GetImage();
                if (image.IsEmpty()) throw new InvalidOperationException();
                selectedPng = image.SavePngToBuffer();
                if (selectedPng.Length is < 12 or > VybeClient.MaxCaptureBytes) throw new InvalidOperationException();
                previewTexture = ImageTexture.CreateFromImage(image); preview.Texture = previewTexture; preview.Show();
                status.Text = "Screenshot ready. Review the image and caption before uploading.";
            }
            catch { ClearImage(); status.Text = "The game frame is not ready. Try taking another screenshot."; }
            finally { busy = false; Refresh(); }
        }
    }

    private void StartConnect()
    {
        var active = client!; connectionId = null; ClearImage(true); reservedId = null; reviewUri = connectUri = null; code.Text = "";
        Run(async (token, dispatch) => {
            var link = await active.StartLinkAsync(token);
            dispatch(() => { connectUri = link.VerificationUriComplete; code.Text = "Enter this code in Vybe: " + link.UserCode; status.Text = "Open Vybe to review and approve this connection."; Refresh(); });
            var authorization = await active.WaitForAuthorizationAsync(token);
            return () => { connectionId = authorization.ConnectionId; connectUri = null; code.Text = ""; status.Text = "Connected. Choose a game moment to capture."; };
        });
    }
    private void Upload()
    {
        if (selectedPng is null || connectionId is null) return;
        var active = client!; var bytes = selectedPng.ToArray();
        uploadKey ??= Guid.NewGuid().ToString("N");
        if (reservedId is null) uploadCaption = caption.Text;
        var key = uploadKey; var text = uploadCaption;
        Run(async (token, dispatch) => {
            try {
                var receipt = await active.StageCaptureAsync(bytes, "image/png", key, text, new[] { "gaming" },
                    progress => dispatch(() => status.Text = progress.Phase == "uploading" ? $"Uploading privately: {progress.UploadedBytes * 100L / Math.Max(1, progress.TotalBytes)}%" : "Checking your private capture…"),
                    receipt => dispatch(() => { reservedId = receipt.CaptureId; Refresh(); }), token);
                return () => { reservedId = receipt.CaptureId; reviewUri = receipt.ReviewUri; status.Text = "Private upload ready. Open Vybe to review and publish it."; };
            } finally { CryptographicOperations.ZeroMemory(bytes); }
        });
    }
    private void Discard()
    {
        if (reservedId is null) return;
        var active = client!; var id = reservedId;
        Run(async (token, _) => { await active.DiscardCaptureAsync(id, token); return () => { ClearImage(); reservedId = null; reviewUri = null; status.Text = "Private upload discarded."; }; });
    }
    private void Disconnect()
    {
        var active = client!; ClearImage(true); reviewUri = connectUri = null; code.Text = "";
        Run(async (token, _) => {
            try { await active.RevokeAsync(token); return () => { connectionId = null; reservedId = null; status.Text = "Disconnected from Vybe."; }; }
            catch { return () => { connectionId = null; reservedId = null; status.Text = "Local connection cleared. Server disconnect was not confirmed; use Connections in Vybe Settings."; }; }
        });
    }
    private void Run(Func<CancellationToken, Action<Action>, Task<Action>> work)
    {
        if (busy || !alive) return;
        busy = true; operation = new CancellationTokenSource(); var token = operation.Token; long current = ++epoch;
        void Dispatch(Action action) => mainThread.Enqueue(() => { if (alive && epoch == current) action(); });
        Refresh();
        _ = Task.Run(async () => {
            try { var complete = await work(token, Dispatch); Dispatch(complete); }
            catch (OperationCanceledException) { Dispatch(() => status.Text = "Request cancelled. An accepted upload may still exist; retry the same upload or review it in Vybe."); }
            catch (VybeException error) { Dispatch(() => status.Text = error.Message + (error.RetryAfterSeconds is > 0 ? $" Try again in {error.RetryAfterSeconds} seconds." : "")); }
            catch { Dispatch(() => status.Text = "Vybe could not finish this request. Your upload selection is kept for retry."); }
            finally { Dispatch(() => { busy = false; operation?.Dispose(); operation = null; if (connectionId is null) { connectUri = null; code.Text = ""; } Refresh(); }); }
        });
    }
    private void Open(Uri? uri) { if (uri is not null && uri.Scheme == "https" && uri.Host == "vybehub.app") OS.ShellOpen(uri.AbsoluteUri); }
    private void ClearImage(bool clearCaption = false)
    {
        if (selectedPng is not null) CryptographicOperations.ZeroMemory(selectedPng);
        selectedPng = null; uploadKey = null; uploadCaption = "";
        if (clearCaption && caption is not null) caption.Text = "";
        if (preview is not null) { preview.Texture = null; preview.Hide(); }
        previewTexture?.Dispose(); previewTexture = null;
    }
    private void Refresh()
    {
        bool linked = client?.Authorization is not null;
        connect.Disabled = client is null || busy; browser.Disabled = connectUri is null;
        capture.Disabled = !linked || busy || uploadKey is not null || reservedId is not null;
        upload.Disabled = !linked || busy || selectedPng is null || reviewUri is not null;
        upload.Text = uploadKey is null ? "Upload privately" : "Retry same upload";
        caption.Editable = !busy && uploadKey is null;
        review.Disabled = reviewUri is null || busy; discard.Disabled = !linked || busy || reservedId is null;
        disconnect.Disabled = !linked || busy; cancel.Disabled = !busy || operation is null;
    }
    public override void _ExitTree()
    {
        alive = false; epoch++; operation?.Cancel(); capturePending = false;
        ClearImage(true); client?.Dispose(); operation?.Dispose(); operation = null;
        while (mainThread.TryDequeue(out _)) { }
    }
}
