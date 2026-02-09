import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FONT_PAIRINGS, FontPairingKey, loadGoogleFonts } from '@/hooks/useApplyThemeFonts';

interface FontSelectorProps {
  selectedFont: FontPairingKey | null;
  onSelect: (font: FontPairingKey) => void;
}

export function FontSelector({ selectedFont, onSelect }: FontSelectorProps) {
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());

  // Preload fonts when component mounts
  useEffect(() => {
    const allFonts = Object.values(FONT_PAIRINGS).flatMap(p => [p.body, p.display]);
    const uniqueFonts = [...new Set(allFonts)];
    
    // Load fonts in batches
    const loadFonts = async () => {
      for (let i = 0; i < uniqueFonts.length; i += 4) {
        const batch = uniqueFonts.slice(i, i + 4);
        try {
          await loadGoogleFonts(batch);
          setLoadedFonts(prev => new Set([...prev, ...batch]));
        } catch (error) {
          console.error('Failed to load fonts:', error);
        }
      }
    };
    
    loadFonts();
  }, []);

  const fontEntries = Object.entries(FONT_PAIRINGS) as [FontPairingKey, typeof FONT_PAIRINGS[FontPairingKey]][];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Type className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Choose Your Typography</h3>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto overscroll-contain pr-1">
        {fontEntries.map(([key, pairing], index) => {
          const isSelected = selectedFont === key;
          const isLoaded = loadedFonts.has(pairing.body);
          
          return (
            <motion.button
              key={key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => onSelect(key)}
              className={cn(
                "relative p-3 rounded-xl text-left transition-all duration-200",
                "border-2 flex flex-col gap-1",
                isSelected 
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                  : "border-border bg-card/50 hover:border-primary/50"
              )}
            >
              {/* Preview text with actual font */}
              <div 
                className="text-lg font-bold text-foreground leading-tight truncate"
                style={{ 
                  fontFamily: isLoaded ? `'${pairing.display}', system-ui` : 'system-ui',
                  opacity: isLoaded ? 1 : 0.7,
                }}
              >
                Aa
              </div>
              
              {/* Font name */}
              <div 
                className="text-xs text-muted-foreground truncate"
                style={{ 
                  fontFamily: isLoaded ? `'${pairing.body}', system-ui` : 'system-ui',
                }}
              >
                {pairing.description}
              </div>
              
              {/* Selected indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                >
                  <Check className="h-3 w-3 text-primary-foreground" />
                </motion.div>
              )}
              
              {/* Loading indicator */}
              {!isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
