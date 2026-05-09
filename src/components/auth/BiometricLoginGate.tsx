import { useBiometricLoginGate } from '@/hooks/useBiometricLoginGate';
import { Loader2, ShieldCheck } from 'lucide-react';

/**
 * Mounted once at the app root. Renders a full-screen blocker while the
 * Despia biometric login gate is verifying. No-op outside Despia or when
 * the user hasn't enabled the preference.
 */
export function BiometricLoginGate() {
  const locked = useBiometricLoginGate();
  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-3 bg-background">
      <ShieldCheck className="h-10 w-10 text-primary" />
      <div className="text-base font-semibold">Verifying…</div>
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
