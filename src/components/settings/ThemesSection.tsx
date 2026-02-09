import { useState } from 'react';
import { Layout, Brush, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeCustomizer } from './ThemeCustomizer';
import { ThemeGallery } from './ThemeGallery';
import { ThemeMarketplace } from './ThemeMarketplace';
import { UIBuilder } from './UIBuilder';
import { AIVybeDesigner } from '@/components/onboarding/AIVybeDesigner';
import { AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ThemesSection() {
  const [showUIBuilder, setShowUIBuilder] = useState(false);
  const [showVybeDesigner, setShowVybeDesigner] = useState(false);

  return (
    <>
      <div className="space-y-6">
        {/* Design Your Own VYBE Button - Prominent at top with solid background */}
        <Button 
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base shadow-lg shadow-primary/20"
          onClick={() => setShowVybeDesigner(true)}
        >
          <Wand2 className="w-5 h-5 mr-2" />
          Design Your Own VYBE
        </Button>

        <Tabs defaultValue="customize" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 bg-muted/60">
            <TabsTrigger value="customize" className="text-xs text-foreground data-[state=active]:text-foreground data-[state=active]:bg-background">
              <Brush className="h-3 w-3 mr-1" />
              Customize
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="text-xs text-foreground data-[state=active]:text-foreground data-[state=active]:bg-background">
              Browse
            </TabsTrigger>
            <TabsTrigger value="gallery" className="text-xs text-foreground data-[state=active]:text-foreground data-[state=active]:bg-background">
              My Themes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customize" className="space-y-4">
            <ThemeCustomizer />
            
            {/* UI Builder Button - solid background */}
            <Button 
              className="w-full bg-card hover:bg-accent border border-border text-foreground"
              variant="outline"
              onClick={() => setShowUIBuilder(true)}
            >
              <Layout className="w-4 h-4 mr-2" />
              Design Your Layout
            </Button>
          </TabsContent>

          <TabsContent value="marketplace">
            <ThemeMarketplace />
          </TabsContent>

          <TabsContent value="gallery">
            <ThemeGallery />
          </TabsContent>
        </Tabs>
      </div>

      {/* UI Builder Overlay */}
      <AnimatePresence>
        {showUIBuilder && (
          <UIBuilder onClose={() => setShowUIBuilder(false)} />
        )}
      </AnimatePresence>

      {/* VYBE Designer Overlay */}
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
