import { useState } from 'react';
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

        {/* Primary CTA — glass with subtle gradient sheen */}
        <Button
          onClick={() => setShowVybeDesigner(true)}
          className="w-full h-14 rounded-2xl font-semibold text-base bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground shadow-lg shadow-primary/25 border-0"
        >
          <Wand2 className="w-5 h-5 mr-2" />
          Design Your Own VYBE
        </Button>

        <Tabs defaultValue="customize" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12 p-1 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50">
            <TabsTrigger
              value="customize"
              className="rounded-xl text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Brush className="h-3.5 w-3.5" />
              Customize
            </TabsTrigger>
            <TabsTrigger
              value="marketplace"
              className="rounded-xl text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Compass className="h-3.5 w-3.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger
              value="gallery"
              className="rounded-xl text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
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
