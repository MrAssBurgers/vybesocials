import { useState, useEffect, useCallback, useSyncExternalStore, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Shield, Globe, CreditCard, UserCheck, Wifi, AlertTriangle,
  ChevronDown, ChevronRight, RefreshCw, ExternalLink, Copy, Check,
  Database, Zap, ToggleLeft, Play, Table2, Eye, Bot, Send, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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

function useDebugLogs() {
  const logs = useSyncExternalStore(subscribe, getLogs, getLogs);
  const network = useSyncExternalStore(subscribe, getNetworkLogs, getNetworkLogs);
  return { logs, network };
}

// High-contrast icon wrapper — ensures icons are always visible regardless of theme
function HCIcon({ icon: Icon, className, ...props }: { icon: React.ElementType; className?: string; [key: string]: any }) {
  return <Icon className={cn("text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]", className)} {...props} />;
}

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-3 text-sm font-medium hover:bg-muted/30 transition-colors">
        <Icon className="w-4 h-4 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
        <span className="flex-1 text-left text-foreground">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Row({ label, value, variant }: { label: string; value: React.ReactNode; variant?: 'success' | 'error' | 'warning' | 'default' }) {
  const color = variant === 'success' ? 'text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.3)]' 
    : variant === 'error' ? 'text-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.3)]' 
    : variant === 'warning' ? 'text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.3)]' 
    : 'text-foreground/80';
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-foreground/70">{label}</span>
      <span className={cn("font-mono max-w-[200px] truncate", color)}>{value}</span>
    </div>
  );
}

function StatusBadge({ exists }: { exists: boolean }) {
  return (
    <Badge variant={exists ? 'default' : 'destructive'} className={cn(
      "text-[10px] px-1.5 py-0 font-semibold",
      exists ? "bg-green-600 text-white" : "bg-red-600 text-white"
    )}>
      {exists ? 'exists' : 'missing'}
    </Badge>
  );
}

// ── Feature Flags (localStorage-based) ──
const DEFAULT_FLAGS: Record<string, { label: string; description: string; enabled: boolean }> = {
  'debug_verbose_logging': { label: 'Verbose Logging', description: 'Extra console output for all API calls', enabled: false },
  'debug_show_render_count': { label: 'Render Counts', description: 'Show component render counts in UI', enabled: false },
  'feature_ai_v2': { label: 'AI V2 Engine', description: 'Use next-gen AI response engine', enabled: false },
  'feature_video_hd': { label: 'HD Video Upload', description: 'Allow HD video uploads (>1080p)', enabled: false },
  'feature_dark_mode_v2': { label: 'Dark Mode V2', description: 'Experimental dark theme with OLED blacks', enabled: false },
  'maintenance_mode': { label: 'Maintenance Mode', description: 'Show maintenance banner to all users', enabled: false },
};

function getFlags(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem('vybe_feature_flags');
    return stored ? JSON.parse(stored) : {};
  } catch { return {}; }
}

function setFlag(key: string, value: boolean) {
  const flags = getFlags();
  flags[key] = value;
  localStorage.setItem('vybe_feature_flags', JSON.stringify(flags));
}

// ── Edge Function List ──
const EDGE_FUNCTIONS = [
  'check-debug-secrets',
  'check-stripe-connect',
  'create-stripe-connect',
  'create-stripe-dashboard-link',
  'create-business-checkout',
  'admin-debug-tools',
  'admin-ai-builder',
  'ai-chat',
  'ai-smart-replies',
  'moderate-content',
  'scan-content-safety',
  'get-recommendations',
  'send-push-notification',
];

// ── AI Chat Types ──
type AiMessage = { role: 'user' | 'assistant'; content: string };

