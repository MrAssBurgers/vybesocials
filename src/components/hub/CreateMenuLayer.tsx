import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image, Sparkles } from "lucide-react";

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
        gradient: "from-neon-pink to-neon-purple",
      },
      {
        id: "camera" as const,
        icon: Camera,
        label: "Camera",
        gradient: "from-neon-cyan to-neon-purple",
      },
      {
        id: "hub" as const,
        icon: Sparkles,
        label: "Hub",
        gradient: "from-neon-purple to-neon-pink",
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

  // Keep the Create button tappable to toggle-close on mobile/tablet.
  const navClearancePx = isMobileOrTablet ? 90 : 0;

  return createPortal(
    <>
      {/* Nested modals/fullscreen */}
      <VYBEHub isOpen={showHub} onClose={() => setShowHub(false)} />
      {showCamera && <CameraComponent onClose={() => setShowCamera(false)} />}

      <AnimatePresence>
        {open && (
          <>
            {/* Overlay - clicking closes menu */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
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
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="pointer-events-auto"
              >
                {/* Futuristic glass card - BIGGER */}
                <div className="relative flex flex-col gap-3 p-8 rounded-3xl min-w-[340px] overflow-hidden">
                  {/* Glass background layers */}
                  <div className="absolute inset-0 bg-gradient-to-br from-card/90 via-card/80 to-card/70 backdrop-blur-2xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-accent/5" />
                  
                  {/* Animated border glow */}
                  <div className="absolute inset-0 rounded-3xl border border-foreground/10" />
                  <div className="absolute inset-0 rounded-3xl shadow-[0_0_60px_-10px] shadow-primary/30" />
                  
                  {/* Top shine line */}
                  <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <p className="text-sm font-semibold tracking-widest uppercase text-center text-muted-foreground/70 mb-5">
                      Create
                    </p>
                    
                    <div className="flex flex-col gap-3">
                      {menuItems.map((item, index) => (
                        <motion.button
                          key={item.id}
                          onClick={() => handleAction(item.id)}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          whileTap={{ scale: 0.97 }}
                          whileHover={{ x: 4 }}
                          className="group flex items-center gap-5 p-4 rounded-2xl bg-foreground/5 hover:bg-foreground/10 border border-foreground/5 hover:border-foreground/10 transition-all duration-200"
                        >
                          {/* Icon container with glow */}
                          <div className="relative">
                            <div
                              className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}
                            >
                              <item.icon className="h-6 w-6 text-primary-foreground" />
                            </div>
                            {/* Icon glow effect */}
                            <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${item.gradient} blur-lg opacity-30 group-hover:opacity-50 transition-opacity`} />
                          </div>
                          
                          <div className="flex flex-col items-start">
                            <span className="text-base font-semibold text-foreground">
                              {item.label}
                            </span>
                            <span className="text-sm text-muted-foreground/60">
                              {item.id === 'post' && 'Share media'}
                              {item.id === 'camera' && 'Capture moment'}
                              {item.id === 'hub' && 'Create more'}
                            </span>
                          </div>
                          
                          {/* Arrow indicator */}
                          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
                              <svg className="w-4 h-4 text-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
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
