import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AIBriefSheet } from '@/components/home/AIBriefSheet';

/**
 * Dedicated page for the Daily Brief. Push notifications deep-link here
 * (instead of `/?openBrief=true`) so taps open a real route with full
 * back-stack behavior. Internally reuses the existing AIBriefSheet so the
 * brief renders identically to the in-app widget.
 */
export default function BriefPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(true);

  const focusTopic = searchParams.get('topic');
  const focusHeadline = searchParams.get('headline');

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
