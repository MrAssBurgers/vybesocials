import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, Sparkles, QrCode, Camera, 
  ArrowLeftRight, Loader2, Heart, ZoomIn, Copy, Share2, Maximize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync, FriendDrop as FriendDropType } from '@/hooks/useFriendDropSync';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import jsQR from 'jsqr';

interface FriendDropProps {
  variant?: 'button' | 'icon' | 'banner';
}

type DropPhase = 'idle' | 'showing' | 'scanning' | 'detected' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

// QR Fullscreen Lightbox Component
const QRLightbox = memo(function QRLightbox({
  isOpen,
  onClose,
  qrCodeUrl,
  username,
  onScanned,
}: {
  isOpen: boolean;
  onClose: () => void;
  qrCodeUrl: string;
  username: string;
  onScanned?: () => void;
}) {
  // Auto-close when scanned
  useEffect(() => {
    if (onScanned) {
      onScanned();
    }
  }, [onScanned]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="relative p-8 bg-gradient-to-br from-primary via-primary/80 to-accent rounded-3xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="absolute inset-0 rounded-3xl"
              animate={{
                boxShadow: [
                  '0 0 40px hsl(var(--primary) / 0.4)',
                  '0 0 80px hsl(var(--primary) / 0.6)',
                  '0 0 40px hsl(var(--primary) / 0.4)',
                ],
              }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            
            <div className="relative flex flex-col items-center gap-4">
              <p className="text-white font-semibold text-lg">@{username?.trim()}</p>
              <img 
                src={qrCodeUrl} 
                alt="QR Code" 
                className="w-64 h-64 rounded-2xl bg-white p-2"
              />
              <p className="text-white/70 text-sm">Have them scan this code</p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export function FriendDrop({ variant = 'button' }: FriendDropProps) {
  const { user, profile } = useAuth();
  const sendRequest = useSendFriendRequest();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [qrLightboxOpen, setQrLightboxOpen] = useState(false);
  const [wasScanned, setWasScanned] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Realtime sync for dual-device animation
  const friendDropSync = useFriendDropSync({
    enabled: isOpen,
    onScanned: (drop) => {
      // QR owner sees this when their QR is scanned
      setWasScanned(true);
      setQrLightboxOpen(false); // Auto-close lightbox
      haptics.success();
      
      // Fetch the scanner's profile
      if (drop.to_user_id) {
        fetchUser(drop.to_user_id).then((scannedUser) => {
          if (scannedUser) {
            setFoundUser(scannedUser);
            setPhase('found');
          }
        });
      }
    },
    onConfirmed: () => {
      // Both devices see this - start the animation!
      setPhase('exchanging');
      haptics.impact();
    },
    onCompleted: () => {
      setPhase('success');
      haptics.success();
    },
  });

  // Generate QR data with drop ID for realtime sync
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  
  const myProfileUrl = activeDropId 
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username 
      ? `https://vybehub.app/add-friend/${user?.id}`
      : '';
  
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(myProfileUrl)}&bgcolor=000000&color=ffffff&format=svg&ecc=H`
    : '';

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch {
      return null;
    }
  };

  const handleOpen = useCallback(async () => {
    if (!profile?.username) {
      toast.error('Complete your profile first');
      return;
    }
    setIsOpen(true);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setQrLightboxOpen(false);
    
    // Create a drop session for realtime sync
    const drop = await friendDropSync.createDrop();
    if (drop) {
      setActiveDropId(drop.id);
    }
  }, [profile?.username, friendDropSync]);

  const showMyProfile = useCallback(() => {
    setPhase('showing');
    haptics.impact();
  }, []);

  const openQrLightbox = useCallback(() => {
    setQrLightboxOpen(true);
    haptics.tap();
  }, []);

  const startScanning = useCallback(async () => {
    setPhase('scanning');
    haptics.tap();

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
      toast.error('Could not access camera');
      setPhase('idle');
    }
  }, [user?.id]);

  // Handle scanning a friend-drop QR (realtime sync version)
  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();
    setPhase('detected');

    // Register ourselves as the scanner
    const success = await friendDropSync.scanDrop(dropId);
    if (!success) {
      toast.error('This code has expired');
      setPhase('idle');
      return;
    }

    // Fetch the QR owner's profile
    const { data: drop } = await supabase
      .from('friend_drops')
      .select('from_user_id')
      .eq('id', dropId)
      .single();

    if (drop?.from_user_id) {
      setTimeout(async () => {
        const ownerProfile = await fetchUser(drop.from_user_id);
        if (ownerProfile) {
          setFoundUser(ownerProfile);
          setPhase('found');
        }
      }, 1000);
    }
  }, [friendDropSync]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('detected');

    setTimeout(async () => {
      const userData = await fetchUser(userId);
      if (userData) {
        setFoundUser(userData);
        setPhase('found');
        haptics.impact();
      } else {
        toast.error('Could not find user');
        setPhase('idle');
      }
    }, 1200);
  }, []);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;

    setPhase('exchanging');
    haptics.impact();

    // Confirm the drop for realtime sync (both devices will see animation)
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

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  }, []);

  const handleClose = useCallback(async () => {
    stopScanning();
    if (activeDropId) {
      await friendDropSync.cancelDrop(activeDropId);
    }
    setIsOpen(false);
    setPhase('idle');
    setFoundUser(null);
    setQrLightboxOpen(false);
    setWasScanned(false);
    setActiveDropId(null);
  }, [stopScanning, activeDropId, friendDropSync]);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(myProfileUrl);
    toast.success('Link copied!');
    haptics.tap();
  }, [myProfileUrl]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Add me on VYBE!',
          text: `Add me as a friend on VYBE`,
          url: myProfileUrl,
        });
      } catch {
        copyLink();
      }
    } else {
      copyLink();
    }
  }, [myProfileUrl, copyLink]);

  const renderContent = () => {
    // Initial choice screen
    if (phase === 'idle') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center gap-6 py-6"
        >
          <div className="relative">
            <motion.div
              className="w-28 h-28 rounded-full bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center"
              animate={{ 
                scale: [1, 1.05, 1],
                rotate: [0, 2, -2, 0]
              }}
              transition={{ repeat: Infinity, duration: 3 }}
            >
              <ArrowLeftRight className="h-14 w-14 text-primary-foreground" />
            </motion.div>
            
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{ top: '50%', left: '50%' }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, delay: i * 1.3, ease: "linear" }}
              >
                <motion.div style={{ x: 50, y: -8 }}>
                  <Sparkles className="h-5 w-5 text-primary" />
                </motion.div>
              </motion.div>
            ))}
          </div>

          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              FriendDrop
            </h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Share profiles instantly — like AirDrop for friends!
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button 
              onClick={showMyProfile}
              className="w-full gradient-animated gap-2 h-12"
              size="lg"
            >
              <QrCode className="h-5 w-5" />
              Show My Profile
            </Button>
            <Button 
              onClick={startScanning}
              variant="outline"
              className="w-full gap-2 h-12"
              size="lg"
            >
              <Camera className="h-5 w-5" />
              Scan Friend's Code
            </Button>
          </div>
        </motion.div>
      );
    }

    // Showing my profile card with tap-to-enlarge QR
    if (phase === 'showing') {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotateY: -90 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotateY: 90 }}
          transition={{ type: "spring", duration: 0.6 }}
          className="flex flex-col items-center gap-4 py-4"
        >
          {/* Scanned indicator */}
          <AnimatePresence>
            {wasScanned && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 border border-green-500/30"
              >
                <Check className="h-4 w-4 text-green-400" />
                <span className="text-sm text-green-400 font-medium">Scanned!</span>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            className="relative w-72 rounded-3xl overflow-hidden"
            animate={{
              boxShadow: wasScanned ? [
                '0 0 40px hsl(142 76% 36% / 0.4)',
                '0 0 80px hsl(142 76% 36% / 0.6)',
                '0 0 40px hsl(142 76% 36% / 0.4)',
              ] : [
                '0 0 30px hsl(var(--primary) / 0.3)',
                '0 0 60px hsl(var(--primary) / 0.5)',
                '0 0 30px hsl(var(--primary) / 0.3)'
              ]
            }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-accent" />
            
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            />
            
            <div className="relative p-6 flex flex-col items-center gap-4">
              <motion.div
                className="relative"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <div className="absolute -inset-1 rounded-full bg-white/30 blur-sm" />
                <Avatar className="h-24 w-24 border-4 border-white/50 relative">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="text-2xl bg-white/20 text-white">
                    {profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              
          <div className="text-center text-white">
            <h3 className="text-xl font-bold">
              {profile?.username}
            </h3>
            <p className="text-white/80 text-sm">@{profile?.username?.trim()}</p>
          </div>
              
              {/* Tap-to-enlarge QR Code */}
              <motion.button 
                className="p-3 rounded-2xl bg-black/20 backdrop-blur cursor-pointer relative group"
                onClick={openQrLightbox}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code" 
                  className="w-32 h-32 rounded-lg"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="h-8 w-8 text-white" />
                </div>
              </motion.button>
              
              <p className="text-white/70 text-xs">
                Tap QR to enlarge
              </p>
              
              {/* Share actions */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLink}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={shareLink}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Share
                </Button>
              </div>
            </div>
          </motion.div>

          <Button 
            variant="ghost" 
            onClick={() => {
              setPhase('idle');
              setWasScanned(false);
            }}
            className="gap-2 text-muted-foreground"
          >
            <Camera className="h-4 w-4" />
            Switch to Scanner
          </Button>
        </motion.div>
      );
    }

    // Scanning mode
    if (phase === 'scanning') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4 py-4"
        >
          <div className="relative w-full max-w-xs aspect-square rounded-3xl overflow-hidden bg-black">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/50" />
              <div className="absolute inset-8 border-2 border-primary/50 rounded-2xl" />
              
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="absolute w-8 h-8"
                  style={{
                    top: i < 2 ? 24 : 'auto',
                    bottom: i >= 2 ? 24 : 'auto',
                    left: i % 2 === 0 ? 24 : 'auto',
                    right: i % 2 === 1 ? 24 : 'auto',
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
                      borderTopLeftRadius: i === 0 ? 12 : 0,
                      borderTopRightRadius: i === 1 ? 12 : 0,
                      borderBottomLeftRadius: i === 2 ? 12 : 0,
                      borderBottomRightRadius: i === 3 ? 12 : 0,
                    }}
                  />
                </motion.div>
              ))}
              
              <motion.div
                className="absolute left-8 right-8 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ top: ['20%', '80%', '20%'] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Point at their FriendDrop code
          </p>

          <Button 
            variant="ghost" 
            onClick={() => {
              stopScanning();
              setPhase('idle');
            }}
          >
            Cancel
          </Button>
        </motion.div>
      );
    }

    // QR Detected animation
    if (phase === 'detected') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-6 py-12"
        >
          <motion.div
            className="relative"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
          >
            <motion.div
              className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center"
              animate={{ 
                scale: [1, 1.1, 1],
                boxShadow: [
                  '0 0 30px hsl(var(--primary) / 0.4)',
                  '0 0 60px hsl(var(--primary) / 0.7)',
                  '0 0 30px hsl(var(--primary) / 0.4)',
                ]
              }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Check className="h-16 w-16 text-primary-foreground" />
            </motion.div>

            {/* Ripple effects */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border-2 border-primary"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{
                  repeat: Infinity,
                  duration: 1.5,
                  delay: i * 0.5,
                  ease: "easeOut",
                }}
              />
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-lg font-semibold text-primary"
          >
            Code Detected!
          </motion.p>
        </motion.div>
      );
    }

    // Found user - show profile
    if (phase === 'found' && foundUser) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-6 py-6"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" }}
            className="relative"
          >
            <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-primary to-accent opacity-30 blur-lg" />
            <Avatar className="h-28 w-28 border-4 border-primary/50 relative">
              <AvatarImage src={foundUser.avatar_url || undefined} />
              <AvatarFallback className="text-3xl bg-primary/20">
                {foundUser.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </motion.div>

          <div className="text-center space-y-1">
            <h3 className="text-2xl font-bold">
              {foundUser.display_name || foundUser.username}
            </h3>
            <p className="text-muted-foreground">@{foundUser.username?.trim()}</p>
            {foundUser.bio && (
              <p className="text-sm text-muted-foreground max-w-xs mt-2">{foundUser.bio}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setFoundUser(null);
                setPhase('idle');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddFriend}
              className="gradient-animated gap-2"
              disabled={sendRequest.isPending}
            >
              <UserPlus className="h-4 w-4" />
              Add Friend
            </Button>
          </div>
        </motion.div>
      );
    }

    // Exchanging animation
    if (phase === 'exchanging') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-8 py-12"
        >
          <div className="relative flex items-center gap-8">
            {/* My avatar */}
            <motion.div
              animate={{ x: [0, 20, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Avatar className="h-20 w-20 border-4 border-primary/50">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </motion.div>

            {/* Heart icon */}
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.5 }}
            >
              <Heart className="h-8 w-8 text-pink-500 fill-pink-500" />
            </motion.div>

            {/* Their avatar */}
            <motion.div
              animate={{ x: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Avatar className="h-20 w-20 border-4 border-accent/50">
                <AvatarImage src={foundUser?.avatar_url || undefined} />
                <AvatarFallback>{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </motion.div>
          </div>

          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-muted-foreground"
          >
            Connecting...
          </motion.p>
        </motion.div>
      );
    }

    // Success animation
    if (phase === 'success') {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 py-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
            className="relative"
          >
            <motion.div
              className="w-32 h-32 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center"
              animate={{
                boxShadow: [
                  '0 0 40px rgba(34, 197, 94, 0.3)',
                  '0 0 80px rgba(34, 197, 94, 0.5)',
                  '0 0 40px rgba(34, 197, 94, 0.3)',
                ],
              }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Check className="h-16 w-16 text-white" />
            </motion.div>

            {/* Confetti-like particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-3 h-3 rounded-full"
                style={{
                  background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
                  top: '50%',
                  left: '50%',
                }}
                initial={{ scale: 0, x: 0, y: 0 }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos((i * Math.PI) / 4) * 100,
                  y: Math.sin((i * Math.PI) / 4) * 100,
                }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <h3 className="text-2xl font-bold mb-1">Friend Added!</h3>
            <p className="text-muted-foreground">You can now message each other</p>
          </motion.div>
        </motion.div>
      );
    }

    return null;
  };

  // Render trigger based on variant
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
          <motion.button
            onClick={handleOpen}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 flex items-center gap-4"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <ArrowLeftRight className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="text-left">
              <h4 className="font-semibold">FriendDrop</h4>
              <p className="text-sm text-muted-foreground">Add friends instantly with QR</p>
            </div>
            <Sparkles className="ml-auto h-5 w-5 text-primary" />
          </motion.button>
        );
      default:
        return (
          <Button onClick={handleOpen} className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            FriendDrop
          </Button>
        );
    }
  };

  return (
    <>
      {renderTrigger()}
      
      {/* QR Lightbox */}
      <QRLightbox
        isOpen={qrLightboxOpen}
        onClose={() => setQrLightboxOpen(false)}
        qrCodeUrl={qrCodeUrl}
        username={profile?.username || ''}
        onScanned={wasScanned ? () => {
          setQrLightboxOpen(false);
          haptics.success();
        } : undefined}
      />

      {/* Main Dialog */}
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md p-6 border-0 bg-background/95 backdrop-blur-xl rounded-3xl overflow-hidden [&>button]:hidden">
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>

          {/* Custom close button */}
          {phase !== 'success' && phase !== 'exchanging' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="absolute top-4 right-4 h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
