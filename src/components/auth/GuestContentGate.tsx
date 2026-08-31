import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { stashAuthReturnPath } from '@/lib/authReturnPath';

/** The current Firebase policy requires an account for posts and profiles. */
export function GuestContentGate() {
  const location = useLocation();
  const saveDestination = () => stashAuthReturnPath(`${location.pathname}${location.search}${location.hash}`);
  return (
    <main id="main-content" tabIndex={-1} aria-labelledby="guest-content-title"
      className="flex h-dvh flex-col overflow-y-auto overscroll-contain bg-background px-5 outline-none"
      style={{ paddingTop: 'calc(var(--sat, 0px) + 2rem)', paddingBottom: 'calc(var(--sab, 0px) + 2rem)', paddingLeft: 'max(1.25rem, var(--sal, 0px))', paddingRight: 'max(1.25rem, var(--sar, 0px))' }}>
      <section className="mx-auto my-auto w-full max-w-sm shrink-0 space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 id="guest-content-title" className="text-2xl font-semibold tracking-tight text-foreground">Sign in to browse VYBE</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">Posts, clips, and profiles are available after you sign in. Your place will be saved.</p>
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
