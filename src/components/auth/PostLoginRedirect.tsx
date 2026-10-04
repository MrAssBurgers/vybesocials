import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolvePostLoginDestination } from '@/lib/authReturnPath';

/** Consuming the saved path is a side effect, never a render-time calculation. */
export function PostLoginRedirect({ profile }: { profile: Parameters<typeof resolvePostLoginDestination>[0] }) {
  const navigate = useNavigate();
  const redirected = useRef(false);
  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    navigate(resolvePostLoginDestination(profile), { replace: true });
  }, [navigate, profile]);
  return <div role="status" className="sr-only">Opening your destination…</div>;
}
