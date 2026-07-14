import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VybeScore } from '@/components/profile/VybeScore';

interface ProfileScoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  score: number | null;
  level: number | null;
  xpToNext: number | null;
}

export function ProfileScoreSheet({
  open,
  onOpenChange,
  profileId,
  score,
  level,
  xpToNext,
}: ProfileScoreSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>VYBE Score & Level</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-center py-2">
            <VybeScore profileId={profileId} isOwnProfile />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-center">
              <p className="text-2xl font-semibold tabular-nums">{score ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Score</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-center">
              <p className="text-2xl font-semibold tabular-nums">{level ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Level</p>
            </div>
          </div>
          {xpToNext != null && xpToNext > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {xpToNext} XP to next level
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