export function ProductionDebugPanel({ isOpen, onClose }: Props) {
  const { user, session } = useAuth();
  const { logs, network } = useDebugLogs();
  const [stripeSecrets, setStripeSecrets] = useState<Record<string, boolean>>({});
  const [stripeTestResult, setStripeTestResult] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [copied, setCopied] = useState(false);

  // Database Inspector state
  const [tables, setTables] = useState<{ name: string; count: number; error?: string }[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableDataLoading, setTableDataLoading] = useState(false);
  const [tableTotal, setTableTotal] = useState(0);

  // Edge Function Tester state
  const [selectedFunction, setSelectedFunction] = useState(EDGE_FUNCTIONS[0]);
  const [fnBody, setFnBody] = useState('{}');
  const [fnResult, setFnResult] = useState<string | null>(null);
  const [fnLoading, setFnLoading] = useState(false);

  // Feature Flags state
  const [flags, setFlags] = useState<Record<string, boolean>>(getFlags());

  // AI Builder state
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  const errorLogs = logs.filter(l => ['error', 'stripe', 'network'].includes(l.type));

  // ── Supabase check ──
  const checkSupabase = useCallback(async () => {
    setSupabaseStatus('checking');
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      setSupabaseStatus(error ? 'disconnected' : 'connected');
    } catch { setSupabaseStatus('disconnected'); }
  }, []);

  useEffect(() => { if (isOpen) checkSupabase(); }, [isOpen, checkSupabase]);

  // ── Stripe secrets check ──
  const checkStripeSecrets = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke('check-debug-secrets');
      if (data) setStripeSecrets(data);
    } catch { /* edge fn might not exist */ }
  }, []);

  useEffect(() => { if (isOpen) checkStripeSecrets(); }, [isOpen, checkStripeSecrets]);

  // ── Stripe OAuth test ──
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

  // ── Stripe Connect status check ──
  const [connectStatus, setConnectStatus] = useState<any>(null);
  const checkConnectStatus = async () => {
    try {
      const { data } = await supabase.functions.invoke('check-stripe-connect');
      setConnectStatus(data);
    } catch { setConnectStatus({ error: 'Failed to check' }); }
  };

  // ── Stripe Dashboard link ──
  const openStripeDashboard = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-dashboard-link');
      if (data?.url) window.open(data.url, '_blank');
      else logEvent('stripe', `Dashboard link failed: ${error?.message || data?.error}`);
    } catch (err: any) {
      logEvent('stripe', `Dashboard exception: ${err.message}`);
    }
  };

  // ── Database Inspector ──
  const loadTables = async () => {
    setTablesLoading(true);
    try {
      const { data } = await supabase.functions.invoke('admin-debug-tools', {
        body: { action: 'list_tables' },
      });
      if (data?.tables) setTables(data.tables);
    } catch { setTables([]); }
    setTablesLoading(false);
  };

  const previewTable = async (tableName: string) => {
    setSelectedTable(tableName);
    setTableDataLoading(true);
    try {
      const { data } = await supabase.functions.invoke('admin-debug-tools', {
        body: { action: 'preview_table', table_name: tableName, limit: 20 },
      });
      setTableData(data?.data || []);
      setTableTotal(data?.count || 0);
    } catch { setTableData([]); }
    setTableDataLoading(false);
  };

  // ── Edge Function Tester ──
  const invokeFunction = async () => {
    setFnLoading(true);
    setFnResult(null);
    try {
      let body: any;
      try { body = JSON.parse(fnBody); } catch { body = {}; }
      const start = performance.now();
      const { data, error } = await supabase.functions.invoke(selectedFunction, { body });
      const duration = Math.round(performance.now() - start);
      if (error) {
        setFnResult(`✗ Error (${duration}ms): ${error.message}`);
      } else {
        setFnResult(`✓ Success (${duration}ms):\n${JSON.stringify(data, null, 2)}`);
      }
    } catch (err: any) {
      setFnResult(`✗ Exception: ${err.message}`);
    }
    setFnLoading(false);
  };

  // ── Feature Flags ──
  const toggleFlag = (key: string) => {
    const newValue = !flags[key];
    setFlag(key, newValue);
    setFlags(prev => ({ ...prev, [key]: newValue }));
  };

  const copyUserId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // ── AI Builder ──
  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg: AiMessage = { role: 'user', content: aiInput.trim() };
    setAiMessages(prev => [...prev, userMsg]);
    setAiInput('');
    setAiLoading(true);

    let assistantContent = '';

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-builder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [...aiMessages, userMsg] }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setAiMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: 'assistant', content: assistantContent }];
              });
            }
          } catch { 
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (err: any) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${err.message}` }]);
    }

    setAiLoading(false);
  };

  // Auto-scroll AI chat
  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiMessages]);

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
          "fixed top-0 right-0 bottom-0 z-[100] w-full sm:w-[440px]",
          "bg-background border-l border-border",
          "flex flex-col shadow-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
            <span className="font-bold text-sm text-foreground">DevTools</span>
            <Badge variant="outline" className="text-[10px] border-primary/50 text-primary font-bold">ADMIN</Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-destructive/20 hover:text-destructive" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="ai" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2 grid grid-cols-6 h-10 bg-muted/50">
            <TabsTrigger value="ai" className="text-[10px] px-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bot className="w-3.5 h-3.5" />
            </TabsTrigger>
            <TabsTrigger value="overview" className="text-[10px] px-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="w-3.5 h-3.5" />
            </TabsTrigger>
            <TabsTrigger value="stripe" className="text-[10px] px-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="w-3.5 h-3.5" />
            </TabsTrigger>
            <TabsTrigger value="database" className="text-[10px] px-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="w-3.5 h-3.5" />
            </TabsTrigger>
            <TabsTrigger value="functions" className="text-[10px] px-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Zap className="w-3.5 h-3.5" />
            </TabsTrigger>
            <TabsTrigger value="flags" className="text-[10px] px-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ToggleLeft className="w-3.5 h-3.5" />
            </TabsTrigger>
          </TabsList>

          {/* ═══ AI BUILDER TAB ═══ */}
          <TabsContent value="ai" className="flex-1 flex flex-col overflow-hidden m-0">
            <div className="px-4 pt-3 pb-2 border-b border-border bg-card/50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Bot className="w-4 h-4 text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]" /> AI Admin Builder
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] px-2 text-foreground/70 hover:text-destructive"
                  onClick={() => setAiMessages([])}
                  disabled={aiMessages.length === 0}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Clear
                </Button>
              </div>
              <p className="text-[11px] text-foreground/60 mt-1">
                Ask anything — manage DB, debug, plan features, write queries
              </p>
            </div>

            {/* Messages */}
            <div ref={aiScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {aiMessages.length === 0 && (
                <div className="text-center py-8 space-y-3">
                  <Bot className="w-10 h-10 mx-auto text-primary/40" />
                  <p className="text-xs text-foreground/50">Ask me anything about managing VYBE</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {[
                      'Show active users today',
                      'SQL to find spam reports',
                      'How to add a new badge',
                      'Debug auth issues',
                    ].map(q => (
                      <button
                        key={q}
                        onClick={() => { setAiInput(q); }}
                        className="text-[10px] px-2.5 py-1.5 rounded-full border border-border bg-card hover:bg-muted/50 text-foreground/70 hover:text-foreground transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((msg, i) => (
                <div key={i} className={cn(
                  "text-xs rounded-xl px-3 py-2.5 max-w-[90%] whitespace-pre-wrap",
                  msg.role === 'user'
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-card border border-border text-foreground"
                )}>
                  {msg.content}
                </div>
              ))}
              {aiLoading && (
                <div className="mr-auto bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-foreground/60">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border bg-card/50">
              <form onSubmit={(e) => { e.preventDefault(); sendAiMessage(); }} className="flex gap-2">
                <Input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask the AI admin builder..."
                  className="flex-1 text-xs h-9 bg-background border-border text-foreground placeholder:text-foreground/40"
                  disabled={aiLoading}
                />
                <Button type="submit" size="sm" className="h-9 w-9 p-0" disabled={!aiInput.trim() || aiLoading}>
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </form>
            </div>
          </TabsContent>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                <Section title="Environment Status" icon={Globe} defaultOpen>
                  <Row label="Environment" value={isProduction ? 'Production' : 'Preview'} variant={isProduction ? 'warning' : 'default'} />
                  <Row label="Domain" value={window.location.hostname} />
                  <Row label="HTTPS" value={isHttps ? 'Yes' : 'No'} variant={isHttps ? 'success' : 'error'} />
                  <Row label="Build Mode" value={import.meta.env.MODE} />
                </Section>

                <Section title="Auth Debug" icon={UserCheck}>
                  <Row label="Signed In" value={user ? 'true' : 'false'} variant={user ? 'success' : 'error'} />
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-foreground/70">User ID</span>
                    <button onClick={copyUserId} className="flex items-center gap-1 font-mono text-foreground/70 hover:text-foreground transition-colors">
                      <span className="max-w-[140px] truncate">{user?.id?.slice(0, 12) || 'N/A'}…</span>
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <Row label="Email" value={user?.email || 'N/A'} />
                  <Row label="Session Valid" value={session ? 'true' : 'false'} variant={session ? 'success' : 'error'} />
                  <Row label="Token Expires" value={tokenExp ? tokenExp.toLocaleString() : 'N/A'} variant={tokenExp && tokenExp.getTime() < Date.now() ? 'error' : 'default'} />
                </Section>

                <Section title="Network Monitor" icon={Wifi}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-foreground/70">{network.length} requests captured</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-foreground/70" onClick={checkSupabase}>
                        <RefreshCw className="w-3 h-3 mr-1" /> Check
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-foreground/70" onClick={clearNetworkLogs}>Clear</Button>
                    </div>
                  </div>
                  <Row label="Database Connection" value={supabaseStatus} variant={supabaseStatus === 'connected' ? 'success' : supabaseStatus === 'disconnected' ? 'error' : 'warning'} />
                  <div className="max-h-40 overflow-y-auto space-y-1 mt-2">
                    {network.length === 0 ? (
                      <p className="text-[11px] text-foreground/50 text-center py-2">No requests yet.</p>
                    ) : network.slice(0, 30).map(log => (
                      <div key={log.id} className={cn("text-[10px] font-mono p-1.5 rounded", log.status >= 400 || log.status === 0 ? 'bg-red-500/15 border border-red-500/20' : 'bg-muted/30')}>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={log.status >= 400 || log.status === 0 ? 'destructive' : 'secondary'} className="text-[9px] px-1 py-0 font-bold">{log.status || 'ERR'}</Badge>
                          <span className="text-foreground/60">{log.method}</span>
                          <span className="truncate flex-1 text-foreground">{log.url.split('/').pop()}</span>
                          <span className="text-foreground/60">{log.duration}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Error Console" icon={AlertTriangle}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-foreground/70">{errorLogs.length} errors</span>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-foreground/70" onClick={clearLogs}>Clear</Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {errorLogs.length === 0 ? (
                      <p className="text-[11px] text-foreground/50 text-center py-2">No errors captured ✓</p>
                    ) : errorLogs.slice(0, 30).map(log => (
                      <div key={log.id} className="text-[10px] font-mono p-1.5 rounded bg-red-500/15 border border-red-500/20">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 font-bold">{log.type}</Badge>
                          <span className="text-foreground/60">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-red-400 break-all">{log.message}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ STRIPE TAB ═══ */}
          <TabsContent value="stripe" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                <Section title="Secrets & Config" icon={CreditCard} defaultOpen>
                  <Row label="STRIPE_SECRET_KEY" value={<StatusBadge exists={stripeSecrets.STRIPE_SECRET_KEY ?? false} />} />
                  <Row label="STRIPE_WEBHOOK_SECRET" value={<StatusBadge exists={stripeSecrets.STRIPE_WEBHOOK_SECRET ?? false} />} />
                  <Row label="STRIPE_CLIENT_ID" value={<StatusBadge exists={stripeSecrets.STRIPE_CLIENT_ID ?? false} />} />
                  <Row label="STRIPE_PUBLISHABLE_KEY" value={<StatusBadge exists={stripeSecrets.STRIPE_PUBLISHABLE_KEY ?? false} />} />
                  <Row label="Stripe Enabled" value={stripeSecrets.stripe_enabled ? 'Yes' : 'No'} variant={stripeSecrets.stripe_enabled ? 'success' : 'default'} />
                  <Row label="Stripe Mode" value={stripeSecrets.stripe_mode || 'unknown'} variant={String(stripeSecrets.stripe_mode) === 'live' ? 'warning' : 'default'} />
                  <Row label="OAuth Redirect" value={`${window.location.origin}/business`} />
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs text-foreground" onClick={checkStripeSecrets}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                    </Button>
                  </div>
                </Section>

                <Section title="Connect Status" icon={ExternalLink}>
                  <Button variant="outline" size="sm" className="w-full text-xs mb-2 text-foreground" onClick={checkConnectStatus}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Check Connect Status
                  </Button>
                  {connectStatus && (
                    <div className="space-y-1">
                      <Row label="Connected" value={connectStatus.connected ? 'Yes' : 'No'} variant={connectStatus.connected ? 'success' : 'error'} />
                      {connectStatus.account_id && <Row label="Account ID" value={connectStatus.account_id} />}
                      {connectStatus.charges_enabled !== undefined && <Row label="Charges" value={connectStatus.charges_enabled ? 'Enabled' : 'Disabled'} variant={connectStatus.charges_enabled ? 'success' : 'warning'} />}
                      {connectStatus.payouts_enabled !== undefined && <Row label="Payouts" value={connectStatus.payouts_enabled ? 'Enabled' : 'Disabled'} variant={connectStatus.payouts_enabled ? 'success' : 'warning'} />}
                      {connectStatus.error && <Row label="Error" value={connectStatus.error} variant="error" />}
                    </div>
                  )}
                </Section>

                <Section title="Actions" icon={Zap}>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full text-xs text-foreground" onClick={testStripeOAuth}>
                      <ExternalLink className="w-3 h-3 mr-1.5" /> Test OAuth URL
                    </Button>
                    <Button variant="outline" size="sm" className="w-full text-xs text-foreground" onClick={openStripeDashboard}>
                      <ExternalLink className="w-3 h-3 mr-1.5" /> Open Stripe Dashboard
                    </Button>
                  </div>
                  {stripeTestResult && (
                    <p className={cn("text-[11px] mt-2 font-mono font-semibold", stripeTestResult.startsWith('✓') ? 'text-green-400' : 'text-red-400')}>
                      {stripeTestResult}
                    </p>
                  )}
                </Section>

                {/* Stripe logs */}
                {logs.filter(l => l.type === 'stripe').length > 0 && (
                  <Section title="Stripe Logs" icon={AlertTriangle}>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {logs.filter(l => l.type === 'stripe').slice(0, 20).map(log => (
                        <div key={log.id} className="text-[10px] font-mono p-1.5 rounded bg-muted/30">
                          <span className="text-foreground/60">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
                          <span className="text-foreground">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ DATABASE TAB ═══ */}
          <TabsContent value="database" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Database className="w-4 h-4 text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]" /> Database Inspector
                  </h3>
                  <Button variant="outline" size="sm" className="text-xs text-foreground" onClick={loadTables} disabled={tablesLoading}>
                    <RefreshCw className={cn("w-3 h-3 mr-1", tablesLoading && "animate-spin")} />
                    {tablesLoading ? 'Loading…' : 'Load Tables'}
                  </Button>
                </div>

                {tables.length > 0 && (
                  <div className="space-y-1">
                    {tables.map(t => (
                      <button
                        key={t.name}
                        onClick={() => previewTable(t.name)}
                        className={cn(
                          "w-full flex items-center justify-between text-xs p-2 rounded-lg transition-colors",
                          selectedTable === t.name ? "bg-primary/15 border border-primary/40" : "hover:bg-muted/30 border border-transparent"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Table2 className="w-3.5 h-3.5 text-foreground/60" />
                          <span className="font-mono text-foreground">{t.name}</span>
                        </span>
                        <Badge variant="secondary" className="text-[10px] font-bold">
                          {t.count >= 0 ? t.count.toLocaleString() : 'err'}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {selectedTable && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                        <Eye className="w-3.5 h-3.5" /> {selectedTable}
                        <Badge variant="outline" className="text-[10px] font-bold">{tableTotal} total</Badge>
                      </span>
                    </div>
                    {tableDataLoading ? (
                      <p className="text-xs text-foreground/50 text-center py-4">Loading…</p>
                    ) : tableData.length === 0 ? (
                      <p className="text-xs text-foreground/50 text-center py-4">No data</p>
                    ) : (
                      <div className="max-h-60 overflow-auto rounded-lg border border-border">
                        <table className="w-full text-[10px] font-mono">
                          <thead>
                            <tr className="bg-muted/50 sticky top-0">
                              {Object.keys(tableData[0]).slice(0, 6).map(col => (
                                <th key={col} className="px-2 py-1.5 text-left text-foreground/70 font-semibold whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tableData.slice(0, 20).map((row, i) => (
                              <tr key={i} className="border-t border-border/30 hover:bg-muted/20">
                                {Object.values(row).slice(0, 6).map((val: any, j) => (
                                  <td key={j} className="px-2 py-1 max-w-[120px] truncate text-foreground/80">{String(val ?? 'null')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {tables.length === 0 && !tablesLoading && (
                  <p className="text-xs text-foreground/50 text-center py-6">Press "Load Tables" to inspect the database</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ FUNCTIONS TAB ═══ */}
          <TabsContent value="functions" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Zap className="w-4 h-4 text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]" /> Edge Function Tester
                </h3>

                <div className="space-y-2">
                  <label className="text-[11px] text-foreground/70 font-medium">Function</label>
                  <select
                    value={selectedFunction}
                    onChange={(e) => setSelectedFunction(e.target.value)}
                    className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {EDGE_FUNCTIONS.map(fn => (
                      <option key={fn} value={fn}>{fn}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] text-foreground/70 font-medium">Request Body (JSON)</label>
                  <Textarea
                    value={fnBody}
                    onChange={(e) => setFnBody(e.target.value)}
                    className="font-mono text-xs min-h-[80px] resize-none text-foreground"
                    placeholder='{"key": "value"}'
                  />
                </div>

                <Button
                  variant="default"
                  size="sm"
                  className="w-full text-xs"
                  onClick={invokeFunction}
                  disabled={fnLoading}
                >
                  <Play className={cn("w-3.5 h-3.5 mr-1.5", fnLoading && "animate-spin")} />
                  {fnLoading ? 'Invoking…' : 'Invoke Function'}
                </Button>

                {fnResult && (
                  <div className={cn(
                    "text-[10px] font-mono p-3 rounded-lg max-h-64 overflow-auto whitespace-pre-wrap border",
                    fnResult.startsWith('✓') ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                  )}>
                    {fnResult}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ FLAGS TAB ═══ */}
          <TabsContent value="flags" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <ToggleLeft className="w-4 h-4 text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)]" /> Feature Flags
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-bold text-foreground/70">localStorage</Badge>
                </div>

                <p className="text-[11px] text-foreground/60">
                  Toggle flags for this device. Changes take effect immediately.
                </p>

                <div className="space-y-2">
                  {Object.entries(DEFAULT_FLAGS).map(([key, config]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-xs font-medium text-foreground">{config.label}</p>
                        <p className="text-[10px] text-foreground/60">{config.description}</p>
                        <p className="text-[9px] font-mono text-foreground/40 mt-0.5">{key}</p>
                      </div>
                      <Switch
                        checked={flags[key] ?? config.enabled}
                        onCheckedChange={() => toggleFlag(key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="p-3 border-t border-border bg-card text-center">
          <p className="text-[10px] text-foreground/50 font-medium">Admin-only • Never exposes secret values</p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
