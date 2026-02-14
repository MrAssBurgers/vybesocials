import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { QrCode, Camera, X, Check, Zap, Smartphone, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { getInviteUrl } from '@/hooks/useInvites';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { PersonalQRCode } from './PersonalQRCode';
import jsQR from 'jsqr';

interface BumpToShareProps {
  variant?: 'button' | 'icon';
}

type SharePhase = 'idle' | 'showing-qr' | 'scanning' | 'success' | 'card-rising';

export function BumpToShare({ variant = 'button' }: BumpToShareProps) {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<SharePhase>('idle');
  const [mode, setMode] = useState<'share' | 'receive'>('share');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastShakeTime = useRef<number>(0);
  const shakeCount = useRef<number>(0);

  const inviteUrl = profile?.username ? getInviteUrl(profile.username) : '';

  // Card animation values
  const cardY = useMotionValue(300);
  const cardRotate = useMotionValue(5);
  const cardScale = useMotionValue(0.8);

  // Shake detection for "card from wallet" effect
  useEffect(() => {
    if (!isOpen) return;

    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const x = acceleration.x || 0;
      const y = acceleration.y || 0;
      const z = acceleration.z || 0;

      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);

      const shakeThreshold = 15;
      const now = Date.now();

      if (deltaX + deltaY + deltaZ > shakeThreshold) {
        if (now - lastShakeTime.current > 150) {
          shakeCount.current++;
          lastShakeTime.current = now;

          // After 2 quick shakes, trigger the card animation
          if (shakeCount.current >= 2 && phase === 'idle') {
            haptics.impact();
            triggerCardRise();
            shakeCount.current = 0;
          }
        }
      }

      // Reset shake count if too much time passes
      if (now - lastShakeTime.current > 1000) {
        shakeCount.current = 0;
      }

      lastX = x;
      lastY = y;
      lastZ = z;
    };

    // Request permission for iOS
    if (typeof DeviceMotionEvent !== 'undefined' && 
        typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('devicemotion', handleMotion);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('devicemotion', handleMotion);
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isOpen, phase]);

  const triggerCardRise = useCallback(() => {
    setPhase('card-rising');
    
    // Animate card rising from wallet
    animate(cardY, 0, { 
      type: 'spring', 
      stiffness: 200, 
      damping: 20,
      duration: 0.8 
    });
    animate(cardRotate, 0, { 
      type: 'spring', 
      stiffness: 150, 
      damping: 15 
    });
    animate(cardScale, 1, { 
      type: 'spring', 
      stiffness: 200, 
      damping: 18 
    });

    // After animation completes, show QR
    setTimeout(() => {
      setPhase('showing-qr');
      haptics.success();
    }, 800);
  }, [cardY, cardRotate, cardScale]);

  const handleOpen = useCallback(() => {
    if (!profile?.username) {
      toast.error('Complete your profile first');
      return;
    }
    setIsOpen(true);
    setPhase('idle');
    setMode('share');
    // Reset card animation values
    cardY.set(300);
    cardRotate.set(5);
    cardScale.set(0.8);
  }, [profile?.username, cardY, cardRotate, cardScale]);

  const showMyCode = useCallback(() => {
    setMode('share');
    triggerCardRise();
    haptics.tap();
  }, [triggerCardRise]);

  const startScanning = useCallback(async () => {
    setMode('receive');
    setPhase('scanning');
    haptics.tap();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      
      if (!canvas || !ctx) {
        toast.error('Canvas not available');
        setPhase('idle');
        return;
      }

      scanIntervalRef.current = setInterval(() => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          
          if (code && code.data) {
            const url = code.data;
            if (url.includes('/invite/') || url.includes('vybehub.app') || url.includes('vybeapp')) {
              handleScanSuccess(url);
            }
          }
        }
      }, 150);
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Could not access camera');
      setPhase('idle');
    }
  }, []);

  const handleScanSuccess = useCallback((url: string) => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    setPhase('success');
    haptics.success();
    
    setTimeout(() => {
      window.location.href = url;
    }, 1500);
  }, []);

  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setPhase('idle');
  }, []);

  const handleClose = useCallback(() => {
    stopScanning();
    setIsOpen(false);
    setPhase('idle');
  }, [stopScanning]);

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const renderContent = () => {
    if (phase === 'idle') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex flex-col items-center gap-8 py-8 px-4"
        >
          {/* Hero Icon - Bigger and cleaner */}
          <div className="relative">
            <motion.div
              className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center shadow-2xl shadow-primary/30"
              animate={{ 
                rotate: [0, 3, -3, 0],
                scale: [1, 1.02, 1]
              }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <Users className="h-16 w-16 text-primary-foreground" />
            </motion.div>
            
            {/* Floating shake indicator */}
            <motion.div
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card px-3 py-1.5 rounded-full border shadow-lg"
              animate={{ y: [0, 4, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Smartphone className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">Shake to share!</span>
            </motion.div>
          </div>

          {/* Title and description */}
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-foreground">Add Friends Instantly</h3>
            <p className="text-muted-foreground text-base max-w-xs leading-relaxed">
              Share your profile with a quick QR scan or shake your phone!
            </p>
          </div>

          {/* Action buttons - larger and clearer */}
          <div className="flex flex-col gap-4 w-full max-w-sm">
            <Button 
              onClick={showMyCode}
              className="w-full h-14 text-lg gap-3 gradient-animated shadow-lg"
              size="lg"
            >
              <QrCode className="h-6 w-6" />
              Show My Code
            </Button>
            <Button 
              onClick={startScanning}
              variant="outline"
              className="w-full h-14 text-lg gap-3 border-2"
              size="lg"
            >
              <Camera className="h-6 w-6" />
              Scan Their Code
            </Button>
          </div>
        </motion.div>
      );
    }

    if (phase === 'card-rising') {
      return (
        <motion.div
          className="flex flex-col items-center justify-center py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Card rising from wallet animation */}
          <div className="relative h-80 w-full flex items-end justify-center overflow-hidden">
            {/* Wallet base */}
            <motion.div
              className="absolute bottom-0 w-64 h-20 bg-gradient-to-t from-muted to-muted/50 rounded-t-3xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
            
            {/* Rising card */}
            <motion.div
              className="relative z-10 w-56 h-72 rounded-2xl bg-gradient-to-br from-card via-card to-muted border-2 border-primary/30 shadow-2xl flex flex-col items-center justify-center p-6"
              style={{ 
                y: cardY,
                rotate: cardRotate,
                scale: cardScale
              }}
            >
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="h-10 w-10 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground">Loading...</p>
            </motion.div>
          </div>
        </motion.div>
      );
    }

    if (phase === 'showing-qr') {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex flex-col items-center gap-6 py-6 px-4"
        >
          {/* QR Code - clean presentation */}
          <div className="bg-card rounded-3xl p-6 shadow-xl border">
            <PersonalQRCode data={inviteUrl} size={260} />
          </div>

          <p className="text-base text-foreground text-center font-medium">
            Have your friend scan this code
          </p>

          <Button 
            variant="outline" 
            onClick={() => {
              cardY.set(300);
              cardRotate.set(5);
              cardScale.set(0.8);
              setPhase('idle');
            }}
            className="gap-2 h-12 text-base"
          >
            <Camera className="h-5 w-5" />
            Switch to Scanner
          </Button>
        </motion.div>
      );
    }

    if (phase === 'scanning') {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-6 py-4 px-4"
        >
          {/* Camera viewfinder - cleaner design */}
          <div className="relative w-full max-w-xs aspect-square rounded-3xl overflow-hidden bg-black shadow-2xl">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Corner brackets - bigger */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute w-16 h-16 border-primary"
                  style={{
                    top: i < 2 ? 20 : 'auto',
                    bottom: i >= 2 ? 20 : 'auto',
                    left: i % 2 === 0 ? 20 : 'auto',
                    right: i % 2 === 1 ? 20 : 'auto',
                    borderTopWidth: i < 2 ? 4 : 0,
                    borderBottomWidth: i >= 2 ? 4 : 0,
                    borderLeftWidth: i % 2 === 0 ? 4 : 0,
                    borderRightWidth: i % 2 === 1 ? 4 : 0,
                    borderRadius: 8,
                  }}
                />
              ))}
              
              {/* Scanning line */}
              <motion.div
                className="absolute left-5 right-5 h-1 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full"
                animate={{ top: ['18%', '82%', '18%'] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              />
            </div>
          </div>

          <p className="text-base text-foreground text-center font-medium">
            Point camera at their QR code
          </p>

          <Button 
            variant="outline" 
            onClick={() => {
              stopScanning();
              setPhase('idle');
            }}
            className="gap-2 h-12 text-base"
          >
            <QrCode className="h-5 w-5" />
            Show My Code Instead
          </Button>
        </motion.div>
      );
    }

    if (phase === 'success') {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-8 py-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
            className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center"
          >
            <Check className="h-14 w-14 text-primary" />
          </motion.div>
          
          <div className="text-center">
            <h3 className="text-2xl font-bold text-foreground">Friend Found!</h3>
            <p className="text-muted-foreground text-base mt-2">
              Opening their profile...
            </p>
          </div>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button 
          variant="outline" 
          size="icon" 
          onClick={handleOpen}
          title="Add Friends"
          className="h-12 w-12"
        >
          <Users className="h-6 w-6" />
        </Button>
      ) : (
        <Button 
          variant="outline" 
          onClick={handleOpen}
          className="gap-3 h-12 text-base px-6"
        >
          <Users className="h-5 w-5" />
          Add Friends
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) handleClose();
        else setIsOpen(open);
      }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden [&>button]:hidden bg-background/95 backdrop-blur-xl">
          <div className="relative">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 h-11 w-11 rounded-full bg-muted/90 backdrop-blur-sm hover:bg-muted flex items-center justify-center"
              onClick={handleClose}
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </Button>
            
            <div className="p-6">
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
