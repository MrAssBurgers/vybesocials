import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Check, QrCode, MessageCircle, Radio, Loader2, ScanLine } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync } from '@/hooks/useFriendDropSync';
import { useCreateConversation } from '@/hooks/useMessages';
import { supabase } from '@/integrations/supabase/client';
import { useSwingDetection } from '@/hooks/useSwingDetection';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { getPreloadedStream, requestCameraStream, stopCameraStream } from '@/hooks/useCameraPreload';
import jsQR from 'jsqr';
import { getPrimaryHex } from '@/lib/themeColor';
import { navVisibility } from '@/lib/navVisibility';
import { cn } from '@/lib/utils';
import { useFloatingControlVisibility } from '@/hooks/useFloatingControlVisibility';
import { isDespiaRuntime, isIOSUA } from '@/lib/despiaBridge';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { isFullyLoggedIn } from '@/lib/authReady';
import { buildFriendDropUrl, type FriendLinkTarget, extractFriendTarget } from '@/lib/friendLinkNfc';
import { scanFriendLinkOnce } from '@/lib/friendLinkNfc';
import { useFriendLinkNfcSession } from '@/hooks/useFriendLinkNfcSession';
import { FRIEND_LINK_OPEN_EVENT } from '@/lib/friendLinkUi';
import { NFCSwapAnimation } from '@/components/friends/NFCSwapAnimation';
import { FriendLinkActivateHint, FriendLinkSheetTips } from '@/components/friends/FriendLinkActivateHint';
import { FriendLinkTapAnimation } from '@/components/friends/FriendLinkTapAnimation';
import { acquirePostCameraStream, stopStream } from '@/lib/postCameraStream';
import { isCameraSafeMode } from '@/lib/cameraSafeMode';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';
type ActiveTab = 'tap' | 'qr';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function AutoFriendDrop() {
  const { user, profile, loading: authLoading } = useAuth();
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('tap');
  const [qrSvg, setQrSvg] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const webNfcRef = useRef<AbortController | null>(null);
  const exchangeLockRef = useRef(false);
  const completingRef = useRef(false);
  const [showSwapAnimation, setShowSwapAnimation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startScanLoopRef = useRef<() => void>(() => {});
  const createdConversationIdRef = useRef<string | null>(null);

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch { return null; }
  };

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        createdConversationIdRef.current = conversation.id;
      } catch {}
    }
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      const convId = createdConversationIdRef.current;
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      createdConversationIdRef.current = null;
      if (convId) navigate(`/messages/${convId}`);
    }, 3000);
  }, [foundUser?.id, createConversation, navigate]);

  const handleOnScanned = useCallback((drop: { to_user_id: string | null }) => {
    haptics.success();
    if (drop.to_user_id) {
      fetchUser(drop.to_user_id).then((scannedUser) => {
        if (scannedUser) {
          setFoundUser(scannedUser);
          setShowSwapAnimation(true);
          setPhase('exchanging');
        }
      });
    }
  }, []);

  const handleOnConfirmed = useCallback(() => {
    if (phase !== 'exchanging') { setPhase('exchanging'); haptics.impact(); }
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
  const myProfileUrl = activeDropId ? buildFriendDropUrl(activeDropId) : '';

  const nfcBroadcastUrl = myProfileUrl;

  useEffect(() => {
    if (!myProfileUrl) { setQrSvg(''); return; }
    let cancelled = false;
    QRCode.toString(myProfileUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 280,
      color: { dark: primaryHex, light: '#00000000' },
    }).then((svg) => { if (!cancelled) setQrSvg(svg); }).catch(() => { if (!cancelled) setQrSvg(''); });
    return () => { cancelled = true; };
  }, [myProfileUrl, primaryHex]);

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    try { stopCameraStream(); } catch {}
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStarting(false);
    setCameraActive(false);
  }, []);

  const runAutoFriendAdd = useCallback(async (peerId: string) => {
    if (completingRef.current) return;
    completingRef.current = true;
    exchangeLockRef.current = true;
    try {
      await sendRequest.mutateAsync(peerId);
      if (activeDropId) {
        try { await friendDropSync.confirmDrop(activeDropId); } catch {}
        try { await friendDropSync.completeDrop(activeDropId); } catch {}
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
  }, [activeDropId, sendRequest, friendDropSync, autoCloseAfterSuccess]);

  const handleDropScan = useCallback(async (dropId: string) => {
    if (exchangeLockRef.current || completingRef.current) return;
    exchangeLockRef.current = true;
    stopScanning();
    haptics.success();
    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) {
      toast.error('This code has expired');
      exchangeLockRef.current = false;
      return;
    }
    setActiveDropId(dropId);
    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) {
        setFoundUser(ownerProfile);
        setShowSwapAnimation(true);
        setPhase('exchanging');
      }
    }
  }, [friendDropSync, stopScanning]);

  const handleAutoAdd = useCallback((userId: string) => {
    if (phase === 'success' || completingRef.current) return;
    setPhase('exchanging');
    setShowSwapAnimation(true);
    haptics.impact();
    void runAutoFriendAdd(userId);
  }, [phase, runAutoFriendAdd]);

  const handleNfcTarget = useCallback(async (target: FriendLinkTarget) => {
    if (exchangeLockRef.current || completingRef.current || phase === 'success' || phase === 'exchanging') return;
    exchangeLockRef.current = true;
    haptics.success();
    if (target.type === 'drop') {
      await handleDropScan(target.id);
      return;
    }
    if (target.id === profile?.id) {
      exchangeLockRef.current = false;
      return;
    }
    stopScanning();
    const peer = await fetchUser(target.id);
    if (!peer) {
      toast.error('Could not find user');
      exchangeLockRef.current = false;
      setPhase('activated');
      return;
    }
    setFoundUser(peer);
    await handleAutoAdd(target.id);
  }, [phase, profile?.id, handleDropScan, handleAutoAdd, stopScanning]);

  const nativeFriendDrop = useNativeFriendDrop({
    enabled: isActive && activeTab === 'tap',
    onPeerFound: (peer) => {
      setFoundUser({ id: peer.userId, username: peer.username, display_name: peer.displayName, avatar_url: peer.avatarUrl });
      setPhase('found');
      stopScanning();
    },
    onPeerConnected: (peer) => { void handleAutoAdd(peer.userId); },
  });

  useFriendLinkNfcSession({
    enabled: isActive && activeTab === 'tap' && phase === 'activated' && !nativeFriendDrop.isAvailable,
    broadcastUrl: nfcBroadcastUrl,
    onTarget: handleNfcTarget,
  });

  const handleClose = useCallback(() => {
    haptics.tap();
    stopScanning();
    if (webNfcRef.current) {
      webNfcRef.current.abort();
      webNfcRef.current = null;
    }

    const dropId = activeDropId;
    const phaseSnap = phase;
    const nativeActive = nativeFriendDrop.isActive;

    // Dismiss UI immediately — never block on network/NFC teardown.
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
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
        } catch { /* ignore */ }
      }
      if (nativeActive) {
        try {
          await nativeFriendDrop.stopSession();
        } catch { /* ignore */ }
      }
    })();
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync, phase]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('found');
    try {
      const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).single();
      if (error) throw error;
      setFoundUser(data);
    } catch { toast.error('Could not find user'); handleClose(); }
  }, [stopScanning, handleClose]);

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
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code) {
        const target = extractFriendTarget(code.data || '');
        if (target?.type === 'drop') { await handleDropScan(target.id); return; }
        if (target?.type === 'user' && target.id !== profile?.id) { handleFoundUser(target.id); return; }
      }
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };
    scanFrame();
  }, [profile?.id, handleDropScan, handleFoundUser, scanFrameMod, scanMaxWidth]);

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
        : 'Camera unavailable — try again or use Phone Tap';
      setCameraError(msg);
      toast.error(msg);
    } finally {
      setCameraStarting(false);
    }
  }, []);

  const retryNfcScan = useCallback(async () => {
    if (!isDespiaRuntime() && isIOSUA()) {
      toast.error('NFC needs the VYBE app on iPhone — or use QR', { duration: 5000 });
      return;
    }
    toast.success('Hold phones together back-to-back', { duration: 4000 });
    const target = await scanFriendLinkOnce();
    if (target) {
      await handleNfcTarget(target);
    } else {
      toast.info('No NFC detected — keep phones touching or try QR');
    }
  }, [handleNfcTarget]);

  const handleBumpRef = useRef<() => void>(() => {});

  const { requestPermission: requestMotionPermission } = useSwingDetection({
    enabled: showHomePill && !isActive,
    threshold: 6,
    swingWindow: 500,
    cooldown: 3000,
    onSwing: () => handleBumpRef.current(),
  });

  const handleBump = useCallback(async () => {
    if (!profile?.username || !user || isActive) return;
    await requestMotionPermission();
    setIsActive(true);
    setActiveTab('tap');
    haptics.impact();
    setPhase('activated');
    setTimeout(() => haptics.success(), 300);
    friendDropSync.createDrop().then((drop) => { if (drop) setActiveDropId(drop.id); });
  }, [profile?.username, user, friendDropSync, requestMotionPermission, isActive]);

  useEffect(() => {
    handleBumpRef.current = () => {
      void handleBump();
    };
  }, [handleBump]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      if (!isFullyLoggedIn(user, profile, authLoading)) return;
      void (async () => {
        await requestMotionPermission();
        const tab = (e as CustomEvent<{ tab?: ActiveTab }>).detail?.tab;
        const nextTab = tab === 'qr' || tab === 'tap' ? tab : 'tap';
        setIsActive(true);
        setActiveTab(nextTab);
        setPhase('activated');
        haptics.impact();
        if (profile?.username && user) {
          friendDropSync.createDrop().then((drop) => { if (drop) setActiveDropId(drop.id); });
        }
        if (nextTab === 'qr') {
          void startCamera();
        }
      })();
    };
    window.addEventListener(FRIEND_LINK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FRIEND_LINK_OPEN_EVENT, onOpen);
  }, [profile?.username, user, authLoading, friendDropSync, requestMotionPermission, startCamera]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser || completingRef.current) return;
    setShowSwapAnimation(true);
    setPhase('exchanging');
    haptics.impact();
    await runAutoFriendAdd(foundUser.id);
  }, [foundUser, runAutoFriendAdd]);

  useEffect(() => { return () => { stopScanning(); }; }, [stopScanning]);

  // While Friend Link is open: hide bottom nav + lock body scroll (iOS-safe)
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
    if (isActive && phase === 'activated' && activeTab === 'qr') return;
    stopScanning();
  }, [isActive, phase, activeTab, stopScanning]);

  useEffect(() => {
    if (isActive && activeTab === 'tap' && nativeFriendDrop.isAvailable && !nativeFriendDrop.isActive) {
      void nativeFriendDrop.startSession();
    } else if (!isActive && nativeFriendDrop.isActive) {
      void nativeFriendDrop.stopSession();
    }
    return () => {
      if (webNfcRef.current) {
        webNfcRef.current.abort();
        webNfcRef.current = null;
      }
      if (nativeFriendDrop.isActive) {
        void nativeFriendDrop.stopSession();
      }
    };
  }, [isActive, activeTab, nativeFriendDrop]);

  const tapListening =
    isActive &&
    activeTab === 'tap' &&
    phase === 'activated';

  if (!isFullyLoggedIn(user, profile, authLoading)) return null;

  return (
    <>
      <NFCSwapAnimation
        isActive={showSwapAnimation}
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
          if (foundUser && !completingRef.current) void runAutoFriendAdd(foundUser.id);
        }}
        onComplete={() => {
          setShowSwapAnimation(false);
        }}
      />

      {/* Floating pill — tap to open */}
      {!isActive && showHomePill && (
        <div
          className={cn(
            'fixed bottom-20 left-1/2 z-40 flex flex-col items-center -translate-x-1/2 duration-[280ms]',
            controlVisible
              ? 'translate-y-0 pointer-events-auto transition-transform ease-out'
              : 'translate-y-[200%] pointer-events-none transition-transform ease-in'
          )}
        >
          <div className="relative flex flex-col items-center">
            <FriendLinkActivateHint onEnableShake={() => { void requestMotionPermission(); }} />
            <button
              type="button"
              onClick={handleBump}
              className="group relative flex items-center gap-2.5 px-5 py-3 rounded-full active:scale-[0.95] transition-all duration-200 touch-manipulation"
            >
            {/* Animated gradient border */}
            <span className="absolute inset-0 rounded-full seamless-gradient-strip opacity-80" />
            {/* Inner fill */}
            <span className="absolute inset-[1.5px] rounded-full bg-card/95 backdrop-blur-xl" />
            {/* Glow */}
            <span className="absolute inset-0 rounded-full bg-primary/10 blur-lg group-hover:bg-primary/20 transition-colors" />
            {/* Content */}
            <QrCode className="relative z-10 h-4 w-4 text-primary" />
            <span className="relative z-10 text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Friend Link
            </span>
            {/* Pulse ring removed — animate-ping renders as a grey ghost on WebKit */}
            </button>
            <p className="mt-1.5 text-[10px] font-semibold text-foreground/80 drop-shadow-sm pointer-events-none">
              Tap or shake to open
            </p>
          </div>
        </div>
      )}

      {/* Bottom sheet — anchored above the bottom nav */}
      {isActive && (
        <>
          <div
            className={cn(
              'fixed inset-0 bg-black/70',
              !reduceFriendLinkMotion && 'backdrop-blur-sm'
            )}
            style={{ zIndex: 10080, touchAction: 'none', overscrollBehavior: 'contain' }}
            onClick={handleClose}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) handleClose();
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Friend Link"
            className="fixed inset-x-0 mx-auto w-full max-w-sm bg-card rounded-t-3xl sm:rounded-2xl border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
            style={{
              zIndex: 10081,
              bottom: 'env(safe-area-inset-bottom, 0px)',
              maxHeight: 'calc(100dvh - var(--sat, env(safe-area-inset-top, 0px)) - 24px)',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleClose}
              className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-muted-foreground/30 shrink-0"
              aria-label="Close Friend Link"
            />
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-1 pb-2 shrink-0 relative z-10">
              <h2 className="text-base font-semibold text-foreground">Friend Link</h2>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full hover:bg-muted/60 active:bg-muted transition-colors touch-manipulation"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>

            {phase === 'activated' && <FriendLinkSheetTips />}

            {/* Phases: found / exchanging / success override tabs */}
            {phase === 'found' && foundUser && (
              <div className="p-6 flex flex-col items-center gap-4 animate-in fade-in duration-200">
                <Avatar className="h-24 w-24 ring-4 ring-primary/20">
                  <AvatarImage src={foundUser.avatar_url || ''} />
                  <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                    {foundUser.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <h3 className="text-lg font-bold">{foundUser.display_name || foundUser.username}</h3>
                  <p className="text-sm text-muted-foreground">@{foundUser.username}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <Button variant="outline" className="flex-1 rounded-full" onClick={handleClose}>Cancel</Button>
                  <Button className="flex-1 rounded-full gap-1.5" onClick={handleAddFriend}>
                    <Check className="h-4 w-4" /> Add Friend
                  </Button>
                </div>
              </div>
            )}

            {phase === 'exchanging' && (
              <div className="p-8 flex flex-col items-center gap-4 animate-in fade-in duration-200" style={{ minHeight: 260 }}>
                <div className="relative flex items-center justify-center">
                  <Avatar className="h-16 w-16 -mr-3 ring-2 ring-card z-10">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Avatar className="h-16 w-16 -ml-3 ring-2 ring-card">
                    <AvatarImage src={foundUser?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary animate-pulse">Adding friend...</p>
                  <p className="text-xs text-muted-foreground mt-1">{foundUser?.display_name || foundUser?.username}</p>
                </div>
              </div>
            )}

            {phase === 'success' && (
              <div className="p-8 flex flex-col items-center gap-4 animate-in fade-in duration-200" style={{ minHeight: 260 }}>
                <div className="relative flex items-center justify-center">
                  <Avatar className="h-14 w-14 -mr-2 ring-2 ring-card z-10">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center -mx-1 z-20 ring-2 ring-card">
                    <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />
                  </div>
                  <Avatar className="h-14 w-14 -ml-2 ring-2 ring-card">
                    <AvatarImage src={foundUser?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold text-primary">Friend Added!</h3>
                  <p className="text-xs text-muted-foreground mt-1">{foundUser?.display_name || foundUser?.username}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span className="text-[11px]">Opening chat...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tap-first Friend Link — only show during activated phase */}
            {phase === 'activated' && (
              <div className="px-4 pb-4 space-y-4 overflow-hidden">
                <div className="relative grid grid-cols-2 gap-1 rounded-full bg-secondary/60 p-1">
                  {(['tap', 'qr'] as ActiveTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        // Trigger media APIs from the user gesture itself.
                        if (tab === 'qr') {
                          startCamera();
                        } else if (tab === 'tap' && !nativeFriendDrop.isAvailable) {
                          void retryNfcScan();
                        }
                      }}
                      className={cn(
                        'relative z-10 flex h-10 items-center justify-center gap-1.5 rounded-full text-xs font-bold transition-colors active:scale-[0.98]',
                        activeTab === tab ? 'text-primary-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {tab === 'tap' ? <Radio className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
                      {tab === 'tap' ? 'Phone Tap' : 'QR Scan'}
                    </button>
                  ))}
                  <motion.div
                    layout
                    className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/25"
                    style={{ left: activeTab === 'tap' ? 4 : 'calc(50% + 0px)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'tap' ? (
                    <motion.div
                      key="tap"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex flex-col items-center gap-4 py-2"
                    >
                      <FriendLinkTapAnimation
                        active={tapListening}
                        avatarUrl={profile?.avatar_url}
                        username={profile?.username}
                      />

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {tapListening ? (
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                          )}
                          <h3 className="text-base font-black text-foreground">
                            {tapListening ? 'Ready to tap' : 'Starting tap…'}
                          </h3>
                          {tapListening && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              LIVE
                            </span>
                          )}
                        </div>
                        <p className="mx-auto mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                          Hold phones back-to-back. Friend Link listens instantly and connects when a nearby phone is found.
                        </p>
                      </div>

                      {nativeFriendDrop.nearbyPeers.length > 0 && (
                        <div className="w-full space-y-2">
                          {nativeFriendDrop.nearbyPeers.map((peer) => (
                            <button
                              key={peer.peerId}
                              className="flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-3 text-left active:scale-[0.98]"
                              onClick={() => {
                                setFoundUser({ id: peer.userId, username: peer.username, display_name: peer.displayName, avatar_url: peer.avatarUrl });
                                setPhase('found');
                              }}
                            >
                              <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={peer.avatarUrl || ''} className="object-cover" />
                                <AvatarFallback className="font-bold">{peer.username[0]?.toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="min-w-0 flex-1 truncate text-sm font-bold">{peer.displayName || peer.username}</span>
                              <Check className="h-4 w-4 text-primary" />
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="grid gap-3"
                    >
                      <div className="rounded-[24px] bg-white p-4 shadow-2xl">
                        <div className="relative mx-auto aspect-square w-full max-w-[180px] overflow-hidden rounded-2xl bg-white">
                          {qrSvg ? (
                            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {friendDropSync.isCreating || !activeDropId ? 'Preparing your link…' : 'Loading QR…'}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="rounded-2xl bg-white p-1 shadow-lg">
                              <Avatar className="h-10 w-10 rounded-xl">
                                <AvatarImage src={profile?.avatar_url || ''} className="rounded-xl object-cover" />
                                <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-accent font-black text-primary-foreground">
                                  {profile?.username?.[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-center text-sm font-black text-card">@{profile?.username}</p>
                      </div>

                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] border border-primary/20 bg-card">
                        <video ref={videoRef} className={cn('h-full w-full object-cover', !cameraActive && 'opacity-0')} playsInline muted autoPlay />
                        <canvas ref={canvasRef} className="hidden" />
                        {cameraStarting && !cameraActive && !cameraError && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/70 px-4 text-center">
                            <Loader2 className="h-7 w-7 animate-spin text-primary" />
                            <span className="text-xs font-bold text-foreground">Opening camera…</span>
                          </div>
                        )}
                        {!cameraStarting && !cameraActive && !cameraError && (
                          <button
                            type="button"
                            onClick={() => startCamera()}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/70 px-4 text-center active:scale-[0.99]"
                          >
                            <ScanLine className="h-7 w-7 text-primary" />
                            <span className="text-xs font-bold text-foreground">Tap to open camera</span>
                          </button>
                        )}
                        {cameraError && !cameraActive && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-secondary/60 px-4 text-center">
                            <ScanLine className="h-7 w-7 text-primary" />
                            <span className="text-xs font-bold text-destructive">{cameraError}</span>
                            <button
                              type="button"
                              onClick={() => startCamera()}
                              className="mt-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground active:scale-95"
                            >
                              Try again
                            </button>
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 p-5">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="absolute h-8 w-8 rounded-md"
                              style={{
                                top: i < 2 ? 18 : 'auto',
                                bottom: i >= 2 ? 18 : 'auto',
                                left: i % 2 === 0 ? 18 : 'auto',
                                right: i % 2 === 1 ? 18 : 'auto',
                                borderColor: 'hsl(var(--primary))',
                                borderTopWidth: i < 2 ? 4 : 0,
                                borderBottomWidth: i >= 2 ? 4 : 0,
                                borderLeftWidth: i % 2 === 0 ? 4 : 0,
                                borderRightWidth: i % 2 === 1 ? 4 : 0,
                              }}
                            />
                          ))}
                        </div>
                        {cameraActive && (
                          <>
                            {/* Aurora radar wash */}
                            <motion.div
                              className="pointer-events-none absolute inset-0"
                              style={{
                                background:
                                  'radial-gradient(90% 60% at 50% 50%, hsl(var(--primary)/0.14), transparent 68%)',
                                mixBlendMode: 'screen',
                              }}
                              animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.96, 1.02, 0.96] }}
                              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                            />

                            {/* Orbiting scanner ring */}
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <motion.div
                                className="relative h-[180px] w-[180px] rounded-full border border-primary/25"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 7.5, repeat: Infinity, ease: 'linear' }}
                              >
                                <motion.div
                                  className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_20px_hsl(var(--primary)/0.95)]"
                                  animate={{ scale: [0.8, 1.18, 0.8], opacity: [0.55, 1, 0.55] }}
                                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                <motion.div
                                  className="absolute inset-0 rounded-full"
                                  style={{
                                    background:
                                      'conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary)/0.55) 36deg, transparent 84deg)',
                                    mask: 'radial-gradient(circle, transparent 65%, black 69%, black 100%)',
                                    WebkitMask:
                                      'radial-gradient(circle, transparent 65%, black 69%, black 100%)',
                                  }}
                                  animate={{ rotate: -360, opacity: [0.45, 0.85, 0.45] }}
                                  transition={{ duration: 5.2, repeat: Infinity, ease: 'linear' }}
                                />
                              </motion.div>
                            </div>

                            {/* Vertical sweep line */}
                            <div className="pointer-events-none absolute inset-0 px-6 py-[22px]">
                              <motion.div
                                className="relative h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent"
                                style={{ willChange: 'transform' }}
                                animate={{ y: [0, 176, 0] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: [0.32, 0, 0.24, 1] }}
                              >
                                <motion.div
                                  className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/70 to-transparent blur-[2px]"
                                  animate={{ opacity: [0.4, 0.95, 0.4] }}
                                  transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                                />
                              </motion.div>
                            </div>

                            {/* Horizontal cross sweep */}
                            <div className="pointer-events-none absolute inset-0 py-6 px-[22px]">
                              <motion.div
                                className="relative h-full w-0.5 bg-gradient-to-b from-transparent via-primary/90 to-transparent"
                                style={{ willChange: 'transform' }}
                                animate={{ x: [0, 230, 0] }}
                                transition={{ duration: 3.1, repeat: Infinity, ease: [0.22, 1, 0.36, 1] }}
                              />
                            </div>

                            {/* Data blips */}
                            <div className="pointer-events-none absolute inset-0">
                              {[0, 1, 2, 3, 4].map((i) => (
                                <motion.div
                                  key={i}
                                  className="absolute h-1.5 w-1.5 rounded-full bg-primary/80"
                                  style={{
                                    left: `${18 + i * 17}%`,
                                    top: `${22 + (i % 3) * 19}%`,
                                  }}
                                  animate={{
                                    opacity: [0, 1, 0],
                                    scale: [0.4, 1.25, 0.4],
                                  }}
                                  transition={{
                                    duration: 1.6 + i * 0.22,
                                    delay: i * 0.24,
                                    repeat: Infinity,
                                    ease: 'easeInOut',
                                  }}
                                />
                              ))}
                            </div>

                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                              <motion.div
                                className="absolute h-14 w-14 rounded-full border border-primary/55"
                                animate={{ scale: [0.92, 1.12, 0.92], opacity: [0.7, 0.15, 0.7] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <motion.div
                                className="absolute h-24 w-24 rounded-full border border-primary/25"
                                animate={{ scale: [0.85, 1.2, 0.85], opacity: [0.1, 0.4, 0.1] }}
                                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <motion.div
                                className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--primary)/0.85)]"
                                animate={{ scale: [0.85, 1.2, 0.85], opacity: [0.65, 1, 0.65] }}
                                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                              />
                            </div>

                            <div className="absolute bottom-4 inset-x-0 flex justify-center">
                              <span className="rounded-full bg-card/90 px-4 py-1.5 text-xs font-bold text-foreground backdrop-blur-sm">
                                Locking onto friend&apos;s QR
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            </div>

          </div>
        </>
      )}
    </>
  );
}
