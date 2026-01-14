import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreHorizontal, Trash2, BellOff, Bell, User } from 'lucide-react';
import { useHideConversation } from '@/hooks/useHiddenConversations';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ConversationOptionsMenuProps {
  conversationId: string;
  otherUserId?: string;
  otherUsername?: string;
  isMuted?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ConversationOptionsMenu({
  conversationId,
  otherUserId,
  otherUsername,
  isMuted = false,
  onOpenChange,
}: ConversationOptionsMenuProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hideConversation = useHideConversation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);

  const handleDeleteChat = async () => {
    await hideConversation.mutateAsync(conversationId);
    setShowDeleteConfirm(false);
    // Navigate back to messages list if currently in this conversation
    if (window.location.pathname.includes(conversationId)) {
      navigate('/messages');
    }
  };

  const handleToggleMute = async () => {
    setIsTogglingMute(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('conversation_members')
        .update({ is_muted: !isMuted })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(isMuted ? 'Notifications enabled' : 'Notifications muted');
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      toast.error('Failed to update notification settings');
    } finally {
      setIsTogglingMute(false);
    }
  };

  const handleViewProfile = () => {
    if (otherUsername) {
      navigate(`/@${otherUsername}`);
    }
  };

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {otherUserId && otherUsername && (
            <>
              <DropdownMenuItem onClick={handleViewProfile}>
                <User className="h-4 w-4 mr-2" />
                View Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem onClick={handleToggleMute} disabled={isTogglingMute}>
            {isMuted ? (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Unmute Notifications
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 mr-2" />
                Mute Notifications
              </>
            )}
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => setShowDeleteConfirm(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the chat from your list. The other person will still see the conversation and messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChat}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
