import { useEffect, useState, type ReactNode } from 'react';

/**
 * Renders children only after the browser has been idle (or after a
 * timeout fallback). Used to defer heavy providers/components that are
 * not needed for first paint so they don't block the critical render path.
 */
export function IdleGate({
  children,
  timeout = 1500,
  fallback = null,
}: {
  children: ReactNode;
  timeout?: number;
  fallback?: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (idle) {
      const id = idle(() => setReady(true), { timeout });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), Math.min(timeout, 800));
    return () => clearTimeout(t);
  }, [timeout]);

  return <>{ready ? children : fallback}</>;
}
