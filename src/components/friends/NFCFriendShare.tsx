import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Nfc, Smartphone, Loader2, Check, X, Settings, WifiOff, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNFC } from '@/hooks/useNFC';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest, useFriendshipStatus } from '@/hooks/useFriends';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NFCFriendShareProps {
  className?: string;
  variant?: 'button' | 'icon';
}

type NFCMode = 'idle' | 'sharing' | 'receiving' | 'success' | 'error';

export function NFCFriendShare({ className, variant = 'button' }: NFCFriendShareProps) {
  const { profile } = useAuth();
  const {
    isSupported,
    isEnabled,
    isScanning,
    isNative,
    hasWebNFC,
    startScan,
    stopScan,
    writeNFC,
    openSettings,
  } = useNFC();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<NFCMode>('idle');
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
    setIsOpen(false);
  }, [stopScan]);

  // Handle receiving a friend request via NFC
  const handleTagScanned = useCallback(async (userId: string) => {
    if (userId === profile?.id) {
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
        toast.error('User not found');
        setMode('error');
        return;
      }

      setReceivedUser(userData);
      setMode('success');
      stopScan();
    } catch (err) {
      console.error('Error fetching user:', err);
      setMode('error');
    }
  }, [profile?.id, stopScan]);

  // Start sharing your profile
  const handleStartSharing = async () => {
    if (!profile?.id) return;

    setMode('sharing');
    
    if (hasWebNFC) {
      const success = await writeNFC(profile.id);
      if (!success) {
        setMode('idle');
      }
    } else {
      // For native without Web NFC, show instructions
      // The user's phone will broadcast their profile
      toast.success('Hold your phone near your friend\'s device');
    }
  };

  // Start receiving (scanning for NFC tags)
  const handleStartReceiving = async () => {
    setMode('receiving');
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
      toast.success(`Friend request sent to @${receivedUser.username}!`);
      handleClose();
    } catch (error) {
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
    <Sheet open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : handleClose())}>
      <SheetTrigger asChild>
        {variant === 'icon' ? (
          <Button
            variant="outline"
            size="icon"
            className={cn('relative', className)}
            disabled={!isSupported && !hasWebNFC}
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
          >
            <Nfc className="h-4 w-4" />
            <span>NFC Friend</span>
            {!isEnabled && isSupported && (
              <span className="h-2 w-2 rounded-full bg-destructive" />
            )}
          </Button>
        )}
      </SheetTrigger>

      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-center pb-4">
          <SheetTitle>Add Friend via NFC</SheetTitle>
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
                <div className="w-20 h-20 mx-auto rounded-2xl gradient-animated flex items-center justify-center mb-4">
                  <Nfc className="h-10 w-10 text-white" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Tap phones together to quickly add friends
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={handleStartSharing}
                >
                  <Smartphone className="h-6 w-6" />
                  <span className="text-sm">Share My Profile</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={handleStartReceiving}
                >
                  <Nfc className="h-6 w-6" />
                  <span className="text-sm">Receive Friend</span>
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
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full gradient-animated flex items-center justify-center">
                    <Smartphone className="h-10 w-10 text-white" />
                  </div>
                </div>
              </div>

              <div>
                <p className="font-medium">Ready to share</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tap your phone against your friend's device
                </p>
              </div>

              <Button variant="outline" onClick={() => setMode('idle')}>
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
                onClick={() => {
                  stopScan();
                  setMode('idle');
                }}
              >
                Cancel
              </Button>
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
                <Avatar className="w-16 h-16 mx-auto">
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
                  Could not read NFC tag. Try again.
                </p>
              </div>

              <Button variant="outline" onClick={() => setMode('idle')}>
                Try Again
              </Button>
            </motion.div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
