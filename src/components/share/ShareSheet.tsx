import { useState, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  Share2, 
  Download, 
  Check, 
  Send,
  PenLine
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { navVisibility } from '@/lib/navVisibility';
import { useQueryClient } from '@tanstack/react-query';

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postType: 'video' | 'short' | 'image' | 'post';
  caption?: string;
  mediaUrl?: string;
}

interface QuickFriend {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  sent?: boolean;
  sending?: boolean;
}

/**
 * Instagram-style share sheet with clean glassmorphic UI and plane animation.
 */
export const ShareSheet = memo(function ShareSheet({
  isOpen,
  onClose,
  postId,
  postType,
  caption,
  mediaUrl,
}: ShareSheetProps) {
  const { profile } = useAuth();
  const { data: friends } = useFriends();
  const queryClient = useQueryClient();
  const [quickFriends, setQuickFriends] = useState<QuickFriend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [flyingPlanes, setFlyingPlanes] = useState<string[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<QuickFriend | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // Hide bottom nav when sheet is open
  useEffect(() => {
    if (isOpen) {
      navVisibility.setInCommunityChat(true);
    }
    return () => {
      if (isOpen) {
        navVisibility.setInCommunityChat(false);
      }
    };
  }, [isOpen]);

  // Initialize quick friends from friends list
  useEffect(() => {
    if (friends) {
      setQuickFriends(
        friends.slice(0, 20).map(f => ({
          id: f.id,
          username: f.username,
          avatar_url: f.avatar_url,
          display_name: f.display_name,
          sent: false,
          sending: false,
        }))
      );
    }
  }, [friends]);

  // Reset states when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setLinkCopied(false);
      setFlyingPlanes([]);
      setSelectedFriend(null);
      setShowConfirm(false);
    }
  }, [isOpen]);

  const shareUrl = `${window.location.origin}/p/${postId}`;

  // Filter friends by search
  const filteredFriends = searchQuery 
    ? quickFriends.filter(f => 
        f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : quickFriends;

  // Select friend for confirmation
  const handleFriendSelect = useCallback((friend: QuickFriend) => {
    if (friend.sent || friend.sending) return;
    setSelectedFriend(friend);
    setShowConfirm(true);
  }, []);

  // Confirm and send to selected friend
  const handleConfirmSend = useCallback(async () => {
    if (!profile || !selectedFriend) return;

    const friend = selectedFriend;
    setShowConfirm(false);
    setSelectedFriend(null);

    // Start plane animation
    setFlyingPlanes(prev => [...prev, friend.id]);
    setQuickFriends(prev => 
      prev.map(f => f.id === friend.id ? { ...f, sending: true } : f)
    );

    try {
      // Find or create conversation
      const { data: convId } = await supabase.rpc('create_dm_conversation', {
        other_profile_id: friend.id
      });

      if (convId) {
        const isVideo = postType === 'video' || postType === 'short';
        
        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_id: profile.id,
          content: postId,
          media_url: mediaUrl || null,
          media_type: isVideo ? 'video' : 'image',
          message_type: 'shared_post',
        });

        // Update conversation timestamp to move it to top
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', convId);

        // Invalidate DM queries to refresh the list instantly
        queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });

        // Mark as sent after animation completes
        setTimeout(() => {
          setQuickFriends(prev => 
            prev.map(f => f.id === friend.id ? { ...f, sent: true, sending: false } : f)
          );
          setFlyingPlanes(prev => prev.filter(id => id !== friend.id));
        }, 600);
      }
    } catch (error) {
      console.error('Failed to send:', error);
      toast.error('Failed to send');
      setQuickFriends(prev => 
        prev.map(f => f.id === friend.id ? { ...f, sending: false } : f)
      );
      setFlyingPlanes(prev => prev.filter(id => id !== friend.id));
    }
  }, [profile, selectedFriend, postId, postType, mediaUrl, queryClient]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [shareUrl]);

  // System share
  const handleSystemShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: caption || 'Check this out on VYBE!',
          url: shareUrl,
        });
        onClose();
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  }, [shareUrl, caption, handleCopyLink, onClose]);

  // Share to story
  const handleShareToStory = useCallback(() => {
    toast.info('Coming soon!');
  }, []);

  // Download
  const handleDownload = useCallback(async () => {
    if (!mediaUrl) return;
    
    try {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vybe-${postId}.${postType === 'video' || postType === 'short' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Saved!');
    } catch (error) {
      toast.error('Failed to save');
    }
  }, [mediaUrl, postId, postType]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ 
              type: 'spring', 
              damping: 32, 
              stiffness: 400,
              mass: 0.8
            }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-[101]",
              "bg-background/95 backdrop-blur-xl",
              "rounded-t-3xl overflow-hidden",
              "border-t border-border/20",
              "pb-safe"
            )}
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-foreground/20 rounded-full" />
            </div>

            {/* Title */}
            <div className="px-5 pb-4">
              <h3 className="text-lg font-semibold text-center">Share</h3>
            </div>

            {/* Search bar */}
            <div className="px-4 pb-4">
              <Input
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-muted/40 border-0 h-10 rounded-xl text-sm placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>

            {/* Friends grid */}
            <div className="px-4 pb-5">
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {filteredFriends.slice(0, 10).map((friend, index) => (
                  <FriendSendButton
                    key={friend.id}
                    friend={friend}
                    onClick={() => handleFriendSelect(friend)}
                    isFlying={flyingPlanes.includes(friend.id)}
                    delay={index * 0.03}
                  />
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-border/30 mx-5" />

            {/* Actions row */}
            <div className="px-5 py-5">
              <div className="flex justify-around gap-2">
                <ActionButton
                  icon={PenLine}
                  label="Story"
                  onClick={handleShareToStory}
                  delay={0}
                />
                <ActionButton
                  icon={linkCopied ? Check : Link2}
                  label={linkCopied ? "Copied" : "Link"}
                  onClick={handleCopyLink}
                  active={linkCopied}
                  delay={0.05}
                />
                <ActionButton
                  icon={Share2}
                  label="More"
                  onClick={handleSystemShare}
                  delay={0.1}
                />
                {mediaUrl && (
                  <ActionButton
                    icon={Download}
                    label="Save"
                    onClick={handleDownload}
                    delay={0.15}
                  />
                )}
              </div>
            </div>
          </motion.div>

          {/* Send Confirmation Modal */}
          <AnimatePresence>
            {showConfirm && selectedFriend && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[102] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={() => setShowConfirm(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-card border border-border rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl"
                >
                  <div className="flex flex-col items-center gap-4">
                    <Avatar className="h-16 w-16 ring-2 ring-primary ring-offset-2 ring-offset-background">
                      <AvatarImage src={selectedFriend.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-lg font-semibold">
                        {selectedFriend.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="text-center">
                      <h4 className="font-semibold text-lg">
                        Send to {selectedFriend.display_name || selectedFriend.username}?
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Share this {postType === 'short' ? 'clip' : postType} via DM
                      </p>
                    </div>

                    <div className="flex gap-3 w-full mt-2">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowConfirm(false)}
                        className="flex-1 py-3 px-4 rounded-xl bg-muted/60 text-foreground font-medium hover:bg-muted transition-colors"
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleConfirmSend}
                        className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
});

// Friend send button with plane animation
const FriendSendButton = memo(function FriendSendButton({
  friend,
  onClick,
  isFlying,
  delay,
}: {
  friend: QuickFriend;
  onClick: () => void;
  isFlying: boolean;
  delay: number;
}) {
  const signedUrl = useSignedUrl(friend.avatar_url);

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      disabled={friend.sent || friend.sending}
      className="flex flex-col items-center gap-2 min-w-[72px]"
    >
      <div className="relative">
        {/* Avatar */}
        <motion.div
          animate={friend.sent ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          <Avatar className={cn(
            "h-16 w-16 ring-2 ring-offset-2 ring-offset-background transition-all duration-300",
            friend.sent ? "ring-primary" : "ring-transparent"
          )}>
            <AvatarImage src={signedUrl || undefined} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-foreground font-semibold text-lg">
              {friend.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </motion.div>
        
        {/* Flying plane animation */}
        <AnimatePresence>
          {isFlying && (
            <motion.div
              initial={{ scale: 0.5, opacity: 1, x: 0, y: 0 }}
              animate={{ 
                scale: [0.5, 1, 0.8],
                opacity: [1, 1, 0],
                x: [0, 40, 100],
                y: [0, -60, -120],
                rotate: [0, -15, -30]
              }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
            >
              <Send className="h-6 w-6 text-primary" fill="currentColor" />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Sent checkmark */}
        <AnimatePresence>
          {friend.sent && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 400 }}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-lg"
            >
              <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Send icon (before sending) */}
        {!friend.sent && !friend.sending && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-md">
            <Send className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </div>
      
      <span className={cn(
        "text-xs font-medium truncate max-w-[68px] transition-colors",
        friend.sent ? "text-primary" : "text-foreground/80"
      )}>
        {friend.display_name?.split(' ')[0] || friend.username}
      </span>
    </motion.button>
  );
});

// Action button component
const ActionButton = memo(function ActionButton({
  icon: Icon,
  label,
  onClick,
  active,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active?: boolean;
  delay: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex flex-col items-center gap-2 flex-1"
    >
      <div className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
        active 
          ? "bg-primary shadow-lg shadow-primary/30" 
          : "bg-muted/60 hover:bg-muted"
      )}>
        <Icon className={cn(
          "h-5 w-5 transition-colors",
          active ? "text-primary-foreground" : "text-foreground"
        )} />
      </div>
      <span className={cn(
        "text-xs font-medium transition-colors",
        active ? "text-primary" : "text-foreground/70"
      )}>
        {label}
      </span>
    </motion.button>
  );
});
