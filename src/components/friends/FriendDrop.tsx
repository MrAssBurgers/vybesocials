import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, X, Check, QrCode, Camera,
  Copy, Share2, Loader2, Smartphone, Radio, Link2, Wifi
} from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync, FriendDrop as FriendDropType } from '@/hooks/useFriendDropSync';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import { useNFC } from '@/hooks/useNFC';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';
import { getPreloadedStream, requestCameraStream } from '@/hooks/useCameraPreload';
import { LiquidBottomSheet } from '@/components/ui/glass/LiquidBottomSheet';
import { NFCWriteSheet } from '@/components/social/NFCWriteSheet';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { buildFriendDropUrl } from '@/lib/friendLinkNfc';
import { useFriendLinkNfcSession } from '@/hooks/useFriendLinkNfcSession';
import { NFCSwapAnimation } from '@/components/friends/NFCSwapAnimation';
import { acquirePostCameraStream, stopStream } from '@/lib/postCameraStream';
import { isCameraSafeMode } from '@/lib/cameraSafeMode';
import { cn } from '@/lib/utils';

interface FriendDropProps {
  variant?: 'button' | 'icon' | 'banner';
}

type DropPhase = 'idle' | 'scanning' | 'detected' | 'found' | 'exchanging' | 'success';
type ActiveTab = 'qr' | 'tap';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

const smoothSpring = { type: 'spring' as const, stiffness: 380, damping: 28 };

