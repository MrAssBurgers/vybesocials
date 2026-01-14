import { motion } from 'framer-motion';
import { Palette, Sparkles } from 'lucide-react';
import { DesignYourVybe } from './DesignYourVybe';
import { ThemeGallery } from './ThemeGallery';

export function ThemesSection() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6 bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10"
      >
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
      </motion.div>

      {/* Design Your Own */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <DesignYourVybe />
      </motion.div>
      
      {/* Theme Gallery */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <ThemeGallery />
      </motion.div>
    </div>
  );
}
