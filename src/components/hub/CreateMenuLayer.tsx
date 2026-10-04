import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from 'framer-motion';
import { Camera, Image, Zap, ShoppingBag, Calendar, Users, Shield, X, ChevronLeft, BarChart3, Wrench, Clock, MapPin, Code2, Gamepad2 } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { useUserRole } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlayOptional } from '@/contexts/cameraOverlaySafe';

export type CreateMenuView = 'create' | 'hub' | 'utilities';
interface CreateMenuLayerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialView?: CreateMenuView;
  id?: string;
}
const Z = { overlay: 9998, surface: 9999 } as const;
const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.95 },
  visible: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.04, type: 'spring' as const, stiffness: 400, damping: 28 } }),
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.1 } },
  tap: { scale: 0.96, transition: { duration: 0.08 } },
};
const stillVariants = { hidden: { opacity: 1 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } };
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } }, exit: { opacity: 0, transition: { duration: 0.1 } } };
const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export function CreateMenuLayer({ open, onOpenChange, initialView = 'create', id }: CreateMenuLayerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const { reducedMotion: appReducedMotion } = useTheme();
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(appReducedMotion || systemReducedMotion);
  const [view, setView] = useState<CreateMenuView>(initialView);
  const generatedId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openedSession = useRef(session);
  const openedPath = useRef(location.pathname);
  const wasOpen = useRef(false);
  const actionTaken = useRef(false);
  const restoreFocus = useRef(true);
  const current = useRef({ open, view });
  current.current = { open, view };
  const openCamera = useCameraOverlayOptional()?.openCamera;
  const { data: role } = useUserRole();
  const isStaff = !!session.uid && profile?.user_id === session.uid && ['owner', 'admin', 'moderator'].includes(role || '');

  const close = useCallback(() => {
    if (!current.current.open) return;
    actionTaken.current = true;
    onOpenChange(false);
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (open) {
      if (!wasOpen.current) {
        openedSession.current = session;
        openedPath.current = location.pathname;
        const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // A rapid external reopen can happen while the prior card is exiting.
        // Keep the real opener instead of adopting a soon-to-be-removed control.
        if (!focused?.closest('[data-create-dialog]')) opener.current = focused;
        actionTaken.current = false;
        restoreFocus.current = true;
      }
      setView(initialView);
    }
    wasOpen.current = open;
  }, [open, initialView]);

  useEffect(() => {
    if (open && (openedSession.current !== session || openedPath.current !== location.pathname)) {
      restoreFocus.current = false;
      close();
    }
  }, [open, session, location.pathname, close]);

  const switchView = (next: CreateMenuView) => {
    if (!current.current.open || actionTaken.current) return;
    triggerHaptic('light'); playSound('tap');
    setView(next);
    // The heading stays mounted while the old page exits, so focus never falls
    // back to the obscured page or into an invisible outgoing action.
    titleRef.current?.focus({ preventScroll: true });
  };

  const takeAction = (expectedView: CreateMenuView, path?: string, camera = false) => {
    if (!current.current.open || current.current.view !== expectedView || actionTaken.current) return;
    if (openedSession.current !== reportAccountSnapshot()) { restoreFocus.current = false; close(); return; }
    actionTaken.current = true;
    restoreFocus.current = false;
    triggerHaptic('medium'); playSound('pop');
    onOpenChange(false);
    if (!session.uid || user?.id !== session.uid) {
      navigate('/?mode=login'); return;
    }
    if (path === '/admin' && !isStaff) return;
    if (camera && openCamera) {
      // Keep permission acquisition inside this original user gesture.
      openSnapCamera(openCamera, { source: 'global' });
    } else {
      navigate(path || '/upload');
    }
  };

  const hubItems = [
    { path: '/mini-apps', icon: Code2, label: 'Mini Apps', description: 'Build, play & share your own apps', gradient: 'from-primary via-accent to-primary' },
    { path: '/developers', icon: Gamepad2, label: 'Game Developers', description: 'Bring your games into VYBE', gradient: 'from-accent via-primary to-accent' },
    { path: '/market', icon: ShoppingBag, label: 'Marketplace', description: 'Buy & sell with friends', gradient: 'from-primary via-accent to-primary' },
    { path: '/events', icon: Calendar, label: 'Community Events', description: "Discover what's happening", gradient: 'from-accent via-primary to-accent' },
    { path: '/community', icon: Users, label: 'Communities', description: 'Group chats & channels', gradient: 'from-primary via-accent to-primary' },
    ...(isStaff ? [{ path: '/admin', icon: Shield, label: 'Admin Panel', description: 'Manage & moderate', gradient: 'from-destructive via-primary to-destructive' }] : []),
  ];
  const createItems = [
    { id: 'post', icon: Image, label: 'Post', subtitle: 'Share media', gradient: 'from-primary via-accent to-primary' },
    { id: 'camera', icon: Camera, label: 'Camera', subtitle: 'Capture moment', gradient: 'from-accent via-primary to-accent' },
    { id: 'hub', icon: Zap, label: 'Hub', subtitle: 'Explore more', gradient: 'from-primary via-accent to-primary' },
    { id: 'utilities', icon: Wrench, label: 'Utilities', subtitle: 'Creator tools & more', gradient: 'from-accent via-primary to-accent' },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) close(); }}>
      <AnimatePresence>
        {open && <CreateDialogSurface key="create-menu" id={id || generatedId} reducedMotion={reducedMotion}
          onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (restoreFocus.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }}>
          <div className="absolute -inset-[2px] rounded-[28px] bg-gradient-to-r from-primary via-accent to-primary opacity-50 blur-sm pointer-events-none" aria-hidden />
          <motion.div layout={!reducedMotion} transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 350, damping: 32 }}
            className="relative flex max-h-[calc(100dvh-3rem)] w-[min(420px,calc(100vw-2rem))] min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-3xl border border-border/50 bg-card/95 p-6 backdrop-blur-sm">
            <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
            <div aria-hidden className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div aria-hidden className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none" />
            <div className="relative z-10 flex items-center justify-center gap-2 mb-1">
              {view === 'create' ? <div className="w-11 shrink-0" /> : <button type="button" aria-label="Back to Create" onClick={() => switchView('create')} className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-foreground/[0.06] transition-colors ${focusClass}`}><ChevronLeft className="w-4 h-4 text-muted-foreground" /></button>}
              <div className="flex-1 flex items-center justify-center gap-2">
                {view === 'hub' ? <VybeMiniIcon size={16} showSparkles animated={false} /> : view === 'utilities' ? <Wrench className="w-4 h-4 text-primary" /> : <Zap className="w-4 h-4 text-primary" />}
                <Dialog.Title ref={titleRef} tabIndex={-1} className="text-xs font-bold tracking-[0.3em] uppercase text-primary outline-none">{view === 'hub' ? 'VYBE Hub' : view === 'utilities' ? 'Utilities' : 'Create'}</Dialog.Title>
              </div>
              <Dialog.Close asChild><button type="button" aria-label="Close create menu" className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground ${focusClass}`}><X className="h-4 w-4" /></button></Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">Choose what to create or explore. Escape closes this menu.</Dialog.Description>
            <div className="relative z-10">
              <AnimatePresence mode="wait" initial={false}>
                <MenuPage key={view} reducedMotion={reducedMotion}>
                  {view === 'create' ? <>
                    {createItems.map((item, index) => <MenuButton key={item.id} {...item} index={index} reducedMotion={reducedMotion} onClick={() => {
                      if (current.current.view !== 'create') return;
                      if (item.id === 'hub' || item.id === 'utilities') switchView(item.id);
                      else takeAction('create', item.id === 'post' ? '/upload' : undefined, item.id === 'camera');
                    }} />)}
                    <button type="button" onClick={() => takeAction('create', '/map')} className={`mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl text-emerald-400 hover:bg-foreground/[0.06] ${focusClass}`}><MapPin className="h-4 w-4" />VybeMap</button>
                  </> : view === 'hub' ? hubItems.map((item, index) => <MenuButton key={item.path} icon={item.icon} label={item.label} subtitle={item.description} gradient={item.gradient} index={index} reducedMotion={reducedMotion} isDestructive={item.path === '/admin'} onClick={() => takeAction('hub', item.path)} />) : <>
                    <MenuButton icon={BarChart3} label="Creator Analytics" subtitle="Track your content stats" gradient="from-accent via-primary to-accent" index={0} reducedMotion={reducedMotion} onClick={() => takeAction('utilities', '/creator')} />
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.02] border border-dashed border-border/40"><div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center"><Clock className="h-5 w-5 text-muted-foreground/60" /></div><div><p className="text-sm font-medium text-muted-foreground/70">More Coming Soon</p><p className="text-xs text-muted-foreground/50">New tools on the way</p></div></div>
                  </>}
                </MenuPage>
              </AnimatePresence>
            </div>
            <div aria-hidden className="absolute bottom-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent pointer-events-none" />
          </motion.div>
        </CreateDialogSurface>}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function CreateDialogSurface({ children, reducedMotion, ...props }: React.ComponentProps<typeof Dialog.Content> & { reducedMotion: boolean }) {
  const present = useIsPresent();
  return <Dialog.Portal forceMount>
    <Dialog.Overlay forceMount asChild><motion.div aria-hidden data-create-backdrop
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}
      className="fixed inset-0 bg-background/80 backdrop-blur-sm" style={{ zIndex: Z.overlay, pointerEvents: present ? 'auto' : 'none' }} /></Dialog.Overlay>
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: Z.surface, paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <Dialog.Content forceMount asChild {...props} data-create-dialog aria-modal="true" aria-hidden={!present || undefined} {...(!present ? { inert: '' } : {})}>
        <motion.div initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
          transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
          className="relative outline-none" style={{ pointerEvents: present ? 'auto' : 'none' }}>
          {children}
        </motion.div>
      </Dialog.Content>
    </div>
  </Dialog.Portal>;
}

