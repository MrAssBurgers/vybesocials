import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  return null; // not yet decided
}

export function CrashReportConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only show if user hasn't decided yet AND is authenticated
    if (getConsentState() !== null) return;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setOpen(true);
    };
    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && getConsentState() === null) {
        setOpen(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleChoice = (consent: boolean) => {
    localStorage.setItem(CONSENT_KEY, String(consent));
    setOpen(false);
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
}
