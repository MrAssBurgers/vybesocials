import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Settings, 
  Eye, 
  EyeOff, 
  Clock, 
  Ghost,
  Keyboard,
  Palette,
  Heart,
  Zap,
  Coffee,
  Battery,
  Check,
} from 'lucide-react';
import { useDMSettings, ReadReceiptMode, TypingMode, EmotionalPulse, DMSettings } from '@/hooks/useDMSettings';
import { cn } from '@/lib/utils';

interface DMSettingsSheetProps {
  conversationId: string;
}

const READ_RECEIPT_OPTIONS: { value: ReadReceiptMode; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'instant', label: 'Seen instantly', icon: <Eye className="h-4 w-4" />, description: 'They see when you read' },
  { value: 'after_reply', label: 'Seen after reply', icon: <Clock className="h-4 w-4" />, description: "Shows after you respond" },
  { value: 'never', label: 'Never seen', icon: <EyeOff className="h-4 w-4" />, description: "They won't know you read" },
  { value: 'fake', label: 'Fake seen 💀', icon: <Ghost className="h-4 w-4" />, description: 'Shows seen even when not read' },
];

const TYPING_OPTIONS: { value: TypingMode; label: string; description: string }[] = [
  { value: 'normal', label: 'Normal', description: 'Shows when you type' },
  { value: 'hidden', label: 'Hidden', description: 'Type without showing' },
  { value: 'always_show', label: 'Always show', description: 'Show typing while thinking' },
  { value: 'frozen', label: 'Frozen', description: 'Freeze typing to build suspense' },
];

const THEME_OPTIONS = [
  { value: 'default', label: 'Default', color: 'bg-primary' },
  { value: 'rose', label: 'Rose', color: 'bg-rose-500' },
  { value: 'amber', label: 'Amber', color: 'bg-amber-500' },
  { value: 'emerald', label: 'Emerald', color: 'bg-emerald-500' },
  { value: 'violet', label: 'Violet', color: 'bg-violet-500' },
  { value: 'cyan', label: 'Cyan', color: 'bg-cyan-500' },
];

const EMOTIONAL_PULSE_OPTIONS: { value: EmotionalPulse; label: string; icon: React.ReactNode; color: string }[] = [
  { value: null, label: 'None', icon: null, color: '' },
  { value: 'nervous', label: 'Nervous', icon: <Zap className="h-4 w-4" />, color: 'text-yellow-500' },
  { value: 'excited', label: 'Excited', icon: <Heart className="h-4 w-4" />, color: 'text-pink-500' },
  { value: 'calm', label: 'Calm', icon: <Coffee className="h-4 w-4" />, color: 'text-blue-500' },
  { value: 'drained', label: 'Drained', icon: <Battery className="h-4 w-4" />, color: 'text-gray-500' },
];

export function DMSettingsSheet({ conversationId }: DMSettingsSheetProps) {
  const { settings, updateSettings, isLoading } = useDMSettings(conversationId);
  const [open, setOpen] = useState(false);

  const handleUpdateSettings = (updates: Partial<DMSettings>) => {
    updateSettings(updates);
    toast.success('Settings updated', { duration: 1500 });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            DM Settings
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Read Receipts Control */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Read Receipts
            </Label>
            <div className="grid gap-2">
              {READ_RECEIPT_OPTIONS.map((option) => (
                <motion.button
                  key={option.value}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleUpdateSettings({ read_receipt_mode: option.value })}
                  disabled={isLoading}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    settings.read_receipt_mode === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {option.icon}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                  {settings.read_receipt_mode === option.value && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Typing Indicator Control */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Typing Indicator
            </Label>
            <Select
              value={settings.typing_mode}
              onValueChange={(value: TypingMode) => handleUpdateSettings({ typing_mode: value })}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chat Theme */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Chat Theme
            </Label>
            <div className="flex gap-3 flex-wrap">
              {THEME_OPTIONS.map((theme) => (
                <motion.button
                  key={theme.value}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleUpdateSettings({ theme: theme.value })}
                  disabled={isLoading}
                  className={cn(
                    'w-12 h-12 rounded-full border-3 transition-all shadow-md',
                    theme.color,
                    settings.theme === theme.value
                      ? 'border-white ring-2 ring-primary ring-offset-2 ring-offset-background scale-110'
                      : 'border-transparent hover:ring-1 hover:ring-primary/50',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                  title={theme.label}
                />
              ))}
            </div>
          </div>

          {/* Emotional Pulse */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Emotional Pulse
              </Label>
              <Switch
                checked={settings.show_emotional_pulse}
                onCheckedChange={(checked) => handleUpdateSettings({ show_emotional_pulse: checked })}
                disabled={isLoading}
              />
            </div>
            {settings.show_emotional_pulse && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex gap-2 flex-wrap"
              >
                {EMOTIONAL_PULSE_OPTIONS.map((pulse) => (
                  <motion.button
                    key={pulse.value || 'none'}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleUpdateSettings({ emotional_pulse: pulse.value })}
                    disabled={isLoading}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                      pulse.color,
                      settings.emotional_pulse === pulse.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50',
                      isLoading && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {pulse.icon}
                    <span className="text-sm">{pulse.label}</span>
                    {settings.emotional_pulse === pulse.value && (
                      <Check className="h-3 w-3 ml-1" />
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Emotional pulse indicator component
export function EmotionalPulseIndicator({ pulse }: { pulse: EmotionalPulse }) {
  if (!pulse) return null;

  const config = EMOTIONAL_PULSE_OPTIONS.find(p => p.value === pulse);
  if (!config) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={cn('flex items-center gap-1', config.color)}
      title={config.label}
    >
      {config.icon}
    </motion.div>
  );
}
