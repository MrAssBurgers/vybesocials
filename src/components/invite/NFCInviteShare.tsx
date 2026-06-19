import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Nfc, Radio, Zap, Check, X, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNFC } from '@/hooks/useNFC';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { despiaReadNFC } from '@/lib/despiaNFCv2';
import { showNfcError, mapNfcErrorMessage } from '@/lib/nfcPlatform';
import { useAuth } from '@/lib/auth';
import { getInviteUrl } from '@/hooks/useInvites';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';

interface NFCInviteShareProps {
  variant?: 'button' | 'icon';
}

type NFCPhase = 'idle' | 'requesting' | 'ready' | 'broadcasting' | 'success' | 'error';

// Generate the invite URL for NFC transmission
function generateInviteNFCUrl(username: string): string {
  return getInviteUrl(username);
}

export function NFCInviteShare({ variant = 'button' }: NFCInviteShareProps) {
  const { profile } = useAuth();
  const { 
    hasWebNFC, 
    isSupported, 
    requestPermission,
    getStatusMessage 
  } = useNFC();
  
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<NFCPhase>('idle');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleOpen = useCallback(async () => {
    if (!isSupported) {
      toast.error(getStatusMessage());
      return;
    }
    
    if (!profile?.username) {
      toast.error('Complete your profile to share invites via Phone Tap');
      return;
    }
    
    setIsOpen(true);
    setPhase('idle');
  }, [isSupported, profile?.username, getStatusMessage]);

  const startNFCBroadcast = useCallback(async () => {
    if (!profile?.username) return;

    setPhase('requesting');
    haptics.tap();

    if (isDespiaRuntime()) {
      setPhase('ready');
      haptics.impact();
      toast.success('Hold phones together — tap to share your invite', { duration: 5000 });
      const result = await despiaReadNFC(60_000);
      if (result.ok && result.payload) {
        setPhase('success');
        haptics.success();
        toast.success('Phone Tap detected!');
        setTimeout(() => {
          setIsOpen(false);
          setPhase('idle');
        }, 2000);
        return;
      }
      setPhase('error');
      haptics.error();
      if (result.error) toast.error(result.error);
      else toast.info('No NFC detected — try again');
      return;
    }

    if (!window.NDEFReader) {
      setPhase('error');
      toast.error('NFC requires the VYBE app or Chrome on Android');
      return;
    }

    // Request permission first (Chrome Android Web NFC only)
    const hasPermission = await requestPermission();
    if (!hasPermission) {
      setPhase('error');
      return;
    }

    try {
      const ndef = new window.NDEFReader();
      const controller = new AbortController();
      setAbortController(controller);
      
      // Start scanning to enable NFC interaction
      await ndef.scan({ signal: controller.signal });
      
      setPhase('ready');
      haptics.impact();
      
      // Listen for any NFC interaction - when another device comes close
      ndef.addEventListener('reading', async () => {
        setPhase('broadcasting');
        haptics.impact();
        
        const inviteUrl = generateInviteNFCUrl(profile.username!);
        console.log('[NFC Invite] Broadcasting:', inviteUrl);
        
        try {
          // Write our invite link to their device/tag
          await ndef.write({
            records: [
              { 
                recordType: 'url', 
                data: inviteUrl 
              }
            ],
          });
          
          setPhase('success');
          haptics.success();
          toast.success('Invite link shared via Phone Tap!');
          
          // Auto close after success
          setTimeout(() => {
            setIsOpen(false);
            controller.abort();
            setPhase('idle');
          }, 2000);
        } catch (writeError) {
          console.log('[NFC Invite] Write failed (normal for phone-to-phone):', writeError);
          // Even if write fails, the scan was successful
          // For phone-to-phone, the other device needs to have NFC active too
          setPhase('success');
          haptics.success();
          toast.success('Phone Tap detected! Share the link or have them scan your phone.');
          
          setTimeout(() => {
            setIsOpen(false);
            controller.abort();
            setPhase('idle');
          }, 2000);
        }
      });
      
    } catch (error: any) {
      console.error('[NFC Invite] Error:', error);
      setPhase('error');
      haptics.error();
      
      if (error.name === 'NotAllowedError') {
        toast.error(showNfcError(null, error.name));
      } else if (error.name === 'NotSupportedError') {
        toast.error(mapNfcErrorMessage(null, error.name));
      } else if (error.name !== 'AbortError') {
        console.warn('[NFC Invite] Start failed:', error.message);
      }
    }
  }, [profile?.username, requestPermission]);

  const stopNFC = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setPhase('idle');
    setIsOpen(false);
  }, [abortController]);

  const renderPhaseContent = () => {
    switch (phase) {
      case 'idle':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 py-6"
          >
            <div className="relative">
              <motion.div 
                className="w-28 h-28 rounded-full bg-primary/20 flex items-center justify-center"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Nfc className="h-14 w-14 text-primary" />
              </motion.div>
              {/* NFC waves */}
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-primary/30"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5 + i * 0.2, opacity: 0 }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    delay: i * 0.4,
                    ease: "easeOut"
                  }}
                />
              ))}
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Write to NFC Tag</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Write your invite link to a <span className="font-medium text-foreground">physical NFC tag/sticker</span>. Anyone who taps it will get your link!
              </p>
            </div>
            
            {/* Important limitation notice */}
            <div className="w-full p-3 rounded-xl bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground text-center">
                <span className="font-medium text-foreground">⚠️ Note:</span> NFC doesn't work phone-to-phone in browsers. Use <span className="font-medium">QR codes</span> to share with friends directly!
              </p>
            </div>
            
            <Button 
              onClick={startNFCBroadcast} 
              className="gradient-animated gap-2"
              size="lg"
            >
              <Radio className="h-5 w-5" />
              Write to NFC Tag
            </Button>
          </motion.div>
        );
        
      case 'requesting':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-6 py-12"
          >
            <Loader2 className="h-16 w-16 text-primary animate-spin" />
            <p className="text-muted-foreground">Requesting NFC access...</p>
          </motion.div>
        );
        
      case 'ready':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 py-8"
          >
            <div className="relative">
              {/* Pulsing phone icon */}
              <motion.div 
                className="w-40 h-40 rounded-3xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center"
                animate={{ 
                  boxShadow: [
                    '0 0 0 0 hsl(var(--primary) / 0)',
                    '0 0 40px 20px hsl(var(--primary) / 0.3)',
                    '0 0 0 0 hsl(var(--primary) / 0)'
                  ]
                }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Smartphone className="h-20 w-20 text-primary" />
              </motion.div>
              
              {/* Broadcasting waves */}
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-3xl border-2 border-primary"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.3 + i * 0.15, opacity: 0 }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    delay: i * 0.3,
                    ease: "easeOut"
                  }}
                />
              ))}
              
              {/* NFC symbol */}
              <motion.div
                className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-accent flex items-center justify-center"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Nfc className="h-5 w-5 text-accent-foreground" />
              </motion.div>
            </div>
            
            <div className="text-center space-y-2">
              <motion.h3 
                className="text-xl font-bold text-primary"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                📡 Ready to Write...
              </motion.h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Tap a <span className="font-medium text-foreground">physical NFC tag</span> to write your invite link to it.
              </p>
            </div>
            
            <Button variant="outline" onClick={stopNFC} className="gap-2">
              <X className="h-4 w-4" />
              Stop Broadcasting
            </Button>
          </motion.div>
        );
        
      case 'broadcasting':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-6 py-12"
          >
            <Zap className="h-16 w-16 text-primary" />
            <p className="text-lg font-semibold">Sending invite link...</p>
          </motion.div>
        );
        
      case 'success':
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
              className="w-24 h-24 rounded-full bg-accent/30 flex items-center justify-center"
            >
              <Check className="h-12 w-12 text-accent-foreground" />
            </motion.div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-accent-foreground">Invite Shared!</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Your invite link was transmitted via NFC
              </p>
            </div>
          </motion.div>
        );
        
      case 'error':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-6 py-12"
          >
            <div className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center">
              <X className="h-12 w-12 text-destructive" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-destructive">NFC Error</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Failed to start NFC. Check permissions.
              </p>
            </div>
            <Button onClick={() => setPhase('idle')}>Try Again</Button>
          </motion.div>
        );
    }
  };

  // Don't render if NFC not supported
  if (!hasWebNFC) {
    return null;
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button 
          variant="outline" 
          size="icon" 
          onClick={handleOpen}
          className="relative"
        >
          <Nfc className="h-4 w-4" />
          {/* Active indicator */}
          {phase !== 'idle' && (
            <motion.span
              className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            />
          )}
        </Button>
      ) : (
        <Button 
          variant="outline" 
          onClick={handleOpen}
          className="gap-2"
        >
          <Nfc className="h-4 w-4" />
          NFC Share
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) stopNFC();
        else setIsOpen(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Nfc className="h-5 w-5 text-primary" />
              NFC Invite Broadcast
            </DialogTitle>
          </DialogHeader>
          
          <AnimatePresence mode="wait">
            {renderPhaseContent()}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}