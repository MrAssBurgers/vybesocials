import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Key, Save, Loader2, CheckCircle2, XCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SecretInfo {
  name: string;
  label: string;
  description: string;
  placeholder: string;
}

const MANAGEABLE_SECRETS: SecretInfo[] = [
  {
    name: 'STRIPE_SECRET_KEY',
    label: 'Stripe Secret Key',
    description: 'Server-side key for processing payments (sk_test_... or sk_live_...)',
    placeholder: 'sk_test_...',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    label: 'Stripe Webhook Secret',
    description: 'Used to verify webhook signatures from Stripe (whsec_...)',
    placeholder: 'whsec_...',
  },
];

export function SecretsManagerSection() {
  const [secretStatuses, setSecretStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSecretStatuses();
  }, []);

  const fetchSecretStatuses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'list' },
      });

      if (error) throw error;
      setSecretStatuses(data.secrets || {});
    } catch (err) {
      console.error('Failed to fetch secret statuses:', err);
      toast.error('Failed to load secret statuses');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (secretName: string) => {
    const value = inputValues[secretName]?.trim();
    if (!value) {
      toast.error('Please enter a value');
      return;
    }

    setSavingKey(secretName);
    try {
      const { data, error } = await supabase.functions.invoke('manage-secrets', {
        body: { action: 'set', secret_name: secretName, secret_value: value },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${secretName} saved successfully`);
      setEditingKey(null);
      setInputValues(prev => ({ ...prev, [secretName]: '' }));
      setSecretStatuses(prev => ({ ...prev, [secretName]: true }));
    } catch (err: any) {
      console.error('Failed to save secret:', err);
      toast.error(err.message || 'Failed to save secret');
    } finally {
      setSavingKey(null);
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
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            API Keys & Secrets
          </CardTitle>
          <CardDescription>
            Securely manage API keys for your platform. Values are encrypted and never exposed to clients.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {MANAGEABLE_SECRETS.map((secret) => {
            const isConfigured = secretStatuses[secret.name];
            const isEditing = editingKey === secret.name;
            const isSaving = savingKey === secret.name;

            return (
              <div
                key={secret.name}
                className="rounded-lg border border-border/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <Label className="font-medium">{secret.label}</Label>
                  </div>
                  <Badge
                    variant="outline"
                    className={isConfigured
                      ? 'bg-green-500/10 text-green-500 border-green-500/30'
                      : 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                    }
                  >
                    {isConfigured ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1" /> Set</>
                    ) : (
                      <><XCircle className="h-3 w-3 mr-1" /> Not set</>
                    )}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">{secret.description}</p>

                {isEditing ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        type={showValues[secret.name] ? 'text' : 'password'}
                        value={inputValues[secret.name] || ''}
                        onChange={(e) =>
                          setInputValues(prev => ({ ...prev, [secret.name]: e.target.value }))
                        }
                        placeholder={secret.placeholder}
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowValues(prev => ({ ...prev, [secret.name]: !prev[secret.name] }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showValues[secret.name] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(secret.name)}
                        disabled={isSaving}
                        className="gap-1"
                      >
                        {isSaving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingKey(null);
                          setInputValues(prev => ({ ...prev, [secret.name]: '' }));
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingKey(secret.name)}
                  >
                    {isConfigured ? 'Update' : 'Set Value'}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
