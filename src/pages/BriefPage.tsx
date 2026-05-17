import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIBriefSheet } from '@/components/home/AIBriefSheet';

/**
 * Dedicated page for the Daily Brief. Push notifications deep-link here
 * (instead of `/?openBrief=true`) so taps open a real route with full
 * back-stack behavior. Internally reuses the existing AIBriefSheet so the
 * brief renders identically to the in-app widget.
 *
 * Also repairs malformed legacy URLs like `/brief&topic=Climate` (missing
 * `?` separator from an older backfill) by rewriting them on mount.
 */
export default function BriefPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  // Parse params from either a real query string OR a malformed
  // `/brief&topic=...&headline=...` pathname (no `?`).
  const { focusTopic, focusHeadline, needsRepair, repairedSearch } = useMemo(() => {
    if (typeof window === 'undefined') {
      return { focusTopic: null, focusHeadline: null, needsRepair: false, repairedSearch: '' };
    }
    const { pathname, search } = window.location;
    let qs = search;
    let needsRepair = false;
    // Malformed: e.g. "/brief&topic=Climate" or "/brief/&topic=Climate"
    if (!qs && pathname.startsWith('/brief') && pathname.includes('&')) {
      const idx = pathname.indexOf('&');
      qs = '?' + pathname.slice(idx + 1);
      needsRepair = true;
    }
    const params = new URLSearchParams(qs);
    return {
      focusTopic: params.get('topic'),
      focusHeadline: params.get('headline'),
      needsRepair,
      repairedSearch: qs,
    };
  }, []);

  // Rewrite the URL so it's clean (`/brief?topic=...`) without losing params
  useEffect(() => {
    if (needsRepair) {
      navigate(`/brief${repairedSearch}`, { replace: true });
    }
  }, [needsRepair, repairedSearch, navigate]);

  // When user closes the sheet, navigate back to home.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => navigate('/home', { replace: true }), 220);
      return () => clearTimeout(t);
    }
  }, [open, navigate]);

  return (
    <div className="min-h-dvh bg-background">
      <AIBriefSheet
        open={open}
        onOpenChange={setOpen}
        focusTopic={focusTopic}
        focusHeadline={focusHeadline}
      />
    </div>
  );
}
