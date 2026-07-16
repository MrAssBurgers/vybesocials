/**
 * Centered "Verify your phone" prompt.
 * Built from scratch with absolute viewport centering — no Dialog, no role=dialog
 * CSS, no shared modal animations that pin sheets to the top on iOS.
 */
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

export function PhoneCenterPrompt() {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setShow(false);
      return;
    }
    if (isPhoneVerifyDismissed(user.id)) {
      setShow(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data } = await db
        .from('profiles')
        .select('phone_verified')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setShow(!data?.phone_verified);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const centerDelta = Math.round(r.top + r.height / 2 - window.innerHeight / 2);
      // #region agent log
      debugSessionLog(
        'PhoneCenterPrompt.tsx:layout',
        'phone_center_geometry',
        {
          top: Math.round(r.top),
          height: Math.round(r.height),
          viewportH: window.innerHeight,
          centerDelta,
          closeNearSafeArea: r.top < 48,
          centered: Math.abs(centerDelta) < 48,
          mode: 'absolute-center',
        },
        'H-dialog',
        'post-fix',
      );
      // #endregion
    }, 100);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show || !user || typeof document === 'undefined') return null;

  const dismiss = () => {
    dismissPhoneVerifyForSession(user.id);
    setShow(false);
  };

  return createPortal(
    <>
      <div
        onClick={dismiss}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2147483000,
          background: 'rgba(0,0,0,0.55)',
        }}
      />
      <div
        ref={cardRef}
        aria-labelledby={titleId}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2147483001,
          width: 'min(92vw, 28rem)',
          maxHeight: 'min(80vh, 36rem)',
          overflow: 'auto',
          margin: 0,
          padding: '1.5rem',
          borderRadius: '1.25rem',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(15,16,23,0.97)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          boxSizing: 'border-box',
          WebkitTransform: 'translate(-50%, -50%)',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            opacity: 0.85,
            cursor: 'pointer',
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 16, paddingTop: 4 }}>
          <div
            style={{
              margin: '0 auto 12px',
              width: 48,
              height: 48,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(99,102,241,0.15)',
            }}
          >
            <ShieldCheck style={{ width: 24, height: 24, color: '#a5b4fc' }} />
          </div>
          <h2
            id={titleId}
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 650,
              color: '#fafafa',
              letterSpacing: '-0.02em',
            }}
          >
            Verify your phone
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.45, color: '#a1a1aa' }}>
            VYBE works best with a verified phone number — it secures your account and helps friends find you.
          </p>
        </div>

        <PhoneNumberCard
          embedded
          onVerified={() => setShow(false)}
        />
      </div>
    </>,
    document.body,
  );
}
