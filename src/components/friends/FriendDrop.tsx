import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, Sparkles, QrCode, Camera, 
  ArrowLeftRight, Loader2, Heart, ZoomIn
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
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

export function FriendDrop({ variant = 'button' }: FriendDropProps) {
  const { user, profile } = useAuth();
  const sendRequest = useSendFriendRequest();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [qrEnlarged, setQrEnlarged] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Generate QR data URL with user ID
  const myProfileUrl = profile?.username 
    ? `https://vybehub.app/add-friend/${user?.id}`
    : '';
  
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(myProfileUrl)}&bgcolor=000000&color=ffffff&format=svg&ecc=H`
    : '';

  const handleOpen = useCallback(() => {
    if (!profile?.username) {
      toast.error('Complete your profile first');
      return;
    }
    setIsOpen(true);
    setPhase('idle');
    setFoundUser(null);
    setQrEnlarged(false);
  }, [profile?.username]);

  const showMyProfile = useCallback(() => {
    setPhase('showing');
    haptics.impact();
  }, []);

  // Toggle QR code size
  const toggleQrSize = useCallback(() => {
    setQrEnlarged(prev => !prev);
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

      // Create canvas for QR scanning
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const scanFrame = () => {
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
          // Check for add-friend URL pattern
          const match = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
          if (match) {
            const userId = match[1];
            if (userId !== user?.id) {
              handleFoundUser(userId);
              return; // Stop scanning
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(scanFrame);
      };

      // Start scanning loop
      scanFrame();
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Could not access camera');
      setPhase('idle');
    }
  }, [user?.id]);

  const handleFoundUser = useCallback(async (userId: string) => {
    // Stop scanning
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    // Show detection animation first
    haptics.success();
    setPhase('detected');

    // Wait for detection animation, then fetch user
    setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio')
          .eq('id', userId)
          .single();

        if (error) throw error;
        setFoundUser(data);
        setPhase('found');
        haptics.impact();
      } catch (error) {
        console.error('Error fetching user:', error);
        toast.error('Could not find user');
        setPhase('idle');
      }
    }, 1200);
  }, []);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;

    setPhase('exchanging');
    haptics.impact();

    try {
      await sendRequest.mutateAsync(foundUser.id);
      setPhase('success');
      haptics.success();
      
      setTimeout(() => {
        setIsOpen(false);
        setPhase('idle');
        setFoundUser(null);
      }, 2500);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already friends or request pending!');
        setPhase('success');
        setTimeout(() => {
          setIsOpen(false);
          setPhase('idle');
        }, 1500);
      } else {
        toast.error('Failed to send request');
        setPhase('found');
      }
    }
  }, [foundUser, sendRequest]);

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  }, []);

  const handleClose = useCallback(() => {
    stopScanning();
    setIsOpen(false);
    setPhase('idle');
    setFoundUser(null);
    setQrEnlarged(false);
  }, [stopScanning]);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

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
          {/* Animated icon */}
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
            
            {/* Orbiting sparkles */}
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
          {/* Profile Card - NameDrop style */}
          <motion.div 
            className="relative w-72 rounded-3xl overflow-hidden"
            animate={{
              boxShadow: [
                '0 0 30px hsl(var(--primary) / 0.3)',
                '0 0 60px hsl(var(--primary) / 0.5)',
                '0 0 30px hsl(var(--primary) / 0.3)'
              ]
            }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-accent" />
            
            {/* Animated shimmer */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            />
            
            {/* Content */}
            <div className="relative p-6 flex flex-col items-center gap-4">
              {/* Avatar with ring */}
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
              
              {/* Name */}
              <div className="text-center text-white">
                <h3 className="text-xl font-bold">
                  {profile?.username}
                </h3>
                <p className="text-white/80 text-sm">@{profile?.username?.trim()}</p>
              </div>
              
              {/* Tap-to-enlarge QR Code */}
              <motion.button 
                className="p-3 rounded-2xl bg-black/20 backdrop-blur cursor-pointer relative group"
                onClick={toggleQrSize}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={qrEnlarged ? { scale: 1.3 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code" 
                  className={`rounded-lg transition-all ${qrEnlarged ? 'w-44 h-44' : 'w-32 h-32'}`}
                />
                {!qrEnlarged && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="h-8 w-8 text-white" />
                  </div>
                )}
              </motion.button>
              
              <p className="text-white/70 text-xs">
                {qrEnlarged ? 'Tap to shrink' : 'Tap QR to enlarge'}
              </p>
            </div>
          </motion.div>

          <Button 
            variant="ghost" 
            onClick={() => {
              setPhase('idle');
              setQrEnlarged(false);
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
            
            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/50" />
              
              {/* Scanning frame */}
              <div className="absolute inset-8 border-2 border-primary/50 rounded-2xl" />
              
              {/* Corner accents */}
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
              
              {/* Scanning line */}
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
          {/* Pulsing detection indicator */}
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
                  '0 0 0 0 hsl(var(--primary) / 0.4)',
                  '0 0 0 30px hsl(var(--primary) / 0)',
                  '0 0 0 0 hsl(var(--primary) / 0)',
                ]
              }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <QrCode className="h-16 w-16 text-primary-foreground" />
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
                  ease: "easeOut"
                }}
              />
            ))}
          </motion.div>
          
          <motion.p
            className="text-lg font-semibold text-primary"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
          >
            QR Code Detected!
          </motion.p>
        </motion.div>
      );
    }

    // Found a user - show their profile card
    if (phase === 'found' && foundUser) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="flex flex-col items-center gap-6 py-4"
        >
          {/* Their Profile Card */}
          <motion.div 
            className="relative w-72 rounded-3xl overflow-hidden"
            animate={{
              boxShadow: [
                '0 0 30px hsl(var(--primary) / 0.3)',
                '0 0 50px hsl(var(--primary) / 0.4)',
                '0 0 30px hsl(var(--primary) / 0.3)'
              ]
            }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent via-primary to-primary/80" />
            
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            />
            
            <div className="relative p-8 flex flex-col items-center gap-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                <Avatar className="h-28 w-28 border-4 border-white/50">
                  <AvatarImage src={foundUser.avatar_url || ''} />
                  <AvatarFallback className="text-3xl bg-white/20 text-white">
                    {foundUser.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              
              <motion.div 
                className="text-center text-white"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h3 className="text-2xl font-bold">
                  {foundUser.display_name || foundUser.username}
                </h3>
                <p className="text-white/80">@{foundUser.username?.trim()}</p>
                {foundUser.bio && (
                  <p className="text-white/60 text-sm mt-2 line-clamp-2">
                    {foundUser.bio}
                  </p>
                )}
              </motion.div>
            </div>
          </motion.div>

          {/* Add Friend Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button 
              onClick={handleAddFriend}
              className="gradient-animated gap-2 h-12 px-8 text-lg"
              size="lg"
            >
              <UserPlus className="h-5 w-5" />
              Add Friend
            </Button>
          </motion.div>
        </motion.div>
      );
    }

    // Exchanging animation
    if (phase === 'exchanging') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-6 py-12"
        >
          <div className="relative">
            {/* Two profiles exchanging */}
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ x: [0, 20, 0], rotate: [0, 10, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Avatar className="h-16 w-16 border-2 border-primary">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback>{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </motion.div>
              
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <Heart className="h-8 w-8 text-primary" />
              </motion.div>
              
              <motion.div
                animate={{ x: [0, -20, 0], rotate: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Avatar className="h-16 w-16 border-2 border-accent">
                  <AvatarImage src={foundUser?.avatar_url || ''} />
                  <AvatarFallback>{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </motion.div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connecting...</span>
          </div>
        </motion.div>
      );
    }

    // Success!
    if (phase === 'success') {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 py-8"
        >
          {/* Success animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
            className="relative"
          >
            <motion.div
              className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center"
              animate={{ 
                boxShadow: [
                  '0 0 0 0 hsl(var(--primary) / 0)',
                  '0 0 0 20px hsl(var(--primary) / 0)',
                ]
              }}
              transition={{ repeat: 3, duration: 0.6 }}
            >
              <Check className="h-14 w-14 text-primary-foreground" />
            </motion.div>
            
            {/* Confetti-like sparkles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{ top: '50%', left: '50%' }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ 
                  x: Math.cos(i * 45 * Math.PI / 180) * 80,
                  y: Math.sin(i * 45 * Math.PI / 180) * 80,
                  opacity: 0,
                  scale: 0
                }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <Sparkles className="h-4 w-4 text-primary" />
              </motion.div>
            ))}
          </motion.div>
          
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Friend Added! 🎉
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              You and @{foundUser?.username?.trim()} are now connected
            </p>
          </motion.div>
        </motion.div>
      );
    }

    return null;
  };

  // Render trigger button
  const renderTrigger = () => {
    if (variant === 'banner') {
      return (
        <motion.button
          onClick={handleOpen}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 border border-primary/30 flex items-center gap-4"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-left flex-1">
            <h3 className="font-semibold">FriendDrop</h3>
            <p className="text-sm text-muted-foreground">Scan & add friends instantly</p>
          </div>
          <Sparkles className="h-5 w-5 text-primary" />
        </motion.button>
      );
    }

    if (variant === 'icon') {
      return (
        <Button 
          variant="outline" 
          size="icon" 
          onClick={handleOpen}
          title="FriendDrop"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button 
        onClick={handleOpen}
        className="gap-2 gradient-animated"
      >
        <ArrowLeftRight className="h-4 w-4" />
        FriendDrop
      </Button>
    );
  };

  return (
    <>
      {renderTrigger()}

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) handleClose();
        else setIsOpen(open);
      }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-primary/20 [&>button]:hidden">
          <div className="relative min-h-[400px]">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5" />
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
            
            <div className="relative p-6">
              <AnimatePresence mode="wait">
                {renderContent()}
              </AnimatePresence>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
