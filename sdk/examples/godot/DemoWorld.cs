using Godot;

public partial class DemoWorld : Node2D
{
    public bool Animate { get; set; } = true;
    private double time;
    private GradientTexture2D glow = null!;
    public override void _Ready()
    {
        glow = new GradientTexture2D { Width = 256, Height = 256, Fill = GradientTexture2D.FillEnum.Radial,
            FillFrom = new Vector2(.5f, .5f), FillTo = new Vector2(1, .5f),
            Gradient = new Gradient { Offsets = new[] { 0f, .25f, .65f, 1f }, Colors = new[] { new Color(1, 1, 1, .8f), new Color(1, 1, 1, .5f), new Color(1, 1, 1, .1f), new Color(1, 1, 1, 0) } } };
    }
    public override void _ExitTree() { glow?.Dispose(); }
    public override void _Process(double delta) { if (Animate) { time += delta; QueueRedraw(); } }
    public override void _Draw()
    {
        DrawRect(new Rect2(0, 0, 1280, 720), new Color("151328"));
        for (int i = 0; i < 9; i++) {
            var position = new Vector2(640 + Mathf.Sin((float)time * .22f + i * .7f) * 450, 360 + Mathf.Cos((float)time * .17f + i * 1.2f) * 230);
            var color = Color.FromHsv(.7f + i * .025f, .5f, .8f, .65f);
            DrawTextureRect(glow, new Rect2(position - new Vector2(130, 130), new Vector2(260, 260)), false, color);
        }
        DrawString(ThemeDB.FallbackFont, new Vector2(90, 330), "YOUR NEXT GREAT MOMENT", fontSize: 48, modulate: new Color("e4dcff"));
        DrawString(ThemeDB.FallbackFont, new Vector2(94, 385), "A small world. A story worth sharing.", fontSize: 28, modulate: new Color("b5a6cf"));
    }
}
