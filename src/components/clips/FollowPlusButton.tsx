import { memo, useEffect, useRef, useState } from 'react';
import { FollowButton } from '@/components/profile/FollowButton';
import { cn } from '@/lib/utils';

/** Uses the same acknowledged request/approval state as profile follow actions. */
export const FollowPlusButton = memo(function FollowPlusButton({ authorId, className }: { authorId: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '100px' });
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  return <div ref={root} className={cn('absolute -bottom-4 left-1/2 z-[5] -translate-x-1/2', className)}>
    <FollowButton targetId={authorId} compact enabled={visible} className="shadow-md ring-2 ring-background" />
  </div>;
});
