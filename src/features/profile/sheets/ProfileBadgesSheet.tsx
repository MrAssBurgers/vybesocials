import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUserBadges } from '@/hooks/useBadges';
import { Skeleton } from '@/components/ui/skeleton';

interface ProfileBadgesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
}

export function ProfileBadgesSheet({
  open,
  onOpenChange,
  profileId,
}: ProfileBadgesSheetProps) {
  const { data: badges, isLoading } = useUserBadges(open ? profileId : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Badges</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          {!isLoading && !(badges || []).length && (
            <p className="py-8 text-center text-sm text-muted-foreground">No badges yet.</p>
          )}
          {(badges || []).map((row: any) => (
            <div
              key={row.id || row.badge_id}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-3 py-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg">
                {row.badge?.icon || '🏅'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.badge?.name || 'Badge'}</p>
                {row.badge?.description && (
                  <p className="truncate text-xs text-muted-foreground">{row.badge.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
