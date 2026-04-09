import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetStatus, useClearStatus, useUserStatusById } from '@/hooks/useUserStatus';
import { useAuth } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { X, Smile } from 'lucide-react';

const PRESET_STATUSES = [
  { emoji: '📚', text: 'Studying' },
  { emoji: '🎮', text: 'Gaming' },
  { emoji: '😴', text: 'Sleeping' },
  { emoji: '🎵', text: 'Listening to music' },
  { emoji: '🏋️', text: 'Working out' },
  { emoji: '🍕', text: 'Eating' },
  { emoji: '✈️', text: 'Traveling' },
  { emoji: '💼', text: 'Working' },
  { emoji: '🎬', text: 'Watching' },
  { emoji: '📱', text: 'On my phone' },
  { emoji: '🤫', text: 'Do not disturb' },
  { emoji: '🎉', text: 'Celebrating' },
];

const DURATION_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '24h', hours: 24 },
  { label: '∞', hours: undefined },
];

export const StatusPicker = memo(function StatusPicker({ trigger }: { trigger?: React.ReactNode }) {
  const { profile } = useAuth();
  const { data: currentStatus } = useUserStatusById(profile?.id);
  const setStatus = useSetStatus();
  const clearStatus = useClearStatus();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState('😊');
  const [text, setText] = useState('');
  const [duration, setDuration] = useState<number | undefined>(4);

  const handleSetStatus = () => {
    if (!text.trim()) return;
    haptics.impact();
    setStatus.mutate(
      { emoji, text: text.trim(), durationHours: duration },
      {
        onSuccess: () => {
          toast.success('Status updated');
          setOpen(false);
        },
      }
    );
  };

  const handlePreset = (preset: { emoji: string; text: string }) => {
    setEmoji(preset.emoji);
    setText(preset.text);
  };

  const handleClear = () => {
    haptics.impact();
    clearStatus.mutate(undefined, {
      onSuccess: () => {
        toast.success('Status cleared');
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs h-8">
            {currentStatus ? (
              <>
                <span>{currentStatus.emoji}</span>
                <span className="truncate max-w-[100px]">{currentStatus.text}</span>
              </>
            ) : (
              <>
                <Smile className="h-3.5 w-3.5" />
                Set status
              </>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Set your status</DialogTitle>
        </DialogHeader>

        {/* Current status */}
        {currentStatus && (
          <div className="flex items-center justify-between bg-muted/40 rounded-xl px-3 py-2 mb-2">
            <span className="text-sm">
              {currentStatus.emoji} {currentStatus.text}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Custom input */}
        <div className="flex gap-2 items-center">
          <button
            onClick={() => {
              const emojis = ['😊', '😎', '🔥', '💜', '✨', '🌙', '☀️', '❤️', '🤩', '😤'];
              const idx = emojis.indexOf(emoji);
              setEmoji(emojis[(idx + 1) % emojis.length]);
            }}
            className="text-2xl hover:scale-110 transition-transform flex-shrink-0"
          >
            {emoji}
          </button>
          <Input
            placeholder="What's on your mind?"
            value={text}
            onChange={(e) => setText(e.target.value)}
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

        {/* Presets */}
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_STATUSES.map((preset) => (
            <button
              key={preset.text}
              onClick={() => handlePreset(preset)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                text === preset.text
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-muted/30 text-foreground hover:bg-muted/60'
              }`}
            >
              <span>{preset.emoji}</span>
              <span className="truncate">{preset.text}</span>
            </button>
          ))}
        </div>

        <Button onClick={handleSetStatus} disabled={!text.trim() || setStatus.isPending} className="w-full rounded-full h-10">
          {setStatus.isPending ? 'Saving...' : 'Set Status'}
        </Button>
      </DialogContent>
    </Dialog>
  );
});
