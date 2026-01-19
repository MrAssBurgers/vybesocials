import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useFriendshipStatus, useSendFriendRequest } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, UserPlus, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { haptics } from '@/lib/haptics';

/**
 * Deep link handler for NFC friend adds
 * URL: /add-friend/:userId
 * This page handles both in-app and web browser access
 */
export default function AddFriend() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const sendRequest = useSendFriendRequest();

  // Fetch the target user's profile
  const { data: targetUser, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ['add-friend-user', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: friendshipStatus, isLoading: statusLoading } = useFriendshipStatus(userId);

  const isLoading = authLoading || userLoading || statusLoading;

  // If not authenticated, redirect to login with return URL
  useEffect(() => {
    if (!authLoading && !user) {
      // Store the return URL for after login
      sessionStorage.setItem('addFriendReturnUrl', `/add-friend/${userId}`);
      navigate('/landing', { replace: true });
    }
  }, [authLoading, user, userId, navigate]);

  // Don't allow adding yourself
  const isSelf = user?.id === userId;

  const handleAddFriend = async () => {
    if (!userId || isSelf) return;

    try {
      await sendRequest.mutateAsync(userId);
      haptics.success();
      toast.success(`Friend request sent to @${targetUser?.username}!`);
      navigate('/messages');
    } catch (error) {
      haptics.error();
      toast.error('Failed to send friend request');
    }
  };

  const handleGoToMessages = () => {
    navigate('/messages');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userError || !targetUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
            <Users className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">User Not Found</h1>
          <p className="text-muted-foreground">
            This user doesn't exist or the link has expired.
          </p>
          <Button onClick={handleGoToMessages}>
            Go to Messages
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        {/* Avatar with glow effect */}
        <div className="relative">
          <motion.div
            className="absolute inset-0 m-auto w-28 h-28 rounded-full bg-primary/20"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.3, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <Avatar className="w-28 h-28 mx-auto ring-4 ring-background relative z-10">
            <AvatarImage src={targetUser.avatar_url || undefined} alt={targetUser.username} />
            <AvatarFallback className="text-4xl font-bold">
              {targetUser.username?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* User info */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {targetUser.display_name || targetUser.username}
          </h1>
          <p className="text-muted-foreground">@{targetUser.username}</p>
        </div>

        {/* Action based on status */}
        {isSelf ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">This is your own profile!</p>
            <Button onClick={handleGoToMessages} variant="outline" className="w-full">
              Go to Messages
            </Button>
          </div>
        ) : friendshipStatus?.status === 'friends' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Check className="h-5 w-5" />
              <span className="font-medium">Already Friends</span>
            </div>
            <Button onClick={handleGoToMessages} className="w-full">
              Send a Message
            </Button>
          </div>
        ) : friendshipStatus?.status === 'pending_sent' ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">Friend request already sent</p>
            <Button onClick={handleGoToMessages} variant="outline" className="w-full">
              Go to Messages
            </Button>
          </div>
        ) : friendshipStatus?.status === 'pending_received' ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">They've already sent you a request!</p>
            <Button onClick={handleGoToMessages} className="w-full">
              View Request
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              Add {targetUser.display_name || targetUser.username} as a friend?
            </p>
            <Button 
              onClick={handleAddFriend} 
              disabled={sendRequest.isPending}
              className="w-full gap-2"
            >
              {sendRequest.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Add Friend
            </Button>
            <Button onClick={handleGoToMessages} variant="outline" className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}