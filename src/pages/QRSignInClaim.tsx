import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Loader2, MapPin, MonitorSmartphone, ShieldCheck, ShieldX } from 'lucide-react';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { stashAuthReturnPath } from '@/lib/authReturnPath';
import { parseQrSignInNonce } from '@/lib/qrSignIn';

type ClaimMeta = {
  device?: string;
  user_agent?: string | null;
  ip?: string | null;
  geo?: { city?: string | null; region?: string | null; country?: string | null; latitude?: number; longitude?: number } | null;
};

/**
 * Deep-link target for Quick Sign-In QR.
 * Shows waiting-device IP / label and requires Approve or Decline (no silent auto-approve).
 */
export default function QRSignInClaim() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, authReady } = useAuth();

  const nonce = useMemo(() => {
    const fromQuery = params.get('nonce')?.trim() || '';
    if (fromQuery) return fromQuery;
    if (typeof window === 'undefined') return '';
    return parseQrSignInNonce(window.location.href) || '';
  }, [params]);

  const [phase, setPhase] = useState<
    'boot' | 'signing_in' | 'ready' | 'approving' | 'denying' | 'approved' | 'denied' | 'error' | 'gone' | 'expired'
  >('boot');
  const [meta, setMeta] = useState<ClaimMeta>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!user && nonce) {
      stashAuthReturnPath(`/auth/qr/claim?nonce=${encodeURIComponent(nonce)}`);
    }
  }, [authReady, user, nonce]);

  // Load waiting-device info (IP / UA) from the challenge before approving.
  useEffect(() => {
    if (!authReady || !nonce) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await db.functions.invoke('auth-qr', {
          body: { action: 'poll', nonce },
        });
        if (cancelled) return;
        if (error) {
          setPhase('error');
          return;
        }
        const status = (data as { status?: string } | null)?.status;
        const metadata = ((data as { metadata?: ClaimMeta } | null)?.metadata || {}) as ClaimMeta;
        setMeta(metadata);
        if (status === 'expired' || status === 'not_found') {
          setPhase(status === 'expired' ? 'expired' : 'gone');
          return;
        }
        if (status === 'approved' || status === 'redeemed') {
          setPhase('approved');
          return;
        }
        if (status === 'denied') {
          setPhase('denied');
          return;
        }
        if (!user) {
          setPhase('signing_in');
          return;
        }
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, nonce, user]);

  const claim = useCallback(
    async (intent: 'approve' | 'deny') => {
      if (!nonce || busy) return;
      setBusy(true);
      setPhase(intent === 'approve' ? 'approving' : 'denying');
      try {
        const { data, error } = await db.functions.invoke('auth-qr', {
          body: { action: 'claim', nonce, intent },
        });
        if (error) throw error;
        const status = (data as { status?: string } | null)?.status;
        if (intent === 'deny' || status === 'denied') {
          setPhase('denied');
          toast.message('Sign-in declined');
          return;
        }
        setPhase('approved');
        toast.success('Signed in on your other device');
        window.setTimeout(() => navigate('/home', { replace: true }), 900);
      } catch {
        setPhase('error');
        toast.error('Could not finish QR sign-in — try again');
      } finally {
        setBusy(false);
      }
    },
    [nonce, busy, navigate],
  );

  if (!authReady || phase === 'boot' || phase === 'approving' || phase === 'denying') {
    return (
      <Shell>
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-3">
          {phase === 'approving'
            ? 'Approving the other device…'
            : phase === 'denying'
              ? 'Declining…'
              : 'Opening…'}
        </p>
      </Shell>
    );
  }

  if (!nonce || phase === 'gone') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Invalid QR link</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
          This code is missing or no longer valid. Generate a new QR on the other device.
        </p>
        <Button className="mt-4" onClick={() => navigate('/home', { replace: true })}>
          Go home
        </Button>
      </Shell>
    );
  }

  if (phase === 'expired') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Code expired</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
          Ask the other device to show a fresh QR code.
        </p>
        <Button className="mt-4" onClick={() => navigate('/home', { replace: true })}>
          Done
        </Button>
      </Shell>
    );
  }

  if (!user || phase === 'signing_in') {
    return (
      <Shell>
        <VYBELogo size="md" />
        <h1 className="text-lg font-display font-bold mt-4">Confirm sign-in</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
          Sign in on this phone to approve or decline the other device.
        </p>
        <DeviceCard meta={meta} />
        <Button
          className="mt-5 w-full max-w-xs"
          onClick={() => {
            stashAuthReturnPath(`/auth/qr/claim?nonce=${encodeURIComponent(nonce)}`);
            navigate('/auth', { replace: true });
          }}
        >
          Sign in to continue
        </Button>
        <Button asChild variant="ghost" className="mt-2">
          <Link to="/home">Cancel</Link>
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
        <h1 className="text-lg font-semibold mt-3">Declined</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
          That device was not signed in.
        </p>
        <Button className="mt-4" onClick={() => navigate('/home', { replace: true })}>
          Done
        </Button>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Something went wrong.</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Shell>
    );
  }

  // ready — show Approve / Decline
  return (
    <Shell>
      <VYBELogo size="md" />
      <h1 className="text-lg font-display font-bold mt-4">Approve sign-in?</h1>
      <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
        Someone scanned your Quick Sign-In QR. Only approve if this is you.
      </p>
      <DeviceCard meta={meta} />
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Button disabled={busy} onClick={() => void claim('approve')} className="w-full">
          Approve
        </Button>
        <Button disabled={busy} variant="outline" onClick={() => void claim('deny')} className="w-full">
          Decline
        </Button>
      </div>
    </Shell>
  );
}

