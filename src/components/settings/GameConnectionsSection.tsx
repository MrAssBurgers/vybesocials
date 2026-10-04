import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/auth';
import { gamePartnerErrorMessage, listGamePartnerConnections, revokeGamePartnerConnection, type GamePartnerConnection } from '@/lib/gamePartnerService';

export function GameConnectionsSection() {
  const { user } = useAuth();
  return <section aria-labelledby="game-connections-title" className="mt-6 border-t border-border/40 pt-6">
    <h3 id="game-connections-title" className="flex items-center gap-2 text-sm font-bold"><Gamepad2 className="h-4 w-4 text-primary" aria-hidden="true" /> Connected games</h3>
    <p className="mt-1 text-xs text-muted-foreground">Games you allow to send private captures for review. Pilot access lasts ten minutes and never renews automatically.</p>
    {user ? <AccountGameConnections key={user.id} /> : <p className="mt-4 text-sm text-muted-foreground">Sign in to manage game access.</p>}
  </section>;
}

function AccountGameConnections() {
  const [connections, setConnections] = useState<GamePartnerConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<GamePartnerConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const active = useRef(false);
  const lock = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    void listGamePartnerConnections().then(result => {
      if (current) { setConnections(result); setLoaded(true); setNow(Date.now()); }
    }).catch(cause => { if (current) setError(gamePartnerErrorMessage(cause)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);
  useEffect(() => {
    if (!connections.some(connection => connection.status === 'active')) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [connections]);

  const revoke = async () => {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const connection = selected;
    try {
      await revokeGamePartnerConnection(connection.connectionId);
      if (!active.current) return;
      setConnections(previous => previous.map(item => item.connectionId === connection.connectionId ? { ...item, status: 'revoked' } : item));
      setSelected(null); setNotice(`Access revoked for ${connection.gameName}.`);
    } catch (cause) { if (active.current) setError(gamePartnerErrorMessage(cause)); }
    finally { if (active.current) { lock.current = false; setBusy(false); } }
  };

  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/connect/game">Enter a game code</Link></Button><Button variant="ghost" size="sm" disabled={loading || busy} onClick={() => { setNotice(''); setRetry(value => value + 1); }}><RefreshCw className="mr-2 h-3 w-3" aria-hidden="true" />Refresh games</Button></div>
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Loading game connections…</p>}
    {error && !selected && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">{notice}</p>}
    {!loading && loaded && !error && connections.length === 0 && <p className="py-2 text-sm text-muted-foreground">No games connected yet.</p>}
    {connections.map(connection => {
      const status = connection.status === 'active' && connection.expiresAt <= now ? 'expired' : connection.status;
      return <article key={connection.connectionId} className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><h4 className="break-words text-sm font-semibold">{connection.gameName}</h4><p className="break-words text-xs text-muted-foreground">{connection.publisherName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status === 'active' ? `Access ends ${new Date(connection.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : status === 'revoked' ? 'Access revoked' : 'Access expired'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Send private captures · Check capture status</p>
        </div>
        {status === 'active' && <Button variant="outline" size="sm" disabled={busy || loading} aria-label={`Revoke access for ${connection.gameName}`} onClick={() => { setError(''); setSelected(connection); }}>Revoke access</Button>}
      </article>;
    })}
    <AlertDialog open={!!selected} onOpenChange={open => { if (!open && !busy) { setSelected(null); setError(''); } }}>
      <AlertDialogContent className="w-[calc(100%-2rem)]">
        <AlertDialogHeader><AlertDialogTitle>Revoke access for {selected?.gameName}?</AlertDialogTitle><AlertDialogDescription>This immediately stops this connection from submitting new captures or checking their status. Captures already sent remain available for review until they expire, and published posts stay on VYBE. Reconnecting requires a new code and your approval.</AlertDialogDescription></AlertDialogHeader>
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep access</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={() => void revoke()}>{busy ? 'Revoking…' : 'Revoke game access'}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
