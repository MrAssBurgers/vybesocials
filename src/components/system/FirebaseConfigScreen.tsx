import { VYBELogo } from '@/components/ui/VYBELogo';
import { AlertTriangle } from 'lucide-react';

/** Shown when VITE_FIREBASE_* env vars are missing — avoids a white screen on publish misconfig. */
export function FirebaseConfigScreen() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 text-center bg-[#07070c] text-foreground">
      <div className="flex flex-col items-center max-w-md gap-6">
        <VYBELogo size="xl" animated={false} />
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Configuration required
        </div>
        <h1 className="text-xl font-bold text-white">Firebase is not configured</h1>
        <p className="text-sm leading-relaxed text-zinc-300">
          Add <code className="text-violet-300">VITE_FIREBASE_*</code> variables in Lovable → Project →
          Environment, then Publish. See <code className="text-violet-300">.env.example</code> in the repo.
        </p>
        <p className="text-xs text-zinc-500">
          Project: vybe-daaab · Production: vybehub.app
        </p>
      </div>
    </div>
  );
}
