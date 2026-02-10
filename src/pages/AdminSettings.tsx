import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { Settings, Loader2, ShieldAlert, CreditCard, Key, Save, CheckCircle2, XCircle, Eye, EyeOff, Info, AlertCircle, ToggleLeft } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';

function useIsOwner() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['is-owner', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return false;
      const { data } = await supabase.rpc('is_owner', { _user_id: profile.user_id });
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return data.secrets || {};
    },
  });
}

// ─── Secret Row ───
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
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
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
    <div className="rounded-lg border border-border/50 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{label}</span>
        </div>
        <Badge variant="outline" className={isSet ? 'bg-green-500/10 text-green-500 border-green-500/30 text-xs' : 'bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs'}>
          {isSet ? <><CheckCircle2 className="h-3 w-3 mr-1" />Set</> : <><XCircle className="h-3 w-3 mr-1" />Not set</>}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {editing ? (
        <div className="space-y-2">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="pr-10 font-mono text-sm"
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setValue(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{isSet ? 'Update' : 'Set Value'}</Button>
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

  // Local form state
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('test');
  const [publishableKey, setPublishableKey] = useState('');
  const [showPk, setShowPk] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync from server
  useEffect(() => {
    if (stripeConfig) {
      setEnabled(stripeConfig.stripe_enabled);
      setMode(stripeConfig.stripe_mode);
      setPublishableKey(stripeConfig.stripe_publishable_key || '');
      setDirty(false);
    }
  }, [stripeConfig]);

  // Track dirty
  const markDirty = () => setDirty(true);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Client-side validation
      const errors: string[] = [];
      if (enabled && !publishableKey.trim()) errors.push('Publishable key is required when Stripe is enabled');
      if (publishableKey.trim()) {
        if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) errors.push('Publishable key must start with pk_test_ or pk_live_');
        if (mode === 'live' && publishableKey.startsWith('pk_test_')) errors.push('Live mode selected but key is pk_test_');
        if (mode === 'test' && publishableKey.startsWith('pk_live_')) errors.push('Test mode selected but key is pk_live_');
      }
      if (errors.length > 0) throw new Error(errors.join('\n'));

      const updateData = {
        stripe_enabled: enabled,
        stripe_mode: mode,
        stripe_publishable_key: publishableKey.trim() || null,
      };

      if (stripeConfig?.id) {
        const { error } = await supabase.from('stripe_config').update(updateData).eq('id', stripeConfig.id);
        if (error) throw error;
      }

      // Server-side validation
      try {
        const headers = await getFunctionAuthHeaders();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-stripe-config`, {
          method: 'POST', headers, body: JSON.stringify(updateData),
        });
        const result = await res.json();
        if (!result.valid && result.errors?.length) {
          return { saved: true, warnings: result.errors, validation: result };
        }
        return { saved: true, warnings: [], validation: result };
      } catch {
        return { saved: true, warnings: [], validation: null };
      }
    },
    onSuccess: (result) => {
      if (result.warnings?.length) {
        toast.warning('Settings saved with warnings', { description: result.warnings.join(', ') });
      } else {
        toast.success('Stripe settings saved ✓');
      }
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['admin-stripe-config'] });
      queryClient.invalidateQueries({ queryKey: ['stripe-config-status'] });
    },
    onError: (err: Error) => {
      toast.error('Failed to save', { description: err.message });
    },
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

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Owner Settings</h1>
            <p className="text-sm text-muted-foreground">Platform-wide configuration</p>
          </div>
        </div>

        {/* ─── Stripe Payments Card ─── */}
        <Card className="liquid-glass-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-5 w-5 text-primary" />
                Stripe Payments
              </CardTitle>
              <Badge variant="outline" className={enabled ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-muted text-muted-foreground'}>
                {enabled ? <><CheckCircle2 className="h-3 w-3 mr-1" />Active</> : <><ToggleLeft className="h-3 w-3 mr-1" />Disabled</>}
              </Badge>
            </div>
            <CardDescription>Enable and configure payment processing for all users</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div>
                <Label htmlFor="stripe-enabled" className="font-medium">Enable Stripe</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Turn on payment processing platform-wide</p>
              </div>
              <Switch id="stripe-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); markDirty(); }} />
            </div>

            {/* Mode Selector */}
            <div className="space-y-1.5">
              <Label className="text-sm">Mode</Label>
              <Select value={mode} onValueChange={(v) => { setMode(v); markDirty(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test Mode</SelectItem>
                  <SelectItem value="live">Live Mode</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mode === 'test' ? 'No real charges — safe for development' : '⚠️ Real payments will be processed'}
              </p>
            </div>

            {/* Publishable Key */}
            <div className="space-y-1.5">
              <Label className="text-sm">Publishable Key</Label>
              <div className="relative">
                <Input
                  type={showPk ? 'text' : 'password'}
                  value={publishableKey}
                  onChange={(e) => { setPublishableKey(e.target.value); markDirty(); }}
                  placeholder={mode === 'test' ? 'pk_test_...' : 'pk_live_...'}
                  className="pr-10 font-mono text-sm"
                />
                <button type="button" onClick={() => setShowPk(!showPk)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPk ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Client-side key for Stripe.js initialization</p>
            </div>

            {/* Save Button */}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !dirty}
              className="w-full gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dirty ? 'Save Stripe Settings' : 'Settings Saved'}
            </Button>
          </CardContent>
        </Card>

        {/* ─── API Keys Card ─── */}
        <Card className="liquid-glass-card">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-5 w-5 text-primary" />
              API Keys & Secrets
            </CardTitle>
            <CardDescription>Server-side keys stored securely — never exposed to clients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SecretRow
              name="STRIPE_SECRET_KEY"
              label="Stripe Secret Key"
              description={`Server-side key for payment processing (${mode === 'test' ? 'sk_test_...' : 'sk_live_...'})`}
              placeholder={mode === 'test' ? 'sk_test_...' : 'sk_live_...'}
              isSet={secretStatuses['STRIPE_SECRET_KEY'] || false}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-secret-statuses'] })}
            />
            <SecretRow
              name="STRIPE_WEBHOOK_SECRET"
              label="Stripe Webhook Secret"
              description="Used to verify incoming webhook signatures (whsec_...)"
              placeholder="whsec_..."
              isSet={secretStatuses['STRIPE_WEBHOOK_SECRET'] || false}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-secret-statuses'] })}
            />

            {/* Info box */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-2">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                These keys are read automatically by all backend payment functions. Changes take effect immediately for every user.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Helpful note */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-accent/50 border border-border/30">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            All settings are platform-wide. When you enable Stripe and save, payment features become available to every user immediately.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
