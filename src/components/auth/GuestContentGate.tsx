import { Clapperboard, Compass, Map, MessageCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { stashAuthReturnPath } from '@/lib/authReturnPath';

const PREVIEW = [
  { icon: Compass, label: 'Feed', detail: 'For You, friends, and local posts' },
  { icon: Clapperboard, label: 'Clips', detail: 'Vertical video from people you follow' },
  { icon: MessageCircle, label: 'Messages', detail: 'DMs, voice notes, and calls' },
  { icon: Map, label: 'Map', detail: 'Where your friends are, with Ghost Mode' },
] as const;

/** The current Firebase policy requires an account for posts and profiles. */
export function GuestContentGate() {
  const location = useLocation();
  const saveDestination = () => stashAuthReturnPath(`${location.pathname}${location.search}${location.hash}`);
  return (
    <main id="main-content" tabIndex={-1} aria-labelledby="guest-content-title"
      className="flex h-dvh flex-col overflow-y-auto overscroll-contain bg-background px-5 outline-none"
      style={{ paddingTop: 'calc(var(--sat, 0px) + 1.5rem)', paddingBottom: 'calc(var(--sab, 0px) + 1.5rem)', paddingLeft: 'max(1.25rem, var(--sal, 0px))', paddingRight: 'max(1.25rem, var(--sar, 0px))' }}>
      <section className="liquid-glass-card mx-auto my-auto w-full max-w-md shrink-0 space-y-5 rounded-3xl border border-white/10 p-6 text-center shadow-[0_16px_48px_-20px_rgba(0,0,0,0.55)]">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">The social platform for real connection</p>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 id="guest-content-title" className="text-2xl font-semibold tracking-tight text-foreground">Sign in to browse VYBE</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">Posts, clips, and profiles stay behind your account so they are not readable to the open web. Your place will be saved.</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 text-left">
          {PREVIEW.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="rounded-2xl border border-white/10 bg-background/40 p-3">
              <Icon className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">{detail}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          <Button asChild className="min-h-11 w-full">
            <Link to="/login" state={{ from: location }} onClick={saveDestination}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to="/signup" state={{ from: location }} onClick={saveDestination}>Create account</Link>
          </Button>
          <Link to="/about" className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2">Learn about VYBE</Link>
        </div>
      </section>
    </main>
  );
}
