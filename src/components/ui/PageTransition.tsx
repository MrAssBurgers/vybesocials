import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { liquidSpring } from '@/motion/liquidConfig';

const routeShellMotionStyle = {
  willChange: 'opacity' as const,
  backfaceVisibility: 'hidden' as const,
  transform: 'translateZ(0)',
};

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** Opacity-only route transition — no scale/position layout shifts. */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className={className}
      style={routeShellMotionStyle}
    >
      {children}
    </motion.div>
  );
}

// Section transition — opacity only on large sections
export function SectionTransition({ 
  children, 
  delay = 0,
  className,
}: { 
  children: ReactNode; 
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.12,
        delay,
      }}
      className={className}
      style={routeShellMotionStyle}
    >
      {children}
    </motion.div>
  );
}

// Card hover with liquid spring physics
export function CardHover({ 
  children, 
  className,
  scale = 1.01,
}: { 
  children: ReactNode; 
  className?: string;
  scale?: number;
}) {
  return (
    <motion.div
      whileHover={{ scale, y: -3 }}
      whileTap={{ scale: 0.96 }}
      transition={liquidSpring}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// List item stagger with liquid spring
export function StaggerList({ 
  children, 
  className,
  staggerDelay = 0.04,
}: { 
  children: ReactNode[]; 
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: 0.02,
          },
        },
      }}
      className={className}
    >
      {children.map((child, index) => (
        <motion.div
          key={index}
          variants={{
            hidden: { opacity: 0, y: 8, scale: 0.98 },
            visible: { opacity: 1, y: 0, scale: 1 },
          }}
          transition={liquidSpring}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

// Subtle pulse for drawing attention
export function AttentionPulse({ 
  children, 
  active = true,
  className,
}: { 
  children: ReactNode; 
  active?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      animate={active ? { 
        scale: [1, 1.02, 1],
        opacity: [1, 0.9, 1],
      } : undefined}
      transition={active ? { 
        duration: 2, 
        repeat: Infinity,
        ease: 'easeInOut',
      } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Smooth expand/collapse
export function ExpandTransition({ 
  children, 
  isExpanded,
  className,
}: { 
  children: ReactNode; 
  isExpanded: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={false}
      animate={{
        height: isExpanded ? 'auto' : 0,
        opacity: isExpanded ? 1 : 0,
      }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('overflow-hidden', className)}
    >
      {children}
    </motion.div>
  );
}
