import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  isDespia,
  requestBioAuth,
  getBioAuthPref,
  setBioAuthPref,
} from '@/lib/despiaBiometrics';

/**
 * Settings card to toggle Face ID / Touch ID app lock via Despia.
 * Stored as a local preference; the native runtime handles the actual prompt.
 */
export function BiometricLockCard() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const inDespia = isDespia();

  useEffect(() => {
    setEnabled(getBioAuthPref());
  }, []);

  const onToggle = async (next: boolean) => {
    if (!inDespia) {
      toast.info('Open VYBE in the mobile app to use Face ID / Touch ID.');
      return;
    }
    setBusy(true);
    try {
      const r = await requestBioAuth();
      if (r.ok) {
        setBioAuthPref(next);
        setEnabled(next);
        toast.success(next ? 'Biometric lock enabled' : 'Biometric lock disabled');
      } else if (r.reason === 'unavailable') {
        toast.error('No Face ID / Touch ID set up on this device.');
      } else if (r.reason !== 'not-despia') {
        toast.error('Biometric verification failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!inDespia) {
      toast.info('Available inside the mobile app.');
      return;
    }
    setBusy(true);
    const r = await requestBioAuth();
    setBusy(false);
    if (r.ok) toast.success('Verified ✓');
    else if (r.reason === 'unavailable') toast.error('No biometrics enrolled.');
    else toast.error('Verification cancelled.');
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Fingerprint className="w-5 h-5 mt-0.5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-1.5">
                Face ID / Touch ID
                <ShieldCheck className="w-3.5 h-3.5 text-primary/70" />
              </div>
              <div className="text-xs text-muted-foreground">
                {inDespia
                  ? 'Require biometrics to open VYBE and confirm sensitive actions.'
                  : 'Available inside the VYBE mobile app.'}
              </div>
            </div>
            <Switch checked={enabled} disabled={busy || !inDespia} onCheckedChange={onToggle} />
          </div>
          {inDespia && enabled && (
            <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={test}>
              Test biometric prompt
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
