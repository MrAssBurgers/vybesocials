import { useState, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Link2, 
  Share2, 
  Download, 
  MessageCircle, 
  Check, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';

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
 * VYBE-styled share sheet with glassmorphism and animated glow.
 * Instagram-style quick send + share options.
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

  // Initialize quick friends from friends list
  useEffect(() => {
    if (friends) {
      setQuickFriends(
        friends.slice(0, 10).map(f => ({
          id: f.id,
          username: f.username,
          avatar_url: f.avatar_url,
          display_name: f.display_name,
          sent: false,
        }))
      );
    }
  }, [friends]);

  const shareUrl = `${window.location.origin}/p/${postId}`;

  // Quick send to friend via DM
  const handleQuickSend = useCallback(async (friend: QuickFriend) => {
    if (!profile || friend.sent) return;

    setSendingTo(friend.id);

    try {
      // Find or create conversation
      const { data: convId } = await supabase.rpc('create_dm_conversation', {
        other_profile_id: friend.id
      });

      if (convId) {
        // Send the share message
        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_id: profile.id,
          content: caption ? `Check this out: ${caption}` : 'Check this out!',
          media_url: mediaUrl || shareUrl,
          media_type: postType === 'video' || postType === 'short' ? 'video' : 'link',
        });

        // Mark as sent
        setQuickFriends(prev => 
          prev.map(f => f.id === friend.id ? { ...f, sent: true } : f)
        );

        toast.success(`Sent to ${friend.username}!`);
      }
    } catch (error) {
      console.error('Failed to send:', error);
      toast.error('Failed to send');
    } finally {
      setSendingTo(null);
    }
  }, [profile, mediaUrl, caption, shareUrl, postType]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied!');
  }, [shareUrl]);

  // System share
  const handleSystemShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: caption || 'Check this out on VYBE!',
          url: shareUrl,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          toast.error('Failed to share');
        }
      }
    } else {
      handleCopyLink();
    }
  }, [shareUrl, caption, handleCopyLink]);

  // Share to story (placeholder)
  const handleShareToStory = useCallback(() => {
    toast.info('Coming soon: Share to Story!');
    onClose();
  }, [onClose]);

  // Download (for own content)
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
      toast.success('Downloaded!');
    } catch (error) {
      toast.error('Failed to download');
    }
  }, [mediaUrl, postId, postType]);

  const shareActions = [
    { 
      icon: MessageCircle, 
      label: 'Share to Story', 
      onClick: handleShareToStory,
      color: 'from-purple-500 to-pink-500'
    },
    { 
      icon: Link2, 
      label: 'Copy Link', 
      onClick: handleCopyLink,
      color: 'from-blue-500 to-cyan-500'
    },
    { 
      icon: ExternalLink, 
      label: 'Share', 
      onClick: handleSystemShare,
      color: 'from-green-500 to-emerald-500'
    },
    ...(mediaUrl ? [{
      icon: Download, 
      label: 'Save', 
      onClick: handleDownload,
      color: 'from-orange-500 to-amber-500'
    }] : []),
  ];

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-[101]",
              "mx-auto max-w-lg",
              // Glassmorphism
              "bg-background/80 backdrop-blur-2xl",
              "rounded-t-3xl overflow-hidden",
              "border-t border-x border-white/10",
              "shadow-2xl shadow-black/40"
            )}
          >
            {/* Animated glow effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-t-3xl">
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.1, 1],
                }}
                transition={{ 
                  rotate: { duration: 8, repeat: Infinity, ease: 'linear' },
                  scale: { duration: 4, repeat: Infinity, ease: 'easeInOut' }
                }}
                className="absolute -top-32 -right-32 w-64 h-64 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-3xl"
              />
              <motion.div
                animate={{ 
                  rotate: -360,
                  scale: [1, 1.2, 1],
                }}
                transition={{ 
                  rotate: { duration: 10, repeat: Infinity, ease: 'linear' },
                  scale: { duration: 5, repeat: Infinity, ease: 'easeInOut' }
                }}
                className="absolute -bottom-32 -left-32 w-64 h-64 rounded-full bg-gradient-to-tr from-purple-500/15 to-primary/15 blur-3xl"
              />
            </div>

            {/* Content */}
            <div className="relative z-10">
              {/* Handle */}
              <div className="flex justify-center pt-3">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-2 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">Share</h3>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onClose}
                  className="h-8 w-8 rounded-full hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Quick send - horizontal scroll of friends */}
              {quickFriends.length > 0 && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                    Quick Send
                  </p>
                  <ScrollArea className="w-full">
                    <div className="flex gap-3 pb-2">
                      {quickFriends.map(friend => (
                        <QuickSendAvatar
                          key={friend.id}
                          friend={friend}
                          onClick={() => handleQuickSend(friend)}
                          isSending={sendingTo === friend.id}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-border/50 mx-4" />

              {/* Share actions grid */}
              <div className="p-4 grid grid-cols-4 gap-3">
                {shareActions.map((action, index) => (
                  <motion.button
                    key={action.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={action.onClick}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center",
                      "bg-gradient-to-br",
                      action.color,
                      "shadow-lg transition-transform",
                      "group-hover:scale-110 group-active:scale-95"
                    )}>
                      <action.icon className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {action.label}
                    </span>
                  </motion.button>
                ))}
              </div>

              {/* Safe area padding for iOS */}
              <div className="h-safe-area-bottom" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

// Quick send avatar component
const QuickSendAvatar = memo(function QuickSendAvatar({
  friend,
  onClick,
  isSending,
}: {
  friend: QuickFriend;
  onClick: () => void;
  isSending: boolean;
}) {
  const signedUrl = useSignedUrl(friend.avatar_url);

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      disabled={friend.sent || isSending}
      className="flex flex-col items-center gap-1.5 min-w-[60px]"
    >
      <div className="relative">
        <Avatar className={cn(
          "h-14 w-14 border-2 transition-all",
          friend.sent 
            ? "border-green-500" 
            : "border-transparent hover:border-primary"
        )}>
          <AvatarImage src={signedUrl || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold">
            {friend.username[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Sent checkmark overlay */}
        <AnimatePresence>
          {friend.sent && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute inset-0 bg-green-500/90 rounded-full flex items-center justify-center"
            >
              <Check className="h-6 w-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sending spinner */}
        {isSending && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
            />
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[60px]">
        {friend.username}
      </span>
    </motion.button>
  );
});
