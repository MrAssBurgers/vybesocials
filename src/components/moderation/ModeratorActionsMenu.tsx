import { useState } from 'react';
import { Trash2, AlertTriangle, Ban, Laugh, Clock } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserRole } from '@/hooks/useModeration';
import { isModOrAdminRole } from '@/lib/adminAccess';
import { useWarnUser, useBanUser } from '@/hooks/useModerationActions';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { GiphySearchPicker } from './GiphySearchPicker';

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
  return isModOrAdminRole(userRole);
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
  onMemeBanClick,
  onDeleteContentClick,
}: {
  userId: string;
  username: string;
  postId?: string;
  commentId?: string;
  onPostDelete?: () => void;
  onCommentDelete?: () => void;
  onWarnClick: () => void;
  onBanClick: () => void;
  onMemeBanClick: () => void;
  /** @deprecated kept for backward compat — delete now happens inline */
  onDeleteContentClick?: (type: 'post' | 'comment', id: string) => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Instant mod delete — no confirmation dialog. Optimistically yanks the row
  // from local UI, fires the destructive query in the background, and pings
  // the author with a default removal notice.
  const instantDelete = async (type: 'post' | 'comment', id: string) => {
    // Fire UI removal immediately
    if (type === 'post') onPostDelete?.();
    else onCommentDelete?.();
    toast.success(`${type === 'post' ? 'Post' : 'Comment'} deleted`);

    try {
      const table = type === 'post' ? 'posts' : 'comments';
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) throw error;

      // Background: notify the author so they know it was removed by a mod.
      if (profile?.id && userId && userId !== profile.id) {
        db.from('notifications').insert({
          user_id: userId,
          type: 'content_removed',
          actor_id: profile.id,
          reason: 'Removed by moderator',
          ...(type === 'post' ? { post_id: id } : {}),
        }).then(() => {});
      }

      queryClient.invalidateQueries({ queryKey: [type === 'post' ? 'posts' : 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['shorts'] });
    } catch {
      toast.error(`Failed to delete ${type}`);
    }
  };

  return (
    <>
      <DropdownMenuSeparator />
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        Mod Actions
      </div>

      {postId && (
        <DropdownMenuItem onClick={() => instantDelete('post', postId)} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Post (Mod)
        </DropdownMenuItem>
      )}

      {commentId && (
        <DropdownMenuItem onClick={() => instantDelete('comment', commentId)} className="text-destructive">
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

      <DropdownMenuItem onClick={onMemeBanClick} className="text-orange-500">
        <Laugh className="h-4 w-4 mr-2" />
        Meme Ban 😂
      </DropdownMenuItem>
    </>
  );
}

// Time unit options for custom ban duration
type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

const timeUnitMultipliers: Record<TimeUnit, number> = {
  minutes: 1 / (24 * 60),
  hours: 1 / 24,
  days: 1,
  weeks: 7,
  months: 30,
};

// Dialogs component - renders the warn/ban/meme-ban/delete-content dialogs
export function ModeratorDialogs({
  username,
  userId,
  warnDialogOpen,
  setWarnDialogOpen,
  banDialogOpen,
  setBanDialogOpen,
  memeBanDialogOpen,
  setMemeBanDialogOpen,
  deleteContentDialog,
  setDeleteContentDialog,
  onPostDelete,
  onCommentDelete,
}: {
  username: string;
  userId: string;
  warnDialogOpen: boolean;
  setWarnDialogOpen: (open: boolean) => void;
  banDialogOpen: boolean;
  setBanDialogOpen: (open: boolean) => void;
  memeBanDialogOpen: boolean;
  setMemeBanDialogOpen: (open: boolean) => void;
  deleteContentDialog?: { type: 'post' | 'comment' | 'listing'; id: string } | null;
  setDeleteContentDialog?: (v: { type: 'post' | 'comment' | 'listing'; id: string } | null) => void;
  onPostDelete?: () => void;
  onCommentDelete?: () => void;
}) {
  const { profile } = useAuth();
  const warnUser = useWarnUser();
  const banUser = useBanUser();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [banAmount, setBanAmount] = useState(7);
  const [banUnit, setBanUnit] = useState<TimeUnit>('days');
  const [customGifUrl, setCustomGifUrl] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleWarn = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    await warnUser.mutateAsync({ userId, reason });
    setWarnDialogOpen(false);
    setReason('');
  };

  const calculateDays = (amount: number, unit: TimeUnit): number => {
    return amount * timeUnitMultipliers[unit];
  };

  const handleBan = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    const durationDays = isPermanent ? undefined : calculateDays(banAmount, banUnit);
    await banUser.mutateAsync({ 
      userId, 
      reason, 
      isPermanent, 
      durationDays,
      isMemeBan: false,
    });
    setBanDialogOpen(false);
    setReason('');
    setBanAmount(7);
    setBanUnit('days');
    setIsPermanent(false);
  };

  const handleMemeBan = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    const durationDays = isPermanent ? undefined : calculateDays(banAmount, banUnit);
    await banUser.mutateAsync({ 
      userId, 
      reason, 
      isPermanent, 
      durationDays,
      isMemeBan: true,
      customGifUrl,
    });
    setMemeBanDialogOpen(false);
    setReason('');
    setBanAmount(1);
    setBanUnit('hours');
    setIsPermanent(false);
    setCustomGifUrl(null);
  };

  const handleDeleteContent = async () => {
    if (!deleteContentDialog || !deleteReason.trim()) {
      toast.error('Please provide a reason for deletion');
      return;
    }
    setIsDeleting(true);
    try {
      const { type, id } = deleteContentDialog;
      const table = type === 'post' ? 'posts' : type === 'comment' ? 'comments' : 'listings';
      
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) throw error;

      // Send notification to the content owner
      if (profile) {
        await db.from('notifications').insert({
          user_id: userId,
          type: 'content_removed',
          actor_id: profile.id,
          reason: deleteReason.trim(),
          ...(type === 'post' ? { post_id: id } : {}),
        });
      }

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`);
      queryClient.invalidateQueries({ queryKey: [table === 'posts' ? 'posts' : table === 'comments' ? 'comments' : 'listings'] });
      if (type === 'post') onPostDelete?.();
      if (type === 'comment') onCommentDelete?.();
      setDeleteContentDialog?.(null);
      setDeleteReason('');
    } catch {
      toast.error('Failed to delete content');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Delete Content Reason Dialog */}
      <Dialog open={!!deleteContentDialog} onOpenChange={(open) => { if (!open) { setDeleteContentDialog?.(null); setDeleteReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete {deleteContentDialog?.type === 'post' ? 'Post' : deleteContentDialog?.type === 'comment' ? 'Comment' : 'Listing'}
            </DialogTitle>
            <DialogDescription>
              You must provide a reason. The user will be notified about why their content was removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-reason">Reason for removal</Label>
              <Textarea
                id="delete-reason"
                placeholder="e.g. Violates community guidelines, inappropriate content..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteContentDialog?.(null); setDeleteReason(''); }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteContent} 
              disabled={isDeleting || !deleteReason.trim()}
            >
              {isDeleting ? 'Deleting...' : 'Delete & Notify User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warn Dialog */}
      <Dialog open={warnDialogOpen} onOpenChange={setWarnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Warn @{username}
            </DialogTitle>
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
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Ban @{username}
            </DialogTitle>
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
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Custom Ban Duration
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={banAmount}
                    onChange={(e) => setBanAmount(parseInt(e.target.value) || 1)}
                    className="w-24"
                  />
                  <Select value={banUnit} onValueChange={(v) => setBanUnit(v as TimeUnit)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="weeks">Weeks</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

      {/* Meme Ban Dialog */}
      <Dialog open={memeBanDialogOpen} onOpenChange={setMemeBanDialogOpen}>
        <DialogContent className="border-orange-500/50 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-500">
              <Laugh className="h-5 w-5" />
              Meme Ban @{username} 😂
            </DialogTitle>
            <DialogDescription>
              Give them the funny ban screen! They'll see a hilarious meme ban page.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meme-ban-reason">Reason (shown on meme screen)</Label>
                <Textarea
                  id="meme-ban-reason"
                  placeholder="Get rekt noob..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="meme-permanent">Permanent Meme Ban</Label>
                <Switch
                  id="meme-permanent"
                  checked={isPermanent}
                  onCheckedChange={setIsPermanent}
                />
              </div>
              {!isPermanent && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    How long should they suffer? 😈
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      value={banAmount}
                      onChange={(e) => setBanAmount(parseInt(e.target.value) || 1)}
                      className="w-24"
                    />
                    <Select value={banUnit} onValueChange={(v) => setBanUnit(v as TimeUnit)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              
              {/* GIPHY Search Picker */}
              <GiphySearchPicker
                selectedGifUrl={customGifUrl}
                onSelectGif={setCustomGifUrl}
              />
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setMemeBanDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleMemeBan} 
              disabled={banUser.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {banUser.isPending ? 'Banning...' : '😂 Meme Ban!'}
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
