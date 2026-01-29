/**
 * Color Match Prompt Modal
 * 
 * Shows after user adds a background image to ask if they want to match UI colors.
 * Only appears once per background change. Respects user's choice.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Palette, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExtractedColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

interface ColorMatchPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchColors: () => void;
  onKeepColors: () => void;
  extractedColors?: ExtractedColors | null;
}

export function ColorMatchPrompt({
  isOpen,
  onClose,
  onMatchColors,
  onKeepColors,
  extractedColors,
}: ColorMatchPromptProps) {
  if (!isOpen) return null;

  const handleMatchColors = () => {
    onMatchColors();
    onClose();
  };

  const handleKeepColors = () => {
    onKeepColors();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={handleKeepColors}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
          
          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm liquid-glass border border-primary/20 rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleKeepColors}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Content */}
            <div className="text-center">
              {/* Icons */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <ImageIcon className="h-7 w-7 text-primary" />
                </div>
                <div className="text-muted-foreground">→</div>
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <Palette className="h-7 w-7 text-accent" />
                </div>
              </div>

              {/* Color Preview */}
              {extractedColors && (
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div 
                    className="w-8 h-8 rounded-full border-2 border-white/20 shadow-lg"
                    style={{ backgroundColor: `hsl(${extractedColors.primary})` }}
                    title="Primary"
                  />
                  <div 
                    className="w-8 h-8 rounded-full border-2 border-white/20 shadow-lg"
                    style={{ backgroundColor: `hsl(${extractedColors.secondary})` }}
                    title="Secondary"
                  />
                  <div 
                    className="w-8 h-8 rounded-full border-2 border-white/20 shadow-lg"
                    style={{ backgroundColor: `hsl(${extractedColors.accent})` }}
                    title="Accent"
                  />
                </div>
              )}

              {/* Text */}
              <h3 className="text-lg font-bold text-foreground mb-2">
                Match your UI colors?
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                We extracted colors from your background. Would you like to update your theme colors to match?
              </p>

              {/* Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={handleMatchColors}
                  className="w-full h-11 font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90"
                >
                  <Palette className="h-4 w-4 mr-2" />
                  Match Colors
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleKeepColors}
                  className="w-full h-10 text-muted-foreground hover:text-foreground"
                >
                  Keep My Colors
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
