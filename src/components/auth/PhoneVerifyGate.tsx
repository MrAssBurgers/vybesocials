// Prompts for a verified phone number after sign-in.
// Dismissible for the current browser session (X or backdrop); reappears on next login session.
// Uses a dedicated centered overlay (not Dialog) so global [role=dialog] CSS cannot pin it to the top on iOS.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { PhoneNumberCard } from '@/components/settings/PhoneNumberCard';
import { ShieldCheck, X } from 'lucide-react';
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();

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
    const id = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sat = getComputedStyle(document.documentElement).getPropertyValue('--sat').trim();
      const centerDelta = Math.round(r.top + r.height / 2 - window.innerHeight / 2);
      // #region agent log
      debugSessionLog(
        'PhoneVerifyGate.tsx:layout',
        'phone_verify_dialog_geometry',
        {
          top: Math.round(r.top),
          left: Math.round(r.left),
          height: Math.round(r.height),
          viewportH: window.innerHeight,
          centerDelta,
          sat,
          closeNearSafeArea: r.top < 48,
          mode: 'custom-overlay',
          centered: Math.abs(centerDelta) < 40,
        },
        'H-dialog',
        'post-fix',
      );
      // #endregion
    }, 80);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!checked || !needs || !open) return null;
  if (typeof document === 'undefined') return null;

  const handleDismiss = () => {
    if (user?.id) dismissPhoneVerifyForSession(user.id);
    setOpen(false);
    setNeeds(false);
  };

  return createPortal(
    <div
      className="vybe-phone-verify-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        display: 'grid',
        placeItems: 'center',
        paddingTop: 'max(1rem, var(--sat, env(safe-area-inset-top, 0px)))',
        paddingBottom: 'max(1rem, var(--sab, env(safe-area-inset-bottom, 0px)))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="vybe-phone-verify-panel"
        style={{
          position: 'relative',
          width: 'min(92vw, 28rem)',
          maxHeight: 'min(85vh, calc(100dvh - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 2rem))',
          margin: 0,
          overflow: 'auto',
          borderRadius: '1rem',
          border: '1px solid hsl(var(--border) / 0.5)',
          background: 'hsl(var(--background) / 0.95)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full bg-muted/80 flex items-center justify-center opacity-70 hover:opacity-100 z-10"
          style={{ width: 28, height: 28 }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
        <div className="p-6 space-y-4">
          <div className="flex flex-col space-y-1.5 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">
              Verify your phone
            </h2>
            <p id={descId} className="text-sm text-muted-foreground">
              VYBE works best with a verified phone number — it secures your account and helps friends find you.
            </p>
          </div>
          <PhoneNumberCard
            embedded
            onVerified={() => {
              setOpen(false);
              setNeeds(false);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
