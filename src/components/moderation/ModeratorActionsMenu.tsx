import { useState } from 'react';
import { Trash2, AlertTriangle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useUserRole } from '@/hooks/useModeration';
import { useWarnUser, useBanUser } from '@/hooks/useModerationActions';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface ModeratorActionsMenuProps {
  userId: string;
  username: string;
  postId?: string;
  commentId?: string;
  onPostDelete?: () => void;
  onCommentDelete?: () => void;
  className?: string;
}

// Hook to check if user is mod/admin
export function useIsModOrAdmin() {
  const { data: userRole } = useUserRole();
  return userRole === 'admin' || userRole === 'moderator';
}

// Inline menu items component - to be used inside existing DropdownMenuContent
export function ModeratorMenuItems({
  userId,
  username,
  postId,
  commentId,
  onPostDelete,
  onCommentDelete,
  onWarnClick,
  onBanClick,
}: {
  userId: string;
  username: string;
  postId?: string;
  commentId?: string;
  onPostDelete?: () => void;
  onCommentDelete?: () => void;
  onWarnClick: () => void;
  onBanClick: () => void;
}) {
  const queryClient = useQueryClient();

  const handleDeletePost = async () => {
    if (!postId) return;
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;
      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      onPostDelete?.();
    } catch {
      toast.error('Failed to delete post');
    }
  };

  const handleDeleteComment = async () => {
    if (!commentId) return;
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
      toast.success('Comment deleted');
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      onCommentDelete?.();
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  return (
    <>
      <DropdownMenuSeparator />
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        Mod Actions
      </div>
      
      {postId && (
        <DropdownMenuItem onClick={handleDeletePost} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Post (Mod)
        </DropdownMenuItem>
      )}
      
      {commentId && (
        <DropdownMenuItem onClick={handleDeleteComment} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Comment (Mod)
        </DropdownMenuItem>
      )}
      
      <DropdownMenuItem onClick={onWarnClick}>
        <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
        Warn User
      </DropdownMenuItem>
      
      <DropdownMenuItem onClick={onBanClick} className="text-destructive">
        <Ban className="h-4 w-4 mr-2" />
        Ban User
      </DropdownMenuItem>
    </>
  );
}

// Dialogs component - renders the warn/ban dialogs
export function ModeratorDialogs({
  username,
  userId,
  warnDialogOpen,
  setWarnDialogOpen,
  banDialogOpen,
  setBanDialogOpen,
}: {
  username: string;
  userId: string;
  warnDialogOpen: boolean;
  setWarnDialogOpen: (open: boolean) => void;
  banDialogOpen: boolean;
  setBanDialogOpen: (open: boolean) => void;
}) {
  const warnUser = useWarnUser();
  const banUser = useBanUser();
  const [reason, setReason] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [banDays, setBanDays] = useState(7);

  const handleWarn = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    await warnUser.mutateAsync({ userId, reason });
    setWarnDialogOpen(false);
    setReason('');
  };

  const handleBan = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    await banUser.mutateAsync({ 
      userId, 
      reason, 
      isPermanent, 
      durationDays: isPermanent ? undefined : banDays 
    });
    setBanDialogOpen(false);
    setReason('');
  };

  return (
    <>
      {/* Warn Dialog */}
      <Dialog open={warnDialogOpen} onOpenChange={setWarnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Warn @{username}</DialogTitle>
            <DialogDescription>
              Send a warning to this user about their behavior.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="warn-reason">Reason</Label>
              <Textarea
                id="warn-reason"
                placeholder="Explain why you're warning this user..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarnDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleWarn} 
              disabled={warnUser.isPending}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {warnUser.isPending ? 'Sending...' : 'Send Warning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban @{username}</DialogTitle>
            <DialogDescription>
              This will prevent the user from accessing the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ban-reason">Reason</Label>
              <Textarea
                id="ban-reason"
                placeholder="Explain why you're banning this user..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="permanent">Permanent Ban</Label>
              <Switch
                id="permanent"
                checked={isPermanent}
                onCheckedChange={setIsPermanent}
              />
            </div>
            {!isPermanent && (
              <div className="space-y-2">
                <Label htmlFor="ban-days">Ban Duration (days)</Label>
                <Input
                  id="ban-days"
                  type="number"
                  min={1}
                  max={365}
                  value={banDays}
                  onChange={(e) => setBanDays(parseInt(e.target.value) || 7)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBan} 
              disabled={banUser.isPending}
            >
              {banUser.isPending ? 'Banning...' : 'Ban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Legacy component for backwards compatibility - now renders nothing visible
// The actual actions are integrated into parent menus
export function ModeratorActionsMenu({
  userId,
  username,
  postId,
  commentId,
  onPostDelete,
  onCommentDelete,
  className,
}: ModeratorActionsMenuProps) {
  // Return null - mod actions now live in the main "..." menu
  return null;
}
