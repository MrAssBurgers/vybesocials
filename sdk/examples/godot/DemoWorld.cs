using Godot;

public partial class DemoWorld : Node2D
{
    public bool Animate { get; set; } = true;
    private double time;
    public override void _Process(double delta) { if (Animate) { time += delta; QueueRedraw(); } }
    public override void _Draw()
    {
        DrawRect(new Rect2(0, 0, 1280, 720), new Color("151328"));
        for (int i = 0; i < 9; i++) {
            var position = new Vector2(640 + Mathf.Sin((float)time * .22f + i * .7f) * 450, 360 + Mathf.Cos((float)time * .17f + i * 1.2f) * 230);
            var color = Color.FromHsv(.7f + i * .025f, .5f, .8f, .12f);
            for (int ring = 10; ring > 0; ring--) DrawCircle(position, 13 + ring * 7, color with { A = .012f * (11 - ring) });
        }
        DrawString(ThemeDB.FallbackFont, new Vector2(90, 330), "YOUR NEXT GREAT MOMENT", fontSize: 48, modulate: new Color("e4dcff"));
        DrawString(ThemeDB.FallbackFont, new Vector2(94, 385), "A small world. A story worth sharing.", fontSize: 28, modulate: new Color("b5a6cf"));
    }
}
