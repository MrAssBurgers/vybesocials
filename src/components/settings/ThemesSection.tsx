import { useState } from 'react';
import { Layout, Brush } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeCustomizer } from './ThemeCustomizer';
import { ThemeGallery } from './ThemeGallery';
import { ThemeMarketplace } from './ThemeMarketplace';
import { UIBuilderWizard } from './UIBuilderWizard';
import { AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ThemesSection() {
  const [showUIBuilder, setShowUIBuilder] = useState(false);

  return (
    <>
      <div className="space-y-6">
        <Tabs defaultValue="customize" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="customize" className="text-xs">
              <Brush className="h-3 w-3 mr-1" />
              Customize
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="text-xs">
              Browse
            </TabsTrigger>
            <TabsTrigger value="gallery" className="text-xs">
              My Themes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customize" className="space-y-4">
            <ThemeCustomizer />
            
            {/* UI Builder Wizard Button */}
            <div className="space-y-1">
              <Button 
                className="w-full"
                variant="outline"
                onClick={() => setShowUIBuilder(true)}
              >
                <Layout className="w-4 h-4 mr-2" />
                Customize UI (Layout + Tabs)
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">
                Reorder home sections, choose which bottom-bar tabs appear, and more.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="marketplace">
            <ThemeMarketplace />
          </TabsContent>

          <TabsContent value="gallery">
            <ThemeGallery />
          </TabsContent>
        </Tabs>
      </div>

      {/* UI Builder Wizard Overlay */}
      <AnimatePresence>
        {showUIBuilder && (
          <UIBuilderWizard onClose={() => setShowUIBuilder(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
