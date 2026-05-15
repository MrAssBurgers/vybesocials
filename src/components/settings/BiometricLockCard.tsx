import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  isBiometricsAvailable,
  requestBioAuth,
  getBioAuthPref,
  setBioAuthPref,
} from '@/lib/biometrics';

/**
 * Settings card to toggle Face ID / Touch ID app lock.
 * Works inside the Capacitor native app (iOS/Android) and Despia. In a plain
 * web browser the toggle is disabled with an explanatory hint.
 */
export function BiometricLockCard() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(getBioAuthPref());
    isBiometricsAvailable().then(setAvailable);
  }, []);

  const promptEnroll = () => {
    toast.message('Set up Face Unlock or Fingerprint in your phone\'s Settings, then come back.', {
      action: {
        label: 'Open Settings',
        onClick: () => {
          // Best-effort deep link to the system biometric enrollment screen.
          // Android: Settings.ACTION_BIOMETRIC_ENROLL via intent. iOS: Settings app.
          try {
            window.location.href = 'app-settings:';
          } catch {}
        },
      },
      duration: 8000,
    });
  };

  const onToggle = async (next: boolean) => {
    if (!available) {
      toast.info('Face ID / Touch ID isn\'t available on this device.');
      return;
    }
    if (!next) {
      setBioAuthPref(false);
      setEnabled(false);
      toast.success('Biometric lock disabled');
      return;
    }
    setBusy(true);
    try {
      const r = await requestBioAuth();
      if (r.ok === true) {
        setBioAuthPref(true);
        setEnabled(true);
        toast.success('Biometric lock enabled — required at app launch');
      } else if (r.reason === 'not-enrolled' || r.reason === 'unavailable') {
        // Despia returns 'unavailable' both when no hardware exists AND when
        // no fingerprint/face is enrolled. Almost every modern phone has the
        // hardware, so treat this as "go enroll in phone Settings".
        promptEnroll();
      } else if (r.reason === 'cancelled') {
        // user backed out of the prompt — silent
      } else if (r.reason !== 'not-despia') {
        toast.error('Biometric verification failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!available) {
      toast.info('Available inside the mobile app.');
      return;
    }
    setBusy(true);
    const r = await requestBioAuth();
    setBusy(false);
    if (r.ok === true) toast.success('Verified ✓');
    else if (r.reason === 'not-enrolled' || r.reason === 'unavailable') promptEnroll();
    else if (r.reason === 'cancelled') { /* silent */ }
    else toast.error('Verification cancelled.');
  };

  // When the user returns from system Settings (e.g. after enrolling), re-check.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        isBiometricsAvailable().then(setAvailable);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Fingerprint className="w-5 h-5 mt-0.5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-1.5">
                Biometric app lock
                <ShieldCheck className="w-3.5 h-3.5 text-primary/70" />
              </div>
              <div className="text-xs text-muted-foreground">
                {available === false
                  ? 'Available inside the VYBE mobile app.'
                  : 'Require Face ID / fingerprint to open VYBE. (For one‑tap sign‑in, add a Passkey above.)'}
              </div>
            </div>
            <Switch checked={enabled} disabled={busy || available !== true} onCheckedChange={onToggle} />
          </div>
          {available && enabled && (
            <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={test}>
              Test biometric prompt
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