function DeviceCard({ meta }: { meta: ClaimMeta }) {
  const device = (meta.device || 'Unknown device').slice(0, 80);
  const ip = meta.ip?.trim() || 'IP unavailable';
  const where =
    [meta.geo?.city, meta.geo?.region, meta.geo?.country].filter(Boolean).join(', ') || ip;
  const lat = typeof meta.geo?.latitude === 'number' ? meta.geo.latitude : null;
  const lon = typeof meta.geo?.longitude === 'number' ? meta.geo.longitude : null;
  return (
    <div className="mt-5 w-full max-w-sm rounded-3xl border border-white/12 bg-white/[0.04] px-4 py-4 text-left space-y-3">
      <div className="flex items-start gap-2.5 text-sm">
        <MonitorSmartphone className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Device</p>
          <p className="font-semibold break-words">{device}</p>
        </div>
      </div>

      {lat != null && lon != null ? (
        <iframe
          title="Approximate device area"
          className="h-28 w-full rounded-xl border border-white/10"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.08}%2C${lat - 0.04}%2C${lon + 0.08}%2C${lat + 0.04}&layer=mapnik&marker=${lat}%2C${lon}`}
        />
      ) : (
        <div className="h-24 w-full rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] flex items-center justify-center text-xs text-muted-foreground">
          Location area unavailable
        </div>
      )}

      <div className="flex items-start gap-2.5 text-sm">
        <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Location</p>
          <p className="font-medium break-words">{where}</p>
          <p className="font-mono text-[11px] text-muted-foreground break-all mt-0.5">IP {ip}</p>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      data-auth-shell
      className="fixed inset-0 z-50 overflow-hidden overscroll-none flex flex-col items-center justify-center px-4 pt-[calc(1rem+var(--sat,env(safe-area-inset-top,0px)))] pb-[calc(1rem+var(--sab,env(safe-area-inset-bottom,0px)))] bg-background relative"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#11131a]/88 backdrop-blur-xl px-5 py-6 shadow-2xl shadow-black/40">
        {children}
      </div>
    </div>
  );
}
