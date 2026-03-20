import { useState, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Loader2, Check, AlertTriangle, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { shouldBypassSafety } from '@/lib/ownerBypass';
import { scanImage as nsfwScanImage, scanVideo as nsfwScanVideo } from '@/lib/nsfwScanner';

interface ContentSafetyGateProps {
  file: File | null;
  onScanComplete: (isSafe: boolean) => void;
  onCancel: () => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
}

type ScanStatus = 'idle' | 'scanning' | 'safe' | 'unsafe';

/**
 * Content Safety Gate - Scans uploads for inappropriate content
 * 
 * Features:
 * - AI-powered content moderation
 * - Liquid-glass scanning animation
 * - Blocks unsafe content before upload
 * - Respectful warning for flagged content
 */
export const ContentSafetyGate = memo(function ContentSafetyGate({
  file,
  onScanComplete,
  onCancel,
  isScanning,
  setIsScanning,
}: ContentSafetyGateProps) {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [flagReason, setFlagReason] = useState<string | null>(null);
   const [ownerBypass, setOwnerBypass] = useState(false);

  const scanContent = useCallback(async () => {
    if (!file) return;

     // Check owner bypass first
     const isOwner = await shouldBypassSafety();
     if (isOwner) {
       setOwnerBypass(true);
       setStatus('safe');
       setTimeout(() => {
         onScanComplete(true);
       }, 300);
       return;
     }
 
    setIsScanning(true);
    setStatus('scanning');

    try {
      // Create form data with the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('content_type', file.type.startsWith('video/') ? 'video' : 'image');

      // Call content safety edge function
      const { data, error } = await supabase.functions.invoke('scan-content-safety', {
        body: formData,
      });

      if (error) throw error;

      if (data?.is_safe) {
        setStatus('safe');
        setTimeout(() => {
          onScanComplete(true);
        }, 800);
      } else {
        setStatus('unsafe');
        setFlagReason(data?.reason || 'This content may violate our community guidelines.');
        onScanComplete(false);
      }
    } catch (err: any) {
      console.error('Content scan error:', err);
      // On error, allow upload but log for review
      setStatus('safe');
      toast.info('Content check skipped');
      setTimeout(() => {
        onScanComplete(true);
      }, 500);
    } finally {
      setIsScanning(false);
    }
  }, [file, onScanComplete, setIsScanning]);

  // Auto-scan when file is provided
  useEffect(() => {
    if (file && status === 'idle') {
      scanContent();
    }
  }, [file, status, scanContent]);

  return (
    <AnimatePresence mode="wait">
      {status === 'scanning' && (
        <motion.div
          key="scanning"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl"
        >
          <motion.div
            className="flex flex-col items-center gap-6 p-8"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
          >
            {/* Liquid glass scanning animation */}
            <motion.div
              className="relative w-24 h-24"
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              {/* Outer ring */}
              <motion.div
                className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 backdrop-blur-sm"
                animate={{
                  boxShadow: [
                    '0 0 20px hsl(var(--primary) / 0.2)',
                    '0 0 40px hsl(var(--primary) / 0.4)',
                    '0 0 20px hsl(var(--primary) / 0.2)',
                  ],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
              />
              
              {/* Inner icon */}
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={{
                  rotate: [0, 360],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <Shield className="h-10 w-10 text-primary" />
              </motion.div>
              
              {/* Scanning line */}
              <motion.div
                className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{
                  top: ['20%', '80%', '20%'],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            <div className="text-center">
              <motion.p
                className="text-lg font-medium mb-1"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                Scanning content...
              </motion.p>
              <p className="text-sm text-muted-foreground">
                Making sure everything's safe ✨
              </p>
            </div>

            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </motion.div>
        </motion.div>
      )}

      {status === 'safe' && (
        <motion.div
          key="safe"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl"
        >
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
          >
            <motion.div
               className={`w-16 h-16 rounded-full flex items-center justify-center ${ownerBypass ? 'bg-primary/20' : 'bg-green-500/20'}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
               {ownerBypass ? (
                 <Crown className="h-8 w-8 text-primary" />
               ) : (
                 <Check className="h-8 w-8 text-green-500" />
               )}
            </motion.div>
             <p className={`text-lg font-medium ${ownerBypass ? 'text-primary' : 'text-green-500'}`}>
               {ownerBypass ? 'Owner Bypass Active' : 'Looking good!'}
             </p>
          </motion.div>
        </motion.div>
      )}

      {status === 'unsafe' && (
        <motion.div
          key="unsafe"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl p-6"
        >
          <motion.div
            className="max-w-sm w-full rounded-3xl bg-card border border-border p-6 text-center"
            initial={{ y: 20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
          >
            <motion.div
              className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </motion.div>
            
            <h3 className="text-lg font-semibold mb-2">Content Flagged</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {flagReason}
            </p>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onCancel}
              >
                Choose Different
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-4">
              This helps keep VYBE safe for everyone 💙
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Hook to use content safety scanning
 */
export function useContentSafetyScan() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ isSafe: boolean; reason?: string } | null>(null);

  const scanFile = useCallback(async (file: File): Promise<boolean> => {
    setIsScanning(true);
    setScanResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('content_type', file.type.startsWith('video/') ? 'video' : 'image');

      const { data, error } = await supabase.functions.invoke('scan-content-safety', {
        body: formData,
      });

      if (error) throw error;

      const isSafe = data?.is_safe ?? true;
      setScanResult({ isSafe, reason: data?.reason });
      return isSafe;
    } catch (err) {
      console.error('Content scan error:', err);
      // On error, allow upload
      setScanResult({ isSafe: true });
      return true;
    } finally {
      setIsScanning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setScanResult(null);
    setIsScanning(false);
  }, []);

  return { isScanning, scanResult, scanFile, reset };
}
