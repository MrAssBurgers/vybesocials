import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, QrCode, Camera, 
  Copy, Share2, Nfc, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { preloadCameraStream, getPreloadedStream } from '@/hooks/useCameraPreload';

interface FriendDropProps {
  variant?: 'button' | 'icon' | 'banner';
}

type DropPhase = 'idle' | 'scanning' | 'detected' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

const smoothSpring = { type: "spring" as const, stiffness: 400, damping: 30 };

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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=${primaryHex}&format=svg&ecc=H&margin=2`
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
    preloadCameraStream();
    setIsOpen(true);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setIsScanning(false);
    const drop = await friendDropSync.createDrop();
    if (drop) setActiveDropId(drop.id);
  }, [profile?.username, friendDropSync]);

  const startScanning = useCallback(async () => {
    setIsScanning(true);
    haptics.tap();
    try {
      let stream = getPreloadedStream();
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
      }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
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

  // Auto-start NFC when dialog opens
  useEffect(() => {
    if (!isOpen || !user?.id) return;
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
  }, [isOpen, user?.id, hasWebNFC, nfcShareProfile, nativeFriendDrop, handleFoundUser]);

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

  // ── Render Phases ──
  const renderContent = () => {
    // Detected: loading spinner
    if (phase === 'detected') {
      return (
        <motion.div key="detected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4 py-12"
        >
          <motion.div
            className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </motion.div>
          <p className="text-sm font-medium text-muted-foreground">Finding user...</p>
        </motion.div>
      );
    }

    // Found: user card with add button
    if (phase === 'found' && foundUser) {
      return (
        <motion.div key="found" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4 py-6"
        >
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={smoothSpring} className="relative">
            <Avatar className="h-20 w-20 ring-3 ring-primary/20">
              <AvatarImage src={foundUser.avatar_url || undefined} />
              <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                {foundUser.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <motion.div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-card"
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, ...smoothSpring }}
            >
              <Check className="h-3.5 w-3.5 text-primary-foreground" />
            </motion.div>
          </motion.div>
          <div className="text-center">
            <h3 className="text-lg font-bold">{foundUser.display_name || foundUser.username}</h3>
            <p className="text-sm text-muted-foreground">@{foundUser.username?.trim()}</p>
            {foundUser.bio && <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-[220px] line-clamp-2">{foundUser.bio}</p>}
          </div>
          <div className="flex gap-3 w-full px-2">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => { setFoundUser(null); setPhase('idle'); }}>Cancel</Button>
            <Button className="flex-1 rounded-full gap-1.5" onClick={handleAddFriend} disabled={sendRequest.isPending}>
              <UserPlus className="h-4 w-4" /> Add Friend
            </Button>
          </div>
        </motion.div>
      );
    }

    // Exchanging: overlapping avatars
    if (phase === 'exchanging') {
      return (
        <motion.div key="exchanging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-5 py-10"
        >
          <div className="relative flex items-center">
            <Avatar className="h-14 w-14 -mr-3 ring-2 ring-card z-10">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <motion.div
              className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center z-20 -mx-1"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            >
              <Loader2 className="h-4 w-4 text-primary" />
            </motion.div>
            <Avatar className="h-14 w-14 -ml-3 ring-2 ring-card">
              <AvatarImage src={foundUser?.avatar_url || ''} />
              <AvatarFallback className="font-bold">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
          <p className="text-sm font-medium text-primary animate-pulse">Adding friend...</p>
        </motion.div>
      );
    }

    // Success
    if (phase === 'success') {
      return (
        <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-5 py-10"
        >
          <motion.div
            className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...smoothSpring, bounce: 0.4 }}
          >
            <Check className="h-7 w-7 text-primary" strokeWidth={3} />
          </motion.div>
          <div className="text-center">
            <h3 className="text-base font-bold text-primary">Friend Added! 🎉</h3>
            {foundUser && <p className="text-xs text-muted-foreground mt-1">@{foundUser.username}</p>}
          </div>
        </motion.div>
      );
    }

    // Default: Idle — QR + Scanner
    return (
      <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex flex-col items-center gap-4"
      >
        {/* Scanned indicator */}
        <AnimatePresence>
          {wasScanned && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-primary font-medium">Someone scanned your code!</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QR Code */}
        <motion.div
          className="bg-white rounded-2xl p-3 shadow-sm"
          initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}
        >
          <div className="relative">
            <img src={qrCodeUrl} alt="Your QR Code" className="w-44 h-44 rounded-lg" style={{ imageRendering: 'crisp-edges' }} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-9 h-9 rounded-lg overflow-hidden border-2 border-primary/20 shadow-sm bg-white">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-bold text-xs">
                    {profile?.username?.[0]?.toUpperCase() || 'V'}
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-black/50 text-center mt-1.5 font-medium">@{profile?.username?.trim()}</p>
        </motion.div>

        {/* Action pills: Copy, Share, Scan */}
        <motion.div className="flex gap-2 w-full" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
          <button onClick={copyLink}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-xs font-medium"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Copy
          </button>
          <button onClick={shareLink}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-xs font-medium"
          >
            <Share2 className="h-3.5 w-3.5 text-muted-foreground" /> Share
          </button>
        </motion.div>

        {/* Scanner area */}
        <motion.div className="w-full" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
          {isScanning ? (
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black/5 border border-border/40">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Corner brackets */}
              <div className="absolute inset-0 pointer-events-none p-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="absolute w-6 h-6" style={{
                    top: i < 2 ? 16 : 'auto', bottom: i >= 2 ? 16 : 'auto',
                    left: i % 2 === 0 ? 16 : 'auto', right: i % 2 === 1 ? 16 : 'auto',
                    borderColor: 'hsl(var(--primary))',
                    borderTopWidth: i < 2 ? 3 : 0, borderBottomWidth: i >= 2 ? 3 : 0,
                    borderLeftWidth: i % 2 === 0 ? 3 : 0, borderRightWidth: i % 2 === 1 ? 3 : 0,
                    borderRadius: 4,
                  }} />
                ))}
              </div>
              <div className="absolute bottom-3 inset-x-0 flex justify-center">
                <button onClick={stopScanning}
                  className="px-4 py-1.5 rounded-full text-xs font-medium bg-card/90 backdrop-blur-sm border border-border/50"
                >
                  Stop Scanning
                </button>
              </div>
            </div>
          ) : (
            <button onClick={startScanning}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <Camera className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Scan a QR Code</span>
            </button>
          )}
        </motion.div>

        {/* NFC indicator */}
        {(nfcSupported || nativeFriendDrop.isAvailable) && (
          <motion.div className="flex items-center gap-2 text-xs text-muted-foreground"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          >
            <Nfc className={`h-3.5 w-3.5 ${nfcActive ? 'text-primary' : ''}`} />
            <span>{nfcActive ? 'NFC active — tap phones together' : 'NFC available'}</span>
          </motion.div>
        )}
      </motion.div>
    );
  };

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
            className="w-full p-4 rounded-2xl border border-border/40 flex items-center gap-4 bg-card/50 backdrop-blur-sm"
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          >
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <h4 className="font-semibold text-sm">Friend Link</h4>
              <p className="text-xs text-muted-foreground">QR code, NFC, or share a link</p>
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

  return (
    <>
      {renderTrigger()}

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent
          className="sm:max-w-[360px] p-0 border-0 bg-transparent shadow-none rounded-2xl overflow-visible [&>button]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Add Friend</DialogTitle>
          <motion.div
            className="relative w-full rounded-2xl bg-card border border-border/40 shadow-xl overflow-hidden"
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={smoothSpring}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h2 className="text-base font-semibold">Add Friend</h2>
              <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 pb-5">
              <AnimatePresence mode="wait">
                {renderContent()}
              </AnimatePresence>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}
