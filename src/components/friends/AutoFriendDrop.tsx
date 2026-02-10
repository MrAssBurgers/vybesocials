import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Check, Loader2, Smartphone, Zap,
  ArrowLeftRight, Bluetooth, Wifi, ZoomIn, MessageCircle, Nfc
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
  
  
  // Simple card activation - no wallet animation needed
  const triggerCardRise = useCallback(() => {
    setPhase('activated');
    setTimeout(() => {
      haptics.success();
    }, 300);
  }, []);

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

  // Web NFC for NameDrop-like auto-discovery
  const { hasWebNFC, isSupported: nfcSupported, shareProfile: nfcShareProfile, stopScan: nfcStopScan, startScan: nfcStartScan } = useNFC();
  const nfcDiscoveryRef = useRef(false);

  // Passive NFC listening on home screen — like Apple NameDrop
  // When two phones with the app open get near each other, auto-trigger friend add
  useEffect(() => {
    if (!hasWebNFC || !user?.id || isActive || !profile?.username) return;
    if (nfcDiscoveryRef.current) return; // Already listening

    let cancelled = false;
    
    const startPassiveNFC = async () => {
      try {
        nfcDiscoveryRef.current = true;
        
        // Start bidirectional NFC — broadcasts our profile and listens for theirs
        const started = await nfcShareProfile(user.id, async (theirUserId) => {
          if (cancelled || isActive) return;
          if (theirUserId === user.id) return;
          
          console.log('[AutoFriendDrop] NFC NameDrop detected user:', theirUserId);
          haptics.success();
          
          // Auto-activate the FriendDrop UI with the found user
          setIsActive(true);
          setPhase('exchanging');
          
          // Fetch their profile
          const theirProfile = await fetchUser(theirUserId);
          if (theirProfile) {
            setFoundUser(theirProfile);
          }
          
          // Auto-send friend request
          try {
            await sendRequest.mutateAsync(theirUserId);
            setPhase('success');
            haptics.success();
            
            // Create DM and navigate
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
          console.log('[AutoFriendDrop] Passive NFC NameDrop active — bring phones together');
        }
      } catch (e) {
        console.log('[AutoFriendDrop] Passive NFC setup failed:', e);
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
    haptics.impact();
    
    // Start with the card animation
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
  }, [profile?.username, user, nativeFriendDrop, friendDropSync, triggerCardRise]);
  
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
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-primary/12 backdrop-blur-lg border border-primary/20 shadow-md shadow-primary/8 active:scale-95 transition-transform duration-150 touch-manipulation"
          >
            <div className="animate-wiggle">
              {hasWebNFC ? (
                <Nfc className="h-7 w-7 text-primary" />
              ) : nativeFriendDrop.isAvailable ? (
                <Bluetooth className="h-7 w-7 text-primary" />
              ) : (
                <Smartphone className="h-7 w-7 text-primary" />
              )}
            </div>
            <span className="text-xs text-primary font-medium">
              {hasWebNFC
                ? 'Tap phones to add friends'
                : nativeFriendDrop.isAvailable 
                  ? 'Bring phones together'
                  : 'Swing to add friends'}
            </span>
            <Zap className="h-6 w-6 text-primary animate-pulse" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="ml-0.5 p-0.5 rounded-full hover:bg-primary/20 transition-colors touch-manipulation"
            >
              <X className="h-3.5 w-3.5 text-primary/70" />
            </button>
          </button>
        </div>
      )}

      {/* Exchange Modal - Credit card style */}
      <Dialog open={isActive} onOpenChange={handleClose}>
        <DialogContent 
          className="sm:max-w-md p-0 border-0 bg-transparent overflow-visible [&>button]:hidden"
        >
          <AnimatePresence mode="wait">
            
            {phase === 'activated' && (
              <motion.div
                key="activated"
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="flex flex-col items-center"
              >
                {/* Credit Card Scanner */}
                <motion.div
                  className="relative w-80 rounded-2xl overflow-hidden shadow-2xl"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 50%, hsl(var(--primary) / 0.8) 100%)',
                  }}
                >
                  {/* Card chip & branding */}
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="flex items-center gap-2.5">
                      {/* Chip */}
                      <div className="w-10 h-7 rounded-md bg-gradient-to-br from-yellow-300/90 via-yellow-400/80 to-yellow-600/70 border border-yellow-500/30" />
                      <div>
                        <h3 className="font-bold text-sm text-white tracking-wide">FriendDrop</h3>
                        <p className="text-[10px] text-white/50 uppercase tracking-widest">VYBE Connect</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={handleClose}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Contactless icon */}
                  <div className="absolute top-4 right-14">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 18.5a7.5 7.5 0 0 1 0-13" />
                      <path d="M10 16a5 5 0 0 1 0-8" />
                      <path d="M14 13.5a2 2 0 0 1 0-3" />
                    </svg>
                  </div>
                  
                  {/* Live Scanner */}
                  <div className="relative aspect-square mx-4 mb-2 rounded-xl overflow-hidden border border-white/10">
                    <video 
                      ref={videoRef} 
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Scanning overlay - minimal */}
                    <div className="absolute inset-0 pointer-events-none">
                      <motion.div
                        className="absolute left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
                        animate={{ top: ['10%', '90%', '10%'] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                      />
                      
                      {/* Corner brackets */}
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="absolute w-7 h-7 border-white/60"
                          style={{
                            top: i < 2 ? 10 : 'auto',
                            bottom: i >= 2 ? 10 : 'auto',
                            left: i % 2 === 0 ? 10 : 'auto',
                            right: i % 2 === 1 ? 10 : 'auto',
                            borderTopWidth: i < 2 ? 2 : 0,
                            borderBottomWidth: i >= 2 ? 2 : 0,
                            borderLeftWidth: i % 2 === 0 ? 2 : 0,
                            borderRightWidth: i % 2 === 1 ? 2 : 0,
                            borderRadius: 4,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {/* QR Code Section */}
                  {!nativeFriendDrop.isAvailable && (
                    <div className="px-4 pb-2">
                      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/10 border border-white/10">
                        <ExpandableQR
                          qrCodeUrl={qrCodeUrl}
                          isExpanded={isQrExpanded}
                          onToggle={toggleQrExpand}
                          avatarUrl={profile?.avatar_url}
                          username={profile?.username}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-white/50 uppercase tracking-wider">Your code</p>
                          <p className="font-bold text-sm text-white truncate">@{profile?.username}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Native nearby peers */}
                  {nativeFriendDrop.isAvailable && nativeFriendDrop.nearbyPeers.length > 0 && (
                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <Wifi className="h-3 w-3" />
                        <span>Nearby</span>
                      </div>
                      {nativeFriendDrop.nearbyPeers.slice(0, 2).map((peer) => (
                        <motion.button
                          key={peer.peerId}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
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
                          <span className="text-sm font-medium flex-1 text-left truncate text-white">{peer.displayName || peer.username}</span>
                          <ArrowLeftRight className="h-3 w-3 text-white/60" />
                        </motion.button>
                      ))}
                    </div>
                  )}
                  
                  {/* Card footer */}
                  <div className="px-5 pb-4 pt-1 flex items-center justify-between">
                    <p className="text-xs text-white/40">Point camera at friend's code</p>
                    <div className="flex gap-1">
                      {[0,1,2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-white/40"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {phase === 'found' && foundUser && (
              <motion.div
                key="found"
                initial={{ opacity: 0, scale: 0.9, rotateY: -90 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="w-80 rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(var(--primary)) 60%, hsl(var(--accent) / 0.8) 100%)',
                }}
              >
                {/* Shimmer */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-2xl pointer-events-none"
                  animate={{ x: ['-200%', '200%'] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                />
                
                <div className="relative p-6 flex flex-col items-center gap-4">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Avatar className="h-24 w-24 border-4 border-white/40 shadow-xl">
                      <AvatarImage src={foundUser.avatar_url || ''} />
                      <AvatarFallback className="text-2xl bg-white/20 text-white">
                        {foundUser.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  <div className="text-center text-white">
                    <h3 className="text-xl font-bold">{foundUser.display_name || foundUser.username}</h3>
                    <p className="text-white/60 text-sm">@{foundUser.username}</p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="flex gap-3 w-full"
                  >
                    <Button 
                      variant="secondary"
                      className="flex-1 bg-white/15 text-white hover:bg-white/25 border-0"
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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-80 rounded-2xl overflow-hidden shadow-2xl relative"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 50%, hsl(var(--primary) / 0.9) 100%)',
                  minHeight: 300,
                }}
              >
                {/* Subtle particles - reduced count for performance */}
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-white/30"
                    initial={{ x: Math.random() * 280, y: 300, opacity: 0 }}
                    animate={{ y: -20, opacity: [0, 0.5, 0] }}
                    transition={{ duration: 2, delay: i * 0.2, repeat: Infinity, ease: "easeOut" }}
                  />
                ))}
                
                <div className="relative flex flex-col items-center justify-center p-8 gap-6" style={{ minHeight: 300 }}>
                  {/* My profile flying out */}
                  <motion.div
                    className="absolute z-20"
                    initial={{ scale: 1, y: 0 }}
                    animate={{ scale: 0.3, y: -200, opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.32, 0, 0.67, 0] }}
                  >
                    <Avatar className="h-20 w-20 border-3 border-white/80 shadow-xl">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="text-xl bg-white/30 text-white font-bold">
                        {profile?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  {/* Their profile flying in */}
                  <motion.div
                    className="relative z-10"
                    initial={{ scale: 0.3, y: 200, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                  >
                    <Avatar className="h-24 w-24 border-4 border-white/70 shadow-2xl">
                      <AvatarImage src={foundUser?.avatar_url || ''} />
                      <AvatarFallback className="text-2xl bg-white/30 text-white font-bold">
                        {foundUser?.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  
                  <motion.div 
                    className="text-center text-white z-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                  >
                    <p className="text-lg font-bold">Exchanging vibes...</p>
                    <p className="text-white/60 text-sm mt-1">
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
                className="w-80 rounded-2xl overflow-hidden shadow-2xl relative"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(var(--primary)) 50%, hsl(var(--accent) / 0.9) 100%)',
                  minHeight: 300,
                }}
              >
                {/* Celebration particles - reduced for perf */}
                {[...Array(16)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: 4 + Math.random() * 4,
                      height: 4 + Math.random() * 4,
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,220,100,0.8)',
                      left: '50%',
                      top: '40%',
                    }}
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ 
                      x: Math.cos(i * 22.5 * Math.PI / 180) * (60 + Math.random() * 50),
                      y: Math.sin(i * 22.5 * Math.PI / 180) * (60 + Math.random() * 50),
                      scale: [0, 1.5, 0],
                      opacity: [1, 1, 0],
                    }}
                    transition={{ duration: 0.7, delay: i * 0.02, ease: "easeOut" }}
                  />
                ))}
                
                {/* Initial flash */}
                <motion.div
                  className="absolute inset-0 bg-white pointer-events-none rounded-2xl"
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
                
                <div className="relative flex flex-col items-center justify-center p-8 gap-4" style={{ minHeight: 300 }}>
                  {/* Both avatars */}
                  <div className="relative flex items-center justify-center h-28 z-10">
                    <motion.div
                      className="absolute"
                      initial={{ x: -60, scale: 0.5, opacity: 0 }}
                      animate={{ x: -20, scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 22 }}
                    >
                      <Avatar className="h-18 w-18 border-3 border-white/80 shadow-xl">
                        <AvatarImage src={profile?.avatar_url || ''} />
                        <AvatarFallback className="text-lg bg-white/30 text-white font-bold">
                          {profile?.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                    
                    <motion.div
                      className="absolute"
                      initial={{ x: 60, scale: 0.5, opacity: 0 }}
                      animate={{ x: 20, scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 22 }}
                    >
                      <Avatar className="h-18 w-18 border-3 border-white/80 shadow-xl">
                        <AvatarImage src={foundUser?.avatar_url || ''} />
                        <AvatarFallback className="text-lg bg-white/30 text-white font-bold">
                          {foundUser?.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                    
                    {/* Checkmark */}
                    <motion.div
                      className="absolute z-10"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg">
                        <Check className="h-6 w-6 text-primary" strokeWidth={3} />
                      </div>
                    </motion.div>
                  </div>
                  
                  <motion.div 
                    className="text-center text-white z-10"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h3 className="text-xl font-bold">You're connected!</h3>
                    <p className="text-white/70 mt-1 text-sm">
                      {foundUser?.display_name || foundUser?.username} is now your friend 🎉
                    </p>
                    <motion.div
                      className="flex items-center justify-center gap-2 mt-3 text-white/80"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span className="text-sm">Opening chat...</span>
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
