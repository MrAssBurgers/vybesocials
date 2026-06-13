import { RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FriendLinkTapAnimation } from '@/components/friends/FriendLinkTapAnimation';
import { cn } from '@/lib/utils';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';
type ActiveTab = 'tap' | 'qr';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface NearbyPeer {
  peerId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface FriendLinkSheetContentProps {
  phase: DropPhase;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onClose: () => void;
  onAddFriend: () => void;
  onSelectPeer: (peer: NearbyPeer) => void;
  profile: {
    username?: string;
    avatar_url?: string | null;
  } | null;
  foundUser: FoundUser | null;
  tapListening: boolean;
  qrSvg: string;
  qrLoading: boolean;
  nearbyPeers: NearbyPeer[];
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  cameraStarting: boolean;
  cameraError: string | null;
  onStartCamera: () => void;
  reduceMotion?: boolean;
}

const tabMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { type: 'spring', stiffness: 420, damping: 32 },
};

const tabMotionReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.08 },
};

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
  activeTab,
  onTabChange,
  onClose,
  onAddFriend,
  onSelectPeer,
  profile,
  foundUser,
  tapListening,
  qrSvg,
  qrLoading,
  nearbyPeers,
  videoRef,
  canvasRef,
  cameraActive,
  cameraStarting,
  cameraError,
  onStartCamera,
  reduceMotion = false,
}: FriendLinkSheetContentProps) {
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

  const motionProps = reduceMotion ? tabMotionReduced : tabMotion;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as ActiveTab)}
      className="flex flex-col gap-3"
    >
      <TabsList className="friend-link-tabs grid h-9 w-full grid-cols-2 rounded-xl p-1">
        <TabsTrigger value="tap" className="friend-link-tab rounded-lg text-sm font-medium">
          Phone Tap
        </TabsTrigger>
        <TabsTrigger value="qr" className="friend-link-tab rounded-lg text-sm font-medium">
          QR Scan
        </TabsTrigger>
      </TabsList>

      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'tap' ? (
            <motion.div key="tap" {...motionProps} className="space-y-3">
              <FriendLinkTapAnimation
                active={tapListening}
                avatarUrl={profile?.avatar_url}
                username={profile?.username}
                className="friend-link-tap-scene--sheet mx-auto h-[8.5rem] w-full max-w-none border-primary/15 bg-gradient-to-br from-primary/[0.08] via-transparent to-accent/[0.08]"
              />
              <p className="text-center text-sm font-medium text-muted-foreground">
                {tapListening ? (
                  <>
                    <span className="text-primary">Ready</span> — bump phones together
                  </>
                ) : (
                  'Getting ready…'
                )}
              </p>
              {nearbyPeers.length > 0 && (
                <div className="space-y-1">
                  {nearbyPeers.map((peer) => (
                    <button
                      key={peer.peerId}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl bg-muted/15 px-3 py-2 text-left active:scale-[0.99] transition-transform"
                      onClick={() => onSelectPeer(peer)}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={peer.avatarUrl || ''} className="object-cover" />
                        <AvatarFallback className="text-[10px]">{peer.username[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {peer.displayName || peer.username}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="qr" {...motionProps} className="flex flex-col items-center gap-3">
              <div className="friend-link-qr-tile relative rounded-2xl bg-white p-2.5 shadow-[0_8px_28px_-8px_hsl(var(--primary)/0.45)] ring-2 ring-primary/20">
                {qrSvg ? (
                  <div
                    className="h-[6.25rem] w-[6.25rem] [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                ) : (
                  <div className="flex h-[6.25rem] w-[6.25rem] items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <p className="w-full truncate text-center text-sm text-muted-foreground">
                @{profile?.username}
              </p>

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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Tabs>
  );
}
