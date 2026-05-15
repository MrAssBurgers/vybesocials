import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Bell, BellOff } from 'lucide-react';
import {
  useConversationNotifPrefs,
  useUpdateConversationNotifPrefs,
  muteDurationToIso,
  isMuted,
  type ConversationImportance,
} from '@/hooks/useConversationNotifPrefs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
}

const MUTE_OPTIONS: Array<{ key: '1h' | '8h' | '1d' | 'forever'; label: string }> = [
  { key: '1h', label: '1 hour' },
  { key: '8h', label: '8 hours' },
  { key: '1d', label: '1 day' },
  { key: 'forever', label: 'Until I turn it back on' },
];

const SOUNDS = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'pop', label: 'Pop' },
  { value: 'ping', label: 'Ping' },
  { value: 'none', label: 'No sound' },
];

const VIBES = [
  { value: 'default', label: 'Default' },
  { value: 'short', label: 'Short' },
  { value: 'long', label: 'Long' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'none', label: 'No vibration' },
];

const IMPORTANCE: Array<{ value: ConversationImportance; label: string; hint: string }> = [
  { value: 'high', label: 'High', hint: 'Pop on screen, full sound' },
  { value: 'default', label: 'Default', hint: 'Normal banner + sound' },
  { value: 'low', label: 'Quiet', hint: 'Banner only, no sound' },
  { value: 'silent', label: 'Silent', hint: 'No banner, no sound' },
];

export function ConversationNotificationSheet({ open, onOpenChange, conversationId }: Props) {
  const { data: prefs } = useConversationNotifPrefs(conversationId);
  const update = useUpdateConversationNotifPrefs();

  const [sound, setSound] = useState<string>('default');
  const [vibration, setVibration] = useState<string>('default');
  const [importance, setImportance] = useState<ConversationImportance>('default');

  useEffect(() => {
    if (!prefs) return;
    setSound(prefs.sound ?? 'default');
    setVibration(prefs.vibration_pattern ?? 'default');
    setImportance(prefs.importance);
  }, [prefs]);

  const muted = isMuted(prefs ?? undefined);

  const apply = (patch: Partial<{ muted_until: string | null; sound: string; vibration_pattern: string; importance: ConversationImportance }>) => {
    if (!conversationId) return;
    update.mutate({
      conversation_id: conversationId,
      muted_until: patch.muted_until !== undefined ? patch.muted_until : prefs?.muted_until ?? null,
      sound: patch.sound ?? sound,
      vibration_pattern: patch.vibration_pattern ?? vibration,
      importance: patch.importance ?? importance,
    });
  };

  if (!conversationId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-t border-border rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            {muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            Notifications
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-4">
          <section>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base">Mute conversation</Label>
              <Switch
                checked={muted}
                onCheckedChange={(checked) => {
                  apply({ muted_until: checked ? muteDurationToIso('1h') : null });
                }}
              />
            </div>
            {muted && (
              <div className="grid grid-cols-2 gap-2">
                {MUTE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.key}
                    variant="secondary"
                    size="sm"
                    onClick={() => apply({ muted_until: muteDurationToIso(opt.key) })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section>
            <Label className="text-base mb-3 block">Importance</Label>
            <RadioGroup
              value={importance}
              onValueChange={(v) => {
                setImportance(v as ConversationImportance);
                apply({ importance: v as ConversationImportance });
              }}
              className="space-y-2"
            >
              {IMPORTANCE.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`imp-${opt.value}`}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 cursor-pointer"
                >
                  <RadioGroupItem value={opt.value} id={`imp-${opt.value}`} className="mt-0.5" />
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </section>

          <section>
            <Label className="text-base mb-3 block">Sound</Label>
            <div className="grid grid-cols-3 gap-2">
              {SOUNDS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={sound === opt.value ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setSound(opt.value);
                    apply({ sound: opt.value });
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <Label className="text-base mb-3 block">Vibration</Label>
            <div className="grid grid-cols-3 gap-2">
              {VIBES.map((opt) => (
                <Button
                  key={opt.value}
                  variant={vibration === opt.value ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setVibration(opt.value);
                    apply({ vibration_pattern: opt.value });
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground pt-2">
            On Android, these settings are mirrored to a per-conversation notification channel
            after your next sync.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
