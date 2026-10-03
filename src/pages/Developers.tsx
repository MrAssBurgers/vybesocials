import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Code2, Copy, Gamepad2, Layers3, ShieldCheck, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';
import { toast } from 'sonner';

const repository = 'https://github.com/MrAssBurgers/vybesocials';
const example = `import { createFirebaseGameClient } from './sdk/game/firebase';

// firebaseApp uses the player's signed-in VYBE account.
const vybe = createFirebaseGameClient(firebaseApp);

// Keep this key with the capture and reuse it when retrying.
const uploadKey = crypto.randomUUID();
const capture = await vybe.stageCapture({
  gameId: 'your-registered-game',
  idempotencyKey: uploadKey,
  media: screenshotBlob,
  contentType: 'image/png',
  caption: 'That last-second win.',
  tags: ['gaming'],
  onProgress: fraction => updateProgress(fraction),
});

// Show a Review in VYBE button; open it only when clicked.
reviewLink.href = vybe.getReviewUrl(capture);`;

export default function Developers() {
  const [copied, setCopied] = useState(false);
  usePageMeta({ title: 'Build with VYBE', description: 'Bring game moments to VYBE and build mini apps for your community.', canonicalPath: '/developers' });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(example);
      setCopied(true);
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
          <a href={`${repository}/tree/main/sdk/game`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2">View SDK source<ArrowUpRight className="h-4 w-4" /></a>
        </nav>

        <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-6 sm:p-10">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-primary"><Code2 className="h-4 w-4" />VYBE DEVELOPERS</div>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">Your world.<br /><span className="text-primary">More connected.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Bring your best game moments into the conversation. Build little experiences your community can play, use, and make their own.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg"><a href="#game-capture"><Gamepad2 className="mr-2 h-4 w-4" />Build a game integration</a></Button>
            <Button asChild size="lg" variant="outline"><Link to="/mini-apps"><Layers3 className="mr-2 h-4 w-4" />Open Mini App Studio</Link></Button>
          </div>
        </section>

        <section id="game-capture" className="scroll-mt-6 space-y-5" aria-labelledby="capture-title">
          <div className="flex flex-wrap items-center gap-3"><h2 id="capture-title" className="text-2xl font-semibold">From gameplay to the feed</h2><span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">Game Capture SDK · v1</span></div>
          <p className="max-w-3xl leading-relaxed text-muted-foreground">Capture a screenshot or short clip, upload it privately, and let the player finish their post in VYBE. Their caption and final publish decision stay in their hands.</p>
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Gamepad2, title: 'Capture the moment', text: 'Pass PNG, JPEG, WebP, MP4, or WebM media from your game. Up to 48 MiB per capture.' },
              { icon: UploadCloud, title: 'Stage it privately', text: 'Show upload progress, cancel when needed, and retry using the same capture key. Drafts expire after 24 hours.' },
              { icon: ShieldCheck, title: 'Review in VYBE', text: 'Open the player’s review link from a button. VYBE uses its existing post composer and moderation checks.' },
            ].map(({ icon: Icon, title, text }, index) => <li key={title} className="rounded-2xl border border-border bg-card p-5"><div className="mb-5 flex items-center justify-between text-primary"><Icon className="h-6 w-6" /><span className="text-sm text-muted-foreground">0{index + 1}</span></div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></li>)}
          </ol>
          <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
            <h3 className="font-semibold">Before you connect</h3>
            <p className="mt-2 text-muted-foreground">This first release supports registered, trusted games using the same Firebase project and the player’s authenticated session. A VYBE administrator must enable your game ID and deploy the capture services and storage rules. Public third-party account linking and a scoped OAuth flow are planned; do not collect a player’s VYBE password in your game.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><span className="text-sm font-medium">JavaScript / TypeScript</span><Button size="sm" variant="ghost" onClick={copy} aria-label="Copy SDK example">{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</Button></div>
            <pre className="max-w-full overflow-x-auto p-5 text-xs leading-6 sm:text-sm" tabIndex={0} aria-label="Game capture SDK example"><code>{example}</code></pre>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild><a href={`${repository}/blob/main/docs/GAME_SDK.md`} target="_blank" rel="noopener noreferrer">Integration guide<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
            <Button variant="outline" asChild><a href={`${repository}/tree/main/sdk/game`} target="_blank" rel="noopener noreferrer">SDK and Unity example<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-accent/25 bg-accent/5 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center" aria-labelledby="mini-title">
          <div><Layers3 className="mb-4 h-7 w-7 text-accent" /><h2 id="mini-title" className="text-2xl font-semibold">Small apps. Your ideas.</h2><p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">Start with a game, tool, or art template. Edit HTML, CSS, and JavaScript, try it in the preview, then publish a snapshot to the Hub. Keep experimenting in a private draft until your next release is ready.</p><p className="mt-3 text-sm text-muted-foreground">Mini apps run in a separate preview without VYBE account access. An app may contact outside services. Only launch code from creators you trust.</p></div>
          <Button asChild size="lg"><Link to="/mini-apps">Start building<ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>
        </section>
      </div>
    </div>
  );
}
