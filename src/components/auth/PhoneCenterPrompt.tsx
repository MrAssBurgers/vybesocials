/**
 * Mid-screen "Verify your phone" prompt.
 * Full-viewport flex center — no Dialog, no role=dialog, no transform math
 * (iOS WebView routinely strips/overrides transform on fixed sheets).
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

const BUILD_TAG = 'mid-v3';

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
    const measure = () => {
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
          mode: 'flex-center',
          build: BUILD_TAG,
        },
        'H-dialog',
        'post-fix',
      );
      // #endregion
    };
    const t = window.setTimeout(measure, 80);
    const t2 = window.setTimeout(measure, 400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [show]);

  if (!show || !user || typeof document === 'undefined') return null;

  const dismiss = () => {
    dismissPhoneVerifyForSession(user.id);
    setShow(false);
  };

  return createPortal(
    <div
      data-vybe-phone-center={BUILD_TAG}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={cardRef}
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(92vw, 28rem)',
          maxHeight: 'min(80vh, 36rem)',
          overflow: 'auto',
          margin: 0,
          padding: '1.5rem',
          borderRadius: '1.25rem',
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(15,16,23,0.98)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          boxSizing: 'border-box',
          transform: 'none',
          top: 'auto',
          left: 'auto',
          right: 'auto',
          bottom: 'auto',
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
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            opacity: 0.9,
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 16, paddingTop: 4 }}>
          <div
            style={{
              margin: '0 auto 12px',
              width: 52,
              height: 52,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(99,102,241,0.18)',
            }}
          >
            <ShieldCheck style={{ width: 26, height: 26, color: '#a5b4fc' }} />
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

        <PhoneNumberCard embedded onVerified={() => setShow(false)} />
      </div>
    </div>,
    document.body,
  );
}
