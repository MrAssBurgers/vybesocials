import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { setPendingReferral, clearPendingReferral } from '@/lib/referral';

interface InviterInfo {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
}

/**
 * Invite landing page - validates invite and stores referral for post-signup
 * 
 * URL formats:
 * - /invite/@username
 * - /invite/username
 */
export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [validated, setValidated] = useState(false);
  
  // Parse username from identifier (handles @username format)
  const getUsername = (id: string | undefined): string | null => {
    if (!id) return null;
    return id.startsWith('@') ? id.slice(1) : id;
  };
  
  const username = getUsername(identifier);
  
  // Track invite link opened
  useEffect(() => {
    if (username) {
      analytics.inviteLinkOpened({ inviteCode: username });
    }
  }, [username]);
  
  // Validate invite and store for post-signup
  useEffect(() => {
    async function validateInvite() {
      if (!username) {
        setLoading(false);
        return;
      }
      
      try {
        // Find inviter by username using public_profiles for RLS compatibility
        const { data: inviterProfile, error } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url, display_name')
          .ilike('username', username.toLowerCase())
          .maybeSingle();
        
        if (error || !inviterProfile) {
          console.log('Inviter not found, continuing without referral');
          clearPendingReferral();
          setLoading(false);
          return;
        }
        
        setInviter(inviterProfile);
        // Store in localStorage for persistence across signup
        setPendingReferral(inviterProfile.id);
        setValidated(true);
      } catch (err) {
        console.error('Error validating invite:', err);
        clearPendingReferral();
      } finally {
        setLoading(false);
      }
    }
    
    validateInvite();
  }, [username]);
  
  // Handle already logged-in users
  useEffect(() => {
    if (!validated) return;
    if (!user?.id || !profile?.id) return;
    
    if (inviter && inviter.id === profile.id) {
      // Can't use own invite
      clearPendingReferral();
      navigate('/home');
      return;
    }
    
    // Already logged in with valid referral - go to home
    // InvitePopup will show there
    if (inviter) {
      navigate('/home');
    }
  }, [user?.id, profile?.id, inviter, validated, navigate]);
  
  const handleJoin = () => {
    // Navigate to landing page with signup mode
    // Referral is already stored in localStorage
    navigate('/?signup=true');
  };
  
  const handleLogin = () => {
    navigate('/');
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                {inviter ? (
                  <>
                    <span className="font-semibold text-foreground">
                      @{inviter.username}
                    </span>
                    {' '}wants you to join VYBE
                  </>
                ) : (
                  'Join VYBE and connect with friends'
                )}
              </p>
            </div>
            
            {/* Inviter preview */}
            {inviter && (
              <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-muted/30">
                <div className="w-12 h-12 rounded-full gradient-animated flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                  {inviter.avatar_url ? (
                    <img src={inviter.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    inviter.username?.[0]?.toUpperCase()
                  )}
                </div>
                <div className="text-left">
                  <p className="font-semibold">
                    {inviter.display_name || inviter.username}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{inviter.username}
                  </p>
                </div>
              </div>
            )}
            
            {/* Action buttons */}
            <div className="space-y-3">
              <Button
                className="w-full gradient-animated"
                size="lg"
                onClick={handleJoin}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Join VYBE
              </Button>
              <p className="text-xs text-muted-foreground">
                Already have an account?{' '}
                <button 
                  onClick={handleLogin}
                  className="text-primary hover:underline"
                >
                  Log in
                </button>
              </p>
            </div>
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
