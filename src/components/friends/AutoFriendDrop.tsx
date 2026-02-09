import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { 
  X, Check, Sparkles, Loader2, Smartphone, Zap,
  ArrowLeftRight, Bluetooth, Wifi, ZoomIn, MessageCircle
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
// ExpandableQR - Simple component without layout animations to prevent glitches
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
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
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
        initial={false}
        animate={{ opacity: 1 }}
      />
      
      {/* Profile picture overlay in center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className="relative rounded-full overflow-hidden border-2 border-white shadow-lg"
          animate={{ width: avatarSize, height: avatarSize }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
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
      </div>
      
      {/* Expand/shrink indicator */}
      {!isExpanded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-200">
          <ZoomIn className="h-5 w-5 text-white" />
        </div>
      )}
      
      {/* Shrink hint when expanded */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-2 left-0 right-0 text-center"
        >
          <span className="text-xs text-black/60 bg-white/80 px-2 py-1 rounded-full">
            Tap to shrink
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
  
  // Card animation values for wallet effect
  const cardY = useMotionValue(200);
  const cardRotate = useMotionValue(3);
  const cardScale = useMotionValue(0.9);
  const [cardAnimationComplete, setCardAnimationComplete] = useState(false);
  
  // Trigger card rising animation (like credit card from wallet)
  // Now goes directly to activated phase and animates within it
  const triggerCardRise = useCallback(() => {
    // Reset animation values
    cardY.set(200);
    cardRotate.set(3);
    cardScale.set(0.9);
    setCardAnimationComplete(false);
    
    // Go directly to activated phase
    setPhase('activated');
    
    // Animate card rising from wallet with a slight delay for modal to open
    setTimeout(() => {
      animate(cardY, 0, { 
        type: 'spring', 
        stiffness: 180, 
        damping: 22,
      });
      animate(cardRotate, 0, { 
        type: 'spring', 
        stiffness: 150, 
        damping: 18 
      });
      animate(cardScale, 1, { 
        type: 'spring', 
        stiffness: 180, 
        damping: 20 
      });
      
      // Mark animation as complete after spring settles
      setTimeout(() => {
        setCardAnimationComplete(true);
        haptics.success();
      }, 500);
    }, 100);
  }, [cardY, cardRotate, cardScale]);

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
  
  // Auto-close and navigate to DM after success
  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    // Create DM conversation with new friend
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        setCreatedConversationId(conversation.id);
      } catch {
        // Conversation might already exist, that's fine
      }
    }
    
    // Close after 3 seconds and navigate to the DM
    setTimeout(() => {
      const convId = createdConversationId;
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      setIsQrOwner(false);
      setCreatedConversationId(null);
      
      // Navigate to the conversation if we created one
      if (convId) {
        navigate(`/messages/${convId}`);
      }
    }, 3000);
  }, [foundUser?.id, createConversation, createdConversationId, navigate]);
  
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
            // Go to exchanging phase - show fly-out animation
            setPhase('exchanging');
            // After animation, send friend request and complete
            setTimeout(async () => {
              try {
                await sendRequest.mutateAsync(scannedUser.id);
              } catch {
                // Already friends - that's ok
              }
              // Mark as completed - both sides will see success
              if (activeDropId) {
                await friendDropSync.completeDrop(activeDropId);
              }
            }, 1500);
          }
        });
      }
    }, [activeDropId, sendRequest]),
    onConfirmed: useCallback(() => {
      // Both sides see this - transition to exchanging
      if (phase !== 'exchanging') {
        setPhase('exchanging');
        haptics.impact();
      }
    }, [phase]),
    onCompleted: useCallback(async () => {
      // Both sides see this - show success, create DM, and auto-close
      setPhase('success');
      haptics.success();
      
      // Create DM and navigate after delay
      const targetUserId = foundUser?.id;
      if (targetUserId) {
        try {
          const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
          // Navigate after the success animation
          setTimeout(() => {
            setIsActive(false);
            setPhase('idle');
            setFoundUser(null);
            setActiveDropId(null);
            setIsQrOwner(false);
            navigate(`/messages/${conversation.id}`);
          }, 3000);
        } catch {
          // Still close after 3 seconds even if DM creation fails
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
    
    // Reset card animation values for wallet effect
    cardY.set(300);
    cardRotate.set(5);
    cardScale.set(0.8);
    
    // Activate the exchange UI and trigger wallet animation
    setIsActive(true);
    haptics.impact();
    
    // Start with the wallet card-rising animation
    triggerCardRise();
    
    // Create a drop session for realtime sync (do this in background)
    friendDropSync.createDrop().then((drop) => {
      if (drop) {
        setActiveDropId(drop.id);
      }
    });
    
    // Start native peer discovery if available
    if (nativeFriendDrop.isAvailable) {
      nativeFriendDrop.startSession();
    }
  }, [profile?.username, user, nativeFriendDrop, friendDropSync, cardY, cardRotate, cardScale, triggerCardRise]);
  
  // Start QR scanning when phase transitions to activated (after card animation)
  useEffect(() => {
    if (phase === 'activated' && isActive) {
      startScanning();
    }
  }, [phase, isActive]);

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

    // Fetch the QR owner's profile and show exchanging animation
    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) {
        setFoundUser(ownerProfile);
        // Go to exchanging animation - profile flies IN
        setPhase('exchanging');
        // The QR owner will handle sending the friend request and completing
        // We just wait for the realtime 'completed' event to show success
      }
    }
  }, [friendDropSync, stopScanning]);

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
      
      // Complete the drop - this triggers success on BOTH devices via realtime
      if (activeDropId) {
        await friendDropSync.completeDrop(activeDropId);
      }
      
      // If no activeDropId (legacy flow), manually show success
      if (!activeDropId) {
        setPhase('success');
        haptics.success();
        autoCloseAfterSuccess();
      }
      // Otherwise, the realtime onCompleted callback handles it
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already friends or request pending!');
        if (activeDropId) {
          await friendDropSync.completeDrop(activeDropId);
        } else {
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
    // Only cancel the drop if we're not in success phase (don't interfere with completed drops)
    if (activeDropId && phase !== 'success') {
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
    setCreatedConversationId(null);
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync, phase]);

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
            className="flex items-center gap-3 px-5 py-3 rounded-full bg-primary/15 backdrop-blur-lg border border-primary/25 shadow-lg shadow-primary/10 active:scale-95 transition-transform duration-150 touch-manipulation"
          >
            <div className="animate-wiggle">
              {nativeFriendDrop.isAvailable ? (
                <Bluetooth className="h-6 w-6 text-primary" />
              ) : (
                <Smartphone className="h-6 w-6 text-primary" />
              )}
            </div>
            <span className="text-sm text-primary font-medium">
              {nativeFriendDrop.isAvailable 
                ? 'Tap or bring phones together'
                : 'Swing phone to add friends'}
            </span>
            <Zap className="h-5 w-5 text-primary animate-pulse" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="ml-1 p-1 rounded-full hover:bg-primary/20 transition-colors touch-manipulation"
            >
              <X className="h-4 w-4 text-primary/70" />
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center"
              >
                {/* Wallet with Rising Scanner Card */}
                <div className="relative w-full flex flex-col items-center overflow-visible pb-4">
                  {/* Wallet base - leather texture look */}
                  <motion.div
                    className="absolute bottom-0 w-72 h-16 rounded-t-2xl overflow-hidden z-0"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(20,30%,12%)] via-[hsl(20,25%,18%)] to-[hsl(20,20%,25%)]" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1.5 bg-black/60 rounded-b-full" />
                    <div className="absolute top-2 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </motion.div>
                  
                  {/* Rising Scanner Card - contains live scanner */}
                  <motion.div
                    className="relative z-10 w-72 rounded-2xl bg-gradient-to-br from-background via-card to-muted border-2 border-primary/40 shadow-2xl shadow-primary/20 overflow-hidden"
                    style={{ 
                      y: cardY,
                      rotate: cardRotate,
                      scale: cardScale
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 pb-0">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                        >
                          {nativeFriendDrop.isAvailable ? (
                            <Bluetooth className="h-4 w-4 text-primary" />
                          ) : (
                            <Sparkles className="h-4 w-4 text-primary" />
                          )}
                        </motion.div>
                        <h3 className="font-bold text-sm text-foreground">FriendDrop</h3>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {/* Live Scanner */}
                    <div className="relative aspect-square bg-black m-3 mt-2 rounded-xl overflow-hidden">
                      <video 
                        ref={videoRef} 
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                      />
                      <canvas ref={canvasRef} className="hidden" />
                      
                      {/* Scanning overlay */}
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Scanning line */}
                        <motion.div
                          className="absolute left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full"
                          animate={{ top: ['15%', '85%', '15%'] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        />
                        
                        {/* Corner brackets */}
                        {[0, 1, 2, 3].map((i) => (
                          <motion.div
                            key={i}
                            className="absolute w-8 h-8 border-primary"
                            style={{
                              top: i < 2 ? 12 : 'auto',
                              bottom: i >= 2 ? 12 : 'auto',
                              left: i % 2 === 0 ? 12 : 'auto',
                              right: i % 2 === 1 ? 12 : 'auto',
                              borderTopWidth: i < 2 ? 3 : 0,
                              borderBottomWidth: i >= 2 ? 3 : 0,
                              borderLeftWidth: i % 2 === 0 ? 3 : 0,
                              borderRightWidth: i % 2 === 1 ? 3 : 0,
                              borderRadius: 6,
                            }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* QR Code Section - tap to expand */}
                    {!nativeFriendDrop.isAvailable && (
                      <div className="px-3 pb-2">
                        <div className="flex items-center gap-3 p-2 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                          <ExpandableQR
                            qrCodeUrl={qrCodeUrl}
                            isExpanded={isQrExpanded}
                            onToggle={toggleQrExpand}
                            avatarUrl={profile?.avatar_url}
                            username={profile?.username}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Your code</p>
                            <p className="font-bold text-sm text-foreground truncate">@{profile?.username}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Native nearby peers */}
                    {nativeFriendDrop.isAvailable && nativeFriendDrop.nearbyPeers.length > 0 && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Wifi className="h-3 w-3" />
                          <span>Nearby</span>
                        </div>
                        {nativeFriendDrop.nearbyPeers.slice(0, 2).map((peer) => (
                          <motion.button
                            key={peer.peerId}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
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
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={peer.avatarUrl || ''} />
                              <AvatarFallback className="text-xs">{peer.username[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium flex-1 text-left truncate">{peer.displayName || peer.username}</span>
                            <ArrowLeftRight className="h-3 w-3 text-primary" />
                          </motion.button>
                        ))}
                      </div>
                    )}
                    
                    {/* Card footer */}
                    <div className="px-3 pb-3 pt-1">
                      <p className="text-xs text-center text-muted-foreground">
                        Point camera at friend's code
                      </p>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
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
                className="bg-gradient-to-br from-primary/90 via-accent/80 to-primary/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center justify-center gap-6 overflow-hidden relative"
                style={{ minHeight: 320 }}
              >
                {/* Fast animated background particles */}
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full bg-white/40"
                    initial={{ 
                      x: Math.random() * 200 - 100,
                      y: 200,
                      opacity: 0 
                    }}
                    animate={{ 
                      y: -100,
                      opacity: [0, 0.6, 0],
                    }}
                    transition={{ 
                      duration: 1.2,
                      delay: i * 0.08,
                      repeat: Infinity,
                      ease: "easeOut"
                    }}
                  />
                ))}
                
                {/* Phase 1: MY profile flies OUT (both devices show their own flying out) */}
                <motion.div
                  className="absolute z-20"
                  initial={{ scale: 1, y: 0, x: 0, rotateZ: 0 }}
                  animate={{ 
                    scale: [1, 1.1, 0.2], 
                    y: [0, -30, -350], 
                    x: [0, 10, 40],
                    rotateZ: [0, -5, -25],
                    opacity: [1, 1, 0] 
                  }}
                  transition={{ 
                    duration: 0.8,
                    ease: [0.32, 0, 0.67, 0],
                    times: [0, 0.3, 1]
                  }}
                >
                  <div className="relative">
                    <motion.div
                      className="absolute inset-0 rounded-full bg-white/50 blur-lg"
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 2, 0] }}
                      transition={{ duration: 0.8 }}
                      style={{ margin: -12 }}
                    />
                    <Avatar className="h-24 w-24 border-4 border-white/90 shadow-2xl">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="text-2xl bg-white/30 text-white font-bold">
                        {profile?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </motion.div>
                
                {/* Phase 2: THEIR profile flies IN (delayed) */}
                <motion.div
                  className="relative z-10"
                  initial={{ scale: 0.2, y: 350, x: -40, rotateZ: 25, opacity: 0 }}
                  animate={{ 
                    scale: [0.2, 1.15, 1], 
                    y: [350, -20, 0], 
                    x: [-40, 10, 0],
                    rotateZ: [25, -3, 0],
                    opacity: [0, 1, 1] 
                  }}
                  transition={{ 
                    duration: 0.9,
                    delay: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                    times: [0, 0.7, 1]
                  }}
                >
                  <div className="relative">
                    {/* Glow ring behind avatar */}
                    <motion.div
                      className="absolute inset-0 rounded-full bg-white/50 blur-xl"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: [0, 1.8, 1.2], opacity: [0, 0.8, 0.4] }}
                      transition={{ duration: 0.6, delay: 0.8 }}
                      style={{ margin: -16 }}
                    />
                    <Avatar className="h-28 w-28 border-4 border-white/80 shadow-2xl relative z-10">
                      <AvatarImage src={foundUser?.avatar_url || ''} />
                      <AvatarFallback className="text-3xl bg-white/30 text-white font-bold">
                        {foundUser?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    {/* Sparkle burst on landing */}
                    {[...Array(8)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{ top: '50%', left: '50%' }}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ 
                          scale: [0, 1.2, 0],
                          opacity: [0, 1, 0],
                          x: Math.cos(i * 45 * Math.PI / 180) * 55 - 8,
                          y: Math.sin(i * 45 * Math.PI / 180) * 55 - 8,
                        }}
                        transition={{ 
                          duration: 0.5,
                          delay: 1.3 + i * 0.04,
                        }}
                      >
                        <Sparkles className="h-4 w-4 text-white" />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
                
                {/* Text */}
                <motion.div 
                  className="text-center text-white z-10 mt-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                >
                  <p className="text-xl font-bold">Exchanging vibes...</p>
                  <p className="text-white/70 text-sm mt-1">
                    {foundUser?.display_name || foundUser?.username}
                  </p>
                </motion.div>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="bg-gradient-to-br from-accent via-primary to-accent rounded-3xl p-8 flex flex-col items-center gap-4 overflow-hidden relative"
                style={{ minHeight: 320 }}
              >
                {/* MASSIVE EXPLOSION - radial particle burst */}
                {[...Array(32)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: 6 + Math.random() * 8,
                      height: 6 + Math.random() * 8,
                      background: i % 3 === 0 ? 'rgba(255,255,255,0.9)' : i % 3 === 1 ? 'rgba(255,220,100,0.9)' : 'rgba(255,180,255,0.8)',
                    }}
                    initial={{ 
                      x: 0, 
                      y: 0, 
                      scale: 0,
                      opacity: 1 
                    }}
                    animate={{ 
                      x: Math.cos(i * 11.25 * Math.PI / 180) * (100 + Math.random() * 80),
                      y: Math.sin(i * 11.25 * Math.PI / 180) * (100 + Math.random() * 80),
                      scale: [0, 2, 0],
                      opacity: [1, 1, 0],
                    }}
                    transition={{ duration: 0.8, delay: i * 0.015, ease: "easeOut" }}
                  />
                ))}
                
                {/* Secondary sparkle explosion */}
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={`sparkle-${i}`}
                    className="absolute"
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ 
                      x: Math.cos(i * 18 * Math.PI / 180) * (70 + Math.random() * 60),
                      y: Math.sin(i * 18 * Math.PI / 180) * (70 + Math.random() * 60),
                      scale: [0, 1.5, 0],
                      opacity: [1, 1, 0],
                      rotate: 720
                    }}
                    transition={{ duration: 1, delay: 0.1 + i * 0.02, ease: "easeOut" }}
                  >
                    <Sparkles className="h-5 w-5 text-white" />
                  </motion.div>
                ))}
                
                {/* Central flash */}
                <motion.div
                  className="absolute inset-0 rounded-3xl bg-white pointer-events-none"
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
                
                {/* Both avatars meeting with bounce */}
                <div className="relative flex items-center justify-center h-32 z-10">
                  {/* My avatar */}
                  <motion.div
                    className="absolute"
                    initial={{ x: -80, scale: 0.4, opacity: 0 }}
                    animate={{ x: -22, scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 20 }}
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
                    initial={{ x: 80, scale: 0.4, opacity: 0 }}
                    animate={{ x: 22, scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Avatar className="h-20 w-20 border-4 border-white/90 shadow-xl">
                      <AvatarImage src={foundUser?.avatar_url || ''} />
                      <AvatarFallback className="text-xl bg-white/30 text-white font-bold">
                        {foundUser?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  {/* Connection burst with pulse */}
                  <motion.div
                    className="absolute z-10"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.6, 1], opacity: 1 }}
                    transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" }}
                  >
                    <motion.div 
                      className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ delay: 0.8, duration: 0.5, repeat: 2 }}
                    >
                      <Check className="h-7 w-7 text-primary" strokeWidth={3} />
                    </motion.div>
                  </motion.div>
                </div>
                
                {/* Text */}
                <motion.div 
                  className="text-center text-white z-10"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <h3 className="text-2xl font-bold">You're connected!</h3>
                  <p className="text-white/80 mt-1">
                    {foundUser?.display_name || foundUser?.username} is now your friend 🎉
                  </p>
                  <motion.div
                    className="flex items-center justify-center gap-2 mt-3 text-white/90"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-sm">Opening chat...</span>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
