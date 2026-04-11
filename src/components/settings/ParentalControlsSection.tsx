import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Clock, Eye, Check } from 'lucide-react';
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
  verifyPin,
  hashPin,
} from '@/hooks/useParentalControls';
import { useTodayScreenTime, formatScreenTime } from '@/hooks/useScreenTime';

export function ParentalControlsSection() {
  const { data: controls, isLoading } = useParentalControls();
  const setupMutation = useSetupParentalControls();
  const updateMutation = useUpdateParentalControls();
  const { data: screenTimeSec } = useTodayScreenTime();

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'setup' | 'verify' | 'dashboard'>('setup');
  const [unlocked, setUnlocked] = useState(false);
  const [verifyPin2, setVerifyPin2] = useState('');

  // Determine initial state
  const hasControls = !!controls;
  const isActive = controls?.is_active ?? false;

  // If controls exist but locked, show PIN entry
  if (hasControls && !unlocked && step !== 'setup') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-card p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Lock className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Parental Controls</h3>
            <p className="text-sm text-muted-foreground">Enter PIN to manage settings</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <InputOTP maxLength={4} value={verifyPin2} onChange={setVerifyPin2}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
          <Button
            onClick={() => {
              if (verifyPin(verifyPin2, controls!.pin_hash)) {
                setUnlocked(true);
                setStep('dashboard');
                haptics.success();
              } else {
                toast.error('Incorrect PIN');
                haptics.error();
                setVerifyPin2('');
              }
            }}
            disabled={verifyPin2.length !== 4}
          >
            Unlock
          </Button>
        </div>
      </motion.div>
    );
  }

  // Dashboard (unlocked or no controls yet)
  if (hasControls && unlocked) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="liquid-glass-card p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-base mb-1">Parental Controls</h3>
              <p className="text-sm text-muted-foreground">Manage content and screen time restrictions</p>
            </div>
          </div>

          {/* Active toggle */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Controls Active</p>
                <p className="text-sm text-muted-foreground">Enable or disable all restrictions</p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={(val) => {
                  updateMutation.mutate({ is_active: val });
                  haptics.tap();
                }}
              />
            </div>
          </div>

          {/* Screen time limit */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label>Daily Screen Time Limit</Label>
            </div>
            <Slider
              value={[controls!.max_screen_time_minutes]}
              onValueChange={([val]) => updateMutation.mutate({ max_screen_time_minutes: val })}
              min={15}
              max={480}
              step={15}
            />
            <p className="text-sm text-muted-foreground mt-2">
              {Math.floor(controls!.max_screen_time_minutes / 60)}h {controls!.max_screen_time_minutes % 60}m daily
            </p>
          </div>

          {/* Today's screen time */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <Label>Today's Screen Time</Label>
            </div>
            <p className="text-2xl font-bold text-primary">{formatScreenTime(screenTimeSec || 0)}</p>
          </div>

          {/* Content filter */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
            <Label className="mb-2 block">Content Filter Level</Label>
            <div className="flex gap-2">
              {['protected', 'moderate'].map((level) => (
                <Button
                  key={level}
                  variant={controls!.content_filter_level === level ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    updateMutation.mutate({ content_filter_level: level });
                    haptics.tap();
                  }}
                  className="capitalize"
                >
                  {level === 'protected' && <Shield className="w-3 h-3 mr-1" />}
                  {level}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Setup flow — new PIN
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="liquid-glass-card p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-base mb-1">Set Up Parental Controls</h3>
          <p className="text-sm text-muted-foreground">Create a 4-digit PIN to manage content restrictions</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6">
        <div className="space-y-4 w-full flex flex-col items-center">
          <div>
            <p className="text-sm font-medium mb-2 text-center">Create PIN</p>
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
            <p className="text-sm font-medium mb-2 text-center">Confirm PIN</p>
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
            setupMutation.mutate({ pin }, {
              onSuccess: () => {
                toast.success('Parental controls enabled!');
                haptics.success();
                setUnlocked(true);
                setStep('dashboard');
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
