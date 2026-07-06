import { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Brush, Sparkles, Compass, Wand2 } from 'lucide-react';
import { ThemeCustomizer } from './ThemeCustomizer';
import { MyCurrentVybeCard } from '@/components/themes/MyCurrentVybeCard';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppErrorFallback } from '@/components/error/AppErrorFallback';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy + mount-on-demand — Radix TabsContent forceMount was loading Browse/Mine
// in the background and crashing the whole settings page on bad theme rows.
const ThemeMarketplace = lazy(() =>
  import('./ThemeMarketplace').then((m) => ({ default: m.ThemeMarketplace })),
);
const ThemeGallery = lazy(() =>
  import('./ThemeGallery').then((m) => ({ default: m.ThemeGallery })),
);
const AIVybeDesigner = lazy(() =>
  import('@/components/onboarding/AIVybeDesigner').then((m) => ({ default: m.AIVybeDesigner })),
);

type ThemesTab = 'customize' | 'marketplace' | 'gallery';

const TAB_ITEMS: { id: ThemesTab; label: string; icon: typeof Brush }[] = [
  { id: 'customize', label: 'Customize', icon: Brush },
  { id: 'marketplace', label: 'Browse', icon: Compass },
  { id: 'gallery', label: 'Mine', icon: Sparkles },
];

function ThemesTabFallback() {
  return (
    <div className="space-y-3 mt-5">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

export function ThemesSection() {
  const [showVybeDesigner, setShowVybeDesigner] = useState(false);
  const [activeTab, setActiveTab] = useState<ThemesTab>('customize');

  return (
    <>
      <div className="space-y-5">
        <MyCurrentVybeCard />

        {/* Primary CTA — animated aurora sheen */}
        <motion.button
          type="button"
          onClick={() => setShowVybeDesigner(true)}
          whileTap={{ scale: 0.98 }}
          className="relative w-full h-[3.75rem] rounded-2xl overflow-hidden shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.55)] group"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] animate-[gradient-x_4s_ease_infinite]"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: 'radial-gradient(circle at 30% 50%, hsl(var(--foreground) / 0.15), transparent 55%)',
            }}
          />
          <div className="relative z-10 flex items-center justify-center gap-2.5 h-full px-4 text-primary-foreground font-bold text-base tracking-tight">
            <Wand2 className="w-5 h-5 drop-shadow-sm" />
            Design Your Own VYBE
            <Sparkles className="w-4 h-4 opacity-80" />
          </div>
        </motion.button>

        <div className="w-full">
          <div className="grid w-full grid-cols-3 h-12 p-1 rounded-2xl bg-secondary/50 backdrop-blur-sm border border-border/30">
            {TAB_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors',
                  activeTab === id
                    ? 'bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/25 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-foreground/5',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <ErrorBoundary
            scope="settings:themes-tab"
            fallback={(reset) => (
              <AppErrorFallback
                compact
                title="Couldn't load this tab"
                description="Try again — the rest of settings still works."
                onRetry={reset}
              />
            )}
          >
            <div className="mt-5">
              {activeTab === 'customize' && (
                <div className="space-y-4">
                  <ThemeCustomizer />
                </div>
              )}
              {activeTab === 'marketplace' && (
                <Suspense fallback={<ThemesTabFallback />}>
                  <ThemeMarketplace />
                </Suspense>
              )}
              {activeTab === 'gallery' && (
                <Suspense fallback={<ThemesTabFallback />}>
                  <ThemeGallery />
                </Suspense>
              )}
            </div>
          </ErrorBoundary>
        </div>
      </div>

      <AnimatePresence>
        {showVybeDesigner && (
          <Suspense fallback={null}>
            <AIVybeDesigner
              interests={[]}
              onComplete={() => setShowVybeDesigner(false)}
              onSkip={() => setShowVybeDesigner(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}
