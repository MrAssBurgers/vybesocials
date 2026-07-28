import { useEffect, useState, memo } from 'react';
import { db } from '@/lib/firebase';
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
import { CONSENT_KEY, getConsentState } from '@/lib/crashReportConsent';

export const CrashReportConsent = memo(function CrashReportConsent() {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    // Already answered locally — done
    if (getConsentState() !== null) return;
    if (!profile?.id) return;

    let cancelled = false;
    const openIfStillNeeded = () => {
      if (!cancelled && getConsentState() === null) setOpen(true);
    };

    const fetchConsent = async () => {
      try {
        const { data } = await db
          .rpc('get_own_sensitive_profile')
          .single();
        const dbVal = (data as any)?.crash_consent;
        if (dbVal === true || dbVal === false || dbVal === 'true' || dbVal === 'false') {
          const consent = dbVal === true || dbVal === 'true';
          localStorage.setItem(CONSENT_KEY, String(consent));
        } else {
          setTimeout(openIfStillNeeded, 2500);
        }
      } catch {
        setTimeout(openIfStillNeeded, 2500);
      }
    };
    fetchConsent();

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const handleChoice = async (consent: boolean) => {
    localStorage.setItem(CONSENT_KEY, String(consent));
    setOpen(false);

    // Persist to DB so it never asks again on any device
    if (profile?.id) {
      await db
        .from('profiles')
        .update({ crash_consent: consent } as any)
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
