import { useState } from 'react';
import { Crown, Laugh, Clock, Sparkles } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBanUser } from '@/hooks/useModerationActions';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { GiphySearchPicker } from '@/components/moderation/GiphySearchPicker';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PremiumMemeBanItemsProps {
  userId: string;
  username: string;
}

const MAX_MINUTES = 5;

export function PremiumMemeBanMenuItem({ userId, username, onOpen }: PremiumMemeBanItemsProps & { onOpen: () => void }) {
  const { hasPremiumCosmetics } = usePremiumStatus();

  if (!hasPremiumCosmetics) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onOpen} className="relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <Crown className="h-4 w-4 mr-2 text-amber-400" />
        <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent font-semibold">
          Premium Meme Ban
        </span>
        <Sparkles className="h-3 w-3 ml-auto text-amber-400/60" />
      </DropdownMenuItem>
    </>
  );
}

export function PremiumMemeBanDialog({ userId, username, open, onOpenChange }: PremiumMemeBanItemsProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const banUser = useBanUser();
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(1);
  const [customGifUrl, setCustomGifUrl] = useState<string | null>(null);

  const handleMemeBan = async () => {
    if (!reason.trim()) {
      toast.error('Give them a reason to cry about 😂');
      return;
    }
    const durationDays = durationMinutes / (24 * 60);
    await banUser.mutateAsync({
      userId,
      reason: `[Premium Meme Ban] ${reason}`,
      isPermanent: false,
      durationDays,
      isMemeBan: true,
      customGifUrl,
    });
    onOpenChange(false);
    setReason('');
    setDurationMinutes(1);
    setCustomGifUrl(null);
  };

  const formatDuration = (mins: number) => {
    if (mins === 1) return '1 minute';
    return `${mins} minutes`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-amber-500/30 bg-gradient-to-b from-background to-amber-950/10 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
              <Laugh className="h-5 w-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-pink-400 bg-clip-text text-transparent font-black text-lg">
              Premium Meme Ban
            </span>
            <span className="text-lg">😂</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/80">
            Hit <span className="font-semibold text-amber-400">@{username}</span> with a meme ban — max {MAX_MINUTES} minutes of pure chaos.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5">
            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="premium-meme-reason" className="text-sm font-medium flex items-center gap-2">
                <span>Roast Message</span>
                <span className="text-xs text-muted-foreground">(shown on their screen)</span>
              </Label>
              <Textarea
                id="premium-meme-reason"
                placeholder="You've been hit with a Premium Meme Ban 💀..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border-amber-500/20 focus-visible:ring-amber-500/30 bg-background/60"
              />
            </div>

            {/* Duration Slider */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-amber-400" />
                Duration
              </Label>
              <div className="px-1">
                <Slider
                  value={[durationMinutes]}
                  onValueChange={([v]) => setDurationMinutes(v)}
                  min={1}
                  max={MAX_MINUTES}
                  step={1}
                  className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-amber-400 [&_[role=slider]]:to-orange-500 [&_[role=slider]]:border-amber-500/50 [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-amber-500/20"
                />
              </div>
              <motion.div
                key={durationMinutes}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/20">
                  <span className="text-2xl font-black bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                    {durationMinutes}
                  </span>
                  <span className="text-sm text-amber-300/80 font-medium">
                    {durationMinutes === 1 ? 'minute' : 'minutes'}
                  </span>
                </span>
              </motion.div>
            </div>

            {/* GIF Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                Choose their doom screen
              </Label>
              <GiphySearchPicker
                selectedGifUrl={customGifUrl}
                onSelectGif={setCustomGifUrl}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-amber-500/20">
            Nah
          </Button>
          <Button
            onClick={handleMemeBan}
            disabled={banUser.isPending || !reason.trim()}
            className={cn(
              "relative overflow-hidden font-bold",
              "bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500",
              "hover:from-amber-400 hover:via-orange-400 hover:to-pink-400",
              "shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40",
              "transition-all duration-300"
            )}
          >
            {banUser.isPending ? (
              'Sending...'
            ) : (
              <span className="flex items-center gap-1.5">
                <Crown className="h-4 w-4" />
                Meme Ban for {formatDuration(durationMinutes)}! 😂
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
