import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Camera, X, Check, Zap, ArrowDown } from 'lucide-react';
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

type SharePhase = 'idle' | 'showing-qr' | 'scanning' | 'success';

export function BumpToShare({ variant = 'button' }: BumpToShareProps) {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<SharePhase>('idle');
  const [mode, setMode] = useState<'share' | 'receive'>('share');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const inviteUrl = profile?.username ? getInviteUrl(profile.username) : '';

  const handleOpen = useCallback(() => {
    if (!profile?.username) {
      toast.error('Complete your profile first');
      return;
    }
    setIsOpen(true);
    setPhase('idle');
    setMode('share');
  }, [profile?.username]);

  const showMyCode = useCallback(() => {
    setMode('share');
    setPhase('showing-qr');
    haptics.tap();
  }, []);

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

      // Start QR code detection using jsQR library (works everywhere)
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      
      if (!canvas || !ctx) {
        toast.error('Canvas not available');
        setPhase('idle');
        return;
      }

      scanIntervalRef.current = setInterval(() => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          // Set canvas dimensions to match video
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          
          // Draw video frame to canvas
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          
          // Get image data for jsQR
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          
          if (code && code.data) {
            const url = code.data;
            // Accept both vybehub.app and lovable.app invite URLs
            if (url.includes('/invite/') || url.includes('vybehub.app') || url.includes('vybeapp')) {
              handleScanSuccess(url);
            }
          }
        }
      }, 150); // Scan every 150ms for smooth detection
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Could not access camera');
      setPhase('idle');
    }
  }, []);

  const handleScanSuccess = useCallback((url: string) => {
    // Stop scanning
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    setPhase('success');
    haptics.success();
    
    // Open the invite link
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

  // Cleanup on unmount
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
          className="flex flex-col items-center gap-6 py-8"
        >
          <div className="relative">
            <motion.div
              className="w-28 h-28 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center"
              animate={{ 
                rotate: [0, 5, -5, 0],
                scale: [1, 1.02, 1]
              }}
              transition={{ repeat: Infinity, duration: 3 }}
            >
              <Zap className="h-14 w-14 text-primary-foreground" />
            </motion.div>
            <motion.div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2"
              animate={{ y: [0, 5, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <ArrowDown className="h-7 w-7 text-muted-foreground" />
            </motion.div>
          </div>

          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold">Bump to Share</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Instant QR sharing — just show your code or scan theirs!
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button 
              onClick={showMyCode}
              className="w-full gradient-animated gap-2"
              size="lg"
            >
              <QrCode className="h-5 w-5" />
              Show My Code
            </Button>
            <Button 
              onClick={startScanning}
              variant="outline"
              className="w-full gap-2"
              size="lg"
            >
              <Camera className="h-5 w-5" />
              Scan Their Code
            </Button>
          </div>
        </motion.div>
      );
    }

    if (phase === 'showing-qr') {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 py-4"
        >
          {/* Personal QR Code with profile picture */}
          <PersonalQRCode data={inviteUrl} size={240} />

          <p className="text-sm text-muted-foreground text-center">
            Have your friend scan this code
          </p>

          <Button 
            variant="ghost" 
            onClick={() => setPhase('idle')}
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
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
          className="flex flex-col items-center gap-4 py-4"
        >
          {/* Camera viewfinder */}
          <div className="relative w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-black">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Corner brackets */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute w-12 h-12 border-primary"
                  style={{
                    top: i < 2 ? 16 : 'auto',
                    bottom: i >= 2 ? 16 : 'auto',
                    left: i % 2 === 0 ? 16 : 'auto',
                    right: i % 2 === 1 ? 16 : 'auto',
                    borderTopWidth: i < 2 ? 3 : 0,
                    borderBottomWidth: i >= 2 ? 3 : 0,
                    borderLeftWidth: i % 2 === 0 ? 3 : 0,
                    borderRightWidth: i % 2 === 1 ? 3 : 0,
                  }}
                />
              ))}
              
              {/* Scanning line */}
              <motion.div
                className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ top: ['15%', '85%', '15%'] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Point camera at their QR code
          </p>

          <Button 
            variant="ghost" 
            onClick={() => {
              stopScanning();
              setPhase('idle');
            }}
            className="gap-2"
          >
            <QrCode className="h-4 w-4" />
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
          className="flex flex-col items-center gap-6 py-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center"
          >
            <Check className="h-12 w-12 text-primary" />
          </motion.div>
          
          <div className="text-center">
            <h3 className="text-xl font-bold">Code Scanned!</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Opening invite link...
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
          title="Bump to Share"
        >
          <Zap className="h-4 w-4" />
        </Button>
      ) : (
        <Button 
          variant="outline" 
          onClick={handleOpen}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          Bump Share
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) handleClose();
        else setIsOpen(open);
      }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden [&>button]:hidden">
          <div className="relative">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-muted/80 backdrop-blur-sm hover:bg-muted"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
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