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
              transition={{ duration: 0.15 }}
              className="fixed left-0 right-0 top-0 bg-background/40 backdrop-blur-sm backdrop-brightness-75"
              style={{
                zIndex: Z.overlay,
                bottom: navClearancePx
                  ? `calc(env(safe-area-inset-bottom, 0px) + ${navClearancePx}px)`
                  : "0px",
              }}
              onClick={close}
            />

            {/* Centered popup */}
            <motion.div
              ref={surfaceRef}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ zIndex: Z.surface }}
            >
              {/* Clean card popup */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/40 shadow-2xl min-w-[240px]">
                <p className="text-sm font-medium text-center text-muted-foreground mb-1">
                  Create
                </p>
                {menuItems.map((item) => (
                  <motion.button
                    key={item.id}
                    onClick={() => handleAction(item.id)}
                    whileTap={{ scale: 0.97 }}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-md`}
                    >
                      <item.icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>,
    portalTarget,
  );
}
