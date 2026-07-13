import { memo } from 'react';
import { Check, Clock, EyeOff, Link2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { QuickSafetyActions } from '@/components/safety/QuickSafetyActions';
import {
  useFriendshipStatus,
  useCancelFriendRequest,
  useRespondToFriendRequest,
} from '@/hooks/useFriends';
import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';
import { buildProfileShareUrl } from '@/lib/shareLinks';

interface SocialProfileMoreMenuProps {
  profile: { id: string; username: string; display_name?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SocialProfileMoreMenu = memo(function SocialProfileMoreMenu({
  profile,
  open,
  onOpenChange,
}: SocialProfileMoreMenuProps) {
  const { data: friendship } = useFriendshipStatus(profile.id);
  const cancelRequest = useCancelFriendRequest();
  const respondToRequest = useRespondToFriendRequest();
  const { dismissUser } = useDismissedQuickAdd();

  const status = friendship?.status ?? 'none';
  const requestId = friendship?.requestId;

  const shareProfile = async () => {
    const url = buildProfileShareUrl(profile.username);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${profile.display_name || profile.username} on VYBE`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied');
      }
      onOpenChange(false);
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') toast.error('Could not share profile');
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(buildProfileShareUrl(profile.username));
    toast.success('Profile link copied');
    onOpenChange(false);
  };

  const hideSuggestion = () => {
    dismissUser(profile.id);
    toast.success('You will see fewer suggestions like this');
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="bg-background/95 backdrop-blur-2xl">
        <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-muted-foreground/30" aria-hidden />
        <DrawerHeader>
          <DrawerTitle>Profile options</DrawerTitle>
          <DrawerDescription>@{profile.username}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 px-4 pb-8">
          <Button variant="outline" className="w-full justify-start" onClick={() => void shareProfile()}>
            <Share2 className="mr-2 h-4 w-4" />
            Share profile
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => void copyLink()}>
            <Link2 className="mr-2 h-4 w-4" />
            Copy profile link
          </Button>

          {status === 'pending_sent' && requestId && (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={cancelRequest.isPending}
              onClick={() =>
                cancelRequest.mutate(requestId, { onSuccess: () => onOpenChange(false) })
              }
            >
              <Clock className="mr-2 h-4 w-4" />
              Cancel friend request
            </Button>
          )}

          {status === 'pending_received' && requestId && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={respondToRequest.isPending}
                onClick={() =>
                  respondToRequest.mutate(
                    { requestId, action: 'accept' },
                    { onSuccess: () => onOpenChange(false) },
                  )
                }
              >
                <Check className="mr-2 h-4 w-4" />
                Accept
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={respondToRequest.isPending}
                onClick={() =>
                  respondToRequest.mutate(
                    { requestId, action: 'decline' },
                    { onSuccess: () => onOpenChange(false) },
                  )
                }
              >
                <X className="mr-2 h-4 w-4" />
                Decline
              </Button>
            </div>
          )}

          {status === 'none' && (
            <Button variant="outline" className="w-full justify-start" onClick={hideSuggestion}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide suggestion
            </Button>
          )}

          <div className="rounded-xl border border-border/50 p-3">
            <QuickSafetyActions
              targetUserId={profile.id}
              targetUsername={profile.username}
              onComplete={() => onOpenChange(false)}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
});
