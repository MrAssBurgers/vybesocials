import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

// Smooth fade-up transition for page content
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        duration: 0.2,
        ease: [0.25, 0.1, 0.25, 1], // Custom easing for smooth feel
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Section transition for staggered content loading
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Card hover animation wrapper
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
      whileHover={{ scale, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// List item stagger animation
export function StaggerList({ 
  children, 
  className,
  staggerDelay = 0.05,
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
          },
        },
      }}
      className={className}
    >
      {children.map((child, index) => (
        <motion.div
          key={index}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.2 }}
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
