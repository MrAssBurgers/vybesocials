import { memo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { publicProfilePath } from '@/lib/friendProfileRoutes';
import { QuickSafetyActions } from '@/components/safety/QuickSafetyActions';

interface FriendProfileMoreMenuProps {
  profile: { id: string; username: string; display_name?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FriendProfileMoreMenu = memo(function FriendProfileMoreMenu({
  profile,
  open,
  onOpenChange,
}: FriendProfileMoreMenuProps) {
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Safety & options</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onOpenChange(false);
              navigate(publicProfilePath(profile.username));
            }}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View public profile
          </Button>

          <div className="rounded-xl border border-border/50 p-3">
            <QuickSafetyActions
              targetUserId={profile.id}
              targetUsername={profile.username}
              onComplete={() => onOpenChange(false)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});
