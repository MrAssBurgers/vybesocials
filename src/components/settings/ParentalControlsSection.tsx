import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Clock, Eye, MessageCircle, Bell, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import {
  useParentalControls,
  useSetupParentalControls,
  useUpdateParentalControls,
  useVerifyParentalPin,
} from '@/hooks/useParentalControls';

import { useTodayScreenTime, formatScreenTime } from '@/hooks/useScreenTime';
import { useSafetySettings, useUpdateSafetySettings } from '@/hooks/useSafetySettings';

const CHILD_SAFE_DEFAULTS = {
  content_filter_level: 'protected' as const,
  dm_filter: 'friends_only' as const,
  dm_content_filter_enabled: true,
  message_requests_enabled: false,
  quiet_hours_enabled: true,
  quiet_hours_start: '21:00',
  quiet_hours_end: '07:00',
  take_a_break_reminder: true,
  break_reminder_interval_hours: 1,
};

export function ParentalControlsSection() {
  const { data: controls, isLoading } = useParentalControls();
  const { data: safety } = useSafetySettings();
  const setupMutation = useSetupParentalControls();
  const updateMutation = useUpdateParentalControls();
  const updateSafetyMutation = useUpdateSafetySettings();
  const { data: screenTimeSec } = useTodayScreenTime();

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [verifyPinInput, setVerifyPinInput] = useState('');
  const verifyPinMutation = useVerifyParentalPin();


  const hasControls = !!controls;
  const isActive = controls?.is_active ?? false;
  const screenLimit = controls?.max_screen_time_minutes ?? 120;
  const filterLevel = controls?.content_filter_level ?? 'protected';
  const dmFilter = safety?.dm_filter ?? 'friends_only';
  const messageRequestsEnabled = safety?.message_requests_enabled ?? false;
  const dmContentFilterEnabled = safety?.dm_content_filter_enabled ?? true;
  const quietHoursEnabled = safety?.quiet_hours_enabled ?? true;
  const takeBreakReminder = safety?.take_a_break_reminder ?? true;

  const applyChildSafeDefaults = () => {
    updateSafetyMutation.mutate(CHILD_SAFE_DEFAULTS, {
      onSuccess: () => {
        toast.success('Child-safe protections applied');
        haptics.success();
      },
      onError: () => {
        toast.error('Could not apply all safety protections');
        haptics.error();
      },
    });
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="liquid-glass-card p-6">
        <p className="text-sm text-muted-foreground">Loading parental controls...</p>
      </motion.div>
    );
  }

  if (hasControls && !unlocked) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-card p-6">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
            <Lock className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h3 className="mb-1 text-base font-semibold">Parental Controls</h3>
            <p className="text-sm text-muted-foreground">Parental controls are active — enter your PIN to manage them.</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <InputOTP maxLength={4} value={verifyPinInput} onChange={setVerifyPinInput}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
          <Button
            onClick={async () => {
              if (!controls?.has_pin) return;
              try {
                const ok = await verifyPinMutation.mutateAsync(verifyPinInput);
                if (ok) {
                  setUnlocked(true);
                  setVerifyPinInput('');
                  haptics.success();
                } else {
                  toast.error('Incorrect PIN');
                  haptics.error();
                  setVerifyPinInput('');
                }
              } catch {
                toast.error('Could not verify PIN');
                setVerifyPinInput('');
              }
            }}
            disabled={verifyPinInput.length !== 4 || verifyPinMutation.isPending}
          >
            Unlock Controls
          </Button>

        </div>
      </motion.div>
    );
  }

  if (hasControls && unlocked) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="liquid-glass-card p-6">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="mb-1 text-base font-semibold">Parental Controls</h3>
              <p className="text-sm text-muted-foreground">Keep kids protected with safer DMs, stronger filters, reminders, and quiet hours.</p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Controls Active</p>
                <p className="text-sm text-muted-foreground">Keep all restrictions enabled for this account.</p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(val) => {
                  updateMutation.mutate({ is_active: val });
                  if (val) applyChildSafeDefaults();
                  haptics.tap();
                }}
              />
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label>Daily Screen Time Limit</Label>
            </div>
            <Slider
              value={[screenLimit]}
              onValueChange={([val]) => updateMutation.mutate({ max_screen_time_minutes: val })}
              min={15}
              max={480}
              step={15}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {Math.floor(screenLimit / 60)}h {screenLimit % 60}m daily
            </p>
          </div>

          <div className="mb-4 rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Label>Today's Screen Time</Label>
            </div>
            <p className="text-2xl font-bold text-primary">{formatScreenTime(screenTimeSec || 0)}</p>
          </div>

          <div className="mb-4 rounded-xl border border-border/50 bg-muted/30 p-4">
            <Label className="mb-2 block">Content Filter Level</Label>
            <div className="flex gap-2">
              {['protected', 'moderate'].map((level) => (
                <Button
                  key={level}
                  variant={filterLevel === level ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    updateMutation.mutate({ content_filter_level: level });
                    updateSafetyMutation.mutate({ content_filter_level: level as 'protected' | 'moderate' });
                    haptics.tap();
                  }}
                  className="capitalize"
                >
                  {level === 'protected' && <Shield className="mr-1 h-3 w-3" />}
                  {level}
                </Button>
              ))}
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <Label>Who Can DM This Account</Label>
            </div>
            <div className="flex gap-2">
              <Button
                variant={dmFilter === 'friends_only' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateSafetyMutation.mutate({ dm_filter: 'friends_only' })}
              >
                Friends Only
              </Button>
              <Button
                variant={dmFilter === 'nobody' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateSafetyMutation.mutate({ dm_filter: 'nobody' })}
              >
                Nobody
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Message Requests</p>
                <p className="text-sm text-muted-foreground">Keep requests from strangers turned off.</p>
              </div>
              <Switch
                checked={messageRequestsEnabled}
                onCheckedChange={(checked) => updateSafetyMutation.mutate({ message_requests_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">DM Safety Filter</p>
                <p className="text-sm text-muted-foreground">Scan direct messages for unsafe content.</p>
              </div>
              <Switch
                checked={dmContentFilterEnabled}
                onCheckedChange={(checked) => updateSafetyMutation.mutate({ dm_content_filter_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Quiet Hours</p>
                <p className="text-sm text-muted-foreground">Pause activity overnight from 9:00 PM to 7:00 AM.</p>
              </div>
              <Switch
                checked={quietHoursEnabled}
                onCheckedChange={(checked) => updateSafetyMutation.mutate({ quiet_hours_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Take-a-Break Reminders</p>
                  <p className="text-sm text-muted-foreground">Nudge breaks every hour for healthier sessions.</p>
                </div>
              </div>
              <Switch
                checked={takeBreakReminder}
                onCheckedChange={(checked) => updateSafetyMutation.mutate({
                  take_a_break_reminder: checked,
                  break_reminder_interval_hours: checked ? 1 : 2,
                })}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={applyChildSafeDefaults} className="flex-1">
              Re-apply Child Safe Defaults
            </Button>
            <Button type="button" variant="outline" onClick={() => setUnlocked(false)} className="flex-1">
              Lock Again
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Moon className="h-4 w-4 text-primary" />
            Safe-time coverage
          </div>
          <ul className="space-y-1">
            <li>• Stronger content filtering stays on.</li>
            <li>• Stranger message requests can stay blocked.</li>
            <li>• Quiet hours reduce late-night interruptions.</li>
            <li>• Break reminders support healthier screen habits.</li>
          </ul>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-card p-6">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="mb-1 text-base font-semibold">Set Up Parental Controls</h3>
          <p className="text-sm text-muted-foreground">Create a 4-digit PIN and turn on safer defaults for a younger user.</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center space-y-4">
          <div>
            <p className="mb-2 text-center text-sm font-medium">Create PIN</p>
            <InputOTP maxLength={4} value={pin} onChange={setPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div>
            <p className="mb-2 text-center text-sm font-medium">Confirm PIN</p>
            <InputOTP maxLength={4} value={confirmPin} onChange={setConfirmPin}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>

        <Button
          onClick={() => {
            if (pin !== confirmPin) {
              toast.error('PINs do not match');
              haptics.error();
              return;
            }
            setupMutation.mutate({
              pin,
              settings: {
                content_filter_level: 'protected',
                max_screen_time_minutes: 120,
                allowed_features: ['messaging', 'feed', 'profile'],
              },
            }, {
              onSuccess: () => {
                applyChildSafeDefaults();
                toast.success('Parental controls enabled!');
                haptics.success();
                setUnlocked(true);
              },
              onError: () => {
                toast.error('Failed to set up parental controls');
                haptics.error();
              },
            });
          }}
          disabled={pin.length !== 4 || confirmPin.length !== 4 || setupMutation.isPending}
          className="w-full"
        >
          {setupMutation.isPending ? 'Setting up...' : 'Enable Parental Controls'}
        </Button>
      </div>
    </motion.div>
  );
}
