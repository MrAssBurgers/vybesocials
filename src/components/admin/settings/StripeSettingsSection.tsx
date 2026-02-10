import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Save, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StripeConfig {
  id: string;
  stripe_enabled: boolean;
  stripe_mode: string;
  stripe_publishable_key: string | null;
}

export function StripeSettingsSection() {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<string>('test');
  const [publishableKey, setPublishableKey] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stripe_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data);
        setEnabled(data.stripe_enabled);
        setMode(data.stripe_mode);
        setPublishableKey(data.stripe_publishable_key || '');
      }
    } catch (err) {
      console.error('Failed to fetch Stripe config:', err);
      toast.error('Failed to load Stripe settings');
    } finally {
      setLoading(false);
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    
    if (enabled && !publishableKey.trim()) {
      errs.push('Publishable key is required when Stripe is enabled');
    }

    if (publishableKey.trim()) {
      if (mode === 'live' && publishableKey.startsWith('pk_test_')) {
        errs.push('Live mode selected but publishable key is a test key (pk_test_)');
      }
      if (mode === 'test' && publishableKey.startsWith('pk_live_')) {
        errs.push('Test mode selected but publishable key is a live key (pk_live_)');
      }
      if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
        errs.push('Publishable key must start with pk_test_ or pk_live_');
      }
    }

    return errs;
  };

  const handleSave = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setSaving(true);
    try {
      const updateData = {
        stripe_enabled: enabled,
        stripe_mode: mode,
        stripe_publishable_key: publishableKey.trim() || null,
      };

      if (config?.id) {
        const { error } = await supabase
          .from('stripe_config')
          .update(updateData)
          .eq('id', config.id);
        if (error) throw error;
      }

      toast.success('Stripe settings saved');
      setErrors([]);
      await fetchConfig();
    } catch (err) {
      console.error('Failed to save Stripe config:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="liquid-glass-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="liquid-glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Stripe Configuration
              </CardTitle>
              <CardDescription>
                Manage payment processing for your platform
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={enabled
                ? 'bg-green-500/10 text-green-500 border-green-500/30'
                : 'bg-muted text-muted-foreground'
              }
            >
              {enabled ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Active</>
              ) : (
                'Disabled'
              )}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div>
              <Label htmlFor="stripe-enabled" className="font-medium">Enable Stripe</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Turn on payment processing for the platform
              </p>
            </div>
            <Switch
              id="stripe-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label>Stripe Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test Mode</SelectItem>
                <SelectItem value="live">Live Mode</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {mode === 'test'
                ? 'Uses test keys — no real charges are made'
                : '⚠️ Live mode — real payments will be processed'
              }
            </p>
          </div>

          {/* Publishable Key */}
          <div className="space-y-2">
            <Label>Publishable Key</Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
                placeholder={mode === 'test' ? 'pk_test_...' : 'pk_live_...'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used client-side for Stripe.js initialization
            </p>
          </div>

          {/* Secret Key Info */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-500">Secret Key &amp; Webhook Secret</p>
              <p className="text-muted-foreground">
                Secret keys are stored securely as encrypted environment secrets and are never exposed
                to the client. To update them, use the Lovable secrets manager.
              </p>
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="space-y-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {err}
                </div>
              ))}
            </div>
          )}

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Stripe Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
