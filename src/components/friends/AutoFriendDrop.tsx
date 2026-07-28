import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync } from '@/hooks/useFriendDropSync';
import { useCreateConversation } from '@/hooks/useMessages';
import { db } from '@/lib/firebase';
import { useSwingDetection } from '@/hooks/useSwingDetection';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { getPreloadedStream, requestCameraStream, stopCameraStream } from '@/hooks/useCameraPreload';
import jsQR from 'jsqr';
import { getPrimaryHex } from '@/lib/themeColor';
import { navVisibility } from '@/lib/navVisibility';
import { cn } from '@/lib/utils';
import { useFloatingControlVisibility } from '@/hooks/useFloatingControlVisibility';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { isFullyLoggedIn } from '@/lib/authReady';
import { buildFriendDropUrl, buildAddFriendUrl, extractFriendTarget } from '@/lib/friendLinkNfc';
import { FRIEND_LINK_OPEN_EVENT } from '@/lib/friendLinkUi';
import {
  FRIEND_DROP_ANIMATION_START,
  FRIEND_DROP_COMPLETED,
  FRIEND_DROP_CLOSE_SHEET,
  dispatchFriendDropAnimationStart,
  dispatchFriendDropCompleted,
  dispatchFriendDropCloseSheet,
  scheduleFriendDropSyncStart,
  type FriendDropRole,
  type FriendDropAnimationStartDetail,
  type FriendDropCompletedDetail,
} from '@/lib/friendLinkEvents';
import { NFCSwapAnimation } from '@/components/friends/NFCSwapAnimation';
import { FriendLinkActivateHint } from '@/components/friends/FriendLinkActivateHint';
import { FriendLinkSheetContent } from '@/components/friends/FriendLinkSheetContent';
import { liquidBackdrop, liquidBouncySpring } from '@/motion/liquidConfig';
import { acquirePostCameraStream, stopStream } from '@/lib/postCameraStream';
import { isCameraSafeMode } from '@/lib/cameraSafeMode';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function AutoFriendDrop() {
  const { user, profile, loading: authLoading } = useAuth();
  const profileId = useAuthProfileId();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const showHomePill =
    isFullyLoggedIn(user, profile, authLoading) &&
    isMobileOrTablet &&
    (location.pathname === '/home' || location.pathname === '/');
  const reduceFriendLinkMotion = isNativePerfMode();
  const sendRequest = useSendFriendRequest();
  const createConversation = useCreateConversation();
  const controlVisible = useFloatingControlVisibility();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const exchangeLockRef = useRef(false);
  const completingRef = useRef(false);
  const [showSwapAnimation, setShowSwapAnimation] = useState(false);
  const [dropRole, setDropRole] = useState<FriendDropRole | null>(null);
  const [syncStartAt, setSyncStartAt] = useState<number | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startScanLoopRef = useRef<() => void>(() => {});
  const createdConversationIdRef = useRef<string | null>(null);

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch {
      return null;
    }
  };

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        createdConversationIdRef.current = conversation.id;
        if (activeDropId) {
          dispatchFriendDropCompleted({
            dropId: activeDropId,
            friendProfileId: targetUserId,
            conversationId: conversation.id,
          });
        }
      } catch {
        /* ignore */
      }
    }
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      const convId = createdConversationIdRef.current;
      dispatchFriendDropCloseSheet();
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      setDropRole(null);
      setSyncStartAt(undefined);
      setShowSwapAnimation(false);
      createdConversationIdRef.current = null;
      exchangeLockRef.current = false;
      completingRef.current = false;
      if (convId) navigate(`/messages/${convId}`);
    }, 2800);
  }, [foundUser?.id, activeDropId, createConversation, navigate]);

  const beginFriendLinkExchange = useCallback(
    (params: { dropId: string; role: FriendDropRole; peer: FoundUser; syncAt?: number }) => {
      const syncAt = params.syncAt ?? scheduleFriendDropSyncStart();
      setActiveDropId(params.dropId);
      setDropRole(params.role);
      setSyncStartAt(syncAt);
      setFoundUser(params.peer);
      setShowSwapAnimation(true);
      setPhase('exchanging');
      dispatchFriendDropAnimationStart({
        dropId: params.dropId,
        syncStartAt: syncAt,
        role: params.role,
      });
    },
    [],
  );

  const handleOnScanned = useCallback((drop: { id: string; to_user_id: string | null }) => {
    haptics.success();
    if (drop.to_user_id) {
      fetchUser(drop.to_user_id).then((scannedUser) => {
        if (scannedUser) {
          setActiveDropId(drop.id);
          setDropRole('owner');
          setFoundUser(scannedUser);
          setPhase('exchanging');
        }
      });
    }
  }, []);

  const handleOnConfirmed = useCallback(() => {
    if (phase !== 'exchanging') {
      setPhase('exchanging');
      haptics.impact();
    }
  }, [phase]);

  const handleOnCompleted = useCallback(async () => {
    setPhase('success');
    haptics.success();
    autoCloseAfterSuccess();
  }, [autoCloseAfterSuccess]);

  const friendDropSync = useFriendDropSync({
    enabled: isActive,
    onScanned: handleOnScanned,
    onConfirmed: handleOnConfirmed,
    onCompleted: handleOnCompleted,
  });

  const primaryHex = getPrimaryHex();
  const myProfileUrl = useMemo(
    () =>
      activeDropId
        ? buildFriendDropUrl(activeDropId)
        : profileId
          ? buildAddFriendUrl(profileId)
          : '',
    [activeDropId, profileId],
  );

  useEffect(() => {
    if (!myProfileUrl) {
      setQrSvg('');
      return;
    }
    let cancelled = false;
    const dark = `#${primaryHex.replace(/^#/, '')}`;
    const renderQr = (color: string) =>
      QRCode.toString(myProfileUrl, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 280,
        color: { dark: color, light: '#00000000' },
      });

    renderQr(dark)
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() =>
        renderQr('#000000')
          .then((svg) => {
            if (!cancelled) setQrSvg(svg);
          })
          .catch(() => {
            if (!cancelled) setQrSvg('');
          }),
      );

    return () => {
      cancelled = true;
    };
  }, [myProfileUrl, primaryHex]);

  const ensureFriendDrop = useCallback(async () => {
    if (!profileId || activeDropId || friendDropSync.isCreating) return;
    const drop = await friendDropSync.createDrop();
    if (drop) {
      setActiveDropId(drop.id);
    }
  }, [profileId, activeDropId, friendDropSync]);

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    try {
      stopCameraStream();
    } catch {
      /* ignore */
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStarting(false);
    setCameraActive(false);
  }, []);

  const runAutoFriendAdd = useCallback(
    async (peerId: string) => {
      if (completingRef.current) return;
      completingRef.current = true;
      exchangeLockRef.current = true;
      try {
        await sendRequest.mutateAsync(peerId);
        if (activeDropId) {
          try {
            await friendDropSync.confirmDrop(activeDropId);
          } catch {
            /* ignore */
          }
          try {
            await friendDropSync.completeDrop(activeDropId);
          } catch {
            /* ignore */
          }
        }
        setPhase('success');
        haptics.success();
        autoCloseAfterSuccess(peerId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('already')) {
          setPhase('success');
          autoCloseAfterSuccess(peerId);
        } else {
          toast.error('Failed to add friend');
          setPhase('found');
          setShowSwapAnimation(false);
          exchangeLockRef.current = false;
          completingRef.current = false;
        }
      }
    },
    [activeDropId, sendRequest, friendDropSync, autoCloseAfterSuccess],
  );

  const handleDropScan = useCallback(
    async (dropId: string) => {
      if (exchangeLockRef.current || completingRef.current) return;
      exchangeLockRef.current = true;
      stopScanning();
      haptics.success();
      const syncAt = scheduleFriendDropSyncStart();
      const scannedDrop = await friendDropSync.scanDrop(dropId);
      if (!scannedDrop) {
        toast.error('This code has expired');
        exchangeLockRef.current = false;
        return;
      }
      if (scannedDrop.from_user_id) {
        const ownerProfile = await fetchUser(scannedDrop.from_user_id);
        if (ownerProfile) {
          beginFriendLinkExchange({
            dropId,
            role: 'scanner',
            peer: ownerProfile,
            syncAt,
          });
        }
      }
    },
    [friendDropSync, stopScanning, beginFriendLinkExchange],
  );

  const handleClose = useCallback(() => {
    haptics.tap();
    stopScanning();

    const dropId = activeDropId;
    const phaseSnap = phase;

    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
    setDropRole(null);
    setSyncStartAt(undefined);
    setShowSwapAnimation(false);
    exchangeLockRef.current = false;
    completingRef.current = false;
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    void (async () => {
      if (dropId && phaseSnap !== 'success') {
        try {
          await friendDropSync.cancelDrop(dropId);
        } catch {
          /* ignore */
        }
      }
    })();
  }, [stopScanning, activeDropId, friendDropSync, phase]);

  const handleFoundUser = useCallback(
    async (userId: string) => {
      stopScanning();
      haptics.success();
      setPhase('found');
      try {
        const { data, error } = await db
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', userId)
          .single();
        if (error) throw error;
        setFoundUser(data);
      } catch {
        toast.error('Could not find user');
        handleClose();
      }
    },
    [stopScanning, handleClose],
  );

  const scanDimensionsRef = useRef({ width: 0, height: 0 });
  const scanFrameSkipRef = useRef(0);
  const scanFrameMod = isNativePerfMode() ? 5 : 2;
  const scanMaxWidth = isNativePerfMode() ? 360 : 640;

  const startScanLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    scanFrameSkipRef.current = 0;

    const scanFrame = async () => {
      if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      scanFrameSkipRef.current = (scanFrameSkipRef.current + 1) % scanFrameMod;
      if (scanFrameSkipRef.current !== 0) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const vw = videoRef.current.videoWidth;
      const vh = videoRef.current.videoHeight;
      const scale = vw > scanMaxWidth ? scanMaxWidth / vw : 1;
      const cw = Math.max(1, Math.round(vw * scale));
      const ch = Math.max(1, Math.round(vh * scale));
      if (scanDimensionsRef.current.width !== cw || scanDimensionsRef.current.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        scanDimensionsRef.current = { width: cw, height: ch };
      }
      ctx.drawImage(videoRef.current, 0, 0, cw, ch);
      const imageData = ctx.getImageData(0, 0, cw, ch);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code) {
        const target = extractFriendTarget(code.data || '');
        if (target?.type === 'drop') {
          await handleDropScan(target.id);
          return;
        }
        if (target?.type === 'user' && target.id !== profileId) {
          handleFoundUser(target.id);
          return;
        }
      }
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };
    scanFrame();
  }, [profileId, handleDropScan, handleFoundUser, scanFrameMod, scanMaxWidth]);

  startScanLoopRef.current = startScanLoop;

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    setCameraStarting(true);
    setCameraError(null);
    try {
      let stream = getPreloadedStream();
      if (!stream) {
        if (isCameraSafeMode()) {
          stream = await acquirePostCameraStream('environment');
        } else {
          stream = await requestCameraStream({ facingMode: 'environment', width: 640, height: 480 });
        }
      }
      if (!stream) throw new Error('Camera stream unavailable');
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setCameraActive(true);
        startScanLoopRef.current();
      }
    } catch (err: unknown) {
      const e = err as { name?: string };
      console.warn('[FriendLink] Camera access failed:', err);
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      const msg = denied
        ? 'Camera blocked — enable camera access in settings'
        : 'Camera unavailable — try again';
      setCameraError(msg);
      toast.error(msg);
    } finally {
      setCameraStarting(false);
    }
  }, []);

  const handleBumpRef = useRef<() => void>(() => {});

  const { requestPermission: requestMotionPermission } = useSwingDetection({
    enabled: showHomePill && !isActive,
    threshold: 6,
    swingWindow: 500,
    cooldown: 3000,
    onSwing: () => handleBumpRef.current(),
  });

  const openFriendLink = useCallback(async () => {
    if (!profileId || !user || isActive) return;
    await requestMotionPermission();
    setIsActive(true);
    haptics.impact();
    setPhase('activated');
    setTimeout(() => haptics.success(), 300);
    void ensureFriendDrop();
    void startCamera();
  }, [profileId, user, isActive, requestMotionPermission, ensureFriendDrop, startCamera]);

  useEffect(() => {
    if (!isActive || phase !== 'activated' || !profileId) return;
    void ensureFriendDrop();
  }, [isActive, phase, profileId, ensureFriendDrop]);

  useEffect(() => {
    handleBumpRef.current = () => {
      void openFriendLink();
    };
  }, [openFriendLink]);

  useEffect(() => {
    const onOpen = () => {
      if (!isFullyLoggedIn(user, profile, authLoading)) return;
      void (async () => {
        await requestMotionPermission();
        setIsActive(true);
        setPhase('activated');
        haptics.impact();
        if (profileId && user) {
          void ensureFriendDrop();
        }
        void startCamera();
      })();
    };
    window.addEventListener(FRIEND_LINK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FRIEND_LINK_OPEN_EVENT, onOpen);
  }, [profileId, user, profile, authLoading, ensureFriendDrop, requestMotionPermission, startCamera]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser || completingRef.current) return;
    setShowSwapAnimation(true);
    setPhase('exchanging');
    haptics.impact();
    await runAutoFriendAdd(foundUser.id);
  }, [foundUser, runAutoFriendAdd]);

  useEffect(() => {
    const onAnimStart = (e: Event) => {
      const detail = (e as CustomEvent<FriendDropAnimationStartDetail>).detail;
      if (!detail?.dropId || !isActive) return;
      if (activeDropId && activeDropId !== detail.dropId) return;
      if (detail.role !== 'scanner') return;

      setActiveDropId(detail.dropId);
      setDropRole('owner');
      setSyncStartAt(detail.syncStartAt);
      setPhase('exchanging');
      setShowSwapAnimation(true);
    };
    const onCompleted = (e: Event) => {
      const detail = (e as CustomEvent<FriendDropCompletedDetail>).detail;
      if (!detail?.dropId) return;
      if (activeDropId === detail.dropId && !completingRef.current) {
        setPhase('success');
        haptics.success();
        if (detail.conversationId) {
          createdConversationIdRef.current = detail.conversationId;
        }
        void autoCloseAfterSuccess(detail.friendProfileId);
      }
    };
    const onCloseSheet = () => {
      if (!isActive) return;
      stopScanning();
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      setDropRole(null);
      setSyncStartAt(undefined);
      setShowSwapAnimation(false);
      exchangeLockRef.current = false;
      completingRef.current = false;
    };
    window.addEventListener(FRIEND_DROP_ANIMATION_START, onAnimStart);
    window.addEventListener(FRIEND_DROP_COMPLETED, onCompleted);
    window.addEventListener(FRIEND_DROP_CLOSE_SHEET, onCloseSheet);
    return () => {
      window.removeEventListener(FRIEND_DROP_ANIMATION_START, onAnimStart);
      window.removeEventListener(FRIEND_DROP_COMPLETED, onCompleted);
      window.removeEventListener(FRIEND_DROP_CLOSE_SHEET, onCloseSheet);
    };
  }, [isActive, activeDropId, autoCloseAfterSuccess, stopScanning]);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, handleClose]);

  useEffect(() => {
    if (!isActive) return;
    navVisibility.setInDesigner(true);
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const useFixedLock = !isNativePerfMode();
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (useFixedLock) {
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    }
    return () => {
      navVisibility.setInDesigner(false);
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      document.documentElement.style.overflow = prevHtmlOverflow;
      if (useFixedLock) window.scrollTo(0, scrollY);
    };
  }, [isActive]);

  // Stop QR camera whenever sheet closes or phase leaves activated.
  useEffect(() => {
    if (isActive && phase === 'activated') return;
    stopScanning();
  }, [isActive, phase, stopScanning]);

  if (!isFullyLoggedIn(user, profile, authLoading)) return null;

  return (
    <>
      <NFCSwapAnimation
        isActive={showSwapAnimation}
        syncStartAt={syncStartAt}
        performAutoAdd={dropRole === 'scanner'}
        myProfile={
          profile?.username
            ? { username: profile.username, avatar_url: profile.avatar_url }
            : null
        }
        theirProfile={
          foundUser
            ? { username: foundUser.username, avatar_url: foundUser.avatar_url }
            : null
        }
        onAutoAdd={() => {
          if (foundUser && dropRole === 'scanner' && !completingRef.current) {
            void runAutoFriendAdd(foundUser.id);
          }
        }}
        onComplete={() => {
          setShowSwapAnimation(false);
        }}
      />

      {!isActive && showHomePill && (
        <div
          className={cn(
            // Mobile uses the header QR action. Keeping this centered pill on
            // phones covered feed tabs, install prompts, and the bottom nav.
            'fixed bottom-20 left-1/2 z-40 hidden flex-col items-center -translate-x-1/2 duration-300 sm:flex',
            controlVisible
              ? 'translate-y-0 pointer-events-auto transition-transform ease-out'
              : 'translate-y-[200%] pointer-events-none transition-transform ease-in',
          )}
        >
          <div className="relative flex flex-col items-center">
            <FriendLinkActivateHint onEnableShake={() => { void requestMotionPermission(); }} />
            <button
              type="button"
              onClick={() => void openFriendLink()}
              className="group relative flex items-center gap-2.5 px-5 py-3 rounded-full active:scale-[0.95] transition-all duration-200 touch-manipulation"
            >
              <span className="absolute inset-0 rounded-full seamless-gradient-strip opacity-80" />
              <span className="absolute inset-[1.5px] rounded-full bg-card/95 backdrop-blur-xl" />
              <span className="absolute inset-0 rounded-full bg-primary/10 blur-lg group-hover:bg-primary/20 transition-colors" />
              <QrCode className="relative z-10 h-4 w-4 text-primary" />
              <span className="relative z-10 text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Friend Link
              </span>
            </button>
            <p className="mt-1.5 text-[10px] font-semibold text-foreground/80 drop-shadow-sm pointer-events-none">
              Tap or shake to open
            </p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isActive && !showSwapAnimation && (
          <>
            <motion.div
              key="friend-link-backdrop"
              {...liquidBackdrop}
              className={cn(
                'friend-link-backdrop fixed inset-0 liquid-modal-backdrop',
                !reduceFriendLinkMotion && 'backdrop-blur-sm',
              )}
              style={{ zIndex: 10080, touchAction: 'none', overscrollBehavior: 'contain' }}
              onClick={handleClose}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) handleClose();
              }}
              aria-hidden
            />
            <div
              className="fixed inset-x-0 z-[10081] flex justify-center pointer-events-none px-4"
              style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <motion.div
                key="friend-link-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Friend Link"
                initial={reduceFriendLinkMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceFriendLinkMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                transition={reduceFriendLinkMotion ? { duration: 0.1 } : liquidBouncySpring}
                className="friend-link-sheet friend-link-poster pointer-events-auto flex w-full max-w-[24rem] flex-col overflow-hidden rounded-[28px] liquid-glass-depth"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="friend-link-poster-aura pointer-events-none absolute inset-0 rounded-[28px]" aria-hidden />
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

                <div className="relative grid shrink-0 grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 pb-2 pt-4">
                  <span aria-hidden />
                  <h2 className="text-center bg-gradient-to-r from-primary via-foreground to-accent bg-clip-text text-base font-bold tracking-tight text-transparent">
                    Friend Link
                  </h2>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose();
                    }}
                    className="flex h-9 w-9 items-center justify-center justify-self-end rounded-full bg-foreground/5 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary touch-manipulation active:scale-95"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative overflow-hidden px-4 pb-4 pt-0">
                  <FriendLinkSheetContent
                    phase={phase}
                    onClose={handleClose}
                    onAddFriend={handleAddFriend}
                    profile={profile}
                    foundUser={foundUser}
                    qrSvg={qrSvg}
                    qrLoading={!profileId || (!qrSvg && friendDropSync.isCreating)}
                    videoRef={videoRef}
                    canvasRef={canvasRef}
                    cameraActive={cameraActive}
                    cameraStarting={cameraStarting}
                    cameraError={cameraError}
                    onStartCamera={() => void startCamera()}
                    reduceMotion={reduceFriendLinkMotion}
                  />
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
