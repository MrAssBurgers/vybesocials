import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Gamepad2, Loader2, ShieldCheck } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import {
  approveGamePartnerLink, denyGamePartnerLink, formatGameUserCode, gamePartnerErrorMessage,
  getGamePartnerLink, isGameUserCode, normalizeGameUserCode,
  type GamePartnerConnection, type GamePartnerLink,
} from '@/lib/gamePartnerService';

export default function ConnectGame() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  // Profile hydration can lag an account switch. Never show the prior account's name.
  const currentProfile = profile?.user_id === user?.id ? profile : null;
  const maskedEmail = user?.email?.replace(/^([^@])[^@]*@/, '$1•••@');
  const account = currentProfile?.username ? `@${currentProfile.username}` : currentProfile?.display_name || maskedEmail || `VYBE account ${user?.id.slice(-8) || ''}`;
  return <AppLayout>
    {user ? <GameConsent key={`${user.id}:${code}`} account={account} initialCode={code} /> : <p className="p-6">Sign in to connect your game.</p>}
  </AppLayout>;
}

function GameConsent({ account, initialCode }: { account: string; initialCode: string }) {
  // A URL can only prefill a public user code; it can never approve access.
  const [code, setCode] = useState(isGameUserCode(initialCode) ? formatGameUserCode(initialCode) : '');
  const [request, setRequest] = useState<{ code: string; link: GamePartnerLink } | null>(null);
  const [confirmedCode, setConfirmedCode] = useState(false);
  const [connected, setConnected] = useState<GamePartnerConnection | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<'review' | 'approve' | 'deny' | null>(null);
  const [error, setError] = useState(initialCode && !isGameUserCode(initialCode) ? 'This link does not contain a valid game code. Enter the code shown in your game.' : '');
  const [now, setNow] = useState(Date.now());
  const active = useRef(false);
  const lock = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!request || request.link.status !== 'pending') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [request]);

  const review = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!isGameUserCode(code)) { setError('Enter the eight-character code shown in your game.'); return; }
    lock.current = true; setBusy('review'); setError(''); setRequest(null); setConfirmedCode(false); setConnected(null); setDenied(false);
    const normalized = normalizeGameUserCode(code);
    try {
      const link = await getGamePartnerLink(normalized);
      if (active.current) { setRequest({ code: normalized, link }); setNow(Date.now()); }
    } catch (cause) { if (active.current) setError(gamePartnerErrorMessage(cause)); }
    finally { if (active.current) { lock.current = false; setBusy(null); } }
  };

  const decide = async (decision: 'approve' | 'deny') => {
    if (!request || lock.current || request.link.status !== 'pending' || (decision === 'approve' && !confirmedCode)) return;
    if (request.link.expiresAt <= Date.now()) { setNow(Date.now()); return; }
    lock.current = true; setBusy(decision); setError('');
    try {
      if (decision === 'approve') {
        const result = await (request.link.scopes.includes('capture:preview')
          ? approveGamePartnerLink(request.code, request.link.scopes) : approveGamePartnerLink(request.code));
        if (active.current) setConnected(result);
      } else {
        await denyGamePartnerLink(request.code);
        if (active.current) setDenied(true);
      }
    } catch (cause) {
      if (active.current) { setError(gamePartnerErrorMessage(cause)); setRequest(null); setConfirmedCode(false); }
    } finally { if (active.current) { lock.current = false; setBusy(null); } }
  };

  const expired = request && request.link.expiresAt <= now;
  const pending = request?.link.status === 'pending' && !expired;
  const secondsLeft = request ? Math.max(0, Math.ceil((request.link.expiresAt - now) / 1000)) : 0;

  return <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:pt-10">
    <Link to="/settings?tab=connections" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Game connections</Link>
    <section className="overflow-hidden rounded-3xl border border-border bg-card/90 shadow-xl">
      <div className="border-b border-border bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-cyan-500/10 p-6">
        <Gamepad2 className="mb-4 h-8 w-8 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight">Connect your game</h1>
        <p className="mt-2 text-sm text-muted-foreground">Send screenshots and highlights to VYBE as private captures for review. You choose what gets posted.</p>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="rounded-xl border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Connecting as</p><p className="break-all text-sm font-semibold">{account}</p></div>
        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</p>}
        {connected ? <div role="status" className="space-y-3">
          <Check className="h-8 w-8 text-green-500" aria-hidden="true" /><h2 className="text-xl font-semibold">{connected.expiresAt <= now ? `${connected.gameName} access has expired` : `${connected.gameName} is connected`}</h2>
          <p className="text-sm text-muted-foreground">{connected.expiresAt <= now ? 'Ask your game for a new code to connect again. Access does not renew automatically.' : `Return to your game. Access ends at ${new Date(connected.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. It will not renew automatically.`}</p>
          <Button asChild variant="outline"><Link to="/settings?tab=connections">Manage game access</Link></Button>
        </div> : denied ? <div role="status" className="space-y-3"><h2 className="text-xl font-semibold">Request denied</h2><p className="text-sm text-muted-foreground">This request gave the game no access. You can return to your game.</p><Button variant="outline" onClick={() => { setDenied(false); setRequest(null); setCode(''); }}>Enter another code</Button></div> : <>
          <form onSubmit={review} className="space-y-3">
            <label htmlFor="game-user-code" className="block text-sm font-medium">Code shown in your game</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="game-user-code" value={code} maxLength={9} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-1234" className="font-mono text-lg tracking-widest uppercase" disabled={!!busy} onChange={event => { setCode(event.target.value); setRequest(null); setConfirmedCode(false); setError(''); }} />
              <Button type="submit" disabled={!!busy || !code.trim()}>{busy === 'review' && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}Review request</Button>
            </div>
            <p className="text-xs text-muted-foreground">Only connect a game you opened yourself. Requests expire after ten minutes.</p>
          </form>
          {request && <section aria-label="Game access request" className="space-y-4 rounded-2xl border border-border p-4 sm:p-5">
            <div><p className="text-xs text-muted-foreground">Registered game</p><h2 className="break-words text-xl font-semibold">{request.link.gameName}</h2><p className="break-words text-sm text-muted-foreground">Published by {request.link.publisherName}</p></div>
            <p className="font-mono text-2xl font-bold tracking-widest">{formatGameUserCode(request.code)}</p>
            <div><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Access you can approve</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>Send private captures for your review</li><li>Check the status of captures sent by this game</li>{request.link.scopes.includes('capture:preview') && <li>Show images and videos sent during this connection inside the game or app</li>}</ul>
              <p className="mt-3 text-xs text-muted-foreground">The game cannot publish posts or read your account, feed, or messages. Access lasts ten minutes, with no automatic renewal.</p>
            </div>
            {pending ? <>
              <p className="text-xs text-muted-foreground">Request expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/40 p-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={confirmedCode} disabled={!!busy} onChange={event => setConfirmedCode(event.target.checked)} />This code matches the code shown in my game.</label>
              <div className="flex flex-col gap-2 sm:flex-row-reverse"><Button className="sm:flex-1" disabled={!!busy || !confirmedCode} onClick={() => void decide('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve game access'}</Button><Button variant="outline" className="sm:flex-1" disabled={!!busy} onClick={() => void decide('deny')}>{busy === 'deny' ? 'Denying…' : 'Deny request'}</Button></div>
            </> : <p role="status" className="rounded-xl bg-muted/40 p-3 text-sm">{request.link.status === 'denied' ? 'This request was denied.' : request.link.status === 'approved' || request.link.status === 'used' ? 'This request has already been approved or used. Manage access in Game connections.' : 'This request has expired. Ask your game for a new code.'}</p>}
          </section>}
        </>}
      </div>
    </section>
  </main>;
}
