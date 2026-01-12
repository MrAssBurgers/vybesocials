import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Hash, Volume2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCreateChannel, ChannelType } from '@/hooks/useServers';
import { cn } from '@/lib/utils';

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
}

export function CreateChannelDialog({ open, onOpenChange, serverId }: CreateChannelDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const createChannel = useCreateChannel();

  const handleCreate = async () => {
    if (!name.trim() || createChannel.isPending) return;

    try {
      await createChannel.mutateAsync({
        serverId,
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        type,
      });
      onOpenChange(false);
      setName('');
      setType('text');
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
        onClick={() => onOpenChange(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md mx-4 bg-card rounded-2xl shadow-xl border border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Create Channel</h2>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Channel type */}
            <div className="space-y-3">
              <Label>Channel Type</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as ChannelType)}>
                <label
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    type === 'text' ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="text" className="sr-only" />
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Text</p>
                    <p className="text-xs text-muted-foreground">Send messages, images, and more</p>
                  </div>
                </label>

                <label
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    type === 'voice' ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="voice" className="sr-only" />
                  <Volume2 className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Voice</p>
                    <p className="text-xs text-muted-foreground">Hang out with voice and video</p>
                  </div>
                </label>

                <label
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    type === 'announcement' ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="announcement" className="sr-only" />
                  <Megaphone className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Announcement</p>
                    <p className="text-xs text-muted-foreground">Important updates for everyone</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Channel name */}
            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel Name</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="channel-name"
                  placeholder="general"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="h-12 pl-10"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Channel names can't contain spaces
              </p>
            </div>

            {/* Create button */}
            <Button
              className="w-full h-12"
              disabled={!name.trim() || createChannel.isPending}
              onClick={handleCreate}
            >
              {createChannel.isPending ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
