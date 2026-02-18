import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2, BellOff, Bell, User, Pin, PinOff, MessageSquareX } from 'lucide-react';
import { useTrashConversation } from '@/hooks/useTrashedConversations';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
 import { useAuth } from '@/lib/auth';

interface ConversationOptionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  otherUserId?: string;
  otherUsername?: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string;
  isMuted?: boolean;
  isPinned?: boolean;
}

export function ConversationOptionsSheet({
  open,
  onOpenChange,
  conversationId,
  otherUserId,
  otherUsername,
  otherDisplayName,
  otherAvatarUrl,
  isMuted = false,
  isPinned = false,
}: ConversationOptionsSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trashConversation = useTrashConversation();
   const { profile } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [isTogglingPin, setIsTogglingPin] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleDeleteChat = async () => {
    await trashConversation.mutateAsync(conversationId);
    setShowDeleteConfirm(false);
    onOpenChange(false);
    if (window.location.pathname.includes(conversationId)) {
      navigate('/messages');
    }
  };

  const handleClearChat = async () => {
    if (!profile?.id) return;
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true })
        .eq('conversation_id', conversationId);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast.success('Chat cleared');
      setShowClearConfirm(false);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to clear chat:', error);
      toast.error('Failed to clear chat');
    } finally {
      setIsClearing(false);
    }
  };

  const handleToggleMute = async () => {
    setIsTogglingMute(true);
    try {
       if (!profile?.id) {
         toast.error('Please log in to update settings');
         return;
       }

      const { error } = await supabase
        .from('conversation_members')
        .update({ is_muted: !isMuted })
        .eq('conversation_id', conversationId)
         .eq('user_id', profile.id);

      if (error) throw error;

       queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
       queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(isMuted ? 'Notifications enabled' : 'Notifications muted');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      toast.error('Failed to update notification settings');
    } finally {
      setIsTogglingMute(false);
    }
  };

  const handleTogglePin = async () => {
    setIsTogglingPin(true);
    try {
       if (!profile?.id) {
         toast.error('Please log in to update settings');
         return;
       }

      const { error } = await supabase
        .from('conversation_members')
        .update({ is_pinned: !isPinned })
        .eq('conversation_id', conversationId)
         .eq('user_id', profile.id);

      if (error) throw error;

       queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(isPinned ? 'Unpinned' : 'Pinned to top');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      toast.error('Failed to update pin status');
    } finally {
      setIsTogglingPin(false);
    }
  };

  const handleViewProfile = () => {
    if (otherUsername) {
      navigate(`/@${otherUsername}`);
      onOpenChange(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
          <SheetHeader className="text-center pb-4">
            <SheetTitle>{otherDisplayName || otherUsername || 'Chat Options'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-2 pb-4">
            {otherUserId && otherUsername && (
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={handleViewProfile}
              >
                <User className="h-5 w-5" />
                View Profile
              </Button>
            )}
            
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={handleTogglePin}
              disabled={isTogglingPin}
            >
              {isPinned ? (
                <>
                  <PinOff className="h-5 w-5" />
                  Unpin Conversation
                </>
              ) : (
                <>
                  <Pin className="h-5 w-5" />
                  Pin to Top
                </>
              )}
            </Button>
            
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={handleToggleMute}
              disabled={isTogglingMute}
            >
              {isMuted ? (
                <>
                  <Bell className="h-5 w-5" />
                  Unmute Notifications
                </>
              ) : (
                <>
                  <BellOff className="h-5 w-5" />
                  Mute Notifications
                </>
              )}
            </Button>
            
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12 text-orange-500 hover:text-orange-500 hover:bg-orange-500/10"
              onClick={() => setShowClearConfirm(true)}
            >
              <MessageSquareX className="h-5 w-5" />
              Clear Chat
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-5 w-5" />
              Delete Chat
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This chat will be moved to trash. You can recover it within 30 days or delete it permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChat}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all messages?</AlertDialogTitle>
            <AlertDialogDescription>
              All messages in this chat will be permanently deleted. The conversation will remain but will be empty. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearChat}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? 'Clearing...' : 'Clear All Messages'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
