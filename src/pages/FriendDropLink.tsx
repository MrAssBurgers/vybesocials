import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, UserPlus, Check, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { stashAuthReturnPath } from '@/lib/authReturnPath';
import { NFCSwapAnimation } from '@/components/friends/NFCSwapAnimation';

type Phase = 'loading' | 'ready' | 'exchanging' | 'success' | 'error';

/**
 * Deep link for Friend Link QR / NFC: /friend-drop/:dropId
 */
export default function FriendDropLink() {
  const { dropId } = useParams<{ dropId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const profileId = useAuthProfileId();
  const sendRequest = useSendFriendRequest();
  const [phase, setPhase] = useState<Phase>('loading');
  const [owner, setOwner] = useState<{
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [showSwap, setShowSwap] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!dropId) {
      setPhase('error');
      return;
    }
    if (!user) {
      stashAuthReturnPath(`/friend-drop/${dropId}`);
      navigate('/auth', { replace: true });
      return;
    }
    if (!profileId) {
      if (!profile) return;
      setPhase('error');
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const { data: drop, error } = await supabase
          .from('friend_drops')
          .update({
            to_user_id: profileId,
            status: 'scanned',
          })
          .eq('id', dropId)
          .eq('status', 'pending')
          .select()
          .single();

        if (error || !drop?.from_user_id) {
          setPhase('error');
          toast.error('This Friend Link has expired');
          return;
        }

        const { data: ownerProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', drop.from_user_id)
          .single();

        if (profileError || !ownerProfile) {
          setPhase('error');
          return;
        }

        if (ownerProfile.id === profileId) {
          toast.info("That's your own link");
          navigate('/home', { replace: true });
          return;
        }

        setOwner(ownerProfile);
        setShowSwap(true);
        setPhase('exchanging');
        haptics.success();
      } catch {
        setPhase('error');
      }
    })();
  }, [authLoading, user, profile, profileId, dropId, navigate]);

  const completeRef = useRef(false);

  const completeAdd = async () => {
    if (!owner || !dropId || completeRef.current) return;
    completeRef.current = true;
    try {
      await sendRequest.mutateAsync(owner.id);
      await supabase
        .from('friend_drops')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', dropId);
      setPhase('success');
      haptics.success();
      toast.success(`You're now connected with @${owner.username}!`);
      window.setTimeout(() => navigate('/messages', { replace: true }), 2200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('already')) {
        setPhase('success');
        window.setTimeout(() => navigate('/messages', { replace: true }), 1500);
      } else {
        toast.error('Could not add friend');
        setPhase('ready');
        setShowSwap(false);
      }
    }
  };

  if (authLoading || phase === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Connecting Friend Link…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-center">
        <Users className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-lg font-bold">Link expired or invalid</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Ask your friend to open Friend Link again and share a fresh QR or tap.
        </p>
        <Button asChild className="rounded-full">
          <Link to="/home">Go to Home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <NFCSwapAnimation
        isActive={showSwap}
        myProfile={
          profile?.username
            ? { username: profile.username, avatar_url: profile.avatar_url }
            : null
        }
        theirProfile={
          owner ? { username: owner.username, avatar_url: owner.avatar_url } : null
        }
        onAutoAdd={() => { void completeAdd(); }}
        onComplete={() => setShowSwap(false)}
      />

      {phase === 'success' && owner && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Friend added!</h1>
          <p className="text-muted-foreground">@{owner.username}</p>
        </motion.div>
      )}

      {phase === 'exchanging' && owner && !showSwap && (
        <div className="flex flex-col items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={owner.avatar_url || undefined} />
            <AvatarFallback>{owner.username[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <Button className="rounded-full gap-2" onClick={() => { void completeAdd(); }}>
            <UserPlus className="h-4 w-4" /> Add @{owner.username}
          </Button>
        </div>
      )}
    </div>
  );
}
