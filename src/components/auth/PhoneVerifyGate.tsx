// Prompts for a verified phone number after sign-in.
// Dismissible for the current browser session (X or backdrop); reappears on next login session.
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { PhoneNumberCard } from '@/components/settings/PhoneNumberCard';
import { ShieldCheck } from 'lucide-react';
import {
  dismissPhoneVerifyForSession,
  isPhoneVerifyDismissed,
} from '@/lib/phoneVerifyDismiss';
import { debugSessionLog } from '@/lib/debugSessionLog';

export function PhoneVerifyGate() {
  const { user, loading } = useAuth();
  const [needs, setNeeds] = useState(false);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const contentProbeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setNeeds(false);
      setOpen(false);
      setChecked(true);
      return;
    }
    if (isPhoneVerifyDismissed(user.id)) {
      setNeeds(false);
      setOpen(false);
      setChecked(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('profiles')
        .select('phone_verified')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const shouldShow = !data?.phone_verified;
      setNeeds(shouldShow);
      setOpen(shouldShow);
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const el =
        contentProbeRef.current?.closest('[role="dialog"]') ||
        document.querySelector('[role="dialog"]');
      if (!el || !(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      const sat = getComputedStyle(document.documentElement).getPropertyValue('--sat').trim();
      // #region agent log
      debugSessionLog(
        'PhoneVerifyGate.tsx:layout',
        'phone_verify_dialog_geometry',
        {
          top: Math.round(r.top),
          left: Math.round(r.left),
          height: Math.round(r.height),
          viewportH: window.innerHeight,
          centerDelta: Math.round(r.top + r.height / 2 - window.innerHeight / 2),
          sat,
          closeNearSafeArea: r.top < 48,
        },
        'H-dialog',
        'post-fix',
      );
      // #endregion
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!checked || !needs) return null;

  const handleDismiss = () => {
    if (user?.id) dismissPhoneVerifyForSession(user.id);
    setOpen(false);
    setNeeds(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
      }}
    >
      <DialogContent className="max-w-md w-[min(92vw,28rem)]">
        <div ref={contentProbeRef} className="contents">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Verify your phone</DialogTitle>
          <DialogDescription className="text-center">
            VYBE works best with a verified phone number — it secures your account and helps friends find you.
          </DialogDescription>
        </DialogHeader>
        <PhoneNumberCard
          embedded
          onVerified={() => {
            setOpen(false);
            setNeeds(false);
          }}
        />
        </div>
      </DialogContent>
    </Dialog>
  );
}
