import { Link } from 'react-router-dom';
import { Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Logged-out visitors who follow marketing "Apps" links.
 * The studio itself stays behind an account.
 */
export default function MiniAppsGuest() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-labelledby="mini-apps-guest-title"
      className="flex min-h-dvh flex-col overflow-y-auto bg-background px-5 outline-none"
      style={{
        paddingTop: 'calc(var(--sat, 0px) + 1.5rem)',
        paddingBottom: 'calc(var(--sab, 0px) + 1.5rem)',
        paddingLeft: 'max(1.25rem, var(--sal, 0px))',
        paddingRight: 'max(1.25rem, var(--sar, 0px))',
      }}
    >
      <section className="mx-auto my-auto w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-card p-6 text-center shadow-[0_16px_48px_-20px_rgba(0,0,0,0.55)]">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Community apps</p>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Code2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 id="mini-apps-guest-title" className="text-2xl font-semibold tracking-tight text-foreground">Mini App Studio</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Build a small app, keep a private draft, and publish it for other members. The studio opens after you create an account.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button asChild className="min-h-11 w-full">
            <Link to="/signup">Create account</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to="/login">Sign in</Link>
          </Button>
          <Link to="/developers" className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm text-primary underline-offset-4 hover:underline">
            Read the developer guide
          </Link>
          <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm text-muted-foreground underline-offset-4 hover:underline">
            Back to VYBE
          </Link>
        </div>
      </section>
    </main>
  );
}
