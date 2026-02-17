/**
 * DM Image Safety Gate
 * 
 * Scans images for inappropriate content before sending in DMs
 * Uses AI content safety scanner to block nude/explicit content
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, ShieldCheck, ShieldX, ShieldAlert, 
  Loader2, X, Send, AlertTriangle, Eye
} from 'lucide-react';
 import { Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useContentSafety, SafetyResult } from '@/hooks/useContentSafety';
import { triggerHaptic } from '@/lib/haptics';
 import { shouldBypassSafety } from '@/lib/ownerBypass';

interface DMImageSafetyGateProps {
  file: File;
  previewUrl: string;
  onApproved: () => void;
  onCancel: () => void;
  onBlocked?: () => void;
}

export function DMImageSafetyGate({
  file,
  previewUrl,
  onApproved,
  onCancel,
  onBlocked,
}: DMImageSafetyGateProps) {
   const { scanImage, isScanning, result, message, submitAppeal, bypassEnabled } = useContentSafety();
  const [dots, setDots] = useState(0);
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const hasScanned = useRef(false);
   const [ownerBypass, setOwnerBypass] = useState(false);

  // Start scan when component mounts - only once
  useEffect(() => {
    if (hasScanned.current) return;
    hasScanned.current = true;

    const runScan = async () => {
       // Check owner bypass first
       const isOwner = await shouldBypassSafety();
       if (isOwner) {
         setOwnerBypass(true);
         triggerHaptic('success');
         // Auto-approve after brief delay
         setTimeout(() => {
           onApproved();
         }, 500);
         return;
       }
 
      const scanResult = await scanImage(file);
      
      if (scanResult.result === 'allowed') {
        triggerHaptic('success');
      } else if (scanResult.result === 'warned') {
        triggerHaptic('medium');
      } else if (scanResult.result === 'blocked' || scanResult.result === 'error') {
        triggerHaptic('error');
        onBlocked?.();
      }
    };
    
    runScan();
  }, []);

  // Animate dots during scanning
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, [isScanning]);

  const handleAppeal = async () => {
    if (!appealReason.trim()) return;
    
    const success = await submitAppeal('image', appealReason);
    if (success) {
      setShowAppeal(false);
      onCancel();
    }
  };

  const getIcon = () => {
     if (ownerBypass) {
       return (
         <motion.div
           initial={{ scale: 0 }}
           animate={{ scale: 1 }}
           transition={{ type: 'spring', stiffness: 400, damping: 15 }}
         >
           <Crown className="h-12 w-12 text-primary" />
         </motion.div>
       );
     }
    switch (result) {
      case 'scanning':
        return <Loader2 className="h-12 w-12 text-primary animate-spin" />;
      case 'allowed':
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <ShieldCheck className="h-12 w-12 text-emerald-500" />
          </motion.div>
        );
      case 'warned':
        return (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <ShieldAlert className="h-12 w-12 text-amber-500" />
          </motion.div>
        );
      case 'blocked':
        return (
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <ShieldX className="h-12 w-12 text-destructive" />
          </motion.div>
        );
      case 'error':
        return (
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <ShieldAlert className="h-12 w-12 text-destructive" />
          </motion.div>
        );
      default:
        return <Shield className="h-12 w-12 text-muted-foreground" />;
    }
  };

  const getTitle = () => {
     if (ownerBypass) return 'Owner Bypass Active';
    switch (result) {
      case 'scanning':
        return `Checking Image${'.'.repeat(dots)}`;
      case 'allowed':
        return 'Ready to Send!';
      case 'warned':
        return 'Sensitive Content';
      case 'blocked':
        return 'Cannot Send';
      case 'error':
        return 'Scan Failed';
      default:
        return 'Checking...';
    }
  };

  const getDescription = () => {
     if (ownerBypass) return 'Sending without content scan...';
    if (message) return message;
    switch (result) {
      case 'scanning':
        return 'Making sure this image follows community guidelines';
      case 'allowed':
        return 'Your image is safe to send';
      case 'warned':
        return 'This image may be sensitive. You can still send it.';
      case 'blocked':
        return 'This image cannot be sent because it may contain inappropriate content.';
      case 'error':
        return 'Safety scan failed. For your protection, this image cannot be sent. Please try again.';
      default:
        return '';
    }
  };

  const getBgClass = () => {
     if (ownerBypass) return 'from-primary/20 to-primary/5 border-primary/30';
    switch (result) {
      case 'allowed':
        return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
      case 'warned':
        return 'from-amber-500/20 to-amber-500/5 border-amber-500/30';
      case 'blocked':
      case 'error':
        return 'from-destructive/20 to-destructive/5 border-destructive/30';
      default:
        return 'from-primary/10 to-primary/5 border-border';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'w-full max-w-sm rounded-2xl border bg-gradient-to-b backdrop-blur-xl overflow-hidden',
          getBgClass()
        )}
      >
        {/* Image Preview */}
        <div className="relative aspect-video bg-black/20 overflow-hidden">
          <motion.img
            src={previewUrl}
            alt="Preview"
            className="w-full h-full object-contain"
            initial={{ scale: 1.1, filter: 'blur(10px)' }}
            animate={{ scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.5 }}
          />
          
          {/* Scanning overlay - premium, subtle animation */}
          <AnimatePresence>
            {isScanning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center"
              >
                {/* Scanning line animation */}
                <motion.div
                  className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                  animate={{ y: [0, 200, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
                
                {/* Center icon and text */}
                <div className="flex flex-col items-center gap-2 z-10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  >
                    <Shield className="h-6 w-6 text-primary" />
                  </motion.div>
                  <p className="text-xs text-muted-foreground font-medium">Checking content...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Status */}
        <div className="p-6 text-center space-y-4">
          <div className="flex justify-center">
            {getIcon()}
          </div>
          
          <div className="space-y-2">
            <motion.h3
              key={result}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-lg font-semibold"
            >
              {getTitle()}
            </motion.h3>
            <motion.p
              key={`desc-${result}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground"
            >
              {getDescription()}
            </motion.p>
          </div>

          {/* Progress bar during scanning */}
          {isScanning && (
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 3, ease: 'easeOut' }}
              />
            </div>
          )}

          {/* Actions */}
          <AnimatePresence mode="wait">
            {result === 'allowed' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-3 pt-2"
              >
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    triggerHaptic('light');
                    onApproved();
                  }}
                  className="flex-1 gap-2 bg-emerald-500 hover:bg-emerald-600"
                >
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </motion.div>
            )}

            {result === 'warned' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-3 pt-2"
              >
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    triggerHaptic('light');
                    onApproved();
                  }}
                  className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600"
                >
                  <Send className="h-4 w-4" />
                  Send Anyway
                </Button>
              </motion.div>
            )}

            {result === 'blocked' && !showAppeal && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-3 pt-2"
              >
                <Button onClick={onCancel} className="w-full">
                  Choose Different Image
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowAppeal(true)}
                  className="w-full text-muted-foreground gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Appeal Decision
                </Button>
              </motion.div>
            )}

            {result === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-3 pt-2"
              >
                <Button onClick={onCancel} className="w-full">
                  Try Again
                </Button>
              </motion.div>
            )}

            {showAppeal && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3 pt-2"
              >
                <textarea
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  placeholder="Explain why you think this image should be allowed..."
                  className="w-full p-3 rounded-lg bg-background/50 border border-border text-sm resize-none"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAppeal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAppeal}
                    disabled={!appealReason.trim()}
                    className="flex-1"
                  >
                    Submit Appeal
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
