using Godot;

public partial class CaptureDemo
{
    private string QaOutput()
    {
        var value = OS.GetCmdlineUserArgs().SingleOrDefault(arg => arg.StartsWith("--vybe-qa-output=", StringComparison.Ordinal));
        if (value is null) throw new InvalidOperationException("Pass --vybe-qa-output with a local output directory.");
        string directory = System.IO.Path.GetFullPath(value["--vybe-qa-output=".Length..]);
        System.IO.Directory.CreateDirectory(directory); return directory;
    }

    public async void RunRenderCheck()
    {
        try
        {
            if (!OS.IsDebugBuild() || client is not null || DisplayServer.GetName() == "headless") throw new InvalidOperationException("Render checks need an unconfigured debug project and a real renderer.");
            string output = QaOutput();
            for (int frame = 0; frame < 4; frame++) await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);
            using var scene = GetViewport().GetTexture().GetImage();
            using var gameplay = game.GetTexture().GetImage();
            if (scene.IsEmpty() || gameplay.IsEmpty() || gameplay.GetWidth() != 1280 || gameplay.GetHeight() != 720) throw new InvalidOperationException("Rendered viewport readback failed.");
            if (scene.SavePng(System.IO.Path.Combine(output, "panel.png")) != Error.Ok || gameplay.SavePng(System.IO.Path.Combine(output, "gameplay.png")) != Error.Ok) throw new InvalidOperationException("Could not save render proof.");
            GD.Print("PASS rendered Godot panel and isolated 1280x720 gameplay readback");
            GetTree().Quit(0);
        }
        catch (Exception error) { GD.PushError(error.Message); GetTree().Quit(1); }
    }
}
