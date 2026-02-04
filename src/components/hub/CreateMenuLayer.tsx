import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image, Zap } from "lucide-react";
import { VybeMiniIcon } from "@/components/ui/VybeMiniIcon";

import { triggerHaptic } from "@/lib/haptics";
import { playSound } from "@/lib/sounds";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { VYBEHub } from "./VYBEHub";
import { Camera as CameraComponent } from "@/components/camera";

interface CreateMenuLayerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Z = {
  overlay: 9998,
  surface: 9999,
} as const;

type Action = "post" | "camera" | "hub";

export function CreateMenuLayer({ open, onOpenChange }: CreateMenuLayerProps) {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const [showHub, setShowHub] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const recoverAttemptsRef = useRef(0);

  const close = () => onOpenChange(false);

  const handleAction = (action: Action) => {
    triggerHaptic("medium");
    playSound("pop");

    close();
    switch (action) {
      case "post":
        navigate("/upload");
        return;
      case "camera":
        setShowCamera(true);
        return;
      case "hub":
        setShowHub(true);
        return;
    }
  };

  const menuItems = useMemo(
    () => [
      {
        id: "post" as const,
        icon: Image,
        label: "Post",
        subtitle: "Share media",
        gradient: "from-primary via-accent to-primary",
      },
      {
        id: "camera" as const,
        icon: Camera,
        label: "Camera",
        subtitle: "Capture moment",
        gradient: "from-accent via-primary to-accent",
      },
      {
        id: "hub" as const,
        icon: Zap, // Using Zap since VybeMiniIcon is a component, not a Lucide icon
        label: "Hub",
        subtitle: "Create more",
        gradient: "from-primary via-accent to-primary",
      },
    ],
    [],
  );

  // FAILSAFE: if open but surface is covered/offscreen, close to avoid locked state
  useEffect(() => {
    if (!open) {
      recoverAttemptsRef.current = 0;
      return;
    }

    const t = window.setTimeout(() => {
      const el = surfaceRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const inViewport = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;

      if (!inViewport) {
        recoverAttemptsRef.current += 1;
        console.warn("[CreateMenu] Open but not visible; closing", { attempts: recoverAttemptsRef.current });
        if (recoverAttemptsRef.current >= 2) {
          onOpenChange(false);
        }
      }
    }, 350);

    return () => window.clearTimeout(t);
  }, [open, onOpenChange]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <>
      {/* Nested modals/fullscreen */}
      <VYBEHub isOpen={showHub} onClose={() => setShowHub(false)} />
      {showCamera && <CameraComponent onClose={() => setShowCamera(false)} />}

      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-xl"
              style={{ zIndex: Z.overlay }}
              onClick={close}
            />

            {/* Centered container */}
            <div 
              className="fixed inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: Z.surface }}
            >
              {/* High-tech popup */}
              <motion.div
                ref={surfaceRef}
                initial={{ opacity: 0, scale: 0.85, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 400 }}
                className="pointer-events-auto"
              >
                {/* Outer glow ring */}
                <div className="relative">
                  {/* Animated gradient border */}
                  <motion.div 
                    className="absolute -inset-[2px] rounded-[28px] bg-gradient-to-r from-primary via-accent to-primary opacity-60 blur-sm"
                    animate={{ 
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    style={{ backgroundSize: "200% 200%" }}
                  />
                  
                  {/* Main card */}
                  <div className="relative flex flex-col gap-4 p-6 rounded-3xl min-w-[320px] overflow-hidden bg-card/95 backdrop-blur-2xl border border-border/50">
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
                        <Zap className="w-4 h-4 text-primary" />
                      </motion.div>
                      <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
                        Create
                      </span>
                      <motion.div
                        animate={{ rotate: -360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                      >
                        <Zap className="w-4 h-4 text-primary" />
                      </motion.div>
                    </div>
                    
                    {/* Menu items */}
                    <div className="relative z-10 flex flex-col gap-2">
                      {menuItems.map((item, index) => (
                        <motion.button
                          key={item.id}
                          onClick={() => handleAction(item.id)}
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.08, type: "spring", stiffness: 300 }}
                          whileTap={{ scale: 0.98 }}
                          whileHover={{ scale: 1.02, x: 4 }}
                          className="group relative flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 hover:border-primary/30 transition-all duration-300 overflow-hidden"
                        >
                          {/* Hover glow */}
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          
                          {/* Icon */}
                          <div className="relative">
                            <motion.div
                              whileHover={{ rotate: [0, -10, 10, 0] }}
                              transition={{ duration: 0.4 }}
                              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} p-[1px]`}
                            >
                              <div className="w-full h-full rounded-xl bg-card/80 flex items-center justify-center backdrop-blur-sm">
                                <item.icon className="h-5 w-5 text-primary" />
                              </div>
                            </motion.div>
                            {/* Icon pulse */}
                            <motion.div 
                              className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-40 blur-md transition-opacity`}
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            />
                          </div>
                          
                          {/* Text */}
                          <div className="flex flex-col items-start flex-1 min-w-0">
                            <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {item.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.subtitle}
                            </span>
                          </div>
                          
                          {/* Arrow */}
                          <motion.div 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            initial={{ x: -5 }}
                            whileHover={{ x: 0 }}
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </motion.div>
                        </motion.button>
                      ))}
                    </div>
                    
                    {/* Bottom accent */}
                    <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>,
    portalTarget,
  );
}
