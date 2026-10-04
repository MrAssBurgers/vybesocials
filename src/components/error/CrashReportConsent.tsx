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
import { getConsentState, setCrashReportConsent, useCrashReportConsentState } from '@/lib/crashReportConsent';
import { useOptionalPromptBlocked } from '@/hooks/useOptionalPromptBlocked';

export const CrashReportConsent = memo(function CrashReportConsent() {
  const [readyForProfile, setReadyForProfile] = useState<string | null>(null);
  const { profile } = useAuth();
  const consent = useCrashReportConsentState();
  const blocked = useOptionalPromptBlocked('crash-consent', !!profile?.id && consent === null);
  const open = !!profile?.id && readyForProfile === profile.id && consent === null && !blocked;

  useEffect(() => {
    setReadyForProfile(null);
    // Already answered locally — done
    if (getConsentState() !== null) return;
    if (!profile?.id) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const openIfStillNeeded = () => {
      if (!cancelled && getConsentState() === null) setReadyForProfile(profile.id);
    };

    const fetchConsent = async () => {
      try {
        const { data } = await db
          .rpc('get_own_sensitive_profile')
          .single();
        if (cancelled || getConsentState() !== null) return;
        const dbVal = (data as any)?.crash_consent;
        if (dbVal === true || dbVal === false || dbVal === 'true' || dbVal === 'false') {
          const consent = dbVal === true || dbVal === 'true';
          setCrashReportConsent(consent);
        } else {
          timer = setTimeout(openIfStillNeeded, 2500);
        }
      } catch {
        if (!cancelled) timer = setTimeout(openIfStillNeeded, 2500);
      }
    };
    fetchConsent();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [profile?.id, consent]);

  const handleChoice = async (consent: boolean) => {
    setCrashReportConsent(consent);
    setReadyForProfile(null);

    // Persist to DB so it never asks again on any device
    if (profile?.id) {
      try {
        await db.from('profiles').update({ crash_consent: consent } as any).eq('id', profile.id);
      } catch { /* The local choice remains effective if sync is unavailable. */ }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={next => { if (!next && getConsentState() === null) void handleChoice(false); }}>
      <AlertDialogContent className="max-w-sm" data-vybe-optional-prompt="crash-consent">
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
