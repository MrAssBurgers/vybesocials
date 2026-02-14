import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Check, Loader2, Smartphone, Zap,
  ArrowLeftRight, Bluetooth, Wifi, ZoomIn, MessageCircle, Nfc,
  Shield, Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync } from '@/hooks/useFriendDropSync';
import { useCreateConversation } from '@/hooks/useMessages';
import { supabase } from '@/integrations/supabase/client';
import { useSwingDetection } from '@/hooks/useSwingDetection';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';
import { useNFC } from '@/hooks/useNFC';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { preloadCameraStream, getPreloadedStream, stopPreloadedCamera } from '@/hooks/useCameraPreload';
import jsQR from 'jsqr';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// Expandable QR component with cyberpunk styling
const ExpandableQR = memo(function ExpandableQR({
  qrCodeUrl,
  isExpanded,
  onToggle,
  avatarUrl,
  username,
}: {
  qrCodeUrl: string;
  isExpanded: boolean;
  onToggle: () => void;
  avatarUrl?: string | null;
  username?: string | null;
}) {
  const size = isExpanded ? 256 : 80;
  const avatarSize = isExpanded ? 48 : 24;
  
  return (
    <motion.div
      className="relative cursor-pointer overflow-hidden"
      onClick={onToggle}
      animate={{
        width: size,
        height: size,
        padding: isExpanded ? 16 : 8,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{
        borderRadius: 4,
        background: 'white',
        boxShadow: '0 0 20px hsl(var(--primary) / 0.15)',
      }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.img
        src={qrCodeUrl}
        alt="QR Code"
        className="w-full h-full"
        initial={false}
        animate={{ opacity: 1 }}
        style={{ borderRadius: 2 }}
      />
      
      {/* Profile picture overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className="relative overflow-hidden border-2 shadow-lg"
          animate={{ width: avatarSize, height: avatarSize }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          style={{ background: 'white', borderRadius: 4, borderColor: 'hsl(var(--primary) / 0.3)' }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={username || 'Profile'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold font-mono">
              {username?.[0]?.toUpperCase() || 'V'}
            </div>
          )}
        </motion.div>
      </div>
      
      {!isExpanded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-sm opacity-0 hover:opacity-100 transition-opacity duration-200">
          <ZoomIn className="h-5 w-5 text-white" />
        </div>
      )}
      
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-2 left-0 right-0 text-center"
        >
          <span className="text-[9px] font-mono text-black/60 bg-white/80 px-2 py-1 rounded-sm">
            TAP TO MINIMIZE
          </span>
        </motion.div>
      )}
    </motion.div>
  );
});

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const sendRequest = useSendFriendRequest();
  const createConversation = useCreateConversation();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [isDismissed, setIsDismissed] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [createdConversationId, setCreatedConversationId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const startScanLoopRef = useRef<() => void>(() => {});
  
  const triggerCardRise = useCallback(() => {
    setPhase('activated');
    setTimeout(() => {
      haptics.success();
    }, 300);
  }, []);

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
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
  
  const [isQrOwner, setIsQrOwner] = useState(false);
  
  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        setCreatedConversationId(conversation.id);
      } catch {
        // Conversation might already exist
      }
    }
    
    setTimeout(() => {
      const convId = createdConversationId;
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      setIsQrOwner(false);
      setCreatedConversationId(null);
      
      if (convId) {
        navigate(`/messages/${convId}`);
      }
    }, 3000);
  }, [foundUser?.id, createConversation, createdConversationId, navigate]);
  
  const friendDropSync = useFriendDropSync({
    enabled: isActive,
    onScanned: useCallback((drop) => {
      haptics.success();
      setIsQrOwner(true);
      if (drop.to_user_id) {
        fetchUser(drop.to_user_id).then((scannedUser) => {
          if (scannedUser) {
            setFoundUser(scannedUser);
            setPhase('exchanging');
            setTimeout(async () => {
              try {
                await sendRequest.mutateAsync(scannedUser.id);
              } catch {
                // Already friends
              }
              if (activeDropId) {
                await friendDropSync.completeDrop(activeDropId);
              }
            }, 1500);
          }
        });
      }
    }, [activeDropId, sendRequest]),
    onConfirmed: useCallback(() => {
      if (phase !== 'exchanging') {
        setPhase('exchanging');
        haptics.impact();
      }
    }, [phase]),
    onCompleted: useCallback(async () => {
      setPhase('success');
      haptics.success();
      
      const targetUserId = foundUser?.id;
      if (targetUserId) {
        try {
          const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
          setTimeout(() => {
            setIsActive(false);
            setPhase('idle');
            setFoundUser(null);
            setActiveDropId(null);
            setIsQrOwner(false);
            navigate(`/messages/${conversation.id}`);
          }, 3000);
        } catch {
          setTimeout(() => {
            setIsActive(false);
            setPhase('idle');
            setFoundUser(null);
            setActiveDropId(null);
            setIsQrOwner(false);
          }, 3000);
        }
      }
    }, [foundUser?.id, createConversation, navigate]),
  });
  
  const nativeFriendDrop = useNativeFriendDrop({
    enabled: isActive,
    onPeerFound: (peer) => {
      setFoundUser({
        id: peer.userId,
        username: peer.username,
        display_name: peer.displayName,
        avatar_url: peer.avatarUrl,
      });
      setPhase('found');
      stopScanning();
    },
    onPeerConnected: (peer) => {
      handleAutoAdd(peer.userId);
    },
  });

  const { hasWebNFC, isSupported: nfcSupported, shareProfile: nfcShareProfile, stopScan: nfcStopScan, startScan: nfcStartScan } = useNFC();
  const nfcDiscoveryRef = useRef(false);

  // Passive NFC listening
  useEffect(() => {
    if (!hasWebNFC || !user?.id || isActive || !profile?.username) return;
    if (nfcDiscoveryRef.current) return;

    let cancelled = false;
    
    const startPassiveNFC = async () => {
      try {
        nfcDiscoveryRef.current = true;
        
        const started = await nfcShareProfile(user.id, async (theirUserId) => {
          if (cancelled || isActive) return;
          if (theirUserId === user.id) return;
          
          haptics.success();
          setIsActive(true);
          setPhase('exchanging');
          
          const theirProfile = await fetchUser(theirUserId);
          if (theirProfile) {
            setFoundUser(theirProfile);
          }
          
          try {
            await sendRequest.mutateAsync(theirUserId);
            setPhase('success');
            haptics.success();
            
            try {
              const conversation = await createConversation.mutateAsync({ memberIds: [theirUserId] });
              setTimeout(() => {
                setIsActive(false);
                setPhase('idle');
                setFoundUser(null);
                navigate(`/messages/${conversation.id}`);
              }, 3000);
            } catch {
              setTimeout(() => {
                setIsActive(false);
                setPhase('idle');
                setFoundUser(null);
              }, 3000);
            }
          } catch (error: any) {
            if (error?.message?.includes('already')) {
              setPhase('success');
              haptics.success();
              setTimeout(() => {
                setIsActive(false);
                setPhase('idle');
                setFoundUser(null);
              }, 2000);
            }
          }
        });
        
        if (started) {
          console.log('[AutoFriendDrop] Passive NFC active');
        }
      } catch (e) {
        nfcDiscoveryRef.current = false;
      }
    };

    startPassiveNFC();
    
    return () => {
      cancelled = true;
      nfcDiscoveryRef.current = false;
      nfcStopScan();
    };
  }, [hasWebNFC, user?.id, isActive, profile?.username, nfcShareProfile, nfcStopScan, sendRequest, createConversation, navigate]);

  const toggleQrExpand = useCallback(() => {
    setIsQrExpanded(prev => !prev);
    haptics.tap();
  }, []);

  const myProfileUrl = activeDropId 
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username 
      ? `https://vybehub.app/add-friend/${user?.id}`
      : '';
  
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=000000&format=svg&ecc=H&margin=2`
    : '';

  const handleAutoAdd = useCallback(async (userId: string) => {
    if (phase === 'exchanging' || phase === 'success') return;
    
    setPhase('exchanging');
    haptics.impact();
    
    try {
      await sendRequest.mutateAsync(userId);
      setPhase('success');
      haptics.success();
      setTimeout(handleClose, 2500);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        setPhase('success');
        setTimeout(handleClose, 1500);
      }
    }
  }, [phase, sendRequest]);

  const handleBump = useCallback(async () => {
    if (!profile?.username || !user) return;
    
    let cameraStream: MediaStream | null = null;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
    } catch (err) {
      console.warn('[AutoFriendDrop] Camera access failed:', err);
    }
    
    setIsActive(true);
    haptics.impact();
    setPhase('activated');
    setTimeout(() => { haptics.success(); }, 300);
    
    if (cameraStream) {
      streamRef.current = cameraStream;
      requestAnimationFrame(() => {
        if (videoRef.current && cameraStream) {
          videoRef.current.srcObject = cameraStream;
          videoRef.current.play().then(() => {
            startScanLoopRef.current();
          }).catch(console.error);
        }
      });
    }
    
    friendDropSync.createDrop().then((drop) => {
      if (drop) setActiveDropId(drop.id);
    });
    
    if (nativeFriendDrop.isAvailable) {
      nativeFriendDrop.startSession();
    }
  }, [profile?.username, user, nativeFriendDrop, friendDropSync]);

  useSwingDetection({
    enabled: !isActive && !!profile?.username,
    threshold: 6,
    swingWindow: 500,
    cooldown: 3000,
    onSwing: handleBump,
  });

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();

    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) {
      toast.error('This code has expired');
      setPhase('activated');
      return;
    }

    setActiveDropId(dropId);
    setIsQrOwner(false);

    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) {
        setFoundUser(ownerProfile);
        setPhase('exchanging');
      }
    }
  }, [friendDropSync, stopScanning]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('found');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setFoundUser(data);
    } catch (error) {
      toast.error('Could not find user');
      handleClose();
    }
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
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        const url = code.data;
        const dropMatch = url?.match(/\/friend-drop\/([a-zA-Z0-9-]+)/);
        if (dropMatch) {
          await handleDropScan(dropMatch[1]);
          return;
        }
        const userMatch = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
        if (userMatch && userMatch[1] !== user?.id) {
          handleFoundUser(userMatch[1]);
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }, [user?.id, handleDropScan, handleFoundUser]);

  startScanLoopRef.current = startScanLoop;

  const startScanning = useCallback(async () => {
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
      }

      startScanLoop();
    } catch (error) {
      console.error('Camera error:', error);
    }
  }, [startScanLoop]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;

    setPhase('exchanging');
    haptics.impact();

    try {
      if (activeDropId) {
        await friendDropSync.confirmDrop(activeDropId);
      }
    } catch (e) {
      console.warn('[FriendDrop] Confirm failed:', e);
    }

    try {
      await sendRequest.mutateAsync(foundUser.id);
      
      try {
        if (activeDropId) {
          await friendDropSync.completeDrop(activeDropId);
        }
      } catch (e) {
        console.warn('[FriendDrop] Complete failed:', e);
      }
      
      if (!activeDropId) {
        setPhase('success');
        haptics.success();
        autoCloseAfterSuccess();
      }
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already linked!');
        try {
          if (activeDropId) {
            await friendDropSync.completeDrop(activeDropId);
          } else {
            setPhase('success');
            autoCloseAfterSuccess();
          }
        } catch (e) {
          setPhase('success');
          autoCloseAfterSuccess();
        }
      } else {
        toast.error('Failed to send request');
        setPhase('found');
      }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync, autoCloseAfterSuccess]);

  const handleClose = useCallback(async () => {
    stopScanning();
    if (activeDropId && phase !== 'success') {
      await friendDropSync.cancelDrop(activeDropId);
    }
    if (nativeFriendDrop.isActive) {
      await nativeFriendDrop.stopSession();
    }
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
    setIsQrOwner(false);
    setCreatedConversationId(null);
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync, phase]);

  useEffect(() => {
    return () => { stopScanning(); };
  }, [stopScanning]);

  if (!profile?.username) return null;

  return (
    <>
      {/* Cyberpunk bump indicator */}
      {!isActive && !isDismissed && isMobile && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fade-in" style={{ animationDuration: '300ms' }}>
          <button
            onClick={handleBump}
            className="friendlink-pill relative flex items-center gap-2.5 px-5 py-3 rounded-lg border active:scale-[0.97] transition-transform duration-150 touch-manipulation overflow-hidden"
            style={{
              background: 'hsl(var(--background) / 0.92)',
              borderColor: 'hsl(var(--primary) / 0.25)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            {/* Single clean shimmer sweep via CSS */}
            <div className="friendlink-shimmer absolute inset-0 pointer-events-none rounded-lg" />
            
            <div className="friendlink-icon-wrap p-1.5 rounded-md relative z-[1]" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
              {hasWebNFC ? (
                <Radio className="h-4 w-4 text-primary" />
              ) : nativeFriendDrop.isAvailable ? (
                <Bluetooth className="h-4 w-4 text-primary" />
              ) : (
                <Zap className="h-4 w-4 text-primary" />
              )}
            </div>
            <div className="flex flex-col items-start relative z-[1]">
              <span className="text-[9px] text-primary font-mono font-bold tracking-[0.25em]">
                FRIEND LINK
              </span>
              <span className="text-[7px] text-muted-foreground font-mono tracking-[0.15em]">
                {hasWebNFC
                  ? 'TAP PHONES'
                  : nativeFriendDrop.isAvailable 
                    ? 'PROXIMITY'
                    : 'SHAKE TO ACTIVATE'}
              </span>
            </div>
            {/* Clean signal bars — pure CSS animation */}
            <div className="flex items-end gap-[2px] relative z-[1] h-4">
              {[0,1,2,3].map(i => (
                <div
                  key={i}
                  className="friendlink-bar w-[3px] rounded-full"
                  style={{ 
                    background: 'hsl(var(--primary))',
                    animationDelay: `${i * 150}ms`,
                  }}
                />
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsDismissed(true); }}
              className="ml-0.5 p-1 rounded-md hover:bg-primary/10 transition-colors touch-manipulation relative z-[1]"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </button>
        </div>
      )}

      {/* Exchange Modal — Cyberpunk HUD */}
      <Dialog open={isActive} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md p-0 border-0 bg-transparent overflow-visible [&>button]:hidden">
          <AnimatePresence mode="wait">
            
            {phase === 'activated' && (
              <motion.div
                key="activated"
                initial={{ y: 300, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0, scale: 0.95 }}
                transition={{ 
                  type: "spring", stiffness: 200, damping: 22,
                  opacity: { duration: 0.2 },
                }}
                style={{ transformOrigin: 'bottom center' }}
                className="flex flex-col items-center"
              >
                {/* Outer glow pulse */}
                <motion.div
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.15), transparent 70%)' }}
                  animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.05, 0.95] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                />

                {/* Cyber Scanner Card */}
                <motion.div
                  className="relative w-72 rounded-lg overflow-hidden cyber-card"
                  style={{
                    boxShadow: '0 0 50px hsl(var(--primary) / 0.25), 0 0 100px hsl(var(--primary) / 0.1), 0 25px 60px -12px rgba(0,0,0,0.4)',
                  }}
                  initial={{ rotateX: 15, scaleY: 0.85 }}
                  animate={{ rotateX: 0, scaleY: 1 }}
                  transition={{ type: "spring", stiffness: 250, damping: 25, delay: 0.1 }}
                >
                  {/* Boot flash */}
                  <motion.div
                    className="absolute inset-0 z-[5] pointer-events-none rounded-lg"
                    style={{ background: 'hsl(var(--primary) / 0.4)' }}
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  />

                  {/* Vertical data streams */}
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={`stream-${i}`}
                      className="absolute w-px z-[3] pointer-events-none"
                      style={{
                        height: 20 + Math.random() * 40,
                        background: `linear-gradient(180deg, transparent, hsl(var(--primary) / ${0.3 + Math.random() * 0.3}), transparent)`,
                        left: `${8 + i * 12}%`,
                      }}
                      initial={{ y: -60, opacity: 0 }}
                      animate={{ y: 500, opacity: [0, 0.8, 0] }}
                      transition={{ duration: 1 + Math.random() * 0.5, delay: 0.2 + i * 0.08, repeat: Infinity, repeatDelay: 1 + Math.random() * 2, ease: "linear" }}
                    />
                  ))}

                  {/* HUD header with boot sequence */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2 relative z-[4]">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="w-2 h-2 rounded-full"
                        style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 8px hsl(var(--primary) / 0.6)' }}
                        initial={{ scale: 0 }}
                        animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 1, 0.3, 1] }}
                        transition={{ duration: 0.6, delay: 0.3, opacity: { repeat: Infinity, duration: 1, delay: 0.6 } }}
                      />
                      <div>
                        <motion.h3
                          className="font-mono text-xs font-bold tracking-[0.2em] text-primary cyber-glow-text"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2, duration: 0.3 }}
                        >
                          FRIEND LINK
                        </motion.h3>
                        <motion.p
                          className="text-[8px] font-mono text-muted-foreground tracking-[0.3em]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.4 }}
                        >
                          <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ repeat: Infinity, duration: 0.8, delay: 0.5 }}
                          >
                            ▸
                          </motion.span>
                          {' '}SCANNING
                        </motion.p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-sm" onClick={handleClose}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Live Scanner with enhanced cyber overlay */}
                  <motion.div
                    className="relative aspect-square mx-3 mb-2 rounded-sm overflow-hidden border"
                    style={{ borderColor: 'hsl(var(--primary) / 0.3)' }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                  >
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Scanning beam */}
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 z-[2] pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.8), hsl(var(--primary)), hsl(var(--primary) / 0.8), transparent)',
                        boxShadow: '0 0 15px hsl(var(--primary) / 0.5), 0 0 30px hsl(var(--primary) / 0.2)',
                      }}
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    />
                    
                    {/* Cyber scanner overlay */}
                    <div className="absolute inset-0 pointer-events-none cyber-scanline-overlay">
                      {/* Corner brackets with staggered entrance */}
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="cyber-corner-bracket"
                          style={{
                            top: i < 2 ? 8 : 'auto',
                            bottom: i >= 2 ? 8 : 'auto',
                            left: i % 2 === 0 ? 8 : 'auto',
                            right: i % 2 === 1 ? 8 : 'auto',
                            borderTopWidth: i < 2 ? 2 : 0,
                            borderBottomWidth: i >= 2 ? 2 : 0,
                            borderLeftWidth: i % 2 === 0 ? 2 : 0,
                            borderRightWidth: i % 2 === 1 ? 2 : 0,
                          }}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 400, damping: 20 }}
                        />
                      ))}
                      
                      {/* HUD telemetry */}
                      <div className="absolute top-2 left-2 right-2 flex justify-between">
                        <motion.span 
                          className="text-[7px] font-mono"
                          style={{ color: 'hsl(var(--primary) / 0.7)' }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                        >
                          OPTICAL.SCAN//v2.4
                        </motion.span>
                        <motion.span
                          className="text-[7px] font-mono"
                          style={{ color: 'hsl(var(--primary) / 0.7)' }}
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          ● LIVE
                        </motion.span>
                      </div>
                      
                      {/* Bottom HUD stats */}
                      <motion.div
                        className="absolute bottom-2 left-2 right-2 flex justify-between"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                      >
                        <span className="text-[6px] font-mono" style={{ color: 'hsl(var(--primary) / 0.5)' }}>
                          RES: 640×480
                        </span>
                        <motion.span
                          className="text-[6px] font-mono"
                          style={{ color: 'hsl(var(--primary) / 0.5)' }}
                          animate={{ opacity: [0.3, 0.7, 0.3] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          QR.DECODE: READY
                        </motion.span>
                      </motion.div>
                    </div>
                  </motion.div>
                  
                  {/* QR Code Section */}
                  {!nativeFriendDrop.isAvailable && (
                    <motion.div
                      className="px-3 pb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.3 }}
                    >
                      <div className="flex items-center gap-3 p-2 rounded-sm border relative overflow-hidden" style={{ borderColor: 'hsl(var(--primary) / 0.2)', background: 'hsl(var(--primary) / 0.03)' }}>
                        {/* Subtle shimmer */}
                        <motion.div
                          className="absolute inset-0 pointer-events-none"
                          style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.05) 50%, transparent 100%)' }}
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ repeat: Infinity, duration: 3, ease: "linear", repeatDelay: 2 }}
                        />
                        <ExpandableQR
                          qrCodeUrl={qrCodeUrl}
                          isExpanded={isQrExpanded}
                          onToggle={toggleQrExpand}
                          avatarUrl={profile?.avatar_url}
                          username={profile?.username}
                        />
                        <div className="flex-1 min-w-0 relative z-[1]">
                          <p className="text-[8px] font-mono text-muted-foreground tracking-[0.3em]">YOUR ID</p>
                          <p className="font-mono text-xs text-foreground truncate">@{profile?.username}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  
                  {/* Native nearby peers */}
                  {nativeFriendDrop.isAvailable && nativeFriendDrop.nearbyPeers.length > 0 && (
                    <div className="px-3 pb-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground tracking-wider">
                        <Wifi className="h-3 w-3 text-primary" />
                        <span>NEARBY NODES</span>
                      </div>
                      {nativeFriendDrop.nearbyPeers.slice(0, 2).map((peer) => (
                        <motion.button
                          key={peer.peerId}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="w-full flex items-center gap-2 p-2 rounded-sm border transition-colors"
                          style={{ borderColor: 'hsl(var(--primary) / 0.15)', background: 'hsl(var(--primary) / 0.03)' }}
                          onClick={() => {
                            setFoundUser({
                              id: peer.userId,
                              username: peer.username,
                              display_name: peer.displayName,
                              avatar_url: peer.avatarUrl,
                            });
                            setPhase('found');
                          }}
                        >
                          <Avatar className="h-8 w-8 rounded-sm cyber-avatar-ring">
                            <AvatarImage src={peer.avatarUrl || ''} />
                            <AvatarFallback className="text-xs font-mono rounded-sm">{peer.username[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-mono font-medium flex-1 text-left truncate">{peer.displayName || peer.username}</span>
                          <Zap className="h-3 w-3 text-primary" />
                        </motion.button>
                      ))}
                    </div>
                  )}
                  
                  {/* Card footer with animated status */}
                  <motion.div
                    className="px-4 pb-3 pt-1 flex items-center justify-between relative z-[2]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'hsl(142 76% 50%)' }}
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      />
                      <p className="text-[9px] font-mono text-muted-foreground tracking-wider">SCAN TARGET CODE</p>
                    </div>
                    <div className="flex gap-0.5">
                      {[0,1,2,3,4].map(i => (
                        <motion.div
                          key={i}
                          className="w-0.5 rounded-full"
                          style={{ background: 'hsl(var(--primary))', height: 6 }}
                          animate={{ 
                            height: [3, 8 + i, 3],
                            opacity: [0.3, 0.9, 0.3],
                          }}
                          transition={{ repeat: Infinity, duration: 0.6 + i * 0.1, delay: i * 0.05 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {phase === 'found' && foundUser && (
              <motion.div
                key="found"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="w-72 rounded-lg overflow-hidden cyber-card relative"
                style={{
                  boxShadow: '0 0 40px hsl(var(--primary) / 0.2), 0 25px 60px -12px rgba(0,0,0,0.3)',
                }}
              >
                {/* Cyber grid bg */}
                <div className="absolute inset-0 cyber-grid-bg opacity-30 pointer-events-none" />
                
                <div className="relative p-6 flex flex-col items-center gap-4 z-[1]">
                  {/* Avatar with rotating cyber ring */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 18 }}
                    className="relative"
                  >
                    <motion.div
                      className="absolute -inset-2 rounded-lg"
                      style={{
                        background: 'conic-gradient(from 0deg, hsl(var(--primary) / 0.5), transparent, hsl(var(--accent) / 0.3), transparent, hsl(var(--primary) / 0.5))',
                        padding: '1px',
                      }}
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    >
                      <div className="w-full h-full rounded-lg bg-background" />
                    </motion.div>
                    <Avatar className="h-24 w-24 rounded-lg border-2 border-primary/30 relative shadow-2xl cyber-avatar-ring">
                      <AvatarImage src={foundUser.avatar_url || ''} className="rounded-lg" />
                      <AvatarFallback className="text-2xl font-mono font-bold rounded-lg bg-primary/10 text-primary">
                        {foundUser.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  <div className="text-center">
                    <h3 className="text-xl font-bold font-mono" style={{ animation: 'cyber-text-decode 0.5s ease-out forwards' }}>
                      {foundUser.display_name || foundUser.username}
                    </h3>
                    <p className="text-muted-foreground text-xs font-mono tracking-wider">@{foundUser.username}</p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="flex gap-3 w-full"
                  >
                    <Button 
                      variant="outline"
                      className="flex-1 rounded-sm font-mono text-xs border-muted-foreground/20"
                      onClick={handleClose}
                    >
                      ABORT
                    </Button>
                    <Button 
                      className="flex-1 rounded-sm font-mono text-xs gap-1.5"
                      onClick={handleAddFriend}
                      style={{ boxShadow: '0 0 20px hsl(var(--primary) / 0.3)' }}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      LINK UP
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {phase === 'exchanging' && (
              <motion.div
                key="exchanging"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-80 rounded-lg overflow-hidden relative cyber-card"
                style={{
                  boxShadow: '0 0 50px hsl(var(--primary) / 0.25), 0 25px 60px -12px rgba(0,0,0,0.3)',
                  minHeight: 300,
                }}
              >
                {/* Data stream particles */}
                {[...Array(10)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-px rounded-full"
                    style={{
                      height: 6 + Math.random() * 20,
                      background: 'hsl(var(--primary) / 0.4)',
                      left: `${10 + Math.random() * 80}%`,
                      boxShadow: '0 0 4px hsl(var(--primary) / 0.3)',
                    }}
                    initial={{ y: 300, opacity: 0 }}
                    animate={{ y: -20, opacity: [0, 0.6, 0] }}
                    transition={{ duration: 1.5, delay: i * 0.15, repeat: Infinity, ease: "linear" }}
                  />
                ))}
                
                {/* Grid background */}
                <div className="absolute inset-0 cyber-grid-bg opacity-20 pointer-events-none" />
                
                <div className="relative flex flex-col items-center justify-center p-6 gap-5 z-[1]" style={{ minHeight: 260 }}>
                  {/* My profile flying out */}
                  <motion.div
                    className="absolute z-20"
                    initial={{ scale: 1, y: 0 }}
                    animate={{ scale: 0.3, y: -200, opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.32, 0, 0.67, 0] }}
                  >
                    <Avatar className="h-20 w-20 rounded-lg border-2 border-primary/40 shadow-xl cyber-avatar-ring">
                      <AvatarImage src={profile?.avatar_url || ''} className="rounded-lg" />
                      <AvatarFallback className="text-xl font-mono font-bold rounded-lg">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  {/* Their profile flying in */}
                  <motion.div
                    className="relative z-10"
                    initial={{ scale: 0.3, y: 200, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                  >
                    <Avatar className="h-24 w-24 rounded-lg border-2 border-primary/40 shadow-2xl cyber-avatar-ring">
                      <AvatarImage src={foundUser?.avatar_url || ''} className="rounded-lg" />
                      <AvatarFallback className="text-2xl font-mono font-bold rounded-lg">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  <motion.div 
                    className="text-center z-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                  >
                    <motion.p
                      className="text-sm font-mono font-bold tracking-wider cyber-glow-text"
                      style={{ color: 'hsl(var(--primary))' }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      SYNCING DATA...
                    </motion.p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      {foundUser?.display_name || foundUser?.username}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="w-80 rounded-lg overflow-hidden shadow-2xl relative cyber-card"
                style={{
                  boxShadow: '0 0 60px hsl(var(--primary) / 0.3), 0 25px 60px -12px rgba(0,0,0,0.3)',
                  minHeight: 300,
                }}
              >
                {/* Glitch particles */}
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-sm"
                    style={{
                      width: 3 + Math.random() * 3,
                      height: 3 + Math.random() * 3,
                      background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
                      left: '50%',
                      top: '35%',
                      boxShadow: `0 0 6px ${i % 2 === 0 ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--accent) / 0.5)'}`,
                    }}
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ 
                      x: Math.cos(i * 30 * Math.PI / 180) * (50 + Math.random() * 40),
                      y: Math.sin(i * 30 * Math.PI / 180) * (50 + Math.random() * 40),
                      scale: [0, 1.5, 0],
                      opacity: [1, 1, 0],
                    }}
                    transition={{ duration: 0.7, delay: i * 0.02, ease: "easeOut" }}
                  />
                ))}
                
                {/* Flash */}
                <motion.div
                  className="absolute inset-0 pointer-events-none rounded-lg"
                  style={{ background: 'hsl(var(--primary) / 0.3)' }}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
                
                {/* Grid */}
                <div className="absolute inset-0 cyber-grid-bg opacity-20 pointer-events-none" />
                
                <div className="relative flex flex-col items-center justify-center p-6 gap-3 z-[1]" style={{ minHeight: 260 }}>
                  {/* Both avatars */}
                  <div className="relative flex items-center justify-center h-28 z-10">
                    <motion.div
                      className="absolute"
                      initial={{ x: -60, scale: 0.5, opacity: 0 }}
                      animate={{ x: -20, scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 22 }}
                    >
                      <Avatar className="h-16 w-16 rounded-lg border-2 border-primary/30 shadow-xl cyber-avatar-ring">
                        <AvatarImage src={profile?.avatar_url || ''} className="rounded-lg" />
                        <AvatarFallback className="text-lg font-mono font-bold rounded-lg">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </motion.div>
                    
                    <motion.div
                      className="absolute"
                      initial={{ x: 60, scale: 0.5, opacity: 0 }}
                      animate={{ x: 20, scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 22 }}
                    >
                      <Avatar className="h-16 w-16 rounded-lg border-2 border-primary/30 shadow-xl cyber-avatar-ring">
                        <AvatarImage src={foundUser?.avatar_url || ''} className="rounded-lg" />
                        <AvatarFallback className="text-lg font-mono font-bold rounded-lg">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </motion.div>
                    
                    {/* Shield check */}
                    <motion.div
                      className="absolute z-10"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <div className="w-10 h-10 rounded-sm flex items-center justify-center"
                        style={{ 
                          background: 'hsl(var(--primary))',
                          boxShadow: '0 0 20px hsl(var(--primary) / 0.5)',
                        }}
                      >
                        <Check className="h-5 w-5 text-primary-foreground" strokeWidth={3} />
                      </div>
                    </motion.div>
                  </div>
                  
                  <motion.div 
                    className="text-center z-10"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h3 className="text-lg font-bold font-mono tracking-wider cyber-glow-text" style={{ color: 'hsl(var(--primary))' }}>
                      LINK ESTABLISHED
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs font-mono">
                      {foundUser?.display_name || foundUser?.username} synced
                    </p>
                    <motion.div
                      className="flex items-center justify-center gap-2 mt-3 text-primary/70"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-mono tracking-wider">OPENING CHANNEL...</span>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
