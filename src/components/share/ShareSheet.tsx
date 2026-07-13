import { useState, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link2, 
  Share2, 
  Download, 
  Check, 
  Send,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import { db } from '@/lib/firebase';
import { insertDmMessage, bumpConversationUpdatedAt } from '@/lib/dmSendCore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { navVisibility } from '@/lib/navVisibility';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { premiumSounds } from '@/lib/premiumSounds';
import { triggerHaptic } from '@/lib/haptics';
import { buildPostShareUrl } from '@/lib/shareLinks';


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
 * Instagram-style share sheet with bottom send button and multi-select.
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
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [showFullscreenPlane, setShowFullscreenPlane] = useState(false);

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
      setSelectedFriends(new Set());
      setIsSending(false);
    }
  }, [isOpen]);

  const shareUrl = buildPostShareUrl(postId);

  // Filter friends by search
  const filteredFriends = searchQuery 
    ? quickFriends.filter(f => 
        f.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : quickFriends;

  // Toggle friend selection
  const handleFriendToggle = useCallback((friend: QuickFriend) => {
    if (friend.sent || friend.sending) return;
    
    triggerHaptic('light');
    setSelectedFriends(prev => {
      const next = new Set(prev);
      if (next.has(friend.id)) {
        next.delete(friend.id);
      } else {
        next.add(friend.id);
      }
      return next;
    });
  }, []);

  // Send to all selected friends
  const handleSendToSelected = useCallback(async () => {
    if (!profile || selectedFriends.size === 0) return;

    triggerHaptic('medium');
    setIsSending(true);
    setShowFullscreenPlane(true);

    const friendIds = Array.from(selectedFriends);
    
    // Start plane animations for all selected
    setFlyingPlanes(friendIds);
    setQuickFriends(prev => 
      prev.map(f => friendIds.includes(f.id) ? { ...f, sending: true } : f)
    );

    try {
      for (const friendId of friendIds) {
        // Find or create conversation
        const { data: convId } = await db.rpc('create_dm_conversation', {
          other_profile_id: friendId
        });

        if (convId) {
          const isVideo = postType === 'video' || postType === 'short';
          
          const { error } = await insertDmMessage(
            {
              conversation_id: String(convId),
              sender_id: profile.id,
              content: postId,
              media_url: mediaUrl || null,
              media_type: isVideo ? 'video' : 'image',
              message_type: 'shared_post',
              client_message_id: `share_${convId}_${postId}_${Date.now()}`,
            },
            { otherProfileId: friendId },
          );
          if (error) throw error;

          await bumpConversationUpdatedAt(String(convId));
        }
      }

      // Invalidate DM queries to refresh the list instantly
      invalidateConversationCaches(queryClient);

      // Mark as sent after animation completes
      setTimeout(() => {
        setQuickFriends(prev => 
          prev.map(f => friendIds.includes(f.id) ? { ...f, sent: true, sending: false } : f)
        );
        setFlyingPlanes([]);
        setSelectedFriends(new Set());
        setIsSending(false);
        premiumSounds.sharePost();
        toast.success(friendIds.length === 1 ? 'Sent!' : `Sent to ${friendIds.length} friends!`);
      }, 600);
    } catch (error) {
      console.error('Failed to send:', error);
      toast.error('Failed to send');
      setQuickFriends(prev => 
        prev.map(f => friendIds.includes(f.id) ? { ...f, sending: false } : f)
      );
      setFlyingPlanes([]);
      setIsSending(false);
    }
  }, [profile, selectedFriends, postId, postType, mediaUrl, queryClient]);

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

  // Share to story — hidden until repost-to-story ships

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

  // Get names for send button
  const getSelectedNames = () => {
    if (selectedFriends.size === 0) return '';
    if (selectedFriends.size === 1) {
      const friend = quickFriends.find(f => selectedFriends.has(f.id));
      return friend?.display_name?.split(' ')[0] || friend?.username || '';
    }
    return `${selectedFriends.size} people`;
  };

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
                  <FriendSelectButton
                    key={friend.id}
                    friend={friend}
                    onClick={() => handleFriendToggle(friend)}
                    isFlying={flyingPlanes.includes(friend.id)}
                    isSelected={selectedFriends.has(friend.id)}
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

            {/* Bottom Send Bar - Instagram style */}
            <AnimatePresence>
              {selectedFriends.size > 0 && (
                <motion.div
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 100, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  className="px-4 pb-4"
                >
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSendToSelected}
                    disabled={isSending}
                    className={cn(
                      "w-full py-4 rounded-2xl font-semibold text-base",
                      "bg-primary text-primary-foreground",
                      "flex items-center justify-center gap-2",
                      "shadow-lg shadow-primary/25",
                      "disabled:opacity-70",
                      "transition-all duration-200"
                    )}
                  >
                    {isSending ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full"
                        />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        <span>Send to {getSelectedNames()}</span>
                      </>
                    )}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Fullscreen paper airplane send animation */}
          <AnimatePresence>
            {showFullscreenPlane && (
              <motion.div
                className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  initial={{ scale: 0.3, opacity: 0, rotate: -20, x: 0, y: 0 }}
                  animate={{
                    scale: [0.3, 1.2, 1, 0.8],
                    opacity: [0, 1, 1, 0],
                    rotate: [-20, -10, -15, -45],
                    x: [0, 0, 0, 300],
                    y: [0, 0, 0, -400],
                  }}
                  transition={{ 
                    duration: 1.2, 
                    times: [0, 0.3, 0.6, 1],
                    ease: 'easeInOut' 
                  }}
                  onAnimationComplete={() => setShowFullscreenPlane(false)}
                >
                  <Send className="h-16 w-16 text-primary drop-shadow-2xl" fill="currentColor" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
});

// Friend select button with selection ring
const FriendSelectButton = memo(function FriendSelectButton({
  friend,
  onClick,
  isFlying,
  isSelected,
  delay,
}: {
  friend: QuickFriend;
  onClick: () => void;
  isFlying: boolean;
  isSelected: boolean;
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
        {/* Selection ring */}
        <motion.div
          animate={{ 
            scale: isSelected ? 1 : 0.9,
            opacity: isSelected ? 1 : 0 
          }}
          className="absolute -inset-1 rounded-full bg-primary/20"
        />
        
        {/* Avatar */}
        <motion.div
          animate={friend.sent ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          <Avatar className={cn(
            "h-16 w-16 ring-[3px] ring-offset-2 ring-offset-background transition-all duration-200",
            isSelected ? "ring-primary" : friend.sent ? "ring-primary" : "ring-transparent"
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

        {/* Selection checkmark */}
        <AnimatePresence>
          {isSelected && !friend.sent && !friend.sending && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 15, stiffness: 400 }}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-background shadow-lg"
            >
              <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <span className={cn(
        "text-xs font-medium truncate max-w-[68px] transition-colors",
        friend.sent ? "text-primary" : isSelected ? "text-primary" : "text-foreground/80"
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex flex-col items-center gap-2 min-w-[60px]"
    >
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200",
        active 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted/60 hover:bg-muted text-foreground"
      )}>
        <Icon className="h-6 w-6" />
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
