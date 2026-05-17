import { useEffect, useState } from 'react';
import { Gamepad2, Tv, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/**
 * Lets the user save their Twitch login and Steam ID so friends see
 * "Live on Twitch" and "Playing on Steam" presence pills. Stored in
 * `external_account_handles` (no secrets — just public usernames).
 */
export function ExternalPresenceConnections() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [twitch, setTwitch] = useState('');
  const [steam, setSteam] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('external_account_handles')
      .select('twitch_login, steam_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setTwitch(data?.twitch_login ?? '');
        setSteam(data?.steam_id ?? '');
        setLoading(false);
      });
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      twitch_login: twitch.trim().toLowerCase().replace(/^@/, '') || null,
      steam_id: steam.trim() || null,
    };
    const { error } = await supabase
      .from('external_account_handles')
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return;
    }
    // Kick off an immediate poll so the pill shows up right away
    supabase.functions.invoke('external-presence-poll', { body: {} }).catch(() => {});
    toast({ title: 'Saved', description: 'Friends will see your live presence within ~45s.' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4 text-[#9146FF]" />
          <Label htmlFor="twitch-login" className="font-semibold">Twitch username</Label>
        </div>
        <Input
          id="twitch-login"
          value={twitch}
          onChange={(e) => setTwitch(e.target.value)}
          placeholder="e.g. shroud"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Shows a <span className="text-[#9146FF] font-medium">Live on Twitch</span> badge when you go live.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-4 h-4 text-[#66C0F4]" />
          <Label htmlFor="steam-id" className="font-semibold">Steam ID (SteamID64)</Label>
        </div>
        <Input
          id="steam-id"
          value={steam}
          onChange={(e) => setSteam(e.target.value)}
          placeholder="e.g. 76561198000000000"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          17-digit number from your Steam profile URL. Get it at{' '}
          <a href="https://steamid.io" target="_blank" rel="noreferrer noopener" className="underline">
            steamid.io
          </a>. Your Steam profile must be set to <strong>Public</strong>.
        </p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
        Save
      </Button>
    </div>
  );
}
