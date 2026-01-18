import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Loader2, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useRedeemInvite } from '@/hooks/useInvites';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { VYBELogo } from '@/components/ui/VYBELogo';

export default function InviteRedeem() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const redeemInvite = useRedeemInvite();
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track invite link opened
  useEffect(() => {
    if (code) {
      analytics.inviteLinkOpened({ inviteCode: code });
    }
  }, [code]);
  
  // Fetch invite info
  useEffect(() => {
    async function fetchInvite() {
      if (!code) {
        setError('Invalid invite link');
        setLoading(false);
        return;
      }
      
      try {
        const { data, error: fetchError } = await supabase
          .from('invites')
          .select('*, profiles:inviter_id(username, avatar_url, display_name)')
          .eq('invite_code', code.toUpperCase())
          .single();
        
        if (fetchError || !data) {
          setError('This invite link is invalid or has expired');
        } else {
          setInviteInfo(data);
        }
      } catch {
        setError('Failed to load invite');
      } finally {
        setLoading(false);
      }
    }
    
    fetchInvite();
  }, [code]);
  
  const handleAcceptInvite = async () => {
    if (!code) return;
    
    try {
      await redeemInvite.mutateAsync(code);
      // Redirect to home after successful redemption
      setTimeout(() => navigate('/home'), 1500);
    } catch {
      // Error handled by mutation
    }
  };
  
  const handleSignUp = () => {
    // Store invite code in session storage for after signup
    if (code) {
      sessionStorage.setItem('pending_invite_code', code);
    }
    navigate('/auth?mode=signup');
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (error || !inviteInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/20 mb-4">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold">{error || 'Invalid Invite'}</h1>
          <p className="text-muted-foreground max-w-sm">
            This invite link may have expired or been used too many times.
          </p>
          <Button onClick={() => navigate('/')} variant="outline">
            Go to VYBE
          </Button>
        </motion.div>
      </div>
    );
  }
  
  const inviterProfile = inviteInfo.profiles;
  
  // If redeemed successfully
  if (redeemInvite.isSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full gradient-animated mb-4"
          >
            <CheckCircle className="h-10 w-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold">You're Connected!</h1>
          <p className="text-muted-foreground">
            You're now connected with @{inviterProfile?.username}
          </p>
          <p className="text-sm text-muted-foreground">
            Redirecting to VYBE...
          </p>
        </motion.div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/2 -left-1/2 w-full h-full opacity-20"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
      </div>
      
      {/* Header */}
      <header className="relative z-10 p-4 flex items-center justify-center">
        <VYBELogo size="md" showText />
      </header>
      
      {/* Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-6"
        >
          {/* Invite Card */}
          <div className="liquid-glass-card rounded-2xl p-6 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gradient-animated">
              <UserPlus className="h-8 w-8 text-white" />
            </div>
            
            <div>
              <h1 className="text-xl font-bold mb-2">You're Invited!</h1>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">
                  @{inviterProfile?.username || 'A friend'}
                </span>
                {' '}wants you to join VYBE
              </p>
            </div>
            
            {/* Inviter preview */}
            {inviterProfile && (
              <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-muted/30">
                <div className="w-12 h-12 rounded-full gradient-animated flex items-center justify-center text-white font-bold text-lg">
                  {inviterProfile.username?.[0]?.toUpperCase()}
                </div>
                <div className="text-left">
                  <p className="font-semibold">
                    {inviterProfile.display_name || inviterProfile.username}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{inviterProfile.username}
                  </p>
                </div>
              </div>
            )}
            
            {/* Action buttons */}
            {user && profile ? (
              <Button
                className="w-full gradient-animated"
                size="lg"
                onClick={handleAcceptInvite}
                disabled={redeemInvite.isPending}
              >
                {redeemInvite.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Accept Invite
              </Button>
            ) : (
              <div className="space-y-3">
                <Button
                  className="w-full gradient-animated"
                  size="lg"
                  onClick={handleSignUp}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Join VYBE
                </Button>
                <p className="text-xs text-muted-foreground">
                  Already have an account?{' '}
                  <button 
                    onClick={() => {
                      if (code) sessionStorage.setItem('pending_invite_code', code);
                      navigate('/auth?mode=login');
                    }}
                    className="text-primary hover:underline"
                  >
                    Log in
                  </button>
                </p>
              </div>
            )}
          </div>
          
          {/* Features preview */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Join millions sharing clips, connecting with friends, and discovering creators
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
