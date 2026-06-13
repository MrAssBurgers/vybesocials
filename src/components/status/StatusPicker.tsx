import { useState, memo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetStatus, useClearStatus, useUserStatusById } from '@/hooks/useUserStatus';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { X, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Vibe categories with colors for the glowing avatar ring
export const VIBE_STATUSES = [
  { emoji: '🎵', text: 'Listening to music', color: 'hsl(280, 70%, 55%)' },
  { emoji: '🎮', text: 'Gaming', color: 'hsl(140, 65%, 45%)' },
  { emoji: '😌', text: 'Chilling', color: 'hsl(200, 70%, 55%)' },
  { emoji: '🏋️', text: 'Working out', color: 'hsl(30, 80%, 55%)' },
  { emoji: '📚', text: 'Studying', color: 'hsl(45, 75%, 50%)' },
  { emoji: '😴', text: 'Sleeping', color: 'hsl(240, 50%, 45%)' },
  { emoji: '🍕', text: 'Eating', color: 'hsl(15, 80%, 55%)' },
  { emoji: '💼', text: 'Working', color: 'hsl(210, 60%, 50%)' },
  { emoji: '🎬', text: 'Watching', color: 'hsl(350, 70%, 55%)' },
  { emoji: '✈️', text: 'Traveling', color: 'hsl(190, 70%, 50%)' },
  { emoji: '🤫', text: 'Do not disturb', color: 'hsl(0, 60%, 50%)' },
  { emoji: '🎉', text: 'Celebrating', color: 'hsl(320, 70%, 55%)' },
] as const;

export function getVibeColor(emoji: string): string | undefined {
  return VIBE_STATUSES.find(v => v.emoji === emoji)?.color;
}

const DURATION_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '24h', hours: 24 },
  { label: '∞', hours: undefined },
];

export const StatusPicker = memo(function StatusPicker({ trigger }: { trigger?: React.ReactNode }) {
  const profileId = useAuthProfileId();
  const { data: currentStatus } = useUserStatusById(profileId);
  const setStatus = useSetStatus();
  const clearStatus = useClearStatus();
  const [open, setOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('😊');
  const [customText, setCustomText] = useState('');
  const [duration, setDuration] = useState<number | undefined>(4);
  const [showCustom, setShowCustom] = useState(false);

  const handleQuickVibe = useCallback((vibe: typeof VIBE_STATUSES[number]) => {
    if (!profileId) {
      toast.error('Please wait — still loading your profile');
      return;
    }
    haptics.impact();
    setStatus.mutate(
      { emoji: vibe.emoji, text: vibe.text, durationHours: 4 },
      {
        onSuccess: () => {
          toast.success(`Vibe set: ${vibe.emoji} ${vibe.text}`);
          setOpen(false);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Could not update vibe');
        },
      }
    );
  }, [profileId, setStatus]);

  const handleCustomStatus = useCallback(() => {
    if (!profileId) {
      toast.error('Please wait — still loading your profile');
      return;
    }
    if (!customText.trim()) return;
    haptics.impact();
    setStatus.mutate(
      { emoji: customEmoji, text: customText.trim(), durationHours: duration },
      {
        onSuccess: () => {
          toast.success('Vibe updated');
          setOpen(false);
          setShowCustom(false);
          setCustomText('');
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Could not update vibe');
        },
      }
    );
  }, [profileId, customEmoji, customText, duration, setStatus]);

  const handleClear = useCallback(() => {
    haptics.impact();
    clearStatus.mutate(undefined, {
      onSuccess: () => {
        toast.success('Vibe cleared');
        setOpen(false);
      },
    });
  }, [clearStatus]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs h-7 px-2.5">
            {currentStatus ? (
              <>
                <span>{currentStatus.emoji}</span>
                <span className="truncate max-w-[100px]">{currentStatus.text}</span>
              </>
            ) : (
              <>
                <Smile className="h-3.5 w-3.5" />
                Vibe Check
              </>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="text-base font-bold">Vibe Check ✨</DialogTitle>
        </DialogHeader>

        {/* Current status */}
        <AnimatePresence>
          {currentStatus && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-5"
            >
              <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-xl px-3 py-2.5 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{currentStatus.emoji}</span>
                  <span className="text-sm font-medium">{currentStatus.text}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleClear}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick vibe grid */}
        <div className="px-5 pb-3">
          <div className="grid grid-cols-3 gap-1.5">
            {VIBE_STATUSES.map((vibe) => (
              <motion.button
                key={vibe.text}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleQuickVibe(vibe)}
                disabled={setStatus.isPending}
                className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-medium transition-all bg-muted/30 hover:bg-muted/60 active:bg-muted/80 border border-transparent hover:border-primary/20"
                style={{ '--vibe-glow': vibe.color } as any}
              >
                <span className="text-base">{vibe.emoji}</span>
                <span className="truncate text-foreground/80">{vibe.text}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Custom status toggle */}
        <div className="px-5 pb-5 space-y-2.5">
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="text-xs text-primary font-medium hover:underline"
          >
            {showCustom ? 'Hide custom' : '✏️ Custom status...'}
          </button>

          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2.5 overflow-hidden"
              >
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => {
                      const emojis = ['😊', '😎', '🔥', '💜', '✨', '🌙', '☀️', '❤️', '🤩', '😤'];
                      const idx = emojis.indexOf(customEmoji);
                      setCustomEmoji(emojis[(idx + 1) % emojis.length]);
                    }}
                    className="text-2xl hover:scale-110 transition-transform flex-shrink-0"
                  >
                    {customEmoji}
                  </button>
                  <Input
                    placeholder="What's your vibe?"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    maxLength={50}
                    className="h-9 rounded-full text-sm"
                  />
                </div>

                {/* Duration picker */}
                <div className="flex gap-1.5">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setDuration(opt.hours)}
                      className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        duration === opt.hours
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleCustomStatus}
                  disabled={!customText.trim() || setStatus.isPending}
                  className="w-full rounded-full h-9 text-sm"
                >
                  {setStatus.isPending ? 'Setting...' : 'Set Custom Vibe'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
});
