import { useState, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Link2, 
  Share2, 
  Download, 
  Check, 
  Send,
  BookmarkPlus,
  PenLine
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { navVisibility } from '@/lib/navVisibility';

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
}

/**
 * Instagram-style share sheet with clean UI and smooth animations.
 * Quick send to friends + share options.
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
  const [quickFriends, setQuickFriends] = useState<QuickFriend[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

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
        }))
      );
    }
  }, [friends]);

  // Reset states when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setLinkCopied(false);
      setSendingTo(null);
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

  // Quick send to friend via DM - Instagram style (sends actual media, not text)
  const handleQuickSend = useCallback(async (friend: QuickFriend) => {
    if (!profile || friend.sent) return;

    setSendingTo(friend.id);

    try {
      // Find or create conversation
      const { data: convId } = await supabase.rpc('create_dm_conversation', {
        other_profile_id: friend.id
      });

      if (convId) {
        // Send the actual media like Instagram - no "check this out" text
        const isVideo = postType === 'video' || postType === 'short';
        
        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_id: profile.id,
          // Store the post ID in content so we can navigate to it
          content: postId,
          media_url: mediaUrl || null,
          media_type: isVideo ? 'video' : 'image',
          // Use message_type to indicate this is a shared post
          message_type: 'shared_post',
        });

        // Update conversation timestamp so it appears at top of DM list
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', convId);

        // Mark as sent with animation
        setQuickFriends(prev => 
          prev.map(f => f.id === friend.id ? { ...f, sent: true } : f)
        );
      }
    } catch (error) {
      console.error('Failed to send:', error);
      toast.error('Failed to send');
    } finally {
      setSendingTo(null);
    }
  }, [profile, postId, postType, mediaUrl, caption]);

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
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 z-[100]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ 
              type: 'spring', 
              damping: 28, 
              stiffness: 380,
              mass: 0.8
            }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-[101]",
              "bg-background rounded-t-2xl overflow-hidden",
              "pb-safe"
            )}
          >
            {/* Handle */}
            <div className="flex justify-center py-2.5">
              <div className="w-9 h-1 bg-muted-foreground/25 rounded-full" />
            </div>

            {/* Search bar */}
            <div className="px-4 pb-3">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-muted/50 border-0 h-9 rounded-xl text-sm placeholder:text-muted-foreground/60"
              />
            </div>

            {/* Friends grid - Instagram style */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-4 gap-3">
                {filteredFriends.slice(0, 8).map((friend, index) => (
                  <FriendSendButton
                    key={friend.id}
                    friend={friend}
                    onClick={() => handleQuickSend(friend)}
                    isSending={sendingTo === friend.id}
                    delay={index * 0.02}
                  />
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-border mx-4" />

            {/* Actions row - Instagram style */}
            <div className="px-4 py-4">
              <div className="flex justify-around">
                <ActionButton
                  icon={PenLine}
                  label="Add to story"
                  onClick={handleShareToStory}
                  delay={0}
                />
                <ActionButton
                  icon={linkCopied ? Check : Link2}
                  label={linkCopied ? "Copied!" : "Copy link"}
                  onClick={handleCopyLink}
                  active={linkCopied}
                  delay={0.03}
                />
                <ActionButton
                  icon={Share2}
                  label="Share to..."
                  onClick={handleSystemShare}
                  delay={0.06}
                />
                {mediaUrl && (
                  <ActionButton
                    icon={Download}
                    label="Save"
                    onClick={handleDownload}
                    delay={0.09}
                  />
                )}
              </div>
            </div>

            {/* Cancel button */}
            <div className="px-4 pb-4">
              <Button
                variant="secondary"
                onClick={onClose}
                className="w-full h-12 rounded-xl font-semibold text-base"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

// Friend send button component - Instagram style
const FriendSendButton = memo(function FriendSendButton({
  friend,
  onClick,
  isSending,
  delay,
}: {
  friend: QuickFriend;
  onClick: () => void;
  isSending: boolean;
  delay: number;
}) {
  const signedUrl = useSignedUrl(friend.avatar_url);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.2 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      disabled={friend.sent || isSending}
      className="flex flex-col items-center gap-1.5"
    >
      <div className="relative">
        <Avatar className="h-14 w-14">
          <AvatarImage src={signedUrl || undefined} />
          <AvatarFallback className="bg-muted text-muted-foreground font-medium">
            {friend.username[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Send indicator overlay */}
        <AnimatePresence mode="wait">
          {friend.sent ? (
            <motion.div
              key="sent"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15, stiffness: 400 }}
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-background"
            >
              <Check className="h-3 w-3 text-primary-foreground" />
            </motion.div>
          ) : isSending ? (
            <motion.div
              key="sending"
              className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
            </motion.div>
          ) : (
            <motion.div
              key="send"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-muted rounded-full flex items-center justify-center border-2 border-background"
            >
              <Send className="h-2.5 w-2.5 text-muted-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <span className="text-[11px] text-foreground/80 truncate max-w-[60px] leading-tight">
        {friend.display_name || friend.username}
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
      transition={{ delay, duration: 0.2 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex flex-col items-center gap-2"
    >
      <div className={cn(
        "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
        active ? "bg-primary" : "bg-muted"
      )}>
        <Icon className={cn(
          "h-6 w-6 transition-colors",
          active ? "text-primary-foreground" : "text-foreground"
        )} />
      </div>
      <span className="text-xs text-foreground/70 font-medium">
        {label}
      </span>
    </motion.button>
  );
});