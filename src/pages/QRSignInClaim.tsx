import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { stashAuthReturnPath } from '@/lib/authReturnPath';
import { parseQrSignInNonce } from '@/lib/qrSignIn';
import { dbgOauth } from '@/lib/dbgOauth';

/**
 * Deep-link target for Quick Sign-In QR.
 * Opens from phone Camera → auto-approves when already signed in (instant, no extra tap)
 * so the waiting device can redeem and log in immediately.
 */
export default function QRSignInClaim() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const autoClaimed = useRef(false);

  const nonce = useMemo(() => {
    const fromQuery = params.get('nonce')?.trim() || '';
    if (fromQuery) return fromQuery;
    if (typeof window === 'undefined') return '';
    return parseQrSignInNonce(window.location.href) || '';
  }, [params]);

  const [phase, setPhase] = useState<'boot' | 'signing_in' | 'approving' | 'approved' | 'denied' | 'error' | 'gone'>('boot');

  useEffect(() => {
    // #region agent log
    dbgOauth('QR-D', 'QRSignInClaim.tsx:mount', 'claim deep link opened', {
      hasNonce: !!nonce,
      signedIn: !!user,
      authReady,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    }, 'qr-post');
    // #endregion
  }, [nonce, user, authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (!user && nonce) {
      stashAuthReturnPath(`/auth/qr/claim?nonce=${encodeURIComponent(nonce)}`);
    }
  }, [authReady, user, nonce]);

  const approve = useCallback(async () => {
    if (!nonce || autoClaimed.current) return;
    autoClaimed.current = true;
    setPhase('approving');
    try {
      const { data, error } = await db.functions.invoke('auth-qr', {
        body: { action: 'claim', nonce, intent: 'approve' },
      });
      if (error) throw error;
      const status = (data as { status?: string } | null)?.status;
      // #region agent log
      dbgOauth('QR-D', 'QRSignInClaim.tsx:auto-approve', 'instant claim result', { status }, 'qr-post');
      // #endregion
      if (status === 'approved' || status === 'denied') {
        setPhase(status === 'approved' ? 'approved' : 'denied');
        if (status === 'approved') {
          toast.success('Signed in on your other device');
          window.setTimeout(() => navigate('/home', { replace: true }), 700);
        }
        return;
      }
      // Already claimed / redeemed — treat as success for the waiting device.
      setPhase('approved');
      window.setTimeout(() => navigate('/home', { replace: true }), 700);
    } catch (e) {
      autoClaimed.current = false;
      setPhase('error');
      // #region agent log
      dbgOauth('QR-D', 'QRSignInClaim.tsx:auto-approve:fail', 'instant claim failed', {
        msg: e instanceof Error ? e.message : String(e),
      }, 'qr-post');
      // #endregion
      toast.error('Could not finish QR sign-in — try again');
    }
  }, [nonce, navigate]);

  useEffect(() => {
    if (!authReady) return;
    if (!nonce) {
      setPhase('gone');
      return;
    }
    if (!user) {
      setPhase('signing_in');
      return;
    }
    void approve();
  }, [authReady, user, nonce, approve]);

  if (!authReady || phase === 'boot' || phase === 'approving') {
    return (
      <Shell>
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-3">
          {phase === 'approving' ? 'Signing you in on the other device…' : 'Opening…'}
        </p>
      </Shell>
    );
  }

  if (!user || phase === 'signing_in') {
    return (
      <Shell>
        <VYBELogo size="md" />
        <h1 className="text-lg font-display font-bold mt-4">Almost there</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
          Sign in on this phone once — then we’ll instantly approve the other device.
        </p>
        <Button
          className="mt-5 w-full max-w-xs"
          onClick={() => {
            if (nonce) stashAuthReturnPath(`/auth/qr/claim?nonce=${encodeURIComponent(nonce)}`);
            navigate('/auth', { replace: true });
          }}
        >
          Sign in to continue
        </Button>
        <Button asChild variant="ghost" className="mt-2">
          <Link to="/auth">Cancel</Link>
        </Button>
      </Shell>
    );
  }

  if (phase === 'approved') {
    return (
      <Shell>
        <ShieldCheck className="w-12 h-12 text-emerald-500" />
        <h1 className="text-lg font-semibold mt-3">You’re in</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
          The other device is finishing sign-in now.
        </p>
      </Shell>
    );
  }

  if (phase === 'denied') {
    return (
      <Shell>
        <ShieldX className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-lg font-semibold mt-3">Denied</h1>
        <Button className="mt-4" onClick={() => navigate('/home', { replace: true })}>Done</Button>
      </Shell>
    );
  }

  if (phase === 'gone' || !nonce) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Invalid QR link</h1>
        <Button className="mt-4" onClick={() => navigate('/home', { replace: true })}>Go home</Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <button
        type="button"
        onClick={() => void approve()}
        className="absolute top-[max(0.75rem,var(--sat,0px))] left-[var(--app-gutter-x,max(0.75rem,env(safe-area-inset-left,0px)))] z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/70 border border-white/10 text-xs"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Retry
      </button>
      <p className="text-sm text-muted-foreground">Something went wrong.</p>
      <Button className="mt-4" onClick={() => void approve()}>Try again</Button>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      data-auth-shell
      className="fixed inset-0 z-50 overflow-hidden overscroll-none flex flex-col items-center justify-center px-4 py-8 bg-background relative"
    >
      {children}
    </div>
  );
}
