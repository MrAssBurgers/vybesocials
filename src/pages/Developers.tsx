import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Code2, Copy, Gamepad2, Layers3, ShieldCheck, UploadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';
import { toast } from 'sonner';

const repository = 'https://github.com/MrAssBurgers/vybesocials';
const javascriptExample = `import { VybePartnerClient } from '@vybe/integration-sdk/partner';

const vybe = new VybePartnerClient({
  clientId: 'your-reviewed-game',
  apiBaseUrl: 'https://us-central1-<project-id>.cloudfunctions.net/gamePartnerApi',
});

// The player approves this code inside VYBE.
await vybe.authorize({
  onUserCode: link => showLinkCode(link.userCode, link.verificationUriComplete),
});

// Keep this key with the capture and reuse it when retrying.
const uploadKey = crypto.randomUUID();
const capture = await vybe.stageCapture({
  idempotencyKey: uploadKey,
  media: screenshotBlob,
  contentType: 'image/png',
  caption: 'That last-second win.',
  tags: ['gaming'],
  onProgress: fraction => updateProgress(fraction),
});

// Show a Review in VYBE button; open it only when clicked.
reviewLink.href = vybe.getReviewUrl(capture);`;

const dotnetExample = `using Vybe.Integration;

// Add a project reference to sdk/dotnet/Vybe.Integration.
// Supply your registered public client ID and fixed HTTPS endpoint.
using var vybe = new VybeClient(trustedPartnerEndpoint, registeredClientId);

// Your host displays the code and an explicit browser-opening button.
var link = await vybe.StartLinkAsync(cancellationToken);
ShowConnectCode(link.UserCode, link.VerificationUriComplete);
await vybe.WaitForAuthorizationAsync(cancellationToken);

// Keep this key and the same encoded bytes when retrying.
var uploadKey = Guid.NewGuid().ToString("N");
var capture = await vybe.StageCaptureAsync(
    screenshotBytes, "image/png", uploadKey,
    caption: "That last-second win.", tags: new[] { "gaming" },
    onReserved: receipt => RememberPendingCapture(receipt.CaptureId),
    cancellationToken: cancellationToken);

// Your host UI methods; marshal callbacks onto your game's UI thread.
ShowReviewButton(capture.ReviewUri); // Never auto-open or auto-publish.`;