/* ─── Tap Radar (with user avatar at center) ─── */
function TapRadar({ active, avatarUrl, fallback }: { active: boolean; avatarUrl?: string | null; fallback?: string }) {
  return (
    <div className="relative flex items-center justify-center w-44 h-44 mx-auto">
      {/* Outer expanding rings */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-primary/40"
          style={{ width: '100%', height: '100%' }}
          animate={active ? { scale: [0.35, 1.15], opacity: [0.7, 0] } : { scale: 0.35, opacity: 0 }}
          transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.65, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {/* Sweeping radar arm */}
      {active && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary)/0.45) 40deg, transparent 80deg)',
            mask: 'radial-gradient(circle, transparent 28%, black 30%, black 70%, transparent 72%)',
            WebkitMask: 'radial-gradient(circle, transparent 28%, black 30%, black 70%, transparent 72%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {/* Inner glow */}
      <motion.div
        className="absolute inset-4 rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary)/0.4), transparent 70%)' }}
        animate={active ? { opacity: [0.5, 0.95, 0.5], scale: [0.95, 1.06, 0.95] } : { opacity: 0.25 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Orbiting dots */}
      {active && [0, 1, 2].map((i) => (
        <motion.div
          key={`dot-${i}`}
          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
          style={{ marginTop: -3, marginLeft: -3 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4 + i * 0.6, repeat: Infinity, ease: 'linear' }}
        >
          <div style={{ transform: `translateX(${72 + i * 4}px)` }} className="w-1.5 h-1.5 rounded-full bg-primary" />
        </motion.div>
      ))}
      {/* Center avatar */}
      <motion.div
        className="relative z-10"
        animate={active ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Avatar className="h-20 w-20 ring-4 ring-primary/40 shadow-[0_0_28px_hsl(var(--primary)/0.55)]">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary/20 to-accent/20">
            {fallback?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {active && (
          <motion.div
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 ring-2 ring-card flex items-center justify-center"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={smoothSpring}
          >
            <Wifi className="h-3 w-3 text-white" />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

/* ─── Phones Connected Splash ─── */
function PhonesConnected({ myAvatar, myFallback }: { myAvatar?: string | null; myFallback?: string }) {
  return (
    <motion.div
      key="connected"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-5 py-8"
    >
      <div className="relative h-28 w-56 flex items-center justify-center">
        {/* Connection arc */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-1 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), hsl(var(--accent)), transparent)' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: [0, 1, 1] }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* Spark pulses traveling */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
            initial={{ left: '20%', opacity: 0 }}
            animate={{ left: ['20%', '80%'], opacity: [0, 1, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
          />
        ))}

        {/* Left phone */}
        <motion.div
          initial={{ x: -40, opacity: 0, rotate: -8 }}
          animate={{ x: -36, opacity: 1, rotate: -6 }}
          transition={{ ...smoothSpring }}
          className="absolute left-0 top-1/2 -translate-y-1/2"
        >
          <div className="relative w-12 h-20 rounded-xl bg-card border-2 border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.4)] flex items-center justify-center">
            <Avatar className="h-7 w-7">
              <AvatarImage src={myAvatar || undefined} />
              <AvatarFallback className="text-[10px] font-bold">{myFallback?.[0]?.toUpperCase() || '?'}</AvatarFallback>
            </Avatar>
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-foreground/30" />
          </div>
        </motion.div>

        {/* Right phone */}
        <motion.div
          initial={{ x: 40, opacity: 0, rotate: 8 }}
          animate={{ x: 36, opacity: 1, rotate: 6 }}
          transition={{ ...smoothSpring }}
          className="absolute right-0 top-1/2 -translate-y-1/2"
        >
          <div className="relative w-12 h-20 rounded-xl bg-card border-2 border-accent/40 shadow-[0_0_20px_hsl(var(--accent)/0.4)] flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <Wifi className="h-4 w-4 text-accent" />
            </motion.div>
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-foreground/30" />
          </div>
        </motion.div>

        {/* Central pulse */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30"
          initial={{ width: 0, height: 0, opacity: 0 }}
          animate={{ width: [0, 80], height: [0, 80], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
      </div>

      <div className="text-center">
        <motion.div
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center justify-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-base font-bold text-foreground">Phones connected!</h3>
        </motion.div>
        <p className="text-xs text-muted-foreground mt-1">Pulling profile…</p>
      </div>
    </motion.div>
  );
}

export function FriendDrop({ variant = 'button' }: FriendDropProps) {
  const { user, profile } = useAuth();
  const sendRequest = useSendFriendRequest();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [wasScanned, setWasScanned] = useState(false);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [nfcActive, setNfcActive] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('qr');
  const [showWriteSheet, setShowWriteSheet] = useState(false);
  const [showSwapAnimation, setShowSwapAnimation] = useState(false);
  const exchangeLockRef = useRef(false);
  const [qrSvg, setQrSvg] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { hasWebNFC, isSupported: nfcSupported, stopScan: nfcStopScan } = useNFC();
  const nativeFriendDrop = useNativeFriendDrop();

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch { return null; }
  };

  const friendDropSync = useFriendDropSync({
    enabled: isOpen,
    onScanned: useCallback((drop: FriendDropType) => {
      setWasScanned(true);
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
    }, []),
    onConfirmed: useCallback(() => { setPhase('exchanging'); haptics.impact(); }, []),
    onCompleted: useCallback(() => { setPhase('success'); haptics.success(); }, []),
  });

  const myProfileUrl = useMemo(() => (
    activeDropId
      ? buildFriendDropUrl(activeDropId)
      : profile?.username && user?.id
        ? `https://vybehub.app/add-friend/${user.id}`
        : ''
  ), [activeDropId, profile?.username, user?.id]);

  // Generate QR locally (instant, no network)
  useEffect(() => {
    if (!myProfileUrl) { setQrSvg(''); return; }
    let cancelled = false;
    QRCode.toString(myProfileUrl, {
      type: 'svg', errorCorrectionLevel: 'H', margin: 1,
      color: { dark: '#000000', light: '#00000000' },
    }).then((svg) => { if (!cancelled) setQrSvg(svg); }).catch(() => {});
    return () => { cancelled = true; };
  }, [myProfileUrl]);

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    if (exchangeLockRef.current) return;
    exchangeLockRef.current = true;
    stopScanning();
    haptics.success();
    setPhase('detected');
    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) {
      toast.error('This code has expired');
      setPhase('idle');
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

  const handleFoundUser = useCallback(async (userId: string) => {
    if (exchangeLockRef.current) return;
    exchangeLockRef.current = true;
    stopScanning();
    haptics.success();
    setPhase('detected');
    const userData = await fetchUser(userId);
    if (userData) {
      setFoundUser(userData);
      setShowSwapAnimation(true);
      setPhase('exchanging');
      haptics.impact();
    } else {
      toast.error('Could not find user');
      setPhase('idle');
      exchangeLockRef.current = false;
    }
  }, [stopScanning]);

  const handleOpen = useCallback(async () => {
    if (!profile?.username) { toast.error('Complete your profile first'); return; }
    requestCameraStream({ facingMode: 'environment', width: 640, height: 480 });
    setIsOpen(true);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setIsScanning(false);
    const tapAvailable = hasWebNFC || nativeFriendDrop.isAvailable || nfcSupported;
    setActiveTab(tapAvailable ? 'tap' : 'qr');
    const drop = await friendDropSync.createDrop();
    if (drop) setActiveDropId(drop.id);
  }, [profile?.username, friendDropSync, hasWebNFC, nativeFriendDrop.isAvailable, nfcSupported]);

  const startScanning = useCallback(async () => {
    setIsScanning(true);
    haptics.tap();
    try {
      let stream = getPreloadedStream();
      if (!stream) {
        stream = isCameraSafeMode()
          ? await acquirePostCameraStream('environment')
          : await requestCameraStream({ facingMode: 'environment', width: 640, height: 480 });
      }
      if (!stream) { toast.error('Could not access camera'); setIsScanning(false); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const scanFrame = async () => {
        if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
          animationFrameRef.current = requestAnimationFrame(scanFrame); return;
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
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Could not access camera');
      setIsScanning(false);
    }
  }, [user?.id, handleDropScan, handleFoundUser]);

  useFriendLinkNfcSession({
    enabled: isOpen && activeTab === 'tap' && !!myProfileUrl && !nativeFriendDrop.isAvailable,
    broadcastUrl: myProfileUrl,
    onTarget: useCallback(
      (target) => {
        if (target.type === 'drop') void handleDropScan(target.id);
        else if (target.id !== user?.id) void handleFoundUser(target.id);
      },
      [handleDropScan, handleFoundUser, user?.id],
    ),
  });

  useEffect(() => {
    if (!isOpen || activeTab !== 'tap') return;
    if (nativeFriendDrop.isAvailable) {
      void nativeFriendDrop.startSession().then(() => setNfcActive(true));
    } else {
      setNfcActive(true);
    }
    return () => { setNfcActive(false); };
  }, [isOpen, activeTab, nativeFriendDrop]);

  const handleClose = useCallback(async () => {
    stopScanning();
    nfcStopScan();
    if (nativeFriendDrop.isAvailable) await nativeFriendDrop.stopSession();
    setNfcActive(false);
    if (activeDropId) await friendDropSync.cancelDrop(activeDropId);
    setIsOpen(false);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setActiveDropId(null);
    setIsScanning(false);
    setShowSwapAnimation(false);
    exchangeLockRef.current = false;
  }, [stopScanning, activeDropId, friendDropSync, nfcStopScan, nativeFriendDrop]);

  const completeFriendAdd = useCallback(async () => {
    if (!foundUser || exchangeLockRef.current) return;
    exchangeLockRef.current = true;
    try {
      if (activeDropId) await friendDropSync.confirmDrop(activeDropId);
      await sendRequest.mutateAsync(foundUser.id);
      if (activeDropId) await friendDropSync.completeDrop(activeDropId);
      setPhase('success');
      haptics.success();
      setTimeout(() => handleClose(), 2200);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('already')) {
        toast.info('Already friends or request pending!');
        setPhase('success');
        setTimeout(() => handleClose(), 1500);
      } else {
        toast.error('Failed to send request');
        setPhase('found');
        setShowSwapAnimation(false);
        exchangeLockRef.current = false;
      }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync, handleClose]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser || exchangeLockRef.current) return;
    setShowSwapAnimation(true);
    setPhase('exchanging');
    haptics.impact();
    await completeFriendAdd();
  }, [foundUser, completeFriendAdd]);

  useEffect(() => () => { stopScanning(); }, [stopScanning]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(myProfileUrl);
    toast.success('Link copied!');
    haptics.tap();
  }, [myProfileUrl]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Add me on VYBE!', text: 'Add me as a friend on VYBE', url: myProfileUrl }); }
      catch { copyLink(); }
    } else { copyLink(); }
  }, [myProfileUrl, copyLink]);

  /* ── Overlay phases ── */
  const renderOverlay = () => {
    if (phase === 'detected') {
      if (activeTab === 'tap') {
        return <PhonesConnected myAvatar={profile?.avatar_url} myFallback={profile?.username || ''} />;
      }
      return (
        <motion.div key="detected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-3 py-10"
        >
          <motion.div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"
            animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
          >
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </motion.div>
          <p className="text-sm font-medium text-muted-foreground">Finding profile…</p>
        </motion.div>
      );
    }

    if (phase === 'found' && foundUser) {
      return (
        <motion.div key="found" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4 py-4"
        >
          <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={smoothSpring} className="relative">
            <div className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-xl" />
            <Avatar className="h-20 w-20 ring-2 ring-primary/40 relative">
              <AvatarImage src={foundUser.avatar_url || undefined} />
              <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                {foundUser.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <motion.div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-card"
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, ...smoothSpring }}
            >
              <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
            </motion.div>
          </motion.div>
          <div className="text-center">
            <h3 className="text-lg font-bold">{foundUser.display_name || foundUser.username}</h3>
            <p className="text-xs text-muted-foreground">@{foundUser.username?.trim()}</p>
            {foundUser.bio && <p className="text-xs text-muted-foreground/80 mt-1.5 max-w-[240px] line-clamp-2">{foundUser.bio}</p>}
          </div>
          <div className="flex gap-2 w-full px-1 pt-1">
            <Button variant="outline" className="flex-1 rounded-full h-11" onClick={() => { setFoundUser(null); setPhase('idle'); }}>Cancel</Button>
            <Button className="flex-1 rounded-full h-11 gap-1.5 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30"
              onClick={handleAddFriend} disabled={sendRequest.isPending}>
              <UserPlus className="h-4 w-4" /> Add Friend
            </Button>
          </div>
        </motion.div>
      );
    }

    if (phase === 'exchanging') {
      return (
        <motion.div key="exchanging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-5 py-10"
        >
          {/* Two avatars magnetically collide in the middle */}
          <div className="relative h-24 w-56 flex items-center justify-center">
            {/* Backdrop glow */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/40 via-fuchsia-500/30 to-accent/40 blur-2xl"
              initial={{ width: 0, height: 0, opacity: 0 }}
              animate={{ width: 160, height: 160, opacity: [0, 0.8, 0.4] }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            {/* Energy beam between */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] rounded-full"
              style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), #fff, hsl(var(--accent)), transparent)' }}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: [0, 140, 60], opacity: [0, 1, 0.6] }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            {/* Left avatar — slides in from the left */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2"
              initial={{ left: '-10%', scale: 0.85, rotate: -10 }}
              animate={{ left: ['-10%', '38%', '34%'], scale: [0.85, 1, 1], rotate: [-10, 0, 0] }}
              transition={{ duration: 0.85, ease: [0.16, 0.9, 0.3, 1] }}
            >
              <Avatar className="h-14 w-14 ring-2 ring-primary shadow-[0_0_24px_hsl(var(--primary)/0.7)]">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="font-bold bg-primary/15 text-primary">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </motion.div>
            {/* Right avatar — slides in from the right */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2"
              initial={{ right: '-10%', scale: 0.85, rotate: 10 }}
              animate={{ right: ['-10%', '38%', '34%'], scale: [0.85, 1, 1], rotate: [10, 0, 0] }}
              transition={{ duration: 0.85, ease: [0.16, 0.9, 0.3, 1] }}
            >
              <Avatar className="h-14 w-14 ring-2 ring-accent shadow-[0_0_24px_hsl(var(--accent)/0.7)]">
                <AvatarImage src={foundUser?.avatar_url || ''} />
                <AvatarFallback className="font-bold bg-accent/15 text-accent-foreground">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </motion.div>
            {/* Spark burst at the collision point */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <motion.span
                key={i}
                className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                initial={{ x: -3, y: -3, opacity: 0 }}
                animate={{
                  x: Math.cos((i * Math.PI) / 4) * 48 - 3,
                  y: Math.sin((i * Math.PI) / 4) * 48 - 3,
                  opacity: [0, 1, 0],
                  scale: [0.4, 1, 0.2],
                }}
                transition={{ duration: 0.7, delay: 0.55, ease: 'easeOut' }}
              />
            ))}
          </div>
          <motion.p
            initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
            className="text-sm font-semibold bg-gradient-to-r from-primary via-fuchsia-400 to-accent bg-clip-text text-transparent"
          >
            Linking vybes…
          </motion.p>
        </motion.div>
      );
    }

    if (phase === 'success') {
      return (
        <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="relative flex flex-col items-center gap-4 py-10 overflow-hidden"
        >
          {/* Shockwave rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`wave-${i}`}
              className="absolute top-[88px] left-1/2 -translate-x-1/2 rounded-full border-2 border-primary/50"
              initial={{ width: 0, height: 0, opacity: 0.9 }}
              animate={{ width: 280, height: 280, opacity: 0, x: '-50%', y: '-50%' }}
              transition={{ duration: 1.4, delay: i * 0.18, ease: 'easeOut' }}
            />
          ))}
          {/* Confetti shower */}
          {Array.from({ length: 18 }).map((_, i) => {
            const colors = ['#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e', '#ef4444'];
            const x = (i - 9) * 14 + (Math.random() * 10 - 5);
            const drift = Math.random() * 30 - 15;
            return (
              <motion.span
                key={`c-${i}`}
                className="absolute top-1/2 left-1/2 w-2 h-3 rounded-sm"
                style={{ background: colors[i % colors.length] }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: x + drift,
                  y: [-10, 120 + Math.random() * 40],
                  rotate: Math.random() * 720 - 360,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1.4, delay: 0.1 + Math.random() * 0.25, ease: [0.2, 0.7, 0.4, 1] }}
              />
            );
          })}
          {/* Big check medallion with halo */}
          <motion.div
            className="relative z-10 h-20 w-20 rounded-full bg-gradient-to-br from-primary via-fuchsia-500 to-accent flex items-center justify-center shadow-[0_0_40px_hsl(var(--primary)/0.7)]"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: [0, 1.25, 1], rotate: [-45, 8, 0] }}
            transition={{ duration: 0.7, ease: [0.16, 1.2, 0.3, 1] }}
          >
            <motion.div
              className="absolute -inset-2 rounded-full border-2 border-white/40"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.4], opacity: [0.7, 0] }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            <Check className="h-10 w-10 text-white drop-shadow" strokeWidth={3.5} />
          </motion.div>
          {/* Tiny avatar pair under the check */}
          {foundUser && (
            <motion.div
              className="relative flex items-center -mt-1 z-10"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35, ...smoothSpring }}
            >
              <Avatar className="h-9 w-9 ring-2 ring-card -mr-2">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="text-xs font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <Avatar className="h-9 w-9 ring-2 ring-card">
                <AvatarImage src={foundUser.avatar_url || ''} />
                <AvatarFallback className="text-xs font-bold">{foundUser.username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </motion.div>
          )}
          <motion.div
            className="text-center z-10"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <h3 className="text-xl font-extrabold bg-gradient-to-r from-primary via-fuchsia-400 to-accent bg-clip-text text-transparent">
              You're connected!
            </h3>
            {foundUser && (
              <p className="text-xs text-muted-foreground mt-1">
                @{profile?.username} <span className="text-primary mx-1">×</span> @{foundUser.username}
              </p>
            )}
          </motion.div>
        </motion.div>
      );
    }

    return null;
  };

  /* ── QR Tab ── */
  const renderQRTab = () => (
    <motion.div key="qr-tab" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3"
    >
      {/* "Scanned" pulse */}
      <AnimatePresence>
        {wasScanned && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-emerald-500 font-medium">Someone scanned your code</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR card with avatar centered */}
      <div className="relative w-full max-w-[220px]">
        <div className="absolute inset-0 -m-1 rounded-[28px] bg-gradient-to-br from-primary/40 via-accent/30 to-primary/40 blur-xl opacity-60" />
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={smoothSpring}
          className="relative rounded-[24px] bg-white p-5 shadow-2xl"
        >
          <div className="relative aspect-square w-full">
            {qrSvg ? (
              <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-black/30 animate-spin" />
              </div>
            )}
            {/* center avatar */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-2xl bg-white p-1 shadow-md">
                <Avatar className="h-11 w-11 rounded-xl">
                  <AvatarImage src={profile?.avatar_url || undefined} className="rounded-xl" />
                  <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold">
                    {profile?.username?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
          <p className="text-center mt-3 text-sm font-bold text-black">@{profile?.username?.trim()}</p>
          <p className="text-center text-[10px] text-black/40 -mt-0.5">Scan to add me on VYBE</p>
        </motion.div>
      </div>

      {/* Share row */}
      <div className="flex gap-2 w-full">
        <button onClick={copyLink}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-full bg-secondary/60 hover:bg-secondary active:scale-95 transition-all text-xs font-medium"
        >
          <Link2 className="h-3.5 w-3.5" /> Copy link
        </button>
        <button onClick={shareLink}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-full bg-secondary/60 hover:bg-secondary active:scale-95 transition-all text-xs font-medium"
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      {/* Scan button / video */}
      {isScanning ? (
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black border border-border/40">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          {/* corners */}
          <div className="absolute inset-0 pointer-events-none p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="absolute w-7 h-7" style={{
                top: i < 2 ? 16 : 'auto', bottom: i >= 2 ? 16 : 'auto',
                left: i % 2 === 0 ? 16 : 'auto', right: i % 2 === 1 ? 16 : 'auto',
                borderColor: 'hsl(var(--primary))',
                borderTopWidth: i < 2 ? 3 : 0, borderBottomWidth: i >= 2 ? 3 : 0,
                borderLeftWidth: i % 2 === 0 ? 3 : 0, borderRightWidth: i % 2 === 1 ? 3 : 0,
                borderRadius: 8,
              }} />
            ))}
          </div>
          {/* sweeping line */}
          <motion.div
            className="absolute left-5 right-5 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_8px_hsl(var(--primary))]"
            animate={{ top: ['16px', 'calc(100% - 18px)', '16px'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="absolute bottom-3 inset-x-0 flex justify-center">
            <button onClick={stopScanning} className="px-4 py-1.5 rounded-full text-xs font-medium bg-card/90 backdrop-blur-sm border border-border/40">
              Stop
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startScanning}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-gradient-to-r from-primary/15 to-accent/15 hover:from-primary/25 hover:to-accent/25 active:scale-[0.98] border border-primary/25 transition-all"
        >
          <Camera className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">Scan a QR code</span>
        </button>
      )}
    </motion.div>
  );

  /* ── Tap Tab ── */
  const tapAvailable = nfcSupported || nativeFriendDrop.isAvailable;
  const renderTapTab = () => (
    <motion.div key="tap-tab" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-4 py-2"
    >
      <TapRadar
        active={nfcActive || nativeFriendDrop.isActive}
        avatarUrl={profile?.avatar_url}
        fallback={profile?.username || ''}
      />

      <div className="text-center space-y-1.5">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-base font-bold">
            {nfcActive || nativeFriendDrop.isActive ? 'Ready to tap' : tapAvailable ? 'Starting…' : 'Tap not available'}
          </h3>
          {(nfcActive || nativeFriendDrop.isActive) && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-500 font-semibold">LIVE</span>
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
          {tapAvailable
            ? 'Hold your phone back-to-back with your friend\'s phone to add each other instantly.'
            : 'Your device doesn\'t support NFC tap. Try the QR code instead.'}
        </p>
      </div>

      <div className="w-full grid grid-cols-3 gap-2 pt-1">
        {[
          { icon: Radio, label: 'NFC' },
          { icon: Smartphone, label: 'Tap' },
          { icon: UserPlus, label: 'Add' },
        ].map((s, i) => (
          <div key={s.label} className="flex flex-col items-center gap-1 py-2 rounded-xl bg-secondary/40">
            <s.icon className={cn('h-4 w-4', i === 0 && (nfcActive || nativeFriendDrop.isActive) ? 'text-primary' : 'text-muted-foreground')} />
            <span className="text-[10px] font-medium text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Program a physical NFC tag with your friend-link URL (Despia only). */}
      {isDespiaRuntime() && user?.id && (
        <button
          onClick={() => setShowWriteSheet(true)}
          className="w-full mt-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 active:scale-[0.98] transition-all"
        >
          <Radio className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">Program a blank tag</span>
        </button>
      )}
    </motion.div>
  );

  /* ── Trigger ── */
  const renderTrigger = () => {
    switch (variant) {
      case 'icon':
        return (
          <Button variant="ghost" size="icon" onClick={handleOpen}>
            <UserPlus className="h-5 w-5" />
          </Button>
        );
      case 'banner':
        return (
          <motion.button onClick={handleOpen}
            className="w-full p-3.5 rounded-2xl border border-primary/20 flex items-center gap-3.5 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 backdrop-blur-sm"
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          >
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-md shadow-primary/30">
              <QrCode className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-left flex-1">
              <h4 className="font-semibold text-sm">Friend Link</h4>
              <p className="text-[11px] text-muted-foreground">QR · Tap · Share — instant</p>
            </div>
          </motion.button>
        );
      default:
        return (
          <Button onClick={handleOpen} className="gap-2 text-xs rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground">
            <QrCode className="h-4 w-4" />
            Friend Link
          </Button>
        );
    }
  };

  const showOverlay = phase !== 'idle';

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
        onAutoAdd={() => { void completeFriendAdd(); }}
        onComplete={() => {
          setShowSwapAnimation(false);
        }}
      />

      {renderTrigger()}

      <LiquidBottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="Friend Link"
        maxHeight={82}
      >
        <div className="px-4 pb-4 min-h-[480px] overflow-hidden">
          {/* Lock inner scroll so the sheet doesn't visually shift on press */}
          <AnimatePresence mode="wait">
            {showOverlay ? (
              renderOverlay()
            ) : (
              <motion.div key="tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Segmented switcher */}
                <div className="relative flex p-1 rounded-full bg-secondary/50 mb-4">
                  <motion.div
                    layout
                    transition={smoothSpring}
                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-card shadow-md"
                    style={{ left: activeTab === 'qr' ? 4 : 'calc(50% + 0px)' }}
                  />
                  <button
                    onClick={() => { setActiveTab('qr'); stopScanning(); }}
                    className={cn(
                      'relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors',
                      activeTab === 'qr' ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </button>
                  <button
                    onClick={() => { setActiveTab('tap'); stopScanning(); }}
                    className={cn(
                      'relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors',
                      activeTab === 'tap' ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <Radio className="h-3.5 w-3.5" /> Phone Tap
                    {tapAvailable && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'qr' ? renderQRTab() : renderTapTab()}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LiquidBottomSheet>

      {user?.id && (
        <NFCWriteSheet
          isOpen={showWriteSheet}
          onClose={() => setShowWriteSheet(false)}
          value={`https://vybehub.app/add-friend/${user.id}`}
        />
      )}
    </>
  );
}
