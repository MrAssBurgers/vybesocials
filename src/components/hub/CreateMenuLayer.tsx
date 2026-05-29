import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image, Zap, ShoppingBag, Calendar, Users, Shield, X, ChevronLeft, BarChart3, Wrench, Clock, MapPin } from "lucide-react";
import { VybeMiniIcon } from "@/components/ui/VybeMiniIcon";

import { triggerHaptic } from "@/lib/haptics";
import { playSound } from "@/lib/sounds";
import { useIsMobileOrTablet } from "@/hooks/use-mobile";
import { useUserRole } from "@/hooks/useModeration";
import { Camera as CameraComponent } from "@/components/camera";

interface CreateMenuLayerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Z = {
  overlay: 9998,
  surface: 9999,
} as const;

type View = "create" | "hub" | "utilities";

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.04, type: "spring" as const, stiffness: 400, damping: 28 },
  }),
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.1 } },
  tap: { scale: 0.96, transition: { duration: 0.08 } },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

export function CreateMenuLayer({ open, onOpenChange }: CreateMenuLayerProps) {
  const navigate = useNavigate();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const [view, setView] = useState<View>("create");
  const [showCamera, setShowCamera] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const recoverAttemptsRef = useRef(0);
  const { data: userRole } = useUserRole();
  const isModOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'moderator';

  const close = useCallback(() => {
    onOpenChange(false);
    // Reset view after exit animation
    setTimeout(() => setView("create"), 200);
  }, [onOpenChange]);

  const handleNavigate = useCallback((path: string) => {
    triggerHaptic("light");
    playSound("tap");
    close();
    navigate(path);
  }, [close, navigate]);

  const handleAction = useCallback((action: string) => {
    triggerHaptic("medium");
    playSound("pop");

    switch (action) {
      case "post":
        close();
        navigate("/upload");
        return;
      case "camera":
        close();
        setShowCamera(true);
        return;
      case "hub":
        triggerHaptic("light");
        setView("hub");
        return;
      case "utilities":
        triggerHaptic("light");
        setView("utilities");
        return;
    }
  }, [close, navigate]);

  const createItems = useMemo(() => [
    { id: "post", icon: Image, label: "Post", subtitle: "Share media", gradient: "from-primary via-accent to-primary" },
    { id: "camera", icon: Camera, label: "Camera", subtitle: "Capture moment", gradient: "from-accent via-primary to-accent" },
    { id: "hub", icon: Zap, label: "Hub", subtitle: "Explore more", gradient: "from-primary via-accent to-primary" },
    { id: "utilities", icon: Wrench, label: "Utilities", subtitle: "Creator tools & more", gradient: "from-accent via-primary to-accent" },
  ], []);

  const hubItems = useMemo(() => {
    const items = [
      { path: '/market', icon: ShoppingBag, label: 'Marketplace', description: 'Buy & sell with friends', gradient: 'from-primary via-accent to-primary' },
      { path: '/events', icon: Calendar, label: 'Community Events', description: "Discover what's happening", gradient: 'from-accent via-primary to-accent' },
      { path: '/community', icon: Users, label: 'Communities', description: 'Group chats & channels', gradient: 'from-primary via-accent to-primary' },
    ];
    if (isModOrAdmin) {
      items.push({ path: '/admin', icon: Shield, label: 'Admin Panel', description: 'Manage & moderate', gradient: 'from-destructive via-primary to-destructive' });
    }
    return items;
  }, [isModOrAdmin]);

  const utilityItems = useMemo(() => [
    { path: '/creator', icon: BarChart3, label: 'Creator Analytics', description: 'Track your content stats', gradient: 'from-accent via-primary to-accent' },
  ], []);

  // Reset view when menu closes
  useEffect(() => {
    if (!open) setView("create");
  }, [open]);

  // FAILSAFE
  useEffect(() => {
    if (!open) { recoverAttemptsRef.current = 0; return; }
    const t = window.setTimeout(() => {
      const el = surfaceRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inViewport = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      if (!inViewport) {
        recoverAttemptsRef.current += 1;
        if (recoverAttemptsRef.current >= 2) onOpenChange(false);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [open, onOpenChange]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const isHub = view === "hub";
  const isUtilities = view === "utilities";

  return createPortal(
    <>
      {showCamera && <CameraComponent onClose={() => setShowCamera(false)} />}

      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
              style={{ zIndex: Z.overlay }}
              onClick={close}
            />

            {/* Centered container */}
            <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: Z.surface }}>
              <motion.div
                ref={surfaceRef}
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="pointer-events-auto"
                style={{ transform: 'translateZ(0)' }}
              >
                <div className="relative">
                  {/* Gradient border glow */}
                  <div className="absolute -inset-[2px] rounded-[28px] bg-gradient-to-r from-primary via-accent to-primary opacity-50 blur-sm" />

                  {/* Main card - animates size change */}
                  <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 350, damping: 32 }}
                    className="relative flex flex-col gap-3 p-6 rounded-3xl min-w-[320px] overflow-hidden bg-card/95 backdrop-blur-sm border border-border/50"
                  >
                    {/* Glow effects */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                    <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                    {/* Header */}
                    <motion.div layout="position" className="relative z-10 flex items-center justify-center gap-2 mb-1">
                      <AnimatePresence mode="wait">
                        {isUtilities ? (
                          <motion.div
                            key="utilities-header"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-2 w-full"
                          >
                            <button
                              onClick={() => { triggerHaptic("light"); setView("hub"); }}
                              className="p-1.5 rounded-xl hover:bg-foreground/[0.06] transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-2">
                              <Wrench className="w-4 h-4 text-primary" />
                              <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">Utilities</span>
                            </div>
                            <div className="w-7" />
                          </motion.div>
                        ) : isHub ? (
                          <motion.div
                            key="hub-header"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-2 w-full"
                          >
                            <button
                              onClick={() => { triggerHaptic("light"); setView("create"); }}
                              className="p-1.5 rounded-xl hover:bg-foreground/[0.06] transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <div className="flex-1 flex items-center justify-center gap-2">
                              <VybeMiniIcon size={16} showSparkles animated={false} />
                              <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">VYBE Hub</span>
                              <VybeMiniIcon size={16} showSparkles animated={false} />
                            </div>
                            <div className="w-7" />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="create-header"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center gap-2 w-full"
                          >
                            <div className="w-8" />
                            <div className="flex-1 flex items-center justify-center gap-2">
                              <Zap className="w-4 h-4 text-primary" />
                              <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">Create</span>
                              <Zap className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => { triggerHaptic("light"); playSound("tap"); close(); navigate("/map"); }}
                                className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                              >
                                <MapPin className="w-4 h-4 text-white" />
                              </button>
                              <span className="text-[9px] font-bold text-emerald-400">VybeMap</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Content area with slide transitions */}
                    <div className="relative z-10">
                      <AnimatePresence mode="wait" initial={false}>
                        {isUtilities ? (
                          <motion.div
                            key="utilities-items"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="flex flex-col gap-2"
                          >
                            {utilityItems.map((item, i) => (
                              <MenuButton
                                key={item.path}
                                icon={item.icon}
                                label={item.label}
                                subtitle={item.description}
                                gradient={item.gradient}
                                index={i}
                                onClick={() => handleNavigate(item.path)}
                              />
                            ))}
                            {/* Coming soon placeholder */}
                            <motion.div
                              variants={itemVariants}
                              custom={utilityItems.length}
                              className="flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.02] border border-dashed border-border/40"
                            >
                              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
                                <Clock className="h-5 w-5 text-muted-foreground/60" />
                              </div>
                              <div className="flex flex-col items-start">
                                <span className="text-sm font-medium text-muted-foreground/70">More Coming Soon</span>
                                <span className="text-xs text-muted-foreground/50">New tools on the way</span>
                              </div>
                            </motion.div>
                            {/* Close button */}
                            <motion.button
                              variants={itemVariants}
                              custom={utilityItems.length + 1}
                              whileTap="tap"
                              onClick={close}
                              className="mt-1 p-3 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 text-muted-foreground hover:text-foreground transition-colors duration-100 flex items-center justify-center gap-2"
                              style={{ transform: 'translateZ(0)' }}
                            >
                              <X className="h-4 w-4" />
                              <span className="text-sm">Close</span>
                            </motion.button>
                          </motion.div>
                        ) : !isHub ? (
                          <motion.div
                            key="create-items"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="flex flex-col gap-2"
                          >
                            {createItems.map((item, i) => (
                              <MenuButton
                                key={item.id}
                                icon={item.icon}
                                label={item.label}
                                subtitle={item.subtitle}
                                gradient={item.gradient}
                                index={i}
                                onClick={() => handleAction(item.id)}
                              />
                            ))}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="hub-items"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="flex flex-col gap-2"
                          >
                            {hubItems.map((item, i) => (
                              <MenuButton
                                key={item.path}
                                icon={item.icon}
                                label={item.label}
                                subtitle={item.description}
                                gradient={item.gradient}
                                index={i}
                                isDestructive={item.path === '/admin'}
                                onClick={() => handleNavigate(item.path)}
                              />
                            ))}
                            {/* Close button */}
                            <motion.button
                              variants={itemVariants}
                              custom={hubItems.length}
                              whileTap="tap"
                              onClick={close}
                              className="mt-1 p-3 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 text-muted-foreground hover:text-foreground transition-colors duration-100 flex items-center justify-center gap-2"
                              style={{ transform: 'translateZ(0)' }}
                            >
                              <X className="h-4 w-4" />
                              <span className="text-sm">Close</span>
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
                  </motion.div>
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

/* ── Shared animated menu button ── */
interface MenuButtonProps {
  icon: React.ElementType;
  label: string;
  subtitle: string;
  gradient: string;
  index: number;
  isDestructive?: boolean;
  onClick: () => void;
}

function MenuButton({ icon: Icon, label, subtitle, gradient, index, isDestructive, onClick }: MenuButtonProps) {
  const accentColor = isDestructive ? "destructive" : "primary";
  return (
    <motion.button
      variants={itemVariants}
      custom={index}
      whileTap="tap"
      onClick={onClick}
      className={`group relative flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 hover:border-${accentColor}/30 transition-colors duration-100 overflow-hidden`}
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Hover glow */}
      <div className={`absolute inset-0 bg-gradient-to-r from-${accentColor}/0 via-${accentColor}/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-100`} />

      {/* Icon */}
      <div className="relative">
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} p-[1px] group-hover:scale-105 transition-transform duration-100`}
          style={{ transform: 'translateZ(0)' }}
        >
          <div className="w-full h-full rounded-xl bg-card/80 flex items-center justify-center">
            <Icon className={`h-5 w-5 text-${accentColor}`} />
          </div>
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col items-start flex-1 min-w-0">
        <span className={`text-sm font-semibold text-foreground group-hover:text-${accentColor} transition-colors duration-100`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>

      {/* Arrow */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-100">
        <div className={`w-8 h-8 rounded-full bg-${accentColor}/10 border border-${accentColor}/20 flex items-center justify-center`}>
          <svg className={`w-4 h-4 text-${accentColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.button>
  );
}
