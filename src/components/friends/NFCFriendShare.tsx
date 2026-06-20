import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Nfc, Smartphone, Loader2, Check, X, Settings, WifiOff, UserPlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNFC } from '@/hooks/useNFC';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest, useFriendshipStatus } from '@/hooks/useFriends';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { NFCSwapAnimation } from './NFCSwapAnimation';

interface NFCFriendShareProps {
  className?: string;
  variant?: 'button' | 'icon';
}

type NFCMode = 'idle' | 'sharing' | 'receiving' | 'swapping' | 'success' | 'error';

export function NFCFriendShare({ className, variant = 'button' }: NFCFriendShareProps) {
  const { profile } = useAuth();
  const {
    isSupported,
    isEnabled,
    isScanning,
    shareProfile,
    stopScan,
    openSettings,
    getStatusMessage,
  } = useNFC();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<NFCMode>('idle');
  const [showSwapAnimation, setShowSwapAnimation] = useState(false);
  const [receivedUser, setReceivedUser] = useState<{
    id: string;
    username: string;
    avatar_url: string | null;
  } | null>(null);

  const sendRequest = useSendFriendRequest();
  const { data: friendshipStatus } = useFriendshipStatus(receivedUser?.id);

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  // Handle closing the sheet
  const handleClose = useCallback(() => {
    stopScan();
    setMode('idle');
    setReceivedUser(null);
    setShowSwapAnimation(false);
    setIsOpen(false);
  }, [stopScan]);

  // Handle receiving a friend request via NFC
  const handleTagScanned = useCallback(async (userId: string) => {
    if (userId === profile?.id) {
      haptics.error();
      toast.error("You can't add yourself as a friend!");
      return;
    }

    try {
      // Fetch the user's profile
      const { data: userData, error } = await db
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', userId)
        .single();

      if (error || !userData) {
        haptics.error();
        toast.error('User not found');
        setMode('error');
        return;
      }

      setReceivedUser(userData);
      
      // Trigger the swap animation with haptics
      setMode('swapping');
      setShowSwapAnimation(true);
      haptics.impact();
      
    } catch (err) {
      console.error('Error fetching user:', err);
      haptics.error();
      setMode('error');
    }
  }, [profile?.id]);

  // Auto-add friend during animation
  const handleAutoAdd = useCallback(async () => {
    if (!receivedUser) return;
    
    // Check if already connected
    const status = friendshipStatus?.status;
    if (status === 'friends' || status === 'pending_sent') {
      console.log('[NFCShare] Already connected, skipping auto-add');
      return;
    }

    try {
      console.log('[NFCShare] Auto-adding friend:', receivedUser.username);
      await sendRequest.mutateAsync(receivedUser.id);
      haptics.success();
      // success handled by UI state
    } catch (error) {
      console.error('[NFCShare] Auto-add failed:', error);
      // Don't show error toast - the animation will still complete
    }
  }, [receivedUser, friendshipStatus?.status, sendRequest]);

  // Called when swap animation completes
  const handleSwapComplete = useCallback(() => {
    setShowSwapAnimation(false);
    setMode('success');
    stopScan();
    // Close after a short delay since friend was already added
    setTimeout(() => {
      handleClose();
    }, 500);
  }, [stopScan, handleClose]);

  // Immediately activate NFC when button is clicked
  const handleNFCButtonClick = async () => {
    if (!profile?.id) {
      toast.error('Please log in first');
      return;
    }

    if (!isSupported) {
      toast.error(getStatusMessage());
      return;
    }

    haptics.tap();
    setIsOpen(true);
    setMode('sharing');
    
    try {
      console.log('[NFCShare] Starting bidirectional share...');
      // Use shareProfile for bidirectional NFC - shares our profile AND listens for theirs
      const success = await shareProfile(profile.id, handleTagScanned);
      
      if (success) {
        console.log('[NFCShare] NFC activated successfully');
        haptics.impact();
      } else {
        console.log('[NFCShare] NFC activation failed');
        setMode('idle');
      }
    } catch (error) {
      console.error('[NFCShare] NFC activation error:', error);
      haptics.error();
      setMode('error');
    }
  };

  // Start sharing your profile (same as button click)
  const handleStartSharing = async () => {
    if (!profile?.id) return;

    setMode('sharing');
    haptics.tap();
    
    const success = await shareProfile(profile.id, handleTagScanned);
    if (!success) {
      setMode('idle');
    }
  };

  // Start receiving (same as sharing - it's bidirectional)
  const handleStartReceiving = async () => {
    handleStartSharing();
  };

  // Send friend request to received user
  const handleSendRequest = async () => {
    if (!receivedUser) return;

    try {
      await sendRequest.mutateAsync(receivedUser.id);
      haptics.success();
      // success handled by UI state
      handleClose();
    } catch (error) {
      haptics.error();
      toast.error('Failed to send friend request');
    }
  };

  // Don't show if NFC not supported at all
  if (!isSupported) {
    return null;
  }

  // Check if already friends or pending
  const alreadyConnected =
    friendshipStatus?.status === 'friends' ||
    friendshipStatus?.status === 'pending_sent' ||
    friendshipStatus?.status === 'pending_received';

  return (
    <>
      {/* Swap Animation Overlay */}
      <NFCSwapAnimation
        isActive={showSwapAnimation}
        myProfile={profile ? { username: profile.username || 'You', avatar_url: profile.avatar_url } : null}
        theirProfile={receivedUser}
        onComplete={handleSwapComplete}
        onAutoAdd={handleAutoAdd}
      />

      {/* NFC Button - directly activates NFC on click */}
      {variant === 'icon' ? (
        <Button
          variant="outline"
          size="icon"
          className={cn('relative', className)}
          disabled={!isSupported}
          onClick={handleNFCButtonClick}
        >
          <Nfc className="h-4 w-4" />
          {!isEnabled && isSupported && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          className={cn('gap-2', className)}
          disabled={!isSupported}
          onClick={handleNFCButtonClick}
        >
          <Nfc className="h-4 w-4" />
          <span>Phone Tap</span>
          {!isEnabled && isSupported && (
            <span className="h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      )}

      {/* Sheet for NFC interaction */}
      <Sheet open={isOpen} onOpenChange={(open) => (open ? null : handleClose())}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="text-center pb-4">
            <SheetTitle className="flex items-center justify-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Add Friend via Phone Tap
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 pb-safe">
            {/* NFC Not Supported Message */}
            {!isSupported && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                  <WifiOff className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <p className="font-medium">Phone Tap Not Available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getStatusMessage()}
                  </p>
                </div>
        <Button variant="outline" onClick={openSettings} className="rounded-xl">
                  Open NFC Settings
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  Close
                </Button>
              </motion.div>
            )}

            {/* Idle State - Choose Mode */}
            {isSupported && mode === 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="text-center mb-6">
                  <div className="relative w-20 h-20 mx-auto mb-4">
                    <motion.div
                      className="absolute inset-0 rounded-2xl bg-primary/20"
                      animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0.8, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                      <Nfc className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Both phones need the app open and scanning
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Hold phones back-to-back
                  </p>
                </div>

                <Button
                  className="w-full h-14 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-semibold rounded-xl"
                  onClick={handleStartSharing}
                >
                  <Nfc className="h-5 w-5 mr-2" />
                  Start Phone Tap
                </Button>
              </motion.div>
            )}

            {/* Sharing/Scanning Mode - Radar style */}
            {mode === 'sharing' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <div className="relative w-40 h-40 mx-auto">
                  {/* Radar sweep */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, transparent 0%, hsl(var(--primary) / 0.3) 15%, transparent 30%)',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  />
                  {/* Concentric rings */}
                  {[1, 0.75, 0.5].map((scale, i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full border border-primary/20"
                      style={{
                        inset: `${(1 - scale) * 50}%`,
                      }}
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                    />
                  ))}
                  {/* Pulsing outer ring */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/30"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Center icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Smartphone className="h-8 w-8 text-white" />
                    </motion.div>
                  </div>
                  {/* Scanning dots */}
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={`dot-${i}`}
                      className="absolute w-2 h-2 rounded-full bg-primary"
                      style={{
                        top: '50%',
                        left: '50%',
                      }}
                      animate={{
                        x: [0, Math.cos(i * Math.PI / 2) * 55],
                        y: [0, Math.sin(i * Math.PI / 2) * 55],
                        opacity: [0, 1, 0],
                        scale: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.5,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                </div>

                <div>
                  <p className="font-semibold text-base">Scanning for friends...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Hold phones back-to-back
                  </p>
                  <motion.p
                    className="text-xs text-primary mt-2 font-medium"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ✓ Ready to exchange profiles
                  </motion.p>
                </div>

                <Button variant="outline" className="rounded-xl" onClick={handleClose}>
                  Cancel
                </Button>
              </motion.div>
            )}

            {/* Receiving Mode */}
            {mode === 'receiving' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <div className="relative w-32 h-32 mx-auto">
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-dashed border-primary"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 8,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                  {/* Scanning pulse effect */}
                  <motion.div
                    className="absolute inset-4 rounded-full bg-primary/10"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-medium">Scanning for friends...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Hold your phone near your friend's device
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
              </motion.div>
            )}

            {/* Swapping Mode - shows minimal UI while animation plays */}
            {mode === 'swapping' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8"
              >
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              </motion.div>
            )}

            {/* Success - Friend Found */}
            {mode === 'success' && receivedUser && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.5 }}
                  className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <Check className="h-10 w-10 text-primary" />
                </motion.div>

                <div className="space-y-2">
                  <Avatar className="w-16 h-16 mx-auto ring-4 ring-primary/20">
                    <AvatarImage src={receivedUser.avatar_url || undefined} alt={receivedUser.username} />
                    <AvatarFallback className="text-2xl font-bold">
                      {receivedUser.username[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-semibold text-lg">@{receivedUser.username}</p>
                </div>

                {alreadyConnected ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {friendshipStatus?.status === 'friends'
                        ? "You're already friends!"
                        : 'Request already pending'}
                    </p>
                    <Button variant="outline" onClick={handleClose}>
                      Close
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSendRequest}
                      disabled={sendRequest.isPending}
                      className="gap-2"
                    >
                      {sendRequest.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Add Friend
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Error State */}
            {mode === 'error' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="h-8 w-8 text-destructive" />
                </div>

                <div>
                  <p className="font-medium">Something went wrong</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Could not activate Phone Tap. Make sure NFC is enabled on your device.
                  </p>
                </div>

                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={handleClose}>
                    Close
                  </Button>
                  <Button onClick={() => setMode('idle')}>
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
