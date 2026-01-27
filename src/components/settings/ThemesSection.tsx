import { useState } from 'react';
import { Palette, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignYourVybe } from './DesignYourVybe';
import { ThemeGallery } from './ThemeGallery';
import { ThemeMarketplace } from './ThemeMarketplace';
import { UIBuilder } from './UIBuilder';
import { AnimatePresence } from 'framer-motion';

export function ThemesSection() {
  const [showUIBuilder, setShowUIBuilder] = useState(false);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="liquid-glass-card p-4 sm:p-6 bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
              <Palette className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Custom Themes</h3>
              <p className="text-sm text-muted-foreground">
                Create your own unique theme with AI or browse themes shared by the community
              </p>
            </div>
          </div>
          
          {/* UI Builder Button */}
          <Button 
            className="w-full mt-4"
            variant="outline"
            onClick={() => setShowUIBuilder(true)}
          >
            <Layout className="w-4 h-4 mr-2" />
            Design Your Layout
          </Button>
        </div>

        {/* Design Your Own */}
        <DesignYourVybe />
        
        {/* Theme Marketplace */}
        <ThemeMarketplace />
        
        {/* Theme Gallery */}
        <ThemeGallery />
      </div>

      {/* UI Builder Overlay */}
      <AnimatePresence>
        {showUIBuilder && (
          <UIBuilder onClose={() => setShowUIBuilder(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
