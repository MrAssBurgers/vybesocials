import { RefObject, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FriendLinkSheetContentProps {
  phase: DropPhase;
  onClose: () => void;
  onAddFriend: () => void;
  profile: {
    username?: string;
    avatar_url?: string | null;
  } | null;
  foundUser: FoundUser | null;
  qrSvg: string;
  qrLoading: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  cameraStarting: boolean;
  cameraError: string | null;
  onStartCamera: () => void;
  reduceMotion?: boolean;
}

function ScannerViewport({
  videoRef,
  canvasRef,
  cameraActive,
  cameraStarting,
  cameraError,
  onStartCamera,
  reduceMotion,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  cameraStarting: boolean;
  cameraError: string | null;
  onStartCamera: () => void;
  reduceMotion: boolean;
}) {
  return (
    <div
      className={cn(
        'friend-link-scanner relative w-full overflow-hidden rounded-2xl bg-muted/15',
        cameraActive && !reduceMotion && 'friend-link-scanner--live',
      )}
    >
      <video
        ref={videoRef}
        className={cn('h-full w-full object-cover', !cameraActive && 'opacity-0')}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />

      {cameraStarting && !cameraActive && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/55">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Opening camera…</span>
        </div>
      )}

      {!cameraStarting && !cameraActive && !cameraError && (
        <button
          type="button"
          onClick={onStartCamera}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/35 active:bg-background/50 transition-colors"
          aria-label="Open camera"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-primary/25">
            <Camera className="h-4 w-4 text-primary" />
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">Tap to scan</span>
        </button>
      )}

      {cameraError && !cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 px-4 text-center">
          <span className="text-xs text-destructive leading-snug">{cameraError}</span>
          <button
            type="button"
            onClick={onStartCamera}
            className="rounded-full bg-foreground px-3.5 py-1 text-xs font-medium text-background"
          >
            Try again
          </button>
        </div>
      )}

      {cameraActive && !reduceMotion && (
        <span className="friend-link-scan-line pointer-events-none" aria-hidden />
      )}
    </div>
  );
}

function PhasePanel({
  children,
  className,
  reduceMotion,
}: {
  children: React.ReactNode;
  className?: string;
  reduceMotion?: boolean;
}) {
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0.08 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn('flex flex-col items-center', className)}
    >
      {children}
    </motion.div>
  );
}

export function FriendLinkSheetContent({
  phase,
  onClose,
  onAddFriend,
  profile,
  foundUser,
  qrSvg,
  qrLoading,
  videoRef,
  canvasRef,
  cameraActive,
  cameraStarting,
  cameraError,
  onStartCamera,
  reduceMotion = false,
}: FriendLinkSheetContentProps) {
  const [qrExpanded, setQrExpanded] = useState(false);

  if (phase === 'found' && foundUser) {
    return (
      <PhasePanel reduceMotion={reduceMotion} className="gap-3.5 py-1">
        <Avatar className="h-14 w-14 ring-1 ring-foreground/10">
          <AvatarImage src={foundUser.avatar_url || ''} />
          <AvatarFallback className="bg-muted text-base font-semibold text-foreground">
            {foundUser.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <h3 className="text-sm font-semibold">{foundUser.display_name || foundUser.username}</h3>
          <p className="text-xs text-muted-foreground">@{foundUser.username}</p>
        </div>
        <div className="flex w-full gap-2.5 pt-0.5">
          <Button variant="outline" size="sm" className="h-9 flex-1 rounded-full text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="h-9 flex-1 rounded-full text-xs" onClick={onAddFriend}>
            Add friend
          </Button>
        </div>
      </PhasePanel>
    );
  }

  if (phase === 'exchanging') {
    return (
      <PhasePanel reduceMotion={reduceMotion} className="gap-2.5 py-5">
        <div className="flex items-center justify-center">
          <Avatar className="-mr-2 h-10 w-10 ring-2 ring-background">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="text-xs">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <Avatar className="-ml-2 h-10 w-10 ring-2 ring-background">
            <AvatarImage src={foundUser?.avatar_url || ''} />
            <AvatarFallback className="text-xs">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
        <p className="text-sm text-muted-foreground">Adding friend…</p>
      </PhasePanel>
    );
  }

  if (phase === 'success') {
    return (
      <PhasePanel reduceMotion={reduceMotion} className="gap-2.5 py-5">
        <div className="flex items-center justify-center">
          <Avatar className="-mr-1.5 h-9 w-9 ring-2 ring-background">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="text-[10px]">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="-mx-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground ring-2 ring-background">
            <Check className="h-3 w-3 text-background" strokeWidth={3} />
          </div>
          <Avatar className="-ml-1.5 h-9 w-9 ring-2 ring-background">
            <AvatarImage src={foundUser?.avatar_url || ''} />
            <AvatarFallback className="text-[10px]">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
        <p className="text-sm font-medium">Friend added</p>
      </PhasePanel>
    );
  }

  if (phase !== 'activated') return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => qrSvg && setQrExpanded(true)}
        className="friend-link-qr-tile relative rounded-2xl bg-white p-2.5 shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.45)] ring-2 ring-primary/20 transition-transform active:scale-[0.98]"
        aria-label="Enlarge QR code"
      >
        <div className="relative h-[6.25rem] w-[6.25rem]">
          {qrSvg ? (
            <>
              <div
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-xl bg-white p-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.12)] ring-2 ring-white">
                  <Avatar className="h-10 w-10 rounded-[10px]">
                    <AvatarImage src={profile?.avatar_url || ''} className="rounded-[10px] object-cover" />
                    <AvatarFallback className="rounded-[10px] bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
                      {profile?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      </button>
      <p className="w-full truncate text-center text-sm text-muted-foreground">
        Show your code · or scan theirs · @{profile?.username}
      </p>

      <AnimatePresence>
        {qrExpanded && qrSvg && (
          <motion.div
            className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/75 backdrop-blur-md p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQrExpanded(false)}
          >
            <motion.button
              type="button"
              className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
              onClick={() => setQrExpanded(false)}
              aria-label="Close enlarged QR code"
            >
              <X className="h-5 w-5" />
            </motion.button>
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative rounded-3xl bg-white p-4 shadow-2xl ring-2 ring-primary/25 max-w-[min(88vw,320px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="w-full aspect-square [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl bg-white p-1 shadow-lg ring-2 ring-white">
                  <Avatar className="h-14 w-14 rounded-xl">
                    <AvatarImage src={profile?.avatar_url || ''} className="rounded-xl object-cover" />
                    <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-primary-foreground">
                      {profile?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ScannerViewport
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraActive={cameraActive}
        cameraStarting={cameraStarting}
        cameraError={cameraError}
        onStartCamera={onStartCamera}
        reduceMotion={reduceMotion}
      />

      {qrLoading && (
        <p className="text-center text-xs text-muted-foreground">Preparing your code…</p>
      )}
    </div>
  );
}
