import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Check, Sparkles, Loader2, Smartphone, Zap,
  ArrowLeftRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { useBumpDetection } from '@/hooks/useBumpDetection';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const sendRequest = useSendFriendRequest();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // QR code for this user
  const myProfileUrl = profile?.username 
    ? `https://vybehub.app/add-friend/${user?.id}`
    : '';
  
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(myProfileUrl)}&bgcolor=000000&color=ffffff&format=svg`
    : '';

  const handleBump = useCallback(() => {
    if (!profile?.username || !user) {
      return;
    }
    
    // Activate the exchange UI
    setIsActive(true);
    setPhase('activated');
    haptics.impact();
    
    // Start scanning automatically
    startScanning();
  }, [profile?.username, user]);

  // Bump detection - only when on home page and not already active
  useBumpDetection({
    enabled: !isActive && !!profile?.username,
    threshold: 12, // Slightly lower threshold for easier activation
    cooldown: 5000,
    onBump: handleBump,
  });

  const startScanning = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Use BarcodeDetector if available
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code']
        });

        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const url = barcodes[0].rawValue;
                const match = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
                if (match) {
                  const userId = match[1];
                  if (userId !== user?.id) {
                    handleFoundUser(userId);
                  }
                }
              }
            } catch (e) {
              // Continue scanning
            }
          }
        }, 150);
      }
    } catch (error) {
      console.error('Camera error:', error);
      // Camera not available - still show QR code
    }
  }, [user?.id]);

  const handleFoundUser = useCallback(async (userId: string) => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

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
  }, [foundUser, sendRequest]);

  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopScanning();
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
  }, [stopScanning]);

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
      {/* Subtle indicator that bump detection is active */}
      <AnimatePresence>
        {!isActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
          >
            <motion.div
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 backdrop-blur-lg border border-primary/20"
              animate={{ 
                scale: [1, 1.02, 1],
                opacity: [0.7, 1, 0.7]
              }}
              transition={{ repeat: Infinity, duration: 3 }}
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Smartphone className="h-4 w-4 text-primary" />
              </motion.div>
              <span className="text-xs text-primary font-medium">
                Bump phones to add friends
              </span>
              <Zap className="h-3 w-3 text-primary" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exchange Modal */}
      <Dialog open={isActive} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md p-0 border-0 bg-transparent overflow-hidden">
          <AnimatePresence mode="wait">
            {phase === 'activated' && (
              <motion.div
                key="activated"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-background/95 backdrop-blur-xl rounded-3xl p-6"
              >
                {/* Split view - QR and Scanner */}
                <div className="flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                      >
                        <Sparkles className="h-5 w-5 text-primary" />
                      </motion.div>
                      <h3 className="font-bold text-lg">FriendDrop Active!</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* My Profile QR */}
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
                    
                    <div className="relative flex items-center gap-4">
                      <Avatar className="h-14 w-14 border-2 border-white/50">
                        <AvatarImage src={profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-white/20 text-white">
                          {profile?.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 text-white">
                        <p className="font-bold">{profile?.username}</p>
                        <p className="text-white/70 text-sm">Sharing your profile...</p>
                      </div>
                      
                      <img 
                        src={qrCodeUrl} 
                        alt="QR" 
                        className="w-16 h-16 rounded-lg"
                      />
                    </div>
                  </motion.div>

                  {/* Scanner */}
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-black">
                    <video 
                      ref={videoRef} 
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    
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
                className="bg-background/95 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center gap-4"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Loader2 className="h-12 w-12 text-primary" />
                </motion.div>
                <p className="text-lg font-medium">Exchanging vibes...</p>
              </motion.div>
            )}

            {phase === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", bounce: 0.5 }}
                className="bg-gradient-to-br from-accent to-primary rounded-3xl p-8 flex flex-col items-center gap-4"
              >
                {/* Celebration particles */}
                {[...Array(12)].map((_, i) => (
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
                      x: Math.cos(i * 30 * Math.PI / 180) * 100,
                      y: Math.sin(i * 30 * Math.PI / 180) * 100,
                      scale: [0, 1, 0],
                      opacity: [1, 1, 0]
                    }}
                    transition={{ duration: 1, delay: i * 0.05 }}
                  >
                    <Sparkles className="h-4 w-4 text-accent-foreground" />
                  </motion.div>
                ))}
                
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring" }}
                  className="w-20 h-20 rounded-full bg-primary-foreground/20 flex items-center justify-center"
                >
                  <Check className="h-10 w-10 text-white" strokeWidth={3} />
                </motion.div>
                
                <div className="text-center text-white">
                  <motion.h3 
                    className="text-2xl font-bold"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    Friend Added!
                  </motion.h3>
                  <motion.p 
                    className="text-white/80"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    You're now connected 🎉
                  </motion.p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
