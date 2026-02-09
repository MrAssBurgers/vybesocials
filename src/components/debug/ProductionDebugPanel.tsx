import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Shield, Globe, CreditCard, UserCheck, Wifi, AlertTriangle,
  ChevronDown, ChevronRight, RefreshCw, ExternalLink, Copy, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  getLogs, getNetworkLogs, clearLogs, clearNetworkLogs, subscribe,
  logEvent, type DebugLogEntry, type NetworkLogEntry,
} from '@/lib/debugLogger';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Subscribe to the in-memory logger reactively
function useDebugLogs() {
  const logs = useSyncExternalStore(subscribe, getLogs, getLogs);
  const network = useSyncExternalStore(subscribe, getNetworkLogs, getNetworkLogs);
  return { logs, network };
}

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-3 text-sm font-medium hover:bg-muted/30 transition-colors">
        <Icon className="w-4 h-4 text-primary" />
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Row({ label, value, variant }: { label: string; value: React.ReactNode; variant?: 'success' | 'error' | 'warning' | 'default' }) {
  const color = variant === 'success' ? 'text-green-500' : variant === 'error' ? 'text-red-500' : variant === 'warning' ? 'text-yellow-500' : 'text-muted-foreground';
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono max-w-[200px] truncate", color)}>{value}</span>
    </div>
  );
}

