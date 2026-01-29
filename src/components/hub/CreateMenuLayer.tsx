import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Drawer as DrawerPrimitive } from "vaul";
import { Camera, Image, Sparkles, X, Zap } from "lucide-react";

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

const NAV_CLEARANCE_PX = 72;

type Action = "post" | "camera" | "hub";

export function CreateMenuLayer({ open, onOpenChange }: CreateMenuLayerProps) {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const [showHub, setShowHub] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
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
        label: "Create Post",
        description: "Share a photo or video",
        gradient: "from-rose-500 via-pink-500 to-fuchsia-500",
      },
      {
        id: "camera" as const,
        icon: Camera,
        label: "Camera",
        description: "Capture a moment",
        gradient: "from-cyan-500 via-blue-500 to-indigo-500",
      },
      {
        id: "hub" as const,
        icon: Sparkles,
        label: "VYBE Hub",
        description: "Marketplace, Events & More",
        gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
      },
    ],
    [],
  );

  // FAILSAFE: if open but surface is covered/offscreen, remount layer.
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

      const cx = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
      const cy = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
      const topEl = document.elementFromPoint(cx, cy);
      const covered = !!topEl && !el.contains(topEl);

      if (!inViewport || covered) {
        recoverAttemptsRef.current += 1;
        console.warn(
          "[CreateMenu] Open but not visible/covered; forcing root-layer remount",
          { inViewport, covered, attempts: recoverAttemptsRef.current },
        );

        // Force remount to recover.
        setRenderKey((k) => k + 1);

        // If it still fails twice, close to avoid locked/dimmed state.
        if (recoverAttemptsRef.current >= 2) {
          onOpenChange(false);
        }
      }
    }, 350);

    return () => window.clearTimeout(t);
  }, [open, onOpenChange]);

  const content = (
    <>
      {/* Nested modals/fullscreen */}
      <VYBEHub isOpen={showHub} onClose={() => setShowHub(false)} />
      {showCamera && <CameraComponent onClose={() => setShowCamera(false)} />}

      {isMobileOrTablet ? (
        <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
          <DrawerPrimitive.Portal>
            <DrawerPrimitive.Overlay
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
              style={{ zIndex: Z.overlay }}
            />

            <DrawerPrimitive.Content
              key={renderKey}
              className="fixed inset-x-0 rounded-t-3xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden"
              style={{
                zIndex: Z.surface,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + ${NAV_CLEARANCE_PX}px)`,
                maxHeight: "80vh",
              }}
            >
              {/* Grab handle */}
              <div className="px-4 pt-3">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-muted" />
              </div>

              <div
                ref={surfaceRef}
                data-create-menu-surface
                className="p-5"
              >
                {/* Header */}
                <div className="text-center mb-5">
                  <div className="inline-flex items-center gap-2 mb-2">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <Zap className="w-5 h-5 text-primary" />
                    </motion.div>
                    <h2 className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      Create
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground">What do you want to share?</p>
                </div>

                {/* Items */}
                <div className="space-y-3">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleAction(item.id)}
                      className="w-full p-4 rounded-2xl bg-muted/50 hover:bg-muted/80 border border-border/30 hover:border-border/50 flex items-center gap-4 transition-colors group"
                    >
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}
                      >
                        <item.icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="text-left flex-1">
                        <span className="font-semibold text-base block group-hover:text-primary transition-colors">
                          {item.label}
                        </span>
                        <span className="text-sm text-muted-foreground">{item.description}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={close}
                  className="w-full mt-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </DrawerPrimitive.Content>
          </DrawerPrimitive.Portal>
        </DrawerPrimitive.Root>
      ) : (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                style={{ zIndex: Z.overlay }}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                key={renderKey}
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 350, mass: 0.8 }}
                className="fixed left-1/2 top-1/2 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                style={{ zIndex: Z.surface }}
              >
                {/* Glow */}
                <div className="absolute -inset-4 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/30 rounded-[40px] blur-2xl opacity-60" />

                <div
                  ref={surfaceRef}
                  data-create-menu-surface
                  className="relative bg-card/95 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl overflow-hidden"
                >
                  <div className="absolute inset-0 rounded-3xl p-px bg-gradient-to-br from-primary/50 via-transparent to-accent/50 pointer-events-none" />

                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 mb-2">
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      >
                        <Zap className="w-5 h-5 text-primary" />
                      </motion.div>
                      <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Create
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">What do you want to share?</p>
                  </div>

                  <div className="space-y-3">
                    {menuItems.map((item) => (
                      <motion.button
                        key={item.id}
                        onClick={() => handleAction(item.id)}
                        whileTap={{ scale: 0.97 }}
                        whileHover={{ scale: 1.02, x: 4 }}
                        className="w-full p-4 rounded-2xl bg-muted/50 hover:bg-muted/80 border border-border/30 hover:border-border/50 flex items-center gap-4 transition-colors group"
                      >
                        <motion.div
                          whileHover={{ rotate: [0, -10, 10, 0] }}
                          transition={{ duration: 0.4 }}
                          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}
                        >
                          <item.icon className="h-6 w-6 text-white" />
                        </motion.div>
                        <div className="text-left flex-1">
                          <span className="font-semibold text-base block group-hover:text-primary transition-colors">
                            {item.label}
                          </span>
                          <span className="text-sm text-muted-foreground">{item.description}</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>

                  <motion.button
                    onClick={close}
                    whileTap={{ scale: 0.95 }}
                    className="w-full mt-5 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  );

  // NOTE: Dialog/Drawer primitives already portal to document.body.
  return content;
}
