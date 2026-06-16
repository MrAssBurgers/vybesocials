import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import {
  Crown, Loader2, ShieldAlert, CreditCard, Key, Save, CheckCircle2, XCircle,
  Eye, EyeOff, Info, AlertCircle, Zap, RefreshCw, Shield, Activity, Bot,
} from 'lucide-react';
import { clearBypassCache } from '@/lib/ownerBypass';
import { GiftPremiumSection } from '@/components/admin/sections/GiftPremiumSection';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { motion } from 'framer-motion';

// ─── Hooks ───

function useIsOwner() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['is-owner', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return false;
      const { data } = await db.rpc('is_owner', { _user_id: profile.user_id });
      return !!data;
    },
    enabled: !!profile?.user_id,
    staleTime: 60_000,
  });
}

interface StripeConfig {
  id: string;
  stripe_enabled: boolean;
  stripe_mode: string;
  stripe_publishable_key: string | null;
}

function useStripeConfigAdmin() {
  return useQuery({
    queryKey: ['admin-stripe-config'],
    queryFn: async (): Promise<StripeConfig | null> => {
      const { data, error } = await db
        .from('stripe_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useSecretStatuses() {
  return useQuery({
    queryKey: ['admin-secret-statuses'],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await db.functions.invoke('manage-secrets', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return data.secrets || {};
    },
  });
}

function useOwnerBypassSetting() {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['owner-ai-bypass-enabled'],
    queryFn: async () => {
      const { data } = await db
        .from('app_secrets')
        .select('value')
        .eq('key', 'OWNER_AI_BYPASS_ENABLED')
        .maybeSingle();
      return data?.value === 'true';
    },
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await db
        .from('app_secrets')
        .upsert({ key: 'OWNER_AI_BYPASS_ENABLED', value: enabled ? 'true' : 'false', updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      clearBypassCache();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-ai-bypass-enabled'] });
    },
  });

  return { isEnabled: query.data ?? true, isLoading: query.isLoading, toggle };
}

// ─── Status Badge Component ───

function StatusBadge({ label, ok, value }: { label: string; ok: boolean; value?: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
      ok
        ? 'bg-green-500/10 text-green-500 border-green-500/20'
        : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      <span>{label}</span>
      {value && <span className="opacity-70">· {value}</span>}
    </div>
  );
}

// ─── Secret Row Component ───

function SecretRow({ name, label, description, placeholder, isSet, onSaved }: {
  name: string; label: string; description: string; placeholder: string; isSet: boolean; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) { toast.error('Please enter a value'); return; }
    setSaving(true);
    try {
      const { data, error } = await db.functions.invoke('manage-secrets', {
        body: { action: 'set', secret_name: name, secret_value: value.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${label} saved`);
      setEditing(false);
      setValue('');
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 p-4 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{label}</p>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[11px] ${isSet ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-orange-500/10 text-orange-500 border-orange-500/30'}`}>
          {isSet ? <><CheckCircle2 className="h-3 w-3 mr-1" />Set</> : <><XCircle className="h-3 w-3 mr-1" />Not set</>}
        </Badge>
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="pr-10 font-mono text-xs"
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-8 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save Key
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(''); }} className="h-8 text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 text-xs">
          {isSet ? 'Update Key' : 'Set Key'}
        </Button>
      )}
    </div>
  );
}

// ─── Validation Result Component ───

interface ValidationResult {
  valid: boolean;
  errors: string[];
  secret_key_present: boolean;
  secret_key_mode: string | null;
}

function ValidationPanel({ result, lastRun, isRunning, onRun }: {
  result: ValidationResult | null;
  lastRun: Date | null;
  isRunning: boolean;
  onRun: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={onRun} disabled={isRunning} className="gap-1.5 h-8 text-xs">
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Run Full Validation
        </Button>
        {lastRun && (
          <span className="text-[11px] text-muted-foreground">
            Last run: {lastRun.toLocaleTimeString()}
          </span>
        )}
      </div>
      {result && (
        <div className={`rounded-lg border p-3 space-y-2 ${result.valid ? 'bg-green-500/5 border-green-500/20' : 'bg-destructive/5 border-destructive/20'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.valid ? (
              <><CheckCircle2 className="h-4 w-4 text-green-500" /> All checks passed</>
            ) : (
              <><AlertCircle className="h-4 w-4 text-destructive" /> {result.errors.length} issue{result.errors.length > 1 ? 's' : ''} found</>
            )}
          </div>
          {result.errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-destructive">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
              {err}
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/30">
            <Shield className="h-3 w-3" />
            Secret Key: {result.secret_key_present
              ? <span className="text-green-500">Present ({result.secret_key_mode} mode)</span>
              : <span className="text-orange-500">Not configured</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function AdminSettings() {
  const { data: isOwner, isLoading: roleLoading } = useIsOwner();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: stripeConfig, isLoading: configLoading } = useStripeConfigAdmin();
  const { data: secretStatuses = {}, isLoading: secretsLoading } = useSecretStatuses();
  const { isEnabled: bypassEnabled, toggle: toggleBypass } = useOwnerBypassSetting();

  // Local form state
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('test');
  const [publishableKey, setPublishableKey] = useState('');
  const [showPk, setShowPk] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastValidation, setLastValidation] = useState<Date | null>(null);
  const [validating, setValidating] = useState(false);

  // Sync from server
  useEffect(() => {
    if (stripeConfig) {
      setEnabled(stripeConfig.stripe_enabled);
      setMode(stripeConfig.stripe_mode);
      setPublishableKey(stripeConfig.stripe_publishable_key || '');
      setDirty(false);
    }
  }, [stripeConfig]);

  const markDirty = () => setDirty(true);

  // Run validation
  const runValidation = async () => {
    setValidating(true);
    try {
      const headers = await getFunctionAuthHeaders();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-stripe-config`, {
        method: 'POST', headers, body: JSON.stringify({
          stripe_enabled: enabled, stripe_mode: mode, stripe_publishable_key: publishableKey.trim() || null,
        }),
      });
      const result = await res.json();
      setValidationResult(result);
      setLastValidation(new Date());
    } catch {
      toast.error('Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const errors: string[] = [];
      if (enabled && !publishableKey.trim()) errors.push('Publishable key is required when Stripe is enabled');
      if (publishableKey.trim()) {
        if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) errors.push('Publishable key must start with pk_test_ or pk_live_');
        if (mode === 'live' && publishableKey.startsWith('pk_test_')) errors.push('Live mode but key is pk_test_');
        if (mode === 'test' && publishableKey.startsWith('pk_live_')) errors.push('Test mode but key is pk_live_');
      }
      if (errors.length > 0) throw new Error(errors.join('\n'));

      const updateData = {
        stripe_enabled: enabled,
        stripe_mode: mode,
        stripe_publishable_key: publishableKey.trim() || null,
      };

      if (stripeConfig?.id) {
        const { error } = await db.from('stripe_config').update(updateData).eq('id', stripeConfig.id);
        if (error) throw error;
      } else {
        // No config row exists yet — insert one
        const { error } = await db.from('stripe_config').insert(updateData);
        if (error) throw error;
      }

      // Auto-validate after save (non-blocking — don't let secret key issues block publishable key saves)
      try {
        const headers = await getFunctionAuthHeaders();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-stripe-config`, {
          method: 'POST', headers, body: JSON.stringify(updateData),
        });
        const result = await res.json();
        setValidationResult(result);
        setLastValidation(new Date());
        // Only return warnings about the publishable key, not the secret key
        const pkWarnings = (result.errors || []).filter((e: string) =>
          e.toLowerCase().includes('publishable')
        );
        if (pkWarnings.length > 0) {
          return { warnings: pkWarnings };
        }
      } catch { /* validation call failed, save still succeeded */ }
      return { warnings: [] };
    },
    onSuccess: (result) => {
      if (result?.warnings?.length) {
        toast.warning('Settings saved — Secret Key issue detected', { description: result.warnings.join('. '), duration: 8000 });
      } else {
        toast.success('Settings saved & validated ✓');
      }
      setDirty(false);
      // Invalidate all related caches so DevTools + app pick up changes
      queryClient.invalidateQueries({ queryKey: ['admin-stripe-config'] });
      queryClient.invalidateQueries({ queryKey: ['admin-secret-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['stripe-config-status'] });
    },
    onError: (err: Error) => toast.error('Failed to save', { description: err.message }),
  });

  useEffect(() => {
    if (!roleLoading && !isOwner) navigate('/home');
  }, [roleLoading, isOwner, navigate]);

  if (roleLoading || configLoading || secretsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isOwner) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <ShieldAlert className="h-12 w-12 text-destructive" />
          <p className="text-muted-foreground">Access denied</p>
        </div>
      </AppLayout>
    );
  }

  const secretKeySet = secretStatuses['STRIPE_SECRET_KEY'] || false;
  const webhookSet = secretStatuses['STRIPE_WEBHOOK_SECRET'] || false;
  const pkSet = !!publishableKey.trim();

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-24">

        {/* ─── Header ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Owner Command Center</h1>
            <p className="text-xs text-muted-foreground">Platform-wide configuration</p>
          </div>
        </motion.div>

        {/* ─── System Status Bar ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="liquid-glass-card p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Status</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label="Stripe" ok={enabled} value={enabled ? 'Active' : 'Off'} />
            <StatusBadge label="Mode" ok={true} value={mode === 'test' ? 'Test' : 'Live'} />
            <StatusBadge label="Publishable Key" ok={pkSet} />
            <StatusBadge label="Secret Key" ok={secretKeySet} />
            <StatusBadge label="Webhook" ok={webhookSet} />
          </div>
        </motion.div>

        {/* ─── Section 1: Payment Processing ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="liquid-glass-card p-4 sm:p-5 space-y-5"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Payment Processing</h2>
              <p className="text-[11px] text-muted-foreground">Enable and configure Stripe for all users</p>
            </div>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/50 p-3.5 bg-muted/20">
            <div>
              <Label htmlFor="stripe-enabled" className="font-medium text-sm">Enable Stripe</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">Turn on payment processing platform-wide</p>
            </div>
            <Switch id="stripe-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); markDirty(); }} />
          </div>

          {/* Mode Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Mode</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v); markDirty(); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test Mode</SelectItem>
                <SelectItem value="live">Live Mode</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {mode === 'test' ? 'No real charges — safe for development' : '⚠️ Real payments will be processed'}
            </p>
          </div>

          {/* Publishable Key */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Publishable Key</Label>
            <div className="relative">
              <Input
                type={showPk ? 'text' : 'password'}
                value={publishableKey}
                onChange={(e) => { setPublishableKey(e.target.value); markDirty(); }}
                placeholder={mode === 'test' ? 'pk_test_...' : 'pk_live_...'}
                className="pr-10 font-mono text-xs"
              />
              <button type="button" onClick={() => setShowPk(!showPk)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPk ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Client-side key for Stripe.js — safe to store</p>
          </div>

          {/* Save Button */}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !dirty}
            className="w-full gap-2 h-10"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {dirty ? 'Save Payment Settings' : 'Settings Saved ✓'}
          </Button>
        </motion.div>

        {/* ─── Section 2: Server-Side Keys ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="liquid-glass-card p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Server-Side Keys</h2>
              <p className="text-[11px] text-muted-foreground">Securely stored — never exposed to clients</p>
            </div>
          </div>

          <SecretRow
            name="STRIPE_SECRET_KEY"
            label="Stripe Secret Key"
            description={`Server-side key for payment processing (${mode === 'test' ? 'sk_test_...' : 'sk_live_...'})`}
            placeholder={mode === 'test' ? 'sk_test_...' : 'sk_live_...'}
            isSet={secretKeySet}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['admin-secret-statuses'] });
              queryClient.invalidateQueries({ queryKey: ['stripe-config-status'] });
            }}
          />
          <SecretRow
            name="STRIPE_WEBHOOK_SECRET"
            label="Stripe Webhook Secret"
            description="Verify incoming webhook signatures (whsec_...)"
            placeholder="whsec_..."
            isSet={webhookSet}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-secret-statuses'] })}
          />

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              Keys are read automatically by all backend functions. Changes take effect immediately for every user.
            </p>
          </div>
        </motion.div>

        {/* ─── Section 3: Validation & Sync ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="liquid-glass-card p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Validation & Sync</h2>
              <p className="text-[11px] text-muted-foreground">Verify keys match mode and everything is connected</p>
            </div>
          </div>

          <ValidationPanel
            result={validationResult}
            lastRun={lastValidation}
            isRunning={validating}
            onRun={runValidation}
          />
        </motion.div>

        {/* ─── Section 4: AI Safety Bypass ─── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="liquid-glass-card p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">AI Content Safety</h2>
              <p className="text-[11px] text-muted-foreground">Owner bypass for content scanners</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/50 p-3.5 bg-muted/20">
            <div>
              <Label htmlFor="ai-bypass" className="font-medium text-sm">Owner Safety Bypass</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Skip AI content scanning for your posts, DMs, and chat media
              </p>
            </div>
            <Switch
              id="ai-bypass"
              checked={bypassEnabled}
              onCheckedChange={(v) => {
                toggleBypass.mutate(v);
                toast.success(v ? 'AI bypass enabled' : 'AI bypass disabled');
              }}
              disabled={toggleBypass.isPending}
            />
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/30">
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              When enabled, your account bypasses all AI safety scans (uploads, DM images, vybes, camera). Other users are unaffected.
            </p>
          </div>
        </motion.div>

        {/* ─── Section 5: Gift Premium ─── */}
        <GiftPremiumSection />

        {/* Footer note */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent/50 border border-border/30">
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            All settings are platform-wide. When you enable Stripe and save, payment features become available to every user immediately. DevTools panel syncs automatically.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
