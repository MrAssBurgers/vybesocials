import { useEffect, useState, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { ShieldCheck } from 'lucide-react';

const CONSENT_KEY = 'vybe_crash_consent';

export function getConsentState(): boolean | null {
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

export const CrashReportConsent = memo(function CrashReportConsent() {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    // Already answered locally — done
    if (getConsentState() !== null) return;
    if (!profile?.id) return;

    // Check DB for existing answer (cross-device persistence)
    supabase
      .rpc('get_own_sensitive_profile')
      .single()
      .then(({ data }) => {
        const dbVal = (data as any)?.crash_consent;
        if (dbVal === 'true' || dbVal === 'false' || dbVal === true || dbVal === false) {
          const consent = dbVal === 'true' || dbVal === true;
          localStorage.setItem(CONSENT_KEY, String(consent));
          // Already answered — don't show
        } else {
          // Never answered on any device — show once
          setTimeout(() => setOpen(true), 2500);
        }
      })
      .catch(() => {
        // RPC doesn't exist or failed — fall back to showing dialog
        setTimeout(() => setOpen(true), 2500);
      });
  }, [profile?.id]);

  const handleChoice = async (consent: boolean) => {
    localStorage.setItem(CONSENT_KEY, String(consent));
    setOpen(false);

    // Persist to DB so it never asks again on any device
    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ crash_consent: String(consent) } as any)
        .eq('id', profile.id);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <AlertDialogTitle className="text-base">Help improve VYBE</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm">
            Automatically send anonymous crash reports so we can find and fix bugs faster. No personal data is shared.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleChoice(false)}>No thanks</AlertDialogCancel>
          <AlertDialogAction onClick={() => handleChoice(true)}>Sure!</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