function MenuPage({ children, reducedMotion }: { children: React.ReactNode; reducedMotion: boolean }) {
  const present = useIsPresent();
  return <motion.div variants={reducedMotion ? stillVariants : containerVariants} initial="hidden" animate="visible" exit="exit"
    aria-hidden={!present || undefined} {...(!present ? { inert: '' } : {})} className="flex flex-col gap-2" style={{ pointerEvents: present ? 'auto' : 'none' }}>
    {children}
  </motion.div>;
}

interface MenuButtonProps {
  icon: React.ElementType; label: string; subtitle: string; gradient: string; index: number;
  isDestructive?: boolean; reducedMotion: boolean; onClick: () => void;
}
function MenuButton({ icon: Icon, label, subtitle, gradient, index, isDestructive, reducedMotion, onClick }: MenuButtonProps) {
  const accentColor = isDestructive ? 'destructive' : 'primary';
  const descriptionId = useId();
  return <motion.button type="button" aria-label={label} aria-describedby={descriptionId} variants={reducedMotion ? stillVariants : itemVariants} custom={index} whileTap={reducedMotion ? undefined : 'tap'} onClick={onClick}
    className={`group relative flex items-center gap-4 p-4 rounded-2xl bg-foreground/[0.03] hover:bg-foreground/[0.08] border border-border/30 hover:border-${accentColor}/30 transition-colors duration-100 overflow-hidden ${focusClass}`}>
    <div aria-hidden className={`absolute inset-0 bg-gradient-to-r from-${accentColor}/0 via-${accentColor}/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none`} />
    <div className="relative"><div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} p-[1px] ${reducedMotion ? '' : 'group-hover:scale-105 transition-transform duration-100'}`}><div className="w-full h-full rounded-xl bg-card/80 flex items-center justify-center"><Icon className={`h-5 w-5 text-${accentColor}`} /></div></div></div>
    <div className="flex flex-col items-start flex-1 min-w-0"><span className={`text-sm font-semibold text-foreground group-hover:text-${accentColor} transition-colors duration-100`}>{label}</span><span id={descriptionId} className="text-xs text-muted-foreground">{subtitle}</span></div>
    <div aria-hidden className="opacity-0 group-hover:opacity-100 transition-opacity duration-100"><div className={`w-8 h-8 rounded-full bg-${accentColor}/10 border border-${accentColor}/20 flex items-center justify-center`}><svg className={`w-4 h-4 text-${accentColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></div></div>
  </motion.button>;
}
