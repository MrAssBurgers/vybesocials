import { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { Link2, Mail, Check, Plus, Unlink, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface SpotifyConn {
  spotify_user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface MusicSettingsRow {
  show_listening_activity: boolean;
  show_on_profile: boolean;
  show_in_dms: boolean;
  hide_when_invisible: boolean;
}

interface ProviderInfo {
  id: string;
  name: string;
  linked: boolean;
  email: string | null;
  icon: React.ReactNode;
  bgClass: string;
  canLink: boolean;
}

export function ConnectionsSection() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [checking, setChecking] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);

  // Spotify
  const [spotify, setSpotify] = useState<SpotifyConn | null>(null);
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [musicSettings, setMusicSettings] = useState<MusicSettingsRow>({
    show_listening_activity: true,
    show_on_profile: true,
    show_in_dms: true,
    hide_when_invisible: true,
  });

  useEffect(() => {
    const checkLinks = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        const googleIdentity = authUser.identities?.find(i => i.provider === 'google');
        const appleIdentity = authUser.identities?.find(i => i.provider === 'apple');

        // Spotify connection
        const { data: sp } = await supabase
          .from('spotify_connections')
          .select('spotify_user_id, display_name, email, avatar_url')
          .eq('user_id', authUser.id)
          .maybeSingle();
        setSpotify((sp as any) || null);

        const { data: ms } = await supabase
          .from('music_settings')
          .select('show_listening_activity, show_on_profile, show_in_dms, hide_when_invisible')
          .eq('user_id', authUser.id)
          .maybeSingle();
        if (ms) setMusicSettings(ms as any);

        setProviders([
          { id: 'google', name: 'Google', linked: !!googleIdentity, email: googleIdentity?.identity_data?.email || null, icon: <GoogleIcon />, bgClass: 'bg-white', canLink: true },
          { id: 'apple', name: 'Apple', linked: !!appleIdentity, email: appleIdentity?.identity_data?.email || null, icon: <AppleIcon />, bgClass: 'bg-black', canLink: true },
          { id: 'discord', name: 'Discord', linked: false, email: null, icon: <DiscordIcon />, bgClass: 'bg-[#5865F2]', canLink: false },
          { id: 'x', name: 'X (Twitter)', linked: false, email: null, icon: <XIcon />, bgClass: 'bg-black', canLink: false },
        ]);
      } catch (error) {
        console.error('Error checking identity links:', error);
      } finally {
        setChecking(false);
      }
    };
    checkLinks();

    // React to ?spotify=connected returning from OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
      toast.success('Spotify connected');
      // refresh after a beat
      setTimeout(checkLinks, 500);
    } else if (params.get('spotify') === 'error') {
      toast.error('Spotify connection failed');
    }
  }, []);

  const handleLink = async (providerId: string) => {
    setLinking(providerId);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: providerId as 'google' | 'apple',
        options: { redirectTo: window.location.origin + '/settings' },
      });
      if (error) {
        if (error.message?.includes('already linked')) toast.error('This account is already linked to another user.');
        else throw error;
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to link account');
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (providerId: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const identity = authUser.identities?.find(i => i.provider === providerId);
      if (!identity) return;
      if ((authUser.identities?.length || 0) <= 1) {
        toast.error('You must have at least one login method connected.');
        return;
      }
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, linked: false, email: null } : p));
      toast.success(`${providerId === 'google' ? 'Google' : 'Apple'} account disconnected.`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to unlink account');
    }
  };

  const connectSpotify = async () => {
    setSpotifyBusy(true);
    try {
      const returnTo = window.location.origin + '/settings?spotify=connected';
      const { data, error } = await supabase.functions.invoke('spotify-oauth-start', { body: { returnTo } });
      if (error) throw error;
      if (!data?.url) throw new Error('No auth URL returned');
      window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || 'Could not start Spotify');
      setSpotifyBusy(false);
    }
  };

  const disconnectSpotify = async () => {
    setSpotifyBusy(true);
    try {
      const { error } = await supabase.functions.invoke('spotify-disconnect');
      if (error) throw error;
      setSpotify(null);
      toast.success('Spotify disconnected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
    } finally {
      setSpotifyBusy(false);
    }
  };

  const updateSetting = async (key: keyof MusicSettingsRow, value: boolean) => {
    setMusicSettings(prev => ({ ...prev, [key]: value }));
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    await supabase.from('music_settings').upsert({ user_id: authUser.id, ...musicSettings, [key]: value }, { onConflict: 'user_id' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        <Link2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        Account Connections
      </h3>

      {/* Email */}
      <div className="py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm sm:text-base">Email</p>
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground truncate">{user?.email || 'Not set'}</p>
              {user?.email && <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
            </div>
          </div>
        </div>
      </div>

      {/* Spotify (real OAuth) */}
      <div className="py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
            <div className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-[0_0_12px_rgba(29,185,84,0.4)]">
              {spotify?.avatar_url ? (
                <img src={spotify.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : <SpotifyIcon />}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm sm:text-base flex items-center gap-1.5">
                Spotify
                {spotify && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[#1DB954] bg-[#1DB954]/10 px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] shadow-[0_0_6px_#1DB954]" />
                    Connected
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {checking ? 'Checking…' : spotify ? (spotify.display_name || spotify.email || 'Connected') : 'Show what you\'re listening to'}
              </p>
            </div>
          </div>
          {!checking && (
            spotify ? (
              <Button variant="ghost" size="sm" onClick={disconnectSpotify} disabled={spotifyBusy} className="text-xs text-muted-foreground hover:text-destructive">
                {spotifyBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Unlink className="w-3 h-3 mr-1" />Disconnect</>}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={connectSpotify} disabled={spotifyBusy} className="text-xs border-[#1DB954]/40 text-[#1DB954] hover:bg-[#1DB954]/10 hover:text-[#1DB954]">
                {spotifyBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Plus className="w-3 h-3 mr-1" />Connect</>}
              </Button>
            )
          )}
        </div>

        {/* Privacy toggles when connected */}
        {spotify && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pl-13 ml-13 space-y-2 overflow-hidden"
          >
            <ToggleRow label="Show listening activity" value={musicSettings.show_listening_activity} onChange={(v) => updateSetting('show_listening_activity', v)} />
            <ToggleRow label="Show on profile" value={musicSettings.show_on_profile} onChange={(v) => updateSetting('show_on_profile', v)} />
            <ToggleRow label="Show in DMs" value={musicSettings.show_in_dms} onChange={(v) => updateSetting('show_in_dms', v)} />
            <ToggleRow label="Hide when invisible" value={musicSettings.hide_when_invisible} onChange={(v) => updateSetting('hide_when_invisible', v)} />
          </motion.div>
        )}
      </div>

      {/* Platform connections */}
      {providers.map((provider, index) => (
        <div key={provider.id} className={index < providers.length - 1 ? 'border-b border-border' : ''}>
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                <div className={`w-10 h-10 rounded-full ${provider.bgClass} flex items-center justify-center flex-shrink-0`}>
                  {provider.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm sm:text-base">{provider.name}</p>
                  {checking ? (
                    <p className="text-xs text-muted-foreground">Checking...</p>
                  ) : provider.linked ? (
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-muted-foreground truncate">{provider.email || 'Connected'}</p>
                      <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              {!checking && (
                <div>
                  {provider.linked ? (
                    <Button variant="ghost" size="sm" onClick={() => handleUnlink(provider.id)} className="text-xs text-muted-foreground hover:text-destructive">
                      <Unlink className="w-3 h-3 mr-1" />Disconnect
                    </Button>
                  ) : provider.canLink ? (
                    <Button variant="outline" size="sm" onClick={() => handleLink(provider.id)} disabled={linking === provider.id} className="text-xs">
                      {linking === provider.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                      Connect
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled className="text-xs opacity-60">Coming Soon</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="mt-6 pt-6 border-t border-border/40">
        <div className="mb-3">
          <h3 className="text-sm font-bold">Live presence — Twitch & Steam</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Show friends what you're streaming or playing in real time.
          </p>
        </div>
        <ExternalPresenceConnections />
      </div>

      <p className="text-[10px] text-muted-foreground/50 mt-3 text-center">
        Linking accounts lets you sign in with any connected method
      </p>
    </motion.div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
function AppleIcon() {
  return (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>);
}
function DiscordIcon() {
  return (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>);
}
function SpotifyIcon() {
  return (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>);
}
function XIcon() {
  return (<svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>);
}
