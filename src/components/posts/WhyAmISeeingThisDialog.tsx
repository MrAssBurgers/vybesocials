import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Info, Users, Sparkles, MapPin, TrendingUp, Clock, Heart } from 'lucide-react';

interface WhyAmISeeingThisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authorUsername: string;
  isFollowing?: boolean;
  isLocal?: boolean;
  isTrending?: boolean;
  isFresh?: boolean;
  matchesDNA?: boolean;
  hasReacted?: boolean;
}

const signal = (
  Icon: typeof Info,
  title: string,
  active: boolean,
  desc: string,
) => (
  <div
    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
      active ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30 opacity-60'
    }`}
  >
    <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </div>
  </div>
);

export function WhyAmISeeingThisDialog({
  open,
  onOpenChange,
  authorUsername,
  isFollowing,
  isLocal,
  isTrending,
  isFresh,
  matchesDNA,
  hasReacted,
}: WhyAmISeeingThisDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Why am I seeing this?
          </DialogTitle>
          <DialogDescription>
            VYBE personalizes your feed using these signals. Active signals are highlighted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {signal(Users, 'You follow @' + authorUsername, !!isFollowing, 'Posts from people you follow get top priority.')}
          {signal(Sparkles, 'Matches your VYBE DNA', !!matchesDNA, 'Content similar to what you engage with most.')}
          {signal(MapPin, 'Near you', !!isLocal, 'Posts created within 25 miles of your location.')}
          {signal(TrendingUp, 'Trending now', !!isTrending, 'High engagement from the community in the last 24h.')}
          {signal(Clock, 'Fresh post', !!isFresh, 'Posted recently — new content gets a small boost.')}
          {signal(Heart, 'Reacted by friends', !!hasReacted, 'People you follow liked or commented on this.')}
        </div>

        <p className="text-xs text-muted-foreground mt-3 text-center">
          You can tune these signals anytime in Settings → VYBE DNA.
        </p>
      </DialogContent>
    </Dialog>
  );
}
