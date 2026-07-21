import { useState } from 'react';
import { toast } from 'sonner';
import { Bot, KeyRound, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { useAiUsage } from '@/hooks/useAiUsage';

function invokeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message || '').trim();
    if (msg) return msg;
  }
  return fallback;
}

export function AiKeySection() {
  const { usage, refresh } = useAiUsage();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  /** Optimistic flag so a successful save still shows "connected" if refresh flakes. */
  const [justSaved, setJustSaved] = useState(false);

  const googleConnected = usage.providers.google || justSaved;

  const saveKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Paste your Google AI API key first');
      return;
    }
    setSaving(true);
    try {
      const { error } = await invokeFunction('save-user-ai-key', {
        provider: 'google',
        apiKey: apiKey.trim(),
      });
      if (error) throw error;
      setApiKey('');
      setJustSaved(true);
      toast.success('API key saved — AI usage will bill your Google account');
      await refresh();
      window.dispatchEvent(new CustomEvent('vybe-ai-key-saved'));
    } catch (err: unknown) {
      toast.error(invokeErrorMessage(err, 'Could not save API key'));
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    setSaving(true);
    try {
      const { error } = await invokeFunction('delete-user-ai-key', { provider: 'google' });
      if (error) throw error;
      setJustSaved(false);
      toast.success('API key removed');
      await refresh();
    } catch (err: unknown) {
      toast.error(invokeErrorMessage(err, 'Could not remove API key'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">VYBE AI</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Free daily messages are limited. Add your own Google AI key for unlimited chat on your account.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium">Today&apos;s usage (platform AI)</p>
        <UsageRow label="Chat messages" bucket={usage.chat} unlimited={usage.hasByok || justSaved} />
        <UsageRow label="Image generation" bucket={usage.image_gen} unlimited={usage.hasByok || justSaved} />
        <UsageRow label="DM assist" bucket={usage.assist} unlimited={usage.hasByok || justSaved} />
        <UsageRow label="Smart replies" bucket={usage.smart_replies} unlimited={usage.hasByok || justSaved} />
        {usage.isPremium && !(usage.hasByok || justSaved) && (
          <p className="text-xs text-muted-foreground">VYBE+ members get higher daily limits.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">Your API key (optional)</p>
        </div>
        {googleConnected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Google AI key connected</p>
            <Button variant="outline" size="sm" onClick={removeKey} disabled={saving}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Remove
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="google-ai-key">Google AI Studio API key</Label>
              <Input
                id="google-ai-key"
                type="password"
                autoComplete="off"
                placeholder="AIza…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <Button onClick={saveKey} disabled={saving} className="w-full sm:w-auto">
              Save key
            </Button>
          </>
        )}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Get a free key from Google AI Studio
          <ExternalLink className="w-3 h-3" />
        </a>
        <p className="text-xs text-muted-foreground">
          Keys are stored securely and only used server-side for your AI requests. VYBE never shares your key.
        </p>
      </div>
    </div>
  );
}

function UsageRow({
  label,
  bucket,
  unlimited,
}: {
  label: string;
  bucket: { used: number; limit: number };
  unlimited: boolean;
}) {
  const pct = unlimited ? 0 : Math.min(100, Math.round((bucket.used / Math.max(bucket.limit, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {unlimited ? 'Your key' : `${bucket.used} / ${bucket.limit}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
