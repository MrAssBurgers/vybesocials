import { clearCacheAndReload } from '@/lib/bootGuard';

interface BootRecoveryScreenProps {
  error?: unknown;
}

/** Fallback when main.tsx boot throws before the normal app shell mounts. */
export function BootRecoveryScreen({ error }: BootRecoveryScreenProps) {
  const detail =
    error instanceof Error
      ? error.message
      : error
        ? String(error)
        : 'Startup failed before the app could load.';

  return (
    <div
      data-vybe-boot-screen
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 text-center bg-[#07070c] text-foreground"
    >
      <div className="flex flex-col items-center max-w-md gap-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-200">
          Startup recovery
        </div>
        <h1 className="text-xl font-bold text-white">VYBE didn&apos;t load</h1>
        <p className="text-sm leading-relaxed text-zinc-300">
          This is usually a cached update or a one-time glitch. Reload or clear cache to continue.
        </p>
        <p className="text-xs text-zinc-500 break-all">{detail}</p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={clearCacheAndReload}
            className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold border border-border text-foreground"
          >
            Clear cache
          </button>
        </div>
      </div>
    </div>
  );
}
