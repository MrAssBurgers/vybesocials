import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FriendshipCard } from '@/components/friend-profile/FriendshipCard';
import type { ProfileRelationshipSummary } from '../types';

interface ProfileFriendshipSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherProfileId: string;
  summary?: ProfileRelationshipSummary | null;
}

export function ProfileFriendshipSheet({
  open,
  onOpenChange,
  otherProfileId,
  summary,
}: ProfileFriendshipSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Friendship</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {summary?.isBestFriend && (
            <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
              Best Friend — private to the two of you.
            </p>
          )}
          <FriendshipCard otherProfileId={otherProfileId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
