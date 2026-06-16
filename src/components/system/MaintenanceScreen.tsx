import { useEffect } from 'react';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { dismissStaticMaintenanceShell, getMaintenanceMessage } from '@/lib/maintenanceMode';
import { Wrench } from 'lucide-react';

export function MaintenanceScreen() {
  const message = getMaintenanceMessage();

  useEffect(() => {
    dismissStaticMaintenanceShell();
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 text-center bg-[#07070c] text-foreground overflow-hidden relative">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139, 92, 246, 0.35), transparent), radial-gradient(ellipse 60% 40% at 90% 80%, rgba(236, 72, 153, 0.2), transparent), radial-gradient(ellipse 50% 35% at 10% 90%, rgba(59, 130, 246, 0.15), transparent)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-md gap-8">
        <VYBELogo size="2xl" animated={false} />

        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-200">
            <Wrench className="h-4 w-4 shrink-0" aria-hidden />
            Under reconstruction
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            We&apos;ll be back soon
          </h1>
          <p className="text-base sm:text-lg leading-relaxed text-zinc-200 max-w-prose">{message}</p>
        </div>

        <p className="text-xs text-zinc-600">
          vybehub.app · Firebase migration in progress
        </p>
      </div>
    </div>
  );
}
