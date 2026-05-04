import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Check, Smartphone, QrCode, MessageCircle, Radio, Wifi, Loader2, ScanLine } from 'lucide-react';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { getPreloadedStream } from '@/hooks/useCameraPreload';
import jsQR from 'jsqr';
import { getPrimaryHex } from '@/lib/themeColor';
import { navVisibility } from '@/lib/navVisibility';
import { cn } from '@/lib/utils';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';
type ActiveTab = 'tap' | 'qr';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const sendRequest = useSendFriendRequest();
  const createConversation = useCreateConversation();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tap');
  const [qrSvg, setQrSvg] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
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

  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        createdConversationIdRef.current = conversation.id;
      } catch {}
    }
    setTimeout(() => {
      const convId = createdConversationIdRef.current;
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      createdConversationIdRef.current = null;
      if (convId) navigate(`/messages/${convId}`);
    }, 3000);
  }, [foundUser?.id, createConversation, navigate]);

  const handleOnScanned = useCallback((drop: any) => {
    haptics.success();
    if (drop.to_user_id) {
      fetchUser(drop.to_user_id).then((scannedUser) => {
        if (scannedUser) {
          setFoundUser(scannedUser);
          setPhase('exchanging');
          setTimeout(async () => {
            try { await sendRequest.mutateAsync(scannedUser.id); } catch {}
            if (activeDropId) await friendDropSync.completeDrop(activeDropId);
          }, 1500);
        }
      });
    }
  }, [activeDropId, sendRequest]);

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

  const nativeFriendDrop = useNativeFriendDrop({
    enabled: isActive && activeTab === 'tap',
    onPeerFound: (peer) => {
      setFoundUser({ id: peer.userId, username: peer.username, display_name: peer.displayName, avatar_url: peer.avatarUrl });
      setPhase('found');
      stopScanning();
    },
    onPeerConnected: (peer) => handleAutoAdd(peer.userId),
  });

  const primaryHex = getPrimaryHex();
  const myProfileUrl = activeDropId
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username ? `https://vybehub.app/add-friend/${user?.id}` : '';

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

  const handleAutoAdd = useCallback(async (userId: string) => {
    if (phase === 'exchanging' || phase === 'success') return;
    setPhase('exchanging');
    haptics.impact();
    try {
      await sendRequest.mutateAsync(userId);
      setPhase('success');
      haptics.success();
      autoCloseAfterSuccess(userId);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        setPhase('success');
        autoCloseAfterSuccess(userId);
      }
    }
  }, [phase, sendRequest, autoCloseAfterSuccess]);

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();
    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) { toast.error('This code has expired'); return; }
    setActiveDropId(dropId);
    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) { setFoundUser(ownerProfile); setPhase('exchanging'); }
    }
  }, [friendDropSync, stopScanning]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('found');
    try {
      const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).single();
      if (error) throw error;
      setFoundUser(data);
    } catch { toast.error('Could not find user'); handleClose(); }
  }, [stopScanning]);

  const startScanLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const scanFrame = async () => {
      if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code) {
        const url = code.data;
        const dropMatch = url?.match(/\/friend-drop\/([a-zA-Z0-9-]+)/);
        if (dropMatch) { await handleDropScan(dropMatch[1]); return; }
        const userMatch = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
        if (userMatch && userMatch[1] !== user?.id) { handleFoundUser(userMatch[1]); return; }
      }
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };
    scanFrame();
  }, [user?.id, handleDropScan, handleFoundUser]);

  startScanLoopRef.current = startScanLoop;

  const startCamera = useCallback(async () => {
    try {
      let stream = getPreloadedStream();
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        startScanLoopRef.current();
      }
    } catch (err) {
      console.warn('[FriendLink] Camera access failed:', err);
    }
  }, []);

  const handleBump = useCallback(async () => {
    if (!profile?.username || !user) return;
    setIsActive(true);
    setActiveTab('tap');
    haptics.impact();
    setPhase('activated');
    setTimeout(() => haptics.success(), 300);
    friendDropSync.createDrop().then((drop) => { if (drop) setActiveDropId(drop.id); });
  }, [profile?.username, user, friendDropSync]);

  useSwingDetection({
    enabled: !isActive && !!profile?.username,
    threshold: 6,
    swingWindow: 500,
    cooldown: 3000,
    onSwing: handleBump,
  });

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;
    setPhase('exchanging');
    haptics.impact();
    try { if (activeDropId) await friendDropSync.confirmDrop(activeDropId); } catch {}
    try {
      await sendRequest.mutateAsync(foundUser.id);
      try { if (activeDropId) await friendDropSync.completeDrop(activeDropId); } catch {}
      if (!activeDropId) { setPhase('success'); haptics.success(); autoCloseAfterSuccess(); }
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        try { if (activeDropId) await friendDropSync.completeDrop(activeDropId); } catch { setPhase('success'); autoCloseAfterSuccess(); }
      } else { toast.error('Failed to send request'); setPhase('found'); }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync, autoCloseAfterSuccess]);

  const handleClose = useCallback(async () => {
    stopScanning();
    if (activeDropId && phase !== 'success') await friendDropSync.cancelDrop(activeDropId);
    if (nativeFriendDrop.isActive) await nativeFriendDrop.stopSession();
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync, phase]);

  useEffect(() => { return () => { stopScanning(); }; }, [stopScanning]);

  // While Friend Link is open: hide bottom nav + lock body scroll (iOS-safe)
  useEffect(() => {
    if (!isActive) return;
    navVisibility.setInDesigner(true);
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      navVisibility.setInDesigner(false);
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isActive]);

  // Start camera only when QR scanning is visible, so Friend Link opens instantly.
  useEffect(() => {
    if (!isActive || phase !== 'activated') return;
    if (activeTab === 'qr') {
      const timer = window.setTimeout(startCamera, 120);
      return () => { window.clearTimeout(timer); stopScanning(); };
    }
    stopScanning();
  }, [isActive, phase, activeTab, startCamera, stopScanning]);

  // Start NFC/native tap when switching to Phone Tap.
  useEffect(() => {
    if (isActive && activeTab === 'tap' && nativeFriendDrop.isAvailable && !nativeFriendDrop.isActive) {
      nativeFriendDrop.startSession();
    }
  }, [isActive, activeTab, nativeFriendDrop]);

  const tapLive = activeTab === 'tap' && (nativeFriendDrop.isActive || !nativeFriendDrop.isAvailable);

  if (!profile?.username) return null;

  return (
    <>
      {/* Floating pill — tap to open */}
      {!isActive && isMobile && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
          <button
            onClick={handleBump}
            className="group relative flex items-center gap-2.5 px-5 py-3 rounded-full active:scale-[0.95] transition-all duration-200"
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
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full border border-primary/30 animate-ping opacity-20" />
          </button>
        </div>
      )}

      {/* Bottom sheet — anchored above the bottom nav */}
      {isActive && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={handleClose}
          />
          <div
            className="fixed inset-x-0 mx-auto w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300"
            style={{
              zIndex: 9999,
              bottom: 'env(safe-area-inset-bottom, 0px)',
              maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 24px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <h2 className="text-base font-semibold text-foreground">Friend Link</h2>
              <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>


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
                      onClick={() => setActiveTab(tab)}
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
                      <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-accent/10">
                        {[0, 1, 2, 3].map((i) => (
                          <motion.div
                            key={i}
                            className="absolute h-24 w-24 rounded-full border border-primary/35"
                            initial={false}
                            animate={{ scale: [0.55, 2.45], opacity: [0.7, 0] }}
                            transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.62, ease: [0.22, 1, 0.36, 1] }}
                          />
                        ))}
                        <motion.div
                          className="absolute h-44 w-44 rounded-full"
                          style={{
                            background: 'conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary)/0.5) 44deg, transparent 92deg)',
                            mask: 'radial-gradient(circle, transparent 28%, black 30%, black 70%, transparent 72%)',
                            WebkitMask: 'radial-gradient(circle, transparent 28%, black 30%, black 70%, transparent 72%)',
                          }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
                        />
                        <div className="relative flex items-center justify-center gap-4">
                          <motion.div animate={{ x: tapLive ? [0, 10, 0] : 0, rotate: -7 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
                            <div className="relative h-24 w-14 rounded-[18px] border border-primary/35 bg-card shadow-2xl shadow-primary/20">
                              <div className="absolute left-1/2 top-1 h-3 w-5 -translate-x-1/2 rounded-b-lg bg-muted" />
                              <div className="absolute inset-x-2 bottom-3 top-5 overflow-hidden rounded-xl bg-secondary">
                                <Avatar className="h-full w-full rounded-xl">
                                  <AvatarImage src={profile?.avatar_url || ''} className="h-full w-full object-cover" />
                                  <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-black text-primary-foreground">
                                    {profile?.username?.[0]?.toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            </div>
                          </motion.div>
                          <motion.div className="flex flex-col items-center gap-1" animate={{ scale: tapLive ? [1, 1.12, 1] : 1 }} transition={{ duration: 1.2, repeat: Infinity }}>
                            <Wifi className="h-5 w-5 text-primary" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          </motion.div>
                          <motion.div animate={{ x: tapLive ? [0, -10, 0] : 0, rotate: 7 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
                            <div className="relative flex h-24 w-14 items-center justify-center rounded-[18px] border border-accent/35 bg-card shadow-2xl shadow-accent/20">
                              <div className="absolute left-1/2 top-1 h-3 w-5 -translate-x-1/2 rounded-b-lg bg-muted" />
                              <Smartphone className="h-8 w-8 text-accent" />
                            </div>
                          </motion.div>
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                          <h3 className="text-base font-black text-foreground">Ready to tap</h3>
                          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">LIVE</span>
                        </div>
                        <p className="mx-auto mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
                          Hold phones together. Friend Link keeps scanning instantly and confirms the connection when a nearby phone is found.
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
                            <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
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
                        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                        <canvas ref={canvasRef} className="hidden" />
                        {!cameraActive && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-secondary/60">
                            <ScanLine className="h-7 w-7 text-primary" />
                            <span className="text-xs font-bold text-muted-foreground">Camera warming up…</span>
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
                        <motion.div
                          className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-lg shadow-primary"
                          animate={{ top: ['22px', 'calc(100% - 24px)', '22px'] }}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div className="absolute bottom-4 inset-x-0 flex justify-center">
                          <span className="rounded-full bg-card/90 px-4 py-1.5 text-xs font-bold text-foreground backdrop-blur-sm">Point at a friend's QR</span>
                        </div>
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