export default function Developers() {
  const [copiedExample, setCopiedExample] = useState<string | null>(null);
  const [platform, setPlatform] = useState('javascript');
  const example = platform === 'dotnet' ? dotnetExample : javascriptExample;
  const copied = copiedExample === example;
  usePageMeta({ title: 'Build with VYBE', description: 'Bring game moments to VYBE and build mini apps for your community.', canonicalPath: '/developers' });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(example);
      setCopiedExample(example);
      toast.success('Example copied');
    } catch {
      toast.error('Copy is unavailable here. Select the example to copy it.');
    }
  };
  return (
    <div className="page-scroll-fix bg-background text-foreground" style={{ paddingTop: 'var(--sat, 0px)', paddingBottom: 'calc(var(--sab, 0px) + 6rem)' }}>
      <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-6 sm:px-8">
        <nav className="flex items-center justify-between gap-3" aria-label="Developer navigation">
          <Button variant="ghost" asChild><Link to="/home"><ArrowLeft className="mr-2 h-4 w-4" />VYBE</Link></Button>
          <a href={`${repository}/tree/main/sdk`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2">View SDK source<ArrowUpRight className="h-4 w-4" /></a>
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-6 sm:p-10">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-primary"><Code2 className="h-4 w-4" />VYBE DEVELOPERS</div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">Your world.<br /><span className="text-primary">More connected.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Bring VYBE into games, mods, and creative tools. Build little experiences your community can play, use, and make their own.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg"><a href="#game-capture"><Gamepad2 className="mr-2 h-4 w-4" />Build an integration</a></Button>
            <Button asChild size="lg" variant="outline"><Link to="/mini-apps"><Layers3 className="mr-2 h-4 w-4" />Open Mini App Studio</Link></Button>
          </div>
        </section>

        <section id="game-capture" className="scroll-mt-6 space-y-5" aria-labelledby="capture-title">
          <div className="flex flex-wrap items-center gap-3"><h2 id="capture-title" className="text-2xl font-semibold">From your world to the feed</h2><span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">Partner SDK · developer preview</span></div>
          <p className="max-w-3xl leading-relaxed text-muted-foreground">Capture a screenshot or short clip, upload it privately, and let the player finish their post in VYBE. Their caption and final publish decision stay in their hands.</p>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Gamepad2, title: 'Capture the moment', text: 'Pass PNG, JPEG, WebP, MP4, or WebM media from your game, mod, or tool. Up to 48 MiB per capture.' },
              { icon: UploadCloud, title: 'Stage it privately', text: 'Show upload progress, cancel when needed, and retry using the same capture key. Drafts expire after 24 hours.' },
              { icon: ShieldCheck, title: 'Review in VYBE', text: 'Open the player’s review link from a button. VYBE uses its existing post composer and moderation checks.' },
            ].map(({ icon: Icon, title, text }, index) => <li key={title} className="rounded-2xl border border-border bg-card p-5"><div className="mb-5 flex items-center justify-between text-primary"><Icon className="h-6 w-6" /><span className="text-sm text-muted-foreground">0{index + 1}</span></div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></li>)}
          </ol>
          <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
            <h3 className="font-semibold">Before you connect</h3>
            <p className="mt-2 text-muted-foreground">The partner preview requires a reviewed integration registration and deployed capture services. Players approve a matching code in VYBE, giving your integration ten minutes to send captures for review and check their status. They can revoke the connection in Settings. Sessions stay in memory and require linking again when they expire. Never collect a player’s VYBE password in your game.</p>
          </div>
          <Tabs value={platform} onValueChange={value => { setPlatform(value); setCopiedExample(null); }} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"><TabsList aria-label="SDK language"><TabsTrigger value="javascript">JavaScript / TypeScript</TabsTrigger><TabsTrigger value="dotnet">C# / .NET 8</TabsTrigger></TabsList><Button size="sm" variant="ghost" onClick={copy} aria-label="Copy SDK example">{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</Button></div>
            <TabsContent value={platform} className="m-0"><pre className="max-w-full overflow-x-auto p-5 text-xs leading-6 sm:text-sm" tabIndex={0} aria-label={platform === 'dotnet' ? 'C# capture SDK example' : 'JavaScript capture SDK example'}><code>{example}</code></pre></TabsContent>
          </Tabs>
          <p className="text-sm leading-relaxed text-muted-foreground">{platform === 'dotnet' ? 'The .NET pilot requires a .NET 8 host and a local package or project reference. It has no Firebase dependency. Unity/Mono and individual mod loaders are not yet certified. The example’s display and review methods are supplied by your host.' : 'Use the host-neutral SDK for a complete integration lifecycle, or the HTTP client shown here for direct control. The SDK accepts already-encoded captures; your host supplies recording, screenshots, and its own interface.'}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild><a href={`${repository}/blob/main/docs/UNIVERSAL_SDK.md`} target="_blank" rel="noopener noreferrer">Universal SDK &amp; example host<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
            <Button variant="outline" asChild><a href={`${repository}/blob/main/sdk/dotnet/README.md`} target="_blank" rel="noopener noreferrer">.NET integration guide<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
            <Button variant="outline" asChild><a href={`${repository}/blob/main/docs/PARTNER_GAME_SDK.md`} target="_blank" rel="noopener noreferrer">Partner integration guide<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
            <Button variant="outline" asChild><a href={`${repository}/blob/main/docs/PARTNER_GAME_API.md`} target="_blank" rel="noopener noreferrer">HTTP API reference<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
            <Button variant="outline" asChild><Link to="/connect/game">Enter a game code</Link></Button>
            <Button variant="outline" asChild><a href={`${repository}/tree/main/sdk`} target="_blank" rel="noopener noreferrer">SDK source<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 sm:p-8" aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="text-2xl font-semibold">A capture gallery inside your host</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">Let players browse captures from their current connection, preview one they choose, check upload status, or discard an unpublished capture. Previewing media requires an extra permission that the player approves. Final posting stays in VYBE.</p>
          <p className="mt-3 text-sm text-muted-foreground">JavaScript includes an optional gallery interface. The .NET client supplies gallery data and preview bytes for your own interface. A general social feed, messages, recording tools, and engine-specific overlays are still in development.</p>
          <Button className="mt-5" variant="outline" asChild><a href={`${repository}/blob/main/docs/PARTNER_CAPTURE_GALLERY.md`} target="_blank" rel="noopener noreferrer">Capture gallery guide<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
        </section>

        <section className="grid gap-6 rounded-3xl border border-accent/25 bg-accent/5 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center" aria-labelledby="mini-title">
          <div><Layers3 className="mb-4 h-7 w-7 text-accent" /><h2 id="mini-title" className="text-2xl font-semibold">Small apps. Your ideas.</h2><p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">Start with a game, tool, or art template. Edit HTML, CSS, and JavaScript, try it in the preview, then publish a snapshot to the Hub. Keep experimenting in a private draft until your next release is ready.</p><p className="mt-3 text-sm text-muted-foreground">Mini apps run in a separate preview without VYBE account access. An app may contact outside services. Only launch code from creators you trust.</p></div>
          <Button asChild size="lg"><Link to="/mini-apps">Start building<ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>
        </section>
      </div>
    </div>
  );
}
