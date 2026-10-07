import { cn } from '@/lib/utils';

/** Owner-only label. The server omits this for every other viewer. */
export function PrivatePostTag({ className }: { className?: string }) {
  return (
    <span className={cn('pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium lowercase leading-none text-white', className)}>
      private
    </span>
  );
}
