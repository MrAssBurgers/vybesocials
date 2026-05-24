import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Nfc, Loader2, Check, X, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiquidBottomSheet } from '@/components/ui/glass/LiquidBottomSheet';
import { despiaWriteNFC } from '@/lib/despiaNFCv2';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';

type Phase = 'idle' | 'writing' | 'success' | 'error';

interface NFCWriteSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Value to write onto the tag — usually the user's friend-link URL. */
  value: string;
  title?: string;
  hint?: string;
}

/**
 * Bottom sheet for programming an NFC tag with a user-supplied value
 * (typically the user's friend-link URL). Uses the new Despia `nfc://write`
 * + `window.onNFCEvent` contract via `despiaWriteNFC`.
 */
export function NFCWriteSheet({
  isOpen,
  onClose,
  value,
  title = 'Program a tag',
  hint = 'Hold your phone near a blank NFC tag, ring, or sticker.',
}: NFCWriteSheetProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!isDespiaRuntime()) {
      toast.error('Writing NFC tags requires the VYBE app');
      return;
    }
    if (!value) {
      toast.error('Nothing to write');
      return;
    }
    setError(null);
    setPhase('writing');
    haptics.tap();
    const result = await despiaWriteNFC(value);
    if (result.ok) {
      haptics.success();
      setPhase('success');
      toast.success('Tag programmed');
      setTimeout(() => {
        onClose();
        setPhase('idle');
      }, 1400);
    } else if (result.dismissed) {
      setPhase('idle');
    } else {
      haptics.error();
      setError(result.error || 'Could not write tag');
      setPhase('error');
    }
  }, [value, onClose]);

  const handleClose = useCallback(() => {
    setPhase('idle');
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <LiquidBottomSheet isOpen={isOpen} onClose={handleClose} title={title} maxHeight={62}>
      <div className="px-5 pb-6 pt-2 flex flex-col items-center gap-5">
        <div className="relative h-32 w-32 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {phase === 'writing' && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={`ring-${i}`}
                    className="absolute inset-0 rounded-full border border-primary/50"
                    animate={{ scale: [0.5, 1.2], opacity: [0.7, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                ))}
                <motion.div
                  key="writing"
                  className="h-20 w-20 rounded-full bg-primary/15 flex items-center justify-center"
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                >
                  <Radio className="h-9 w-9 text-primary" />
                </motion.div>
              </>
            )}
            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_30px_hsl(var(--primary)/0.6)]"
              >
                <Check className="h-9 w-9 text-primary-foreground" strokeWidth={3} />
              </motion.div>
            )}
            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="h-20 w-20 rounded-full bg-destructive/15 flex items-center justify-center"
              >
                <X className="h-9 w-9 text-destructive" strokeWidth={3} />
              </motion.div>
            )}
            {phase === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-20 w-20 rounded-full bg-secondary/60 flex items-center justify-center"
              >
                <Nfc className="h-9 w-9 text-muted-foreground" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-base font-bold">
            {phase === 'writing' && 'Tap the tag now…'}
            {phase === 'success' && 'Tag programmed 🎉'}
            {phase === 'error' && 'Could not write'}
            {phase === 'idle' && 'Ready to program'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
            {phase === 'error' ? error : hint}
          </p>
        </div>

        {phase === 'writing' ? (
          <Button variant="outline" className="w-full rounded-full h-11" onClick={handleClose}>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancel
          </Button>
        ) : phase === 'success' ? null : (
          <Button
            className="w-full rounded-full h-11 bg-gradient-to-r from-primary to-accent text-primary-foreground"
            onClick={start}
          >
            <Nfc className="h-4 w-4 mr-2" /> {phase === 'error' ? 'Try again' : 'Start writing'}
          </Button>
        )}
      </div>
    </LiquidBottomSheet>
  );
}
