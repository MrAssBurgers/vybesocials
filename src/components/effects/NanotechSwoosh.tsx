import { motion } from 'framer-motion';

interface NanotechSwooshProps {
  primaryColor: string;
  accentColor: string;
  calm: boolean;
  duration: number;
}

/** A single composited glow; preferences and lifetime belong to the provider. */
export function NanotechSwoosh({ primaryColor, accentColor, calm, duration }: NanotechSwooshProps) {
  return (
    <motion.div
      aria-hidden="true"
      data-theme-transition={calm ? 'calm' : 'normal'}
      className="fixed inset-0 z-[100] pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at 50% 25%, hsl(${primaryColor} / 0.22), hsl(${accentColor} / 0.1) 35%, transparent 70%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, calm ? 0.45 : 1, 0] }}
      transition={{ duration: duration / 1000, times: [0, 0.25, 1], ease: 'easeOut' }}
    />
  );
}
