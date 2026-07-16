/**
 * Mid-screen "Verify your phone" prompt for mobile.
 *
 * Vertical position is set in pixels after layout measure — avoids iOS WKWebView
 * bugs with transform centering and absolute+margin:auto+fit-content (pins to top).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

const BUILD_TAG = 'mid-v5';

function safeTopPx(): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--sat')
      .trim();
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

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
      // #region agent log
      debugSessionLog(
        'PhoneCenterPrompt.tsx:gate',
        'phone_prompt_skipped',
        { reason: 'dismissed', build: BUILD_TAG },
        'H-dialog',
        'post-fix',
      );
      // #endregion
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
      const need = !data?.phone_verified;
      setShow(need);
      // #region agent log
      debugSessionLog(
        'PhoneCenterPrompt.tsx:gate',
        'phone_prompt_gate',
        {
          need,
          phoneVerified: Boolean(data?.phone_verified),
          build: BUILD_TAG,
        },
        'H-dialog',
        'post-fix',
      );
      // #endregion
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  const placeCard = () => {
    const el = cardRef.current;
    if (!el) return;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const h = el.offsetHeight;
    const w = Math.min(vw * 0.92, 28 * 16);
    const padTop = Math.max(16, safeTopPx() + 8);
    const padBottom = 16;
    const maxTop = Math.max(padTop, vh - h - padBottom);
    const centered = (vh - h) / 2;
    const top = Math.min(maxTop, Math.max(padTop, centered));

    el.style.position = 'fixed';
    el.style.top = `${Math.round(top)}px`;
    el.style.left = '50%';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.width = `${Math.round(w)}px`;
    el.style.maxWidth = '92vw';
    el.style.maxHeight = `${Math.round(vh - padTop - padBottom)}px`;
    el.style.margin = '0';
    el.style.transform = 'translateX(-50%)';
    el.style.webkitTransform = 'translateX(-50%)';
    el.style.zIndex = '2147483001';

    const r = el.getBoundingClientRect();
    const centerDelta = Math.round(r.top + r.height / 2 - vh / 2);
    // #region agent log
    debugSessionLog(
      'PhoneCenterPrompt.tsx:layout',
      'phone_center_geometry',
      {
        top: Math.round(r.top),
        height: Math.round(r.height),
        viewportH: vh,
        centerDelta,
        closeNearSafeArea: r.top < 48,
        centered: Math.abs(centerDelta) < 64,
        mode: 'measured-top',
        build: BUILD_TAG,
      },
      'H-dialog',
      'post-fix',
    );
    // #endregion
  };

  useLayoutEffect(() => {
    if (!show) return;
    placeCard();
    const t = window.setTimeout(placeCard, 50);
    const t2 = window.setTimeout(placeCard, 250);
    const onResize = () => placeCard();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [show]);

  if (!show || !user || typeof document === 'undefined') return null;

  const dismiss = () => {
    dismissPhoneVerifyForSession(user.id);
    setShow(false);
  };

  return createPortal(
    <>
      <div
        data-vybe-phone-scrim={BUILD_TAG}
        className="vybe-phone-verify-scrim"
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147483000,
          background: 'rgba(0,0,0,0.55)',
        }}
      />
      <div
        ref={cardRef}
        data-vybe-phone-card={BUILD_TAG}
        className="vybe-phone-verify-card"
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          // Placeholder until useLayoutEffect measures — keep off top edge.
          top: '30vh',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2147483001,
          width: 'min(92vw, 28rem)',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '1.5rem',
          borderRadius: '1.25rem',
          border: '2px solid rgba(165,180,252,0.45)',
          background: 'rgba(15,16,23,0.98)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          boxSizing: 'border-box',
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

        <PhoneNumberCard
          embedded
          startEntering
          onVerified={() => setShow(false)}
        />
      </div>
    </>,
    document.body,
  );
}
