import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, QrCode, Camera, 
  Copy, Share2, Loader2, Smartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync, FriendDrop as FriendDropType } from '@/hooks/useFriendDropSync';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import { getPrimaryHex } from '@/lib/themeColor';
import { useNFC } from '@/hooks/useNFC';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';
import { preloadCameraStream, getPreloadedStream, requestCameraStream } from '@/hooks/useCameraPreload';
import { LiquidBottomSheet } from '@/components/ui/glass/LiquidBottomSheet';

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

const smoothSpring = { type: "spring" as const, stiffness: 400, damping: 30 };

// ===== RADAR ANIMATION =====
function PhoneTapRadar({ active }: { active: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-36 h-36 mx-auto">
      {/* Radar rings */}
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-primary/20"
          style={{ width: `${i * 44}px`, height: `${i * 44}px` }}
          animate={active ? {
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.1, 0.3],
          } : {}}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.3,
            ease: 'easeInOut',
          }}
        />
      ))}
      {/* Sweeping line */}
      {active && (
        <motion.div
          className="absolute w-[1px] h-[66px] origin-bottom bg-gradient-to-t from-primary/40 to-transparent"
          style={{ bottom: '50%' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {/* Center icon */}
      <motion.div
        className="relative z-10 w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center"
        animate={active ? { scale: [1, 1.06, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <Smartphone className="h-5 w-5 text-primary" />
      </motion.div>
      {/* Pulse dot */}
      {active && (
        <motion.div
          className="absolute w-2 h-2 rounded-full bg-primary"
          animate={{ scale: [1, 1.8, 1], opacity: [1, 0, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      )}
    </div>
  );
}

// ===== MAIN COMPONENT =====
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { hasWebNFC, isSupported: nfcSupported, shareProfile: nfcShareProfile, stopScan: nfcStopScan } = useNFC();
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
          if (scannedUser) { setFoundUser(scannedUser); setPhase('found'); }
        });
      }
    }, []),
    onConfirmed: useCallback(() => { setPhase('exchanging'); haptics.impact(); }, []),
    onCompleted: useCallback(() => { setPhase('success'); haptics.success(); }, []),
  });

  const myProfileUrl = activeDropId 
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username ? `https://vybehub.app/add-friend/${user?.id}` : '';
  
  const primaryHex = getPrimaryHex();
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=${primaryHex}&format=svg&ecc=H&margin=2`
    : '';

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); }
    setIsScanning(false);
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();
    setPhase('detected');
    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) { toast.error('This code has expired'); setPhase('idle'); return; }
    setActiveDropId(dropId);
    if (scannedDrop.from_user_id) {
      setTimeout(async () => {
        const ownerProfile = await fetchUser(scannedDrop.from_user_id);
        if (ownerProfile) { setFoundUser(ownerProfile); setPhase('found'); }
      }, 800);
    }
  }, [friendDropSync, stopScanning]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('detected');
    setTimeout(async () => {
      const userData = await fetchUser(userId);
      if (userData) { setFoundUser(userData); setPhase('found'); haptics.impact(); }
      else { toast.error('Could not find user'); setPhase('idle'); }
    }, 800);
  }, [stopScanning]);

  const handleOpen = useCallback(async () => {
    if (!profile?.username) { toast.error('Complete your profile first'); return; }
    // Kick off camera request immediately from this user gesture so it's
    // already streaming by the time the sheet finishes opening.
    requestCameraStream({ facingMode: 'environment', width: 640, height: 480 });
    setIsOpen(true);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setIsScanning(false);
    // Auto-select Phone Tap tab when device supports NFC (web NFC, native bridge, or detected support)
    const tapAvailable = hasWebNFC || nativeFriendDrop.isAvailable || nfcSupported;
    setActiveTab(tapAvailable ? 'tap' : 'qr');
    const drop = await friendDropSync.createDrop();
    if (drop) setActiveDropId(drop.id);
  }, [profile?.username, friendDropSync, hasWebNFC, nativeFriendDrop.isAvailable, nfcSupported]);

  const startScanning = useCallback(async () => {
    setIsScanning(true);
    haptics.tap();
    try {
      // Use the stream we already requested in handleOpen if it's ready —
      // skips the getUserMedia round-trip so the camera appears instantly.
      let stream = getPreloadedStream();
      if (!stream) {
        stream = await requestCameraStream({ facingMode: 'environment', width: 640, height: 480 });
      }
      if (!stream) {
        toast.error('Could not access camera');
        setIsScanning(false);
        return;
      }
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

  // Auto-start NFC when Phone Tap tab is active
  useEffect(() => {
    if (!isOpen || !user?.id || activeTab !== 'tap') return;
    let cancelled = false;
    const startNFC = async () => {
      try {
        if (hasWebNFC) {
          const started = await nfcShareProfile(user.id, async (theirUserId) => {
            if (theirUserId !== user.id) handleFoundUser(theirUserId);
          });
          if (started && !cancelled) setNfcActive(true);
        }
        if (nativeFriendDrop.isAvailable) {
          await nativeFriendDrop.startSession();
          if (!cancelled) setNfcActive(true);
        }
      } catch (e) { console.log('[FriendDrop] NFC auto-start failed:', e); }
    };
    startNFC();
    return () => { cancelled = true; };
  }, [isOpen, user?.id, activeTab, hasWebNFC, nfcShareProfile, nativeFriendDrop, handleFoundUser]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;
    setPhase('exchanging');
    haptics.impact();
    if (activeDropId) await friendDropSync.confirmDrop(activeDropId);
    try {
      await sendRequest.mutateAsync(foundUser.id);
      if (activeDropId) await friendDropSync.completeDrop(activeDropId);
      setPhase('success');
      haptics.success();
      setTimeout(() => handleClose(), 2500);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already friends or request pending!');
        setPhase('success');
        setTimeout(handleClose, 1500);
      } else { toast.error('Failed to send request'); setPhase('found'); }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync]);

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
  }, [stopScanning, activeDropId, friendDropSync, nfcStopScan, nativeFriendDrop]);

  useEffect(() => { return () => { stopScanning(); }; }, [stopScanning]);

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

  // ── Overlay Phases (detected/found/exchanging/success) ──
  const renderOverlay = () => {
    if (phase === 'detected') {
      return (
        <motion.div key="detected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-3 py-8"
        >
          <motion.div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center"
            animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </motion.div>
          <p className="text-sm font-medium text-muted-foreground">Finding user...</p>
        </motion.div>
      );
    }

    if (phase === 'found' && foundUser) {
      return (
        <motion.div key="found" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-3 py-4"
        >
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={smoothSpring} className="relative">
            <Avatar className="h-16 w-16 ring-2 ring-primary/20">
              <AvatarImage src={foundUser.avatar_url || undefined} />
              <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                {foundUser.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <motion.div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-card"
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, ...smoothSpring }}
            >
              <Check className="h-3 w-3 text-primary-foreground" />
            </motion.div>
          </motion.div>
          <div className="text-center">
            <h3 className="text-base font-bold">{foundUser.display_name || foundUser.username}</h3>
            <p className="text-xs text-muted-foreground">@{foundUser.username?.trim()}</p>
          </div>
          <div className="flex gap-2.5 w-full px-2">
            <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => { setFoundUser(null); setPhase('idle'); }}>Cancel</Button>
            <Button size="sm" className="flex-1 rounded-full gap-1.5" onClick={handleAddFriend} disabled={sendRequest.isPending}>
              <UserPlus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </motion.div>
      );
    }

    if (phase === 'exchanging') {
      return (
        <motion.div key="exchanging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4 py-8"
        >
          <div className="relative flex items-center">
            <Avatar className="h-12 w-12 -mr-2.5 ring-2 ring-card z-10">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="font-bold text-sm">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <motion.div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center z-20 -mx-0.5"
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            >
              <Loader2 className="h-3.5 w-3.5 text-primary" />
            </motion.div>
            <Avatar className="h-12 w-12 -ml-2.5 ring-2 ring-card">
              <AvatarImage src={foundUser?.avatar_url || ''} />
              <AvatarFallback className="font-bold text-sm">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
          <p className="text-sm font-medium text-primary animate-pulse">Adding friend...</p>
        </motion.div>
      );
    }

    if (phase === 'success') {
      return (
        <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4 py-8"
        >
          <motion.div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...smoothSpring, bounce: 0.4 }}
          >
            <Check className="h-6 w-6 text-primary" strokeWidth={3} />
          </motion.div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-primary">Friend Added! 🎉</h3>
            {foundUser && <p className="text-xs text-muted-foreground mt-0.5">@{foundUser.username}</p>}
          </div>
        </motion.div>
      );
    }

    return null;
  };

  // ── QR Tab Content ──
  const renderQRTab = () => (
    <motion.div key="qr-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3"
    >
      {/* Scanned badge */}
      <AnimatePresence>
        {wasScanned && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] text-primary font-medium">Someone scanned your code!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Code - compact */}
      <div className="bg-white rounded-xl p-2 shadow-sm">
        <img src={qrCodeUrl} alt="Your QR Code" className="w-28 h-28 rounded-lg" style={{ imageRendering: 'crisp-edges' }} />
        <p className="text-[10px] text-black/40 text-center mt-1 font-medium">@{profile?.username?.trim()}</p>
      </div>

      {/* Copy & Share pills */}
      <div className="flex gap-2 w-full">
        <button onClick={copyLink}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-[10px] font-medium"
        >
          <Copy className="h-3 w-3 text-muted-foreground" /> Copy
        </button>
        <button onClick={shareLink}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-[10px] font-medium"
        >
          <Share2 className="h-3 w-3 text-muted-foreground" /> Share
        </button>
      </div>

      {/* Scanner */}
      {isScanning ? (
        <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black/5 border border-border/30">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 pointer-events-none p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="absolute w-5 h-5" style={{
                top: i < 2 ? 12 : 'auto', bottom: i >= 2 ? 12 : 'auto',
                left: i % 2 === 0 ? 12 : 'auto', right: i % 2 === 1 ? 12 : 'auto',
                borderColor: 'hsl(var(--primary))',
                borderTopWidth: i < 2 ? 2 : 0, borderBottomWidth: i >= 2 ? 2 : 0,
                borderLeftWidth: i % 2 === 0 ? 2 : 0, borderRightWidth: i % 2 === 1 ? 2 : 0,
                borderRadius: 3,
              }} />
            ))}
          </div>
          <div className="absolute bottom-2 inset-x-0 flex justify-center">
            <button onClick={stopScanning} className="px-3 py-1 rounded-full text-[10px] font-medium bg-card/90 backdrop-blur-sm border border-border/40">
              Stop
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startScanning}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <Camera className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">Scan QR Code</span>
        </button>
      )}
    </motion.div>
  );

  // ── Phone Tap Tab Content ──
  const renderTapTab = () => (
    <motion.div key="tap-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3 py-2"
    >
      <PhoneTapRadar active={nfcActive || nativeFriendDrop.isActive} />
      
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold">
          {nfcActive || nativeFriendDrop.isActive ? 'Ready to connect' : 'Searching...'}
        </p>
        <p className="text-xs text-muted-foreground max-w-[220px]">
          {(nfcSupported || nativeFriendDrop.isAvailable)
            ? 'Hold your phone near your friend\'s phone to add each other instantly'
            : 'Phone Tap requires NFC support on your device'}
        </p>
      </div>

      {(nfcActive || nativeFriendDrop.isActive) && (
        <motion.div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[10px] font-medium text-primary">Listening for nearby devices</span>
        </motion.div>
      )}
    </motion.div>
  );

  // ── Trigger Variants ──
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
            className="w-full p-3.5 rounded-2xl border border-border/40 flex items-center gap-3.5 bg-card/50 backdrop-blur-sm"
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          >
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <h4 className="font-semibold text-sm">Friend Link</h4>
              <p className="text-[11px] text-muted-foreground">QR, Phone Tap, or share a link</p>
            </div>
          </motion.button>
        );
      default:
        return (
          <Button onClick={handleOpen} className="gap-2 text-xs rounded-full">
            <QrCode className="h-4 w-4" />
            Friend Link
          </Button>
        );
    }
  };

  const showOverlay = phase !== 'idle';

  return (
    <>
      {renderTrigger()}

      <LiquidBottomSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="Add Friend"
        maxHeight={70}
      >
        <div className="px-4 pb-5">
          <AnimatePresence mode="wait">
            {showOverlay ? (
              renderOverlay()
            ) : (
              <motion.div key="tabs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Tab switcher */}
                <div className="flex gap-1 p-1 rounded-xl bg-secondary/40 mb-3">
                  <button
                    onClick={() => { setActiveTab('qr'); stopScanning(); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      activeTab === 'qr' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR Code
                  </button>
                  <button
                    onClick={() => { setActiveTab('tap'); stopScanning(); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      activeTab === 'tap' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" /> Phone Tap
                  </button>
                </div>

                {/* Tab content */}
                <AnimatePresence mode="wait">
                  {activeTab === 'qr' ? renderQRTab() : renderTapTab()}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LiquidBottomSheet>
    </>
  );
}
