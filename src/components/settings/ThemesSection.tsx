import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layout, Brush, Sparkles, Compass, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeCustomizer } from './ThemeCustomizer';
import { ThemeGallery } from './ThemeGallery';
import { ThemeMarketplace } from './ThemeMarketplace';
import { UIBuilder } from './UIBuilder';
import { AIVybeDesigner } from '@/components/onboarding/AIVybeDesigner';
import { MyCurrentVybeCard } from '@/components/themes/MyCurrentVybeCard';
import { AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ThemesSection() {
  const [showUIBuilder, setShowUIBuilder] = useState(false);
  const [showVybeDesigner, setShowVybeDesigner] = useState(false);

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

        <Tabs defaultValue="customize" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12 p-1 rounded-2xl">
            <TabsTrigger
              value="customize"
              className="rounded-xl text-xs gap-1.5 data-[state=active]:shadow-sm"
            >
              <Brush className="h-3.5 w-3.5" />
              Customize
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="rounded-xl text-xs gap-1.5">
              <Compass className="h-3.5 w-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="gallery" className="rounded-xl text-xs gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Mine
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customize" className="space-y-4 mt-5">
            <ThemeCustomizer />

            <Button
              variant="outline"
              onClick={() => setShowUIBuilder(true)}
              className="w-full h-12 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 hover:bg-accent/10 hover:border-primary/40 transition-colors"
            >
              <Layout className="w-4 h-4 mr-2" />
              Design Your Layout
            </Button>
          </TabsContent>

          <TabsContent value="marketplace" className="mt-5">
            <ThemeMarketplace />
          </TabsContent>

          <TabsContent value="gallery" className="mt-5">
            <ThemeGallery />
          </TabsContent>
        </Tabs>
      </div>

      <AnimatePresence>
        {showUIBuilder && <UIBuilder onClose={() => setShowUIBuilder(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showVybeDesigner && (
          <AIVybeDesigner
            interests={[]}
            onComplete={() => setShowVybeDesigner(false)}
            onSkip={() => setShowVybeDesigner(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
