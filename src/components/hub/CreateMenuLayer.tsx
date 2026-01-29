import { useEffect, useMemo, useRef, useState } from "react";
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
  overlay: 5000,
  surface: 5001,
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
        gradient: "from-rose-500 to-pink-500",
      },
      {
        id: "camera" as const,
        icon: Camera,
        label: "Camera",
        gradient: "from-cyan-500 to-blue-500",
      },
      {
        id: "hub" as const,
        icon: Sparkles,
        label: "Hub",
        gradient: "from-violet-500 to-purple-500",
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

  // Calculate position above bottom nav
  const bottomOffset = isMobileOrTablet ? 90 : 100; // px above bottom

  return (
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
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/40"
              style={{ zIndex: Z.overlay }}
              onClick={close}
            />

            {/* Compact centered popup */}
            <motion.div
              ref={surfaceRef}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 28, stiffness: 400 }}
              className="fixed left-1/2 -translate-x-1/2"
              style={{ 
                zIndex: Z.surface,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
              }}
            >
              {/* Compact pill menu */}
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl">
                {menuItems.map((item) => (
                  <motion.button
                    key={item.id}
                    onClick={() => handleAction(item.id)}
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/60 transition-colors min-w-[72px]"
                  >
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg`}
                    >
                      <item.icon className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-foreground/80">
                      {item.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
