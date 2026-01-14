import { Palette } from 'lucide-react';
import { DesignYourVybe } from './DesignYourVybe';
import { ThemeGallery } from './ThemeGallery';

export function ThemesSection() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="liquid-glass-card p-4 sm:p-6 bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
            <Palette className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Custom Themes</h3>
            <p className="text-sm text-muted-foreground">
              Create your own unique theme with AI or browse themes shared by the community
            </p>
          </div>
        </div>
      </div>

      {/* Design Your Own */}
      <DesignYourVybe />
      
      {/* Theme Gallery */}
      <ThemeGallery />
    </div>
  );
}
