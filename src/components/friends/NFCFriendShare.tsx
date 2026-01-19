import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Nfc, Smartphone, Loader2, Check, X, Settings, WifiOff, UserPlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNFC } from '@/hooks/useNFC';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest, useFriendshipStatus } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
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
    isNative,
    hasWebNFC,
    startScan,
    stopScan,
    writeNFC,
    openSettings,
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
      const { data: userData, error } = await supabase
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

  // Called when swap animation completes
  const handleSwapComplete = useCallback(() => {
    setShowSwapAnimation(false);
    setMode('success');
    stopScan();
  }, [stopScan]);

  // Immediately activate NFC when button is clicked
  const handleNFCButtonClick = async () => {
    if (!profile?.id) {
      toast.error('Please log in first');
      return;
    }

    if (!hasWebNFC) {
      toast.error('NFC is not available on this device. Try Chrome on Android.');
      return;
    }

    haptics.tap();
    setIsOpen(true);
    
    // Immediately start both sharing and receiving for seamless experience
    // Start sharing your profile first
    setMode('sharing');
    
    try {
      // Write your profile to NFC - this requests permission
      const writeSuccess = await writeNFC(profile.id);
      
      if (writeSuccess) {
        // Also start scanning for incoming NFC
        startScan(handleTagScanned);
        toast.success('NFC activated! Tap phones together');
      } else {
        setMode('idle');
      }
    } catch (error) {
      console.error('NFC activation error:', error);
      setMode('error');
    }
  };

  // Start sharing your profile
  const handleStartSharing = async () => {
    if (!profile?.id) return;

    setMode('sharing');
    haptics.tap();
    
    if (hasWebNFC) {
      const success = await writeNFC(profile.id);
      if (success) {
        // Also listen for incoming NFC while sharing
        startScan(handleTagScanned);
      } else {
        setMode('idle');
      }
    } else {
      toast.success('Hold your phone near your friend\'s device');
    }
  };

  // Start receiving (scanning for NFC tags)
  const handleStartReceiving = async () => {
    setMode('receiving');
    haptics.tap();
    const success = await startScan(handleTagScanned);

    if (!success) {
      setMode('idle');
    }
  };

  // Send friend request to received user
  const handleSendRequest = async () => {
    if (!receivedUser) return;

    try {
      await sendRequest.mutateAsync(receivedUser.id);
      haptics.success();
      toast.success(`Friend request sent to @${receivedUser.username}!`);
      handleClose();
    } catch (error) {
      haptics.error();
      toast.error('Failed to send friend request');
    }
  };

  // Don't show if NFC not supported at all
  if (!isSupported && !isNative && !hasWebNFC) {
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
      />

      {/* NFC Button - directly activates NFC on click */}
      {variant === 'icon' ? (
        <Button
          variant="outline"
          size="icon"
          className={cn('relative', className)}
          disabled={!isSupported && !hasWebNFC}
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
          disabled={!isSupported && !hasWebNFC}
          onClick={handleNFCButtonClick}
        >
          <Nfc className="h-4 w-4" />
          <span>NFC Friend</span>
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
              Add Friend via NFC
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 pb-safe">
            {/* NFC Not Enabled (native only) */}
            {isNative && !isEnabled && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                  <WifiOff className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <p className="font-medium">NFC is disabled</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enable NFC in your device settings to add friends by tapping phones
                  </p>
                </div>
                <Button onClick={openSettings} className="gap-2">
                  <Settings className="h-4 w-4" />
                  Open Settings
                </Button>
              </motion.div>
            )}

            {/* Idle State - Choose Mode */}
            {(isEnabled || hasWebNFC) && mode === 'idle' && (
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
                    <div className="absolute inset-0 rounded-2xl gradient-animated flex items-center justify-center">
                      <Nfc className="h-10 w-10 text-white" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tap phones together to quickly add friends
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    They'll get a notification to open the app
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-24 flex-col gap-2 relative overflow-hidden group"
                    onClick={handleStartSharing}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.5 }}
                    />
                    <Smartphone className="h-6 w-6 relative z-10" />
                    <span className="text-sm relative z-10">Share My Profile</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-24 flex-col gap-2 relative overflow-hidden group"
                    onClick={handleStartReceiving}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.5 }}
                    />
                    <Nfc className="h-6 w-6 relative z-10" />
                    <span className="text-sm relative z-10">Receive Friend</span>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Sharing Mode */}
            {mode === 'sharing' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4"
              >
                <div className="relative w-32 h-32 mx-auto">
                  {/* Pulsing rings */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/20"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/30"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.6, 0, 0.6],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: 0.3,
                    }}
                  />
                  {/* Lightning bolts around the icon */}
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute"
                      style={{
                        top: '50%',
                        left: '50%',
                        transform: `rotate(${i * 90}deg) translateY(-50px)`,
                      }}
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.25,
                      }}
                    >
                      <Zap className="h-4 w-4 text-primary" />
                    </motion.div>
                  ))}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full gradient-animated flex items-center justify-center">
                      <Smartphone className="h-10 w-10 text-white" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-medium">NFC Active - Broadcasting</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap your phone against your friend's device
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    Also listening for incoming friend requests
                  </p>
                </div>

                <Button variant="outline" onClick={handleClose}>
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
                    Could not activate NFC. Make sure NFC is enabled on your device.
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
