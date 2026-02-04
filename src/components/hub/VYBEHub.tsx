import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Calendar, X, Shield, Users, Sparkles } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { useUserRole } from '@/hooks/useModeration';

interface VYBEHubProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VYBEHub({ isOpen, onClose }: VYBEHubProps) {
  const navigate = useNavigate();
  const { data: userRole } = useUserRole();
  const isModOrAdmin = userRole === 'admin' || userRole === 'moderator';

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    playSound('tap');
    onClose();
    navigate(path);
  };

  const menuItems = [
    { 
      path: '/market', 
      icon: ShoppingBag, 
      label: 'Marketplace', 
      description: 'Buy & sell with friends',
      gradient: 'from-primary via-accent to-primary'
    },
    { 
      path: '/events', 
      icon: Calendar, 
      label: 'Community Events', 
      description: "Discover what's happening",
      gradient: 'from-accent via-primary to-accent'
    },
    { 
      path: '/community', 
      icon: Users, 
      label: 'Communities', 
      description: 'Discord-style servers',
      gradient: 'from-primary via-accent to-primary'
    },
  ];

  const adminItem = {
    path: '/admin',
    icon: Shield,
    label: 'Admin Panel',
    description: 'Manage & moderate',
    gradient: 'from-destructive via-primary to-destructive'
  };

  // Unified animation config for all items
  const itemAnimation = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Centered container */}
          <div 
            className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none"
          >
            {/* High-tech popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 5 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="pointer-events-auto"
              style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
            >
              {/* Outer glow ring */}
              <div className="relative">
                {/* Static gradient border - no animation for performance */}
                <div 
                  className="absolute -inset-[2px] rounded-[28px] bg-gradient-to-r from-primary via-accent to-primary opacity-50 blur-sm"
                />
                
                {/* Main card */}
                <div className="relative flex flex-col gap-4 p-6 rounded-3xl min-w-[340px] overflow-hidden bg-card/95 backdrop-blur-2xl border border-border/50">
                  {/* Inner glow effects */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
                  <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                  
                  {/* Scanline effect */}
                  <div 
                    className="absolute inset-0 pointer-events-none opacity-[0.02]"
                    style={{
                      backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)",
                    }}
                  />
                  
                  {/* Top accent line */}
                  <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  
                  {/* Header */}
                  <div className="relative z-10 flex items-center justify-center gap-2 mb-2">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles className="w-4 h-4 text-primary" />
                    </motion.div>
                    <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
                      VYBE Hub
                    </span>
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles className="w-4 h-4 text-primary" />
                    </motion.div>
                  </div>
                  
                  {/* Menu items */}
                  <div className="relative z-10 flex flex-col gap-2">
                    {menuItems.map((item, index) => (
                      <motion.button
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          delay: 0.05 + index * 0.03, 
                          duration: 0.2, 
                          ease: [0.25, 0.1, 0.25, 1] 
                        }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 hover:border-primary/30 transition-colors duration-150 overflow-hidden"
                        style={{ transform: 'translateZ(0)' }}
                      >
                        {/* Hover glow */}
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        
                        {/* Icon */}
                        <div className="relative">
                          <div
                            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} p-[1px] group-hover:scale-105 transition-transform duration-150`}
                            style={{ transform: 'translateZ(0)' }}
                          >
                            <div className="w-full h-full rounded-xl bg-card/80 flex items-center justify-center backdrop-blur-sm">
                              <item.icon className="h-5 w-5 text-primary" />
                            </div>
                          </div>
                          {/* Subtle hover glow */}
                          <div 
                            className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-30 blur-md transition-opacity duration-150`}
                          />
                        </div>
                        
                        {/* Text */}
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-150">
                            {item.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </div>
                        
                        {/* Arrow */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </motion.button>
                    ))}

                    {/* Admin Panel - Only visible to admins/mods - SAME animation as others */}
                    {isModOrAdmin && (
                      <motion.button
                        onClick={() => handleNavigate(adminItem.path)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          delay: 0.05 + menuItems.length * 0.03, 
                          duration: 0.2, 
                          ease: [0.25, 0.1, 0.25, 1] 
                        }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 hover:border-destructive/30 transition-colors duration-150 overflow-hidden"
                        style={{ transform: 'translateZ(0)' }}
                      >
                        {/* Hover glow */}
                        <div className="absolute inset-0 bg-gradient-to-r from-destructive/0 via-destructive/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        
                        {/* Icon */}
                        <div className="relative">
                          <div
                            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${adminItem.gradient} p-[1px] group-hover:scale-105 transition-transform duration-150`}
                            style={{ transform: 'translateZ(0)' }}
                          >
                            <div className="w-full h-full rounded-xl bg-card/80 flex items-center justify-center backdrop-blur-sm">
                              <adminItem.icon className="h-5 w-5 text-destructive" />
                            </div>
                          </div>
                          {/* Subtle hover glow */}
                          <div 
                            className={`absolute inset-0 rounded-xl bg-gradient-to-br ${adminItem.gradient} opacity-0 group-hover:opacity-30 blur-md transition-opacity duration-150`}
                          />
                        </div>
                        
                        {/* Text */}
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span className="text-sm font-semibold text-foreground group-hover:text-destructive transition-colors duration-150">
                            {adminItem.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {adminItem.description}
                          </span>
                        </div>
                        
                        {/* Arrow */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <div className="w-8 h-8 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </motion.button>
                    )}
                  </div>
                  
                  {/* Close button */}
                  <motion.button
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    onClick={onClose}
                    className="relative z-10 mt-2 p-3 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center justify-center gap-2"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <X className="h-4 w-4" />
                    <span className="text-sm">Close</span>
                  </motion.button>
                  
                  {/* Bottom accent */}
                  <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
