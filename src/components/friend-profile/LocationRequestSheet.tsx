import { memo, useState } from 'react';
import { MapPin, Clock } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocationShareWithFriend } from '@/hooks/useLocationShareWithFriend';
import type { LocationDuration } from '@/lib/friendProfileClient';
import { cn } from '@/lib/utils';

const DURATIONS: { value: LocationDuration; label: string }[] = [
  { value: 'once', label: 'Once (15 min)' },
  { value: '1h', label: '1 hour' },
  { value: 'until_tonight', label: 'Until tonight' },
  { value: '24h', label: '24 hours' },
  { value: 'while_using', label: 'While using app' },
];

interface LocationRequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherProfileId: string;
  otherUsername?: string;
}

export const LocationRequestSheet = memo(function LocationRequestSheet({
  open,
  onOpenChange,
  otherProfileId,
  otherUsername,
}: LocationRequestSheetProps) {
  const [duration, setDuration] = useState<LocationDuration>('1h');
  const [message, setMessage] = useState('');
  const { requestShare } = useLocationShareWithFriend(otherProfileId);

  const handleSend = async () => {
    await requestShare.mutateAsync({ duration, message: message.trim() || undefined });
    onOpenChange(false);
    setMessage('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Request location
          </SheetTitle>
          <SheetDescription>
            Ask @{otherUsername || 'friend'} to share their live location with you.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Duration
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border transition-colors',
                    duration === d.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            placeholder="Optional message…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={200}
          />

          <Button
            className="w-full"
            onClick={handleSend}
            disabled={requestShare.isPending}
          >
            Send request
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
});
