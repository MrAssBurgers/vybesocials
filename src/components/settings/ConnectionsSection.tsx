import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link2, X, Loader2, Mail, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';

export function ConnectionsSection() {
  const { user } = useAuth();
  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [appleLinked, setAppleLinked] = useState(false);
  const [appleEmail, setAppleEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkLinks = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const googleIdentity = user.identities?.find(i => i.provider === 'google');
          if (googleIdentity) {
            setGoogleLinked(true);
            setGoogleEmail(googleIdentity.identity_data?.email || null);
          }
          const appleIdentity = user.identities?.find(i => i.provider === 'apple');
          if (appleIdentity) {
            setAppleLinked(true);
            setAppleEmail(appleIdentity.identity_data?.email || null);
          }
        }
      } catch (error) {
        console.error('Error checking identity links:', error);
      } finally {
        setChecking(false);
      }
    };
    checkLinks();
  }, []);

  const handleConnect = async (provider: 'google' | 'apple') => {
    haptics.tap();
    setLoading(provider);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${window.location.origin}/settings` },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
      setLoading(null);
    }
  };

  const handleDisconnect = async (provider: 'google' | 'apple') => {
    haptics.tap();
    setLoading(provider);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const identity = user.identities?.find(i => i.provider === provider);
      if (identity) {
        const { error } = await supabase.auth.unlinkIdentity(identity);
        if (error) throw error;

        if (provider === 'google') { setGoogleLinked(false); setGoogleEmail(null); }
        if (provider === 'apple') { setAppleLinked(false); setAppleEmail(null); }
        haptics.success();
        toast.success(`${provider === 'google' ? 'Google' : 'Apple'} account disconnected`);
      }
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(null);
    }
  };

  const renderProvider = (
    provider: 'google' | 'apple',
    linked: boolean,
    email: string | null,
    icon: React.ReactNode,
    bgClass: string,
  ) => (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
          <div className={`w-10 h-10 rounded-full ${bgClass} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm sm:text-base capitalize">{provider === 'google' ? 'Google' : 'Apple'}</p>
            {checking ? (
              <p className="text-xs text-muted-foreground">Checking...</p>
            ) : linked ? (
              <p className="text-xs text-muted-foreground truncate">{email || 'Connected'}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Not connected</p>
            )}
          </div>
        </div>
        {!checking && (
          linked ? (
            <Button variant="outline" size="sm" onClick={() => handleDisconnect(provider)} disabled={loading === provider} className="flex-shrink-0">
              {loading === provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
              Disconnect
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => handleConnect(provider)} disabled={loading === provider} className="flex-shrink-0">
              {loading === provider ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
            </Button>
          )
        )}
      </div>
    </div>
  );

  const googleIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );

  const appleIcon = (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );

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

      {/* Email (Read-only) */}
      <div className="py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
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
      </div>

      {/* Google */}
      <div className="border-b border-border">
        {renderProvider('google', googleLinked, googleEmail, googleIcon, 'bg-white')}
      </div>

      {/* Apple */}
      {renderProvider('apple', appleLinked, appleEmail, appleIcon, 'bg-black')}
    </motion.div>
  );
}
