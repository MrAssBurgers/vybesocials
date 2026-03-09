import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import type { VybeDNA } from '@/hooks/useVybeDNA';

const COLOR_NAMES = ['Primary', 'Secondary', 'Accent'];

export function DNAColorPalette({ dna }: { dna: VybeDNA }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyColor = async (color: string, idx: number) => {
    await navigator.clipboard.writeText(color);
    setCopiedIdx(idx);
    toast.success('Color copied!');
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Signature Palette</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Combined swatch strip */}
          <div className="h-14 rounded-xl overflow-hidden mb-4 flex">
            {dna.signature_colors.map((color, i) => (
              <motion.div
                key={i}
                className="flex-1 cursor-pointer relative group"
                style={{ backgroundColor: color }}
                whileHover={{ flex: 1.5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => copyColor(color, i)}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  {copiedIdx === i ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : (
                    <Copy className="h-4 w-4 text-white" />
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Color labels */}
          <div className="flex gap-3">
            {dna.signature_colors.map((color, i) => (
              <div key={i} className="flex-1 text-center">
                <p className="text-xs font-medium text-foreground">{COLOR_NAMES[i]}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{color}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
