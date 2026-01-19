import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { setPendingReferral, clearPendingReferral, type PendingReferral } from '@/lib/referral';

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
 * - /invite/userId (UUID format)
 * 
 * This page NEVER errors - if inviter is invalid, we just continue without referral
 */
export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [validated, setValidated] = useState(false);
  
  // Parse identifier - handles @username, username, or UUID
  const parseIdentifier = (id: string | undefined): { type: 'username' | 'uuid'; value: string } | null => {
    if (!id) return null;
    
    // Remove @ prefix if present
    const cleaned = id.startsWith('@') ? id.slice(1) : id;
    
    // Check if it's a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(cleaned)) {
      return { type: 'uuid', value: cleaned };
    }
    
    return { type: 'username', value: cleaned };
  };
  
  const parsed = parseIdentifier(identifier);
  
  // Track invite link opened
  useEffect(() => {
    if (parsed) {
      analytics.inviteLinkOpened({ inviteCode: parsed.value });
    }
  }, [parsed?.value]);
  
  // Validate invite and store for post-signup
  useEffect(() => {
    async function validateInvite() {
      if (!parsed) {
        setLoading(false);
        return;
      }
      
      try {
        let inviterProfile: InviterInfo | null = null;
        
        // Find inviter by username or UUID
        if (parsed.type === 'uuid') {
          const { data, error } = await supabase
            .from('public_profiles')
            .select('id, username, avatar_url, display_name')
            .eq('id', parsed.value)
            .maybeSingle();
          
          if (!error && data) {
            inviterProfile = data;
          }
        } else {
          const { data, error } = await supabase
            .from('public_profiles')
            .select('id, username, avatar_url, display_name')
            .ilike('username', parsed.value.toLowerCase())
            .maybeSingle();
          
          if (!error && data) {
            inviterProfile = data;
          }
        }
        
        if (!inviterProfile) {
          console.log('[InviteRedeem] Inviter not found, continuing without referral');
          clearPendingReferral();
          setLoading(false);
          return;
        }
        
        console.log('[InviteRedeem] Found inviter:', inviterProfile.username);
        setInviter(inviterProfile);
        
        // Store complete referral data for post-signup
        const referralData: PendingReferral = {
          inviterId: inviterProfile.id,
          inviterUsername: inviterProfile.username,
          inviterDisplayName: inviterProfile.display_name,
          inviterAvatarUrl: inviterProfile.avatar_url,
          timestamp: Date.now(),
        };
        setPendingReferral(referralData);
        setValidated(true);
      } catch (err) {
        console.error('[InviteRedeem] Error validating invite:', err);
        clearPendingReferral();
      } finally {
        setLoading(false);
      }
    }
    
    validateInvite();
  }, [parsed?.type, parsed?.value]);
  
  // Handle already logged-in users
  useEffect(() => {
    if (!validated) return;
    if (!user?.id || !profile?.id) return;
    
    if (inviter && inviter.id === profile.id) {
      // Can't use own invite - clear and redirect
      console.log('[InviteRedeem] Self-referral detected, clearing');
      clearPendingReferral();
      navigate('/home');
      return;
    }
    
    // Already logged in with valid referral - go to home
    // InvitePopup component will handle showing the modal there
    if (inviter) {
      console.log('[InviteRedeem] User logged in, redirecting to home for popup');
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
