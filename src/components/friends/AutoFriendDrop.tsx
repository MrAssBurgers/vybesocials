import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Check, Sparkles, Loader2, Smartphone, Zap,
  ArrowLeftRight, Bluetooth, Wifi, ZoomIn
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync } from '@/hooks/useFriendDropSync';
import { supabase } from '@/integrations/supabase/client';
import { useSwingDetection } from '@/hooks/useSwingDetection';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import jsQR from 'jsqr';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// Expandable QR component with tap-to-toggle and profile picture
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
    <motion.button
      className="relative cursor-pointer overflow-hidden"
      onClick={onToggle}
      layout
      initial={false}
      animate={{
        width: size,
        height: size,
        padding: isExpanded ? 16 : 8,
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
        duration: 0.25,
      }}
      style={{
        borderRadius: 16,
        background: 'white',
      }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.img
        src={qrCodeUrl}
        alt="QR Code"
        className="w-full h-full rounded-lg"
        layout
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
      />
      
      {/* Profile picture overlay in center */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        layout
      >
        <motion.div
          className="relative rounded-full overflow-hidden border-2 border-white shadow-lg"
          animate={{ width: avatarSize, height: avatarSize }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          style={{ background: 'white' }}
        >
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={username || 'Profile'} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold">
              {username?.[0]?.toUpperCase() || 'V'}
            </div>
          )}
        </motion.div>
      </motion.div>
      
      {/* Expand/shrink indicator */}
      <AnimatePresence mode="wait">
        {!isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-200"
          >
            <ZoomIn className="h-5 w-5 text-white" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Shrink hint when expanded */}
      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="absolute bottom-2 left-0 right-0 text-center"
          >
            <span className="text-xs text-black/60 bg-white/80 px-2 py-1 rounded-full">
              Tap to shrink
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
});

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const sendRequest = useSendFriendRequest();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [isDismissed, setIsDismissed] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Fetch user helper
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
  
  // Track if we are the QR owner (our QR was scanned) or the scanner
  const [isQrOwner, setIsQrOwner] = useState(false);
  
  // Realtime sync for dual-device animation
  const friendDropSync = useFriendDropSync({
    enabled: isActive,
    onScanned: useCallback((drop) => {
      // QR owner sees this when their QR is scanned - THEIR profile flies OUT
      haptics.success();
      setIsQrOwner(true);
      if (drop.to_user_id) {
        fetchUser(drop.to_user_id).then((scannedUser) => {
          if (scannedUser) {
            setFoundUser(scannedUser);
            // Skip 'found' phase - go straight to exchanging with auto-add
            setPhase('exchanging');
            // Auto-complete after animation
            setTimeout(() => {
              sendRequest.mutateAsync(scannedUser.id).then(() => {
                friendDropSync.completeDrop(activeDropId!);
              }).catch(() => {
                // Already friends or error - still show success
                friendDropSync.completeDrop(activeDropId!);
              });
            }, 1200);
          }
        });
      }
    }, [activeDropId]),
    onConfirmed: useCallback(() => {
      setPhase('exchanging');
      haptics.impact();
    }, []),
    onCompleted: useCallback(() => {
      setPhase('success');
      haptics.success();
    }, []),
  });
  
  // Native FriendDrop (Bluetooth/Nearby) - works on native apps
  const nativeFriendDrop = useNativeFriendDrop({
    enabled: isActive,
    onPeerFound: (peer) => {
      // Show found peer immediately - they're nearby!
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
      // Auto-add when connection is confirmed (both devices detected each other)
      handleAutoAdd(peer.userId);
    },
  });

  // Toggle QR expansion
  const toggleQrExpand = useCallback(() => {
    setIsQrExpanded(prev => !prev);
    haptics.tap();
  }, []);

  // QR code URL with friend-drop ID for realtime sync
  const myProfileUrl = activeDropId 
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username 
      ? `https://vybehub.app/add-friend/${user?.id}`
      : '';
  
  // Use white background QR for better scannability
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=000000&format=svg&ecc=H&margin=2`
    : '';

  // Auto-add friend (for native peer-to-peer connection)
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
    if (!profile?.username || !user) {
      return;
    }
    
    // Activate the exchange UI
    setIsActive(true);
    setPhase('activated');
    haptics.impact();
    
    // Create a drop session for realtime sync
    const drop = await friendDropSync.createDrop();
    if (drop) {
      setActiveDropId(drop.id);
    }
    
    // Start native peer discovery if available
    if (nativeFriendDrop.isAvailable) {
      await nativeFriendDrop.startSession();
    }
    
    // Also start QR scanning as fallback
    startScanning();
  }, [profile?.username, user, nativeFriendDrop, friendDropSync]);

  // Swing detection - detects back-then-forward motion instantly
  useSwingDetection({
    enabled: !isActive && !!profile?.username,
    threshold: 6, // Lower threshold for responsive detection
    swingWindow: 500, // 500ms to complete back-forward swing
    cooldown: 3000,
    onSwing: handleBump,
  });

  // Stop scanning helper
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

  // Handle drop scan - called when scanner successfully scans QR
  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();

    // Register ourselves as the scanner
    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) {
      toast.error('This code has expired');
      setPhase('activated');
      return;
    }

    // Store the drop ID for later
    setActiveDropId(dropId);
    setIsQrOwner(false); // We are the scanner, not the owner

    // Fetch the QR owner's profile and AUTO-ADD immediately
    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) {
        setFoundUser(ownerProfile);
        // Skip found phase - go straight to exchanging animation
        setPhase('exchanging');
        
        // Auto-add friend after a brief animation delay
        setTimeout(async () => {
          try {
            await sendRequest.mutateAsync(ownerProfile.id);
            await friendDropSync.completeDrop(dropId);
            setPhase('success');
            haptics.success();
            setTimeout(handleClose, 2000);
          } catch (error: any) {
            if (error?.message?.includes('already')) {
              await friendDropSync.completeDrop(dropId);
              setPhase('success');
              setTimeout(handleClose, 1500);
            } else {
              toast.error('Failed to add friend');
              handleClose();
            }
          }
        }, 1200);
      }
    }
  }, [friendDropSync, stopScanning, sendRequest]);

  const startScanning = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

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
          
          // Check for friend-drop URL (realtime sync)
          const dropMatch = url?.match(/\/friend-drop\/([a-zA-Z0-9-]+)/);
          if (dropMatch) {
            const dropId = dropMatch[1];
            await handleDropScan(dropId);
            return;
          }
          
          // Check for legacy add-friend URL
          const userMatch = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
          if (userMatch) {
            const userId = userMatch[1];
            if (userId !== user?.id) {
              handleFoundUser(userId);
              return;
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(scanFrame);
      };

      scanFrame();
    } catch (error) {
      console.error('Camera error:', error);
      // Camera not available - still show QR code
    }
  }, [user?.id, handleDropScan]);

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
      console.error('Error fetching user:', error);
      toast.error('Could not find user');
      handleClose();
    }
  }, [stopScanning]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;

    setPhase('exchanging');
    haptics.impact();

    // Confirm the drop for realtime sync
    if (activeDropId) {
      await friendDropSync.confirmDrop(activeDropId);
    }

    try {
      await sendRequest.mutateAsync(foundUser.id);
      
      // Complete the drop
      if (activeDropId) {
        await friendDropSync.completeDrop(activeDropId);
      }
      
      setPhase('success');
      haptics.success();
      
      setTimeout(() => {
        handleClose();
      }, 2500);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already friends or request pending!');
        setPhase('success');
        setTimeout(handleClose, 1500);
      } else {
        toast.error('Failed to send request');
        setPhase('found');
      }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync]);

  const handleClose = useCallback(async () => {
    stopScanning();
    // Cancel the drop
    if (activeDropId) {
      await friendDropSync.cancelDrop(activeDropId);
    }
    // Stop native session if active
    if (nativeFriendDrop.isActive) {
      await nativeFriendDrop.stopSession();
    }
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
    setIsQrOwner(false);
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync]);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  // Don't render anything if user not logged in
  if (!profile?.username) {
    return null;
  }

  return (
    <>
      {/* Subtle indicator that bump detection is active - only show on mobile */}
      {!isActive && !isDismissed && isMobile && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fade-in"
          style={{ animationDuration: '300ms' }}
        >
          <button
            onClick={handleBump}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary/15 backdrop-blur-lg border border-primary/25 shadow-lg shadow-primary/10 active:scale-95 transition-transform duration-150 touch-manipulation"
          >
            <div className="animate-wiggle">
              {nativeFriendDrop.isAvailable ? (
                <Bluetooth className="h-4 w-4 text-primary" />
              ) : (
                <Smartphone className="h-4 w-4 text-primary" />
              )}
            </div>
            <span className="text-xs text-primary font-medium">
              {nativeFriendDrop.isAvailable 
                ? 'Tap or bring phones together'
                : 'Swing phone to add friends'}
            </span>
            <Zap className="h-3 w-3 text-primary animate-pulse" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="ml-1 p-0.5 rounded-full hover:bg-primary/20 transition-colors touch-manipulation"
            >
              <X className="h-3 w-3 text-primary/70" />
            </button>
          </button>
        </div>
      )}

      {/* Exchange Modal - Wallet-style slide up like a credit card leaving a wallet */}
      <Dialog open={isActive} onOpenChange={handleClose}>
        <DialogContent 
          className="sm:max-w-md p-0 border-0 bg-transparent overflow-visible [&>button]:hidden data-[state=open]:animate-card-bounce-in data-[state=closed]:animate-wallet-slide-down"
          style={{ 
            transformOrigin: 'bottom center',
            perspective: '1200px',
            perspectiveOrigin: 'center bottom',
            transformStyle: 'preserve-3d',
            willChange: 'transform, opacity'
          }}
        >
          <AnimatePresence mode="wait">
            {phase === 'activated' && (
              <div
                className="bg-background/95 backdrop-blur-xl rounded-3xl p-6 shadow-2xl shadow-primary/20 border border-primary/10"
                style={{ 
                  animationDuration: '200ms',
                  transformStyle: 'preserve-3d'
                }}
              >
                {/* Split view - Native discovery or QR fallback */}
                <div className="flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                      >
                        {nativeFriendDrop.isAvailable ? (
                          <Bluetooth className="h-5 w-5 text-primary" />
                        ) : (
                          <Sparkles className="h-5 w-5 text-primary" />
                        )}
                      </motion.div>
                      <h3 className="font-bold text-lg">FriendDrop Active!</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Native discovery - show nearby peers */}
                  {nativeFriendDrop.isAvailable && nativeFriendDrop.nearbyPeers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl bg-accent/20 border border-accent/30 p-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Wifi className="h-4 w-4 text-accent" />
                        <span className="text-sm font-medium">Nearby Friends</span>
                      </div>
                      <div className="space-y-2">
                        {nativeFriendDrop.nearbyPeers.map((peer) => (
                          <motion.button
                            key={peer.peerId}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl bg-background/50 hover:bg-background/80 transition-colors"
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
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={peer.avatarUrl || ''} />
                              <AvatarFallback>{peer.username[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="text-left flex-1">
                              <p className="font-medium">{peer.displayName || peer.username}</p>
                              <p className="text-xs text-muted-foreground">@{peer.username}</p>
                            </div>
                            <ArrowLeftRight className="h-4 w-4 text-primary" />
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Searching for peers indicator (native) */}
                  {nativeFriendDrop.isAvailable && nativeFriendDrop.nearbyPeers.length === 0 && (
                    <motion.div
                      className="rounded-2xl bg-primary/10 border border-primary/20 p-6 flex flex-col items-center gap-3"
                      animate={{ 
                        boxShadow: [
                          '0 0 20px hsl(var(--primary) / 0.1)',
                          '0 0 40px hsl(var(--primary) / 0.2)',
                          '0 0 20px hsl(var(--primary) / 0.1)'
                        ]
                      }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                      >
                        <Bluetooth className="h-12 w-12 text-primary" />
                      </motion.div>
                      <div className="text-center">
                        <p className="font-medium">Searching nearby...</p>
                        <p className="text-sm text-muted-foreground">Bring phones together</p>
                      </div>
                    </motion.div>
                  )}

                  {/* My Profile QR (fallback for web or additional option) - with tap to expand */}
                  {!nativeFriendDrop.isAvailable && (
                    <motion.div 
                      className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-accent p-4"
                      animate={{
                        boxShadow: [
                          '0 0 20px hsl(var(--primary) / 0.3)',
                          '0 0 40px hsl(var(--primary) / 0.5)',
                          '0 0 20px hsl(var(--primary) / 0.3)'
                        ]
                      }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      />
                      
                      <div className="relative flex flex-col items-center gap-4">
                        <div className="flex items-center gap-4 w-full">
                          <Avatar className="h-14 w-14 border-2 border-white/50">
                            <AvatarImage src={profile?.avatar_url || ''} />
                            <AvatarFallback className="bg-white/20 text-white">
                              {profile?.username?.[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 text-white">
                            <p className="font-bold">{profile?.username}</p>
                            <p className="text-white/70 text-sm">
                              {isQrExpanded ? 'Tap QR to shrink' : 'Tap QR to enlarge'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Expandable QR Code with profile picture */}
                        <ExpandableQR
                          qrCodeUrl={qrCodeUrl}
                          isExpanded={isQrExpanded}
                          onToggle={toggleQrExpand}
                          avatarUrl={profile?.avatar_url}
                          username={profile?.username}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Scanner */}
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-black">
                    <video 
                      ref={videoRef} 
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Scanning overlay */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-0 bg-gradient-radial from-transparent to-black/50" />
                      
                      {/* Scanning frame */}
                      <div className="absolute inset-6 border-2 border-primary/50 rounded-2xl" />
                      
                      {/* Scanning line */}
                      <motion.div
                        className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                        animate={{ top: ['15%', '85%', '15%'] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      />
                      
                      {/* Corner accents */}
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="absolute w-6 h-6"
                          style={{
                            top: i < 2 ? 16 : 'auto',
                            bottom: i >= 2 ? 16 : 'auto',
                            left: i % 2 === 0 ? 16 : 'auto',
                            right: i % 2 === 1 ? 16 : 'auto',
                          }}
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                        >
                          <div 
                            className="w-full h-full border-primary"
                            style={{
                              borderTopWidth: i < 2 ? 3 : 0,
                              borderBottomWidth: i >= 2 ? 3 : 0,
                              borderLeftWidth: i % 2 === 0 ? 3 : 0,
                              borderRightWidth: i % 2 === 1 ? 3 : 0,
                              borderTopLeftRadius: i === 0 ? 8 : 0,
                              borderTopRightRadius: i === 1 ? 8 : 0,
                              borderBottomLeftRadius: i === 2 ? 8 : 0,
                              borderBottomRightRadius: i === 3 ? 8 : 0,
                            }}
                          />
                        </motion.div>
                      ))}
                    </div>
                    
                    {/* Instruction overlay */}
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                      <p className="text-white/80 text-sm">
                        Point at their screen
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {phase === 'found' && foundUser && (
              <motion.div
                key="found"
                initial={{ opacity: 0, scale: 0.5, rotateY: -180 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", bounce: 0.4 }}
                className="bg-gradient-to-br from-accent via-primary to-primary/80 rounded-3xl p-6"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-3xl"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                
                <div className="relative flex flex-col items-center gap-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                  >
                    <Avatar className="h-24 w-24 border-4 border-white/50">
                      <AvatarImage src={foundUser.avatar_url || ''} />
                      <AvatarFallback className="text-2xl bg-white/20 text-white">
                        {foundUser.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  <div className="text-center text-white">
                    <h3 className="text-xl font-bold">{foundUser.display_name || foundUser.username}</h3>
                    <p className="text-white/70">@{foundUser.username}</p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex gap-3 w-full"
                  >
                    <Button 
                      variant="secondary"
                      className="flex-1 bg-white/20 text-white hover:bg-white/30"
                      onClick={handleClose}
                    >
                      Cancel
                    </Button>
                    <Button 
                      className="flex-1 bg-white text-primary hover:bg-white/90"
                      onClick={handleAddFriend}
                    >
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Add Friend
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {phase === 'exchanging' && (
              <motion.div
                key="exchanging"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-gradient-to-br from-primary/90 via-accent/80 to-primary/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center gap-6 overflow-hidden relative"
                style={{ minHeight: 280 }}
              >
                {/* Animated background particles */}
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-white/30"
                    initial={{ 
                      x: Math.random() * 300 - 150,
                      y: 300,
                      opacity: 0 
                    }}
                    animate={{ 
                      y: -50,
                      opacity: [0, 0.8, 0],
                    }}
                    transition={{ 
                      duration: 2,
                      delay: i * 0.1,
                      repeat: Infinity,
                      ease: "easeOut"
                    }}
                  />
                ))}
                
                {/* Profile avatar with fly animation */}
                <motion.div
                  className="relative z-10"
                  initial={isQrOwner ? { scale: 1, y: 0 } : { scale: 0.3, y: 200, rotateZ: -15 }}
                  animate={isQrOwner 
                    ? { scale: [1, 1.2, 0.3], y: [0, -20, -300], rotateZ: [0, 5, 15], opacity: [1, 1, 0] }
                    : { scale: [0.3, 1.3, 1], y: [200, -15, 0], rotateZ: [-15, 5, 0] }
                  }
                  transition={{ 
                    duration: 1.2,
                    ease: [0.22, 1.2, 0.36, 1],
                    times: [0, 0.6, 1]
                  }}
                >
                  <div className="relative">
                    {/* Glow ring behind avatar */}
                    <motion.div
                      className="absolute inset-0 rounded-full bg-white/40 blur-xl"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      style={{ margin: -8 }}
                    />
                    <Avatar className="h-28 w-28 border-4 border-white/80 shadow-2xl relative z-10">
                      <AvatarImage src={isQrOwner ? (profile?.avatar_url || '') : (foundUser?.avatar_url || '')} />
                      <AvatarFallback className="text-3xl bg-white/30 text-white font-bold">
                        {isQrOwner 
                          ? profile?.username?.[0]?.toUpperCase()
                          : foundUser?.username?.[0]?.toUpperCase()
                        }
                      </AvatarFallback>
                    </Avatar>
                    
                    {/* Sparkle effects around avatar */}
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{
                          top: '50%',
                          left: '50%',
                        }}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ 
                          scale: [0, 1, 0],
                          opacity: [0, 1, 0],
                          x: Math.cos(i * 60 * Math.PI / 180) * 60 - 8,
                          y: Math.sin(i * 60 * Math.PI / 180) * 60 - 8,
                        }}
                        transition={{ 
                          duration: 0.8,
                          delay: 0.3 + i * 0.1,
                          repeat: Infinity,
                          repeatDelay: 0.5
                        }}
                      >
                        <Sparkles className="h-4 w-4 text-white" />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
                
                {/* Text */}
                <motion.div 
                  className="text-center text-white z-10"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <p className="text-xl font-bold">
                    {isQrOwner ? 'Sending your vybe...' : 'Receiving vybe...'}
                  </p>
                  <p className="text-white/70 text-sm mt-1">
                    {isQrOwner 
                      ? `Flying to ${foundUser?.username || 'friend'}` 
                      : `From ${foundUser?.display_name || foundUser?.username}`
                    }
                  </p>
                </motion.div>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", bounce: 0.4 }}
                className="bg-gradient-to-br from-accent via-primary to-accent rounded-3xl p-8 flex flex-col items-center gap-4 overflow-hidden relative"
                style={{ minHeight: 280 }}
              >
                {/* Celebration particles bursting outward */}
                {[...Array(16)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ 
                      x: 0, 
                      y: 0, 
                      scale: 0,
                      opacity: 1 
                    }}
                    animate={{ 
                      x: Math.cos(i * 22.5 * Math.PI / 180) * 120,
                      y: Math.sin(i * 22.5 * Math.PI / 180) * 120,
                      scale: [0, 1.5, 0],
                      opacity: [1, 1, 0],
                      rotate: 360
                    }}
                    transition={{ duration: 1.2, delay: i * 0.03, ease: "easeOut" }}
                  >
                    <Sparkles className="h-5 w-5 text-white" />
                  </motion.div>
                ))}
                
                {/* Both avatars meeting - stack overlapping */}
                <div className="relative flex items-center justify-center h-32">
                  {/* My avatar */}
                  <motion.div
                    className="absolute"
                    initial={{ x: -60, scale: 0.6, opacity: 0 }}
                    animate={{ x: -20, scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", bounce: 0.5 }}
                  >
                    <Avatar className="h-20 w-20 border-4 border-white/90 shadow-xl">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="text-xl bg-white/30 text-white font-bold">
                        {profile?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  {/* Friend's avatar */}
                  <motion.div
                    className="absolute"
                    initial={{ x: 60, scale: 0.6, opacity: 0 }}
                    animate={{ x: 20, scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, type: "spring", bounce: 0.5 }}
                  >
                    <Avatar className="h-20 w-20 border-4 border-white/90 shadow-xl">
                      <AvatarImage src={foundUser?.avatar_url || ''} />
                      <AvatarFallback className="text-xl bg-white/30 text-white font-bold">
                        {foundUser?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  {/* Connection burst at center */}
                  <motion.div
                    className="absolute z-10"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 1] }}
                    transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                  >
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg">
                      <Check className="h-6 w-6 text-primary" strokeWidth={3} />
                    </div>
                  </motion.div>
                </div>
                
                {/* Text */}
                <motion.div 
                  className="text-center text-white z-10"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <h3 className="text-2xl font-bold">You're connected!</h3>
                  <p className="text-white/80 mt-1">
                    {foundUser?.display_name || foundUser?.username} is now your friend 🎉
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
