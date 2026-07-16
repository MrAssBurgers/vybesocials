/**
 * Safe-area "Verify your phone" prompt for mobile.
 *
 * Card is NOT position:fixed — it sits inside a full-viewport flex shell just
 * below the device safe area, matching native mobile overlay behavior.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthOptional } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { PhoneNumberCard } from '@/components/settings/PhoneNumberCard';
import { ShieldCheck, X } from 'lucide-react';
import {
  dismissPhoneVerifyForSession,
  isPhoneVerifyDismissed,
} from '@/lib/phoneVerifyDismiss';
import { debugSessionLog } from '@/lib/debugSessionLog';

const BUILD_TAG = 'safe-top-v1';

function isPhonePreview(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('vybe_phone_preview') === '1'
    );
  } catch {
    return false;
  }
}

export function PhoneCenterPrompt() {
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const loading = auth?.loading ?? true;
  const [show, setShow] = useState(isPhonePreview);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const preview = isPhonePreview();

  useEffect(() => {
    if (preview) {
      setShow(true);
      return;
    }

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
  }, [user?.id, loading, preview]);

  useEffect(() => {
    if (!show) return;
    const measure = () => {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
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
          mode: 'safe-area-flex-start',
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

  if (!show || typeof document === 'undefined') return null;
  if (!user && !preview) return null;

  const dismiss = () => {
    if (user) dismissPhoneVerifyForSession(user.id);
    setShow(false);
  };

  return createPortal(
    <div
      data-vybe-phone-shell={BUILD_TAG}
      className="vybe-phone-verify-shell"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={cardRef}
        data-vybe-phone-card={BUILD_TAG}
        className="vybe-phone-verify-card"
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vybe-phone-verify-build" aria-hidden="true">
          {BUILD_TAG}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          className="vybe-phone-verify-close"
        >
          <X style={{ width: 16, height: 16 }} />
        </button>

        <div className="vybe-phone-verify-header">
          <div className="vybe-phone-verify-icon">
            <ShieldCheck style={{ width: 26, height: 26, color: '#a5b4fc' }} />
          </div>
          <h2 id={titleId} className="vybe-phone-verify-title">
            Verify your phone
          </h2>
          <p className="vybe-phone-verify-copy">
            VYBE works best with a verified phone number — it secures your account and helps friends find you.
          </p>
        </div>

        <PhoneNumberCard
          embedded
          startEntering
          onVerified={() => setShow(false)}
        />
      </div>
    </div>,
    document.body,
  );
}
