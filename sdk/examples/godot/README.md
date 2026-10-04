# Godot desktop capture example

A concrete Godot **4.5.1 .NET / .NET 8** project using the Vybe partner SDK. Start with `project.godot` in the .NET editor. The sample game renders to its own 1280x720 SubViewport, so the screenshot excludes the connect code, caption, and Vybe panel. The source is a trusted host example, not an API to expose to untrusted scripts.

## Setup

1. Build from the repository root: `dotnet build sdk/examples/godot/VybeGodot.csproj -c Debug`.
2. Obtain a registered public integration client ID and its trusted partner API endpoint. Set `vybe/api_endpoint` and `vybe/client_id` in Project Settings (Advanced) or `project.godot`. These are public configuration, never passwords, bearer tokens, Firebase tokens or service-account keys.
3. Open the project in the matching Godot .NET editor and run the main scene. All networking is disabled while configuration is absent. For isolated emulator development only, `vybe/allow_local_emulator` allows loopback HTTP in debug builds; release builds require HTTPS.
4. Choose **Connect Vybe**, then **Open approval page** and approve the displayed code in Vybe. The approval/review URLs come from the validated SDK and open only after an explicit button press. Local emulator tests require entering the code in the local Vybe preview manually; the official browser URL is never rewritten to an untrusted host.
5. Choose **Take screenshot**, inspect the frozen preview and caption, then **Upload privately**. **Review in Vybe** opens the player's private capture for a separate publish decision. The game never posts automatically.

## Behavior and integration

- `CaptureDemo.cs` owns the UI, SDK client, cancellation, player consent and screenshot selection. Adapt it into your own pause/share panel; use a dedicated trusted game viewport. `DemoWorld.cs` supplies the sample moving background and text. Pause scene animation is an explicit motion control.
- One operation runs at a time. Async HTTP work and progress callbacks marshal changes through a queue drained by the engine thread. Scene exit cancels work, invalidates queued callbacks, clears screenshot bytes/textures, and disposes the SDK. Hiding the panel cancels work and clears selected media. Focus loss alone does not cancel browser approval.
- Captures read the preceding rendered frame, encode PNG in memory and display an ImageTexture. No screenshot file is written. SDK upload also snapshots bytes; account for both copies, PNG encoding and GPU readback cost. The sample's fixed viewport bounds pixel allocation; replacing it with an arbitrary large game viewport requires your own dimension and frame-budget limits.
- An upload freezes its caption, bytes and idempotency key. **Retry same upload** reuses them; it never creates a fresh upload key after an uncertain response. A known reserved capture can be discarded. A cancellation or lost response can leave a private capture on the server; review it in Vybe. Taking another screenshot is disabled once an upload starts until discard/relink clears the pending selection.
- **Disconnect** requests server revocation and clears local state. An unconfirmed revoke is reported explicitly with directions to Vybe Settings. Closing a scene/game only forgets local credentials; it does not claim server revocation. Expiry clears the pending selection; relinking cannot adopt the old connection's captures.
- Capture defaults request only upload/status permissions. This example does not implement an in-game feed, gallery, video recorder, audio capture, automatic publishing, Unity/Mono compatibility, console support or mobile/web export certification. The underlying .NET SDK exposes optional public browsing separately.

## Verification and limits

The project compiles with zero warnings against Godot.NET.Sdk 4.5.1. The official Godot 4.5.1 .NET engine loaded the scene headlessly and verified inactive unconfigured controls, the isolated viewport dimensions, PNG encoding, buffer zeroing, engine-thread dispatch, request cancellation and hide cleanup:

```sh
godot --headless --path sdk/examples/godot -- --vybe-smoke-test
```

The smoke mode requires unconfigured defaults and never contacts a backend. CI compiles this project; the headless engine smoke was run locally and requires installing the matching engine. The real OpenGL renderer has also produced an inspected 960x800 panel image and a separate 1280x720 gameplay PNG. The capture contains only the game viewport. Keyboard/controller interaction and the complete Godot-to-emulator consent/upload/review flow still need verification. SDK HTTP behavior is covered separately by the compiled .NET checks and prior emulator walkthrough; that is not proof of engine UI or graphics behavior. Do not claim engine certification from compilation or headless checks.

References: [Godot 4.5 C# setup](https://docs.godotengine.org/en/4.5/tutorials/scripting/c_sharp/c_sharp_basics.html), [Viewport texture capture](https://docs.godotengine.org/en/4.5/classes/class_viewport.html), [Image PNG encoding](https://docs.godotengine.org/en/4.5/classes/class_image.html), [official 4.5.1 download](https://godotengine.org/download/archive/4.5.1-stable/).


For a local render proof with no network/configuration, run the debug project with a real display/rendering driver and `-- --vybe-render-check --vybe-qa-output=<absolute-local-directory>`. The check waits for four rendered frames and saves `panel.png` and `gameplay.png`, then exits. It rejects headless/dummy display, configured clients and non-debug builds. This verifies scene rendering and GPU readback, not an authenticated upload or user interaction. `CaptureDemo.Qa.cs` contains the render check; no emulator upload automation is included.