function StatusBadge({ exists }: { exists: boolean }) {
  return (
    <Badge variant={exists ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
      {exists ? 'exists' : 'missing'}
    </Badge>
  );
}

export function ProductionDebugPanel({ isOpen, onClose }: Props) {
  const { user, session } = useAuth();
  const { logs, network } = useDebugLogs();
  const [stripeSecrets, setStripeSecrets] = useState<Record<string, boolean>>({});
  const [stripeTestResult, setStripeTestResult] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [copied, setCopied] = useState(false);

  const errorLogs = logs.filter(l => ['error', 'stripe', 'network'].includes(l.type));

  // --- Check Supabase connection ---
  const checkSupabase = useCallback(async () => {
    setSupabaseStatus('checking');
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      setSupabaseStatus(error ? 'disconnected' : 'connected');
    } catch {
      setSupabaseStatus('disconnected');
    }
  }, []);

  useEffect(() => { if (isOpen) checkSupabase(); }, [isOpen, checkSupabase]);

  // --- Check Stripe secrets via edge function ---
  const checkStripeSecrets = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('check-debug-secrets');
      if (data) setStripeSecrets(data);
    } catch { /* edge fn might not exist */ }
  }, []);

  useEffect(() => { if (isOpen) checkStripeSecrets(); }, [isOpen, checkStripeSecrets]);

  // --- Test Stripe OAuth URL ---
  const testStripeOAuth = async () => {
    setStripeTestResult('Testing...');
    logEvent('stripe', 'Testing Stripe OAuth URL generation...');
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect', {
        body: { dry_run: true },
      });
      if (error) {
        const msg = `Error: ${error.message}`;
        setStripeTestResult(msg);
        logEvent('stripe', msg);
      } else if (data?.url) {
        setStripeTestResult('✓ OAuth URL generated successfully');
        logEvent('stripe', 'OAuth URL generated OK', { url: data.url.slice(0, 60) });
      } else if (data?.error) {
        setStripeTestResult(`✗ ${data.error}`);
        logEvent('stripe', `OAuth test failed: ${data.error}`, { code: data.code });
      } else {
        setStripeTestResult('✗ No URL returned');
        logEvent('stripe', 'OAuth test: no URL returned');
      }
    } catch (err: any) {
      setStripeTestResult(`✗ ${err.message}`);
      logEvent('stripe', `OAuth test exception: ${err.message}`);
    }
  };

  const copyUserId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.includes('preview');
  const isHttps = window.location.protocol === 'https:';
  const tokenExp = session?.expires_at ? new Date(session.expires_at * 1000) : null;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[100] w-full sm:w-96",
          "bg-background/98 backdrop-blur-xl border-l border-border",
          "flex flex-col shadow-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">Debug Panel</span>
            <Badge variant="outline" className="text-[10px]">ADMIN</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {/* 1. Environment */}
            <Section title="Environment Status" icon={Globe} defaultOpen>
              <Row label="Environment" value={isProduction ? 'Production' : 'Preview'} variant={isProduction ? 'warning' : 'default'} />
              <Row label="Domain" value={window.location.hostname} />
              <Row label="HTTPS" value={isHttps ? 'Yes' : 'No'} variant={isHttps ? 'success' : 'error'} />
              <Row label="Build Mode" value={import.meta.env.MODE} />
            </Section>

            {/* 2. Stripe Debug */}
            <Section title="Stripe Debug" icon={CreditCard}>
              <Row label="STRIPE_SECRET_KEY" value={<StatusBadge exists={stripeSecrets.STRIPE_SECRET_KEY ?? false} />} />
              <Row label="STRIPE_CLIENT_ID" value={<StatusBadge exists={stripeSecrets.STRIPE_CLIENT_ID ?? false} />} />
              <Row label="STRIPE_PUBLISHABLE_KEY" value={<StatusBadge exists={stripeSecrets.STRIPE_PUBLISHABLE_KEY ?? false} />} />
              <Row label="Stripe Mode" value={stripeSecrets.stripe_mode || 'unknown'} variant={String(stripeSecrets.stripe_mode) === 'live' ? 'warning' : 'default'} />
              <Row label="OAuth Redirect" value={`${window.location.origin}/business`} />
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={testStripeOAuth}>
                  <ExternalLink className="w-3 h-3 mr-1.5" /> Test Stripe OAuth URL
                </Button>
                {stripeTestResult && (
                  <p className={cn("text-[11px] mt-2 font-mono", stripeTestResult.startsWith('✓') ? 'text-green-500' : 'text-red-400')}>
                    {stripeTestResult}
                  </p>
                )}
              </div>
              {/* Stripe-specific logs */}
              {logs.filter(l => l.type === 'stripe').length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Stripe Logs</span>
                  {logs.filter(l => l.type === 'stripe').slice(0, 10).map(log => (
                    <div key={log.id} className="text-[10px] font-mono p-1.5 rounded bg-muted/30">
                      <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 3. Auth Debug */}
            <Section title="Auth Debug" icon={UserCheck}>
              <Row label="Signed In" value={user ? 'true' : 'false'} variant={user ? 'success' : 'error'} />
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-muted-foreground">User ID</span>
                <button onClick={copyUserId} className="flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground transition-colors">
                  <span className="max-w-[140px] truncate">{user?.id?.slice(0, 12) || 'N/A'}…</span>
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              <Row label="Email" value={user?.email || 'N/A'} />
              <Row label="Session Valid" value={session ? 'true' : 'false'} variant={session ? 'success' : 'error'} />
              <Row label="Token Expires" value={tokenExp ? tokenExp.toLocaleString() : 'N/A'} variant={tokenExp && tokenExp.getTime() < Date.now() ? 'error' : 'default'} />
            </Section>

            {/* 4. Network Monitor */}
            <Section title="Network Monitor" icon={Wifi}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{network.length} requests captured</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={checkSupabase}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Check
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={clearNetworkLogs}>Clear</Button>
                </div>
              </div>
              <Row label="Database Connection" value={supabaseStatus} variant={supabaseStatus === 'connected' ? 'success' : supabaseStatus === 'disconnected' ? 'error' : 'warning'} />
              <div className="max-h-40 overflow-y-auto space-y-1 mt-2">
                {network.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2">No requests yet.</p>
                ) : network.slice(0, 30).map(log => (
                  <div key={log.id} className={cn("text-[10px] font-mono p-1.5 rounded", log.status >= 400 || log.status === 0 ? 'bg-red-500/10' : 'bg-muted/30')}>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={log.status >= 400 || log.status === 0 ? 'destructive' : 'secondary'} className="text-[9px] px-1 py-0">{log.status || 'ERR'}</Badge>
                      <span className="text-muted-foreground">{log.method}</span>
                      <span className="truncate flex-1">{log.url.split('/').pop()}</span>
                      <span className="text-muted-foreground">{log.duration}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 5. Error Console */}
            <Section title="Error Console" icon={AlertTriangle}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{errorLogs.length} errors</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={clearLogs}>Clear</Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {errorLogs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2">No errors captured ✓</p>
                ) : errorLogs.slice(0, 30).map(log => (
                  <div key={log.id} className="text-[10px] font-mono p-1.5 rounded bg-red-500/10">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant="destructive" className="text-[9px] px-1 py-0">{log.type}</Badge>
                      <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-red-400 break-all">{log.message}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border text-center">
          <p className="text-[10px] text-muted-foreground">Admin-only • Never exposes secret values</p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
