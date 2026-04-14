import { useState } from 'react';
import { motion } from 'framer-motion';
import { Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const PROFILE_COLORS = [
  { id: 'violet', value: 'hsl(263, 70%, 50%)' },
  { id: 'fuchsia', value: 'hsl(292, 84%, 61%)' },
  { id: 'pink', value: 'hsl(330, 81%, 60%)' },
  { id: 'rose', value: 'hsl(350, 89%, 60%)' },
  { id: 'orange', value: 'hsl(25, 95%, 53%)' },
  { id: 'amber', value: 'hsl(38, 92%, 50%)' },
  { id: 'emerald', value: 'hsl(160, 84%, 39%)' },
  { id: 'cyan', value: 'hsl(188, 94%, 43%)' },
  { id: 'blue', value: 'hsl(217, 91%, 60%)' },
  { id: 'indigo', value: 'hsl(239, 84%, 67%)' },
  { id: 'slate', value: 'hsl(215, 16%, 47%)' },
  { id: 'neutral', value: 'hsl(0, 0%, 45%)' },
];

interface ProfileColorPickerProps {
  selectedColor?: string;
  onColorChange: (color: string) => void;
}

export function ProfileColorPicker({ selectedColor, onColorChange }: ProfileColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-semibold bg-foreground/5 border border-border/20 text-muted-foreground hover:bg-foreground/10 transition-colors"
      >
        <Palette className="h-3 w-3" />
        Theme
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="absolute top-full mt-2 right-0 z-50 p-3 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/30 shadow-xl"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Profile Color</p>
          <div className="grid grid-cols-6 gap-2">
            {PROFILE_COLORS.map((color) => (
              <button
                key={color.id}
                onClick={() => { onColorChange(color.value); setOpen(false); }}
                className="relative w-7 h-7 rounded-lg transition-transform hover:scale-110"
                style={{ backgroundColor: color.value }}
              >
                {selectedColor === color.value && (
                  <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
