import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, Check, Zap,
  Bluetooth, Wifi, ZoomIn, MessageCircle,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync } from '@/hooks/useFriendDropSync';
import { useCreateConversation } from '@/hooks/useMessages';
import { supabase } from '@/integrations/supabase/client';
import { useSwingDetection } from '@/hooks/useSwingDetection';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { getPreloadedStream } from '@/hooks/useCameraPreload';
import jsQR from 'jsqr';
import { getPrimaryHex } from '@/lib/themeColor';

type DropPhase = 'idle' | 'activated' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// Simple QR component — CSS transitions only, no framer-motion
const ExpandableQR = memo(function ExpandableQR({
  qrCodeUrl,
  isExpanded,
  onToggle,
  avatarUrl,
  username,
}: {
  qrCodeUrl: string;
  isExpanded: boolean;
  onToggle: () => void;
  avatarUrl?: string | null;
  username?: string | null;
}) {
  const size = isExpanded ? 256 : 80;
  const avatarSize = isExpanded ? 48 : 24;
  
  return (
    <div
      className="relative cursor-pointer overflow-hidden active:scale-[0.98] transition-all duration-200 ease-out"
      onClick={onToggle}
      style={{
        width: size,
        height: size,
        padding: isExpanded ? 16 : 8,
        borderRadius: 4,
        background: 'white',
        boxShadow: '0 0 20px hsl(var(--primary) / 0.15)',
      }}
    >
      <img
        src={qrCodeUrl}
        alt="QR Code"
        className="w-full h-full"
        style={{ borderRadius: 2 }}
      />
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="relative overflow-hidden border-2 shadow-lg transition-all duration-200 ease-out"
          style={{
            width: avatarSize,
            height: avatarSize,
            background: 'white',
            borderRadius: 4,
            borderColor: 'hsl(var(--primary) / 0.3)',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={username || 'Profile'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold font-mono">
              {username?.[0]?.toUpperCase() || 'V'}
            </div>
          )}
        </div>
      </div>
      
      {!isExpanded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-sm opacity-0 hover:opacity-100 transition-opacity duration-200">
          <ZoomIn className="h-5 w-5 text-white" />
        </div>
      )}
      
      {isExpanded && (
        <div className="absolute bottom-2 left-0 right-0 text-center animate-fade-in">
          <span className="text-[9px] font-mono text-black/60 bg-white/80 px-2 py-1 rounded-sm">
            TAP TO MINIMIZE
          </span>
        </div>
      )}
    </div>
  );
});

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const sendRequest = useSendFriendRequest();
  const createConversation = useCreateConversation();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [isDismissed, setIsDismissed] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [createdConversationId, setCreatedConversationId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const startScanLoopRef = useRef<() => void>(() => {});

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch {
      return null;
    }
  };
  
  const [isQrOwner, setIsQrOwner] = useState(false);
  
  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        setCreatedConversationId(conversation.id);
      } catch {
        // Conversation might already exist
      }
    }
    
    setTimeout(() => {
      const convId = createdConversationId;
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      setIsQrOwner(false);
      setCreatedConversationId(null);
      
      if (convId) {
        navigate(`/messages/${convId}`);
      }
    }, 3000);
  }, [foundUser?.id, createConversation, createdConversationId, navigate]);
  
  const friendDropSync = useFriendDropSync({
    enabled: isActive,
    onScanned: useCallback((drop) => {
      haptics.success();
      setIsQrOwner(true);
      if (drop.to_user_id) {
        fetchUser(drop.to_user_id).then((scannedUser) => {
          if (scannedUser) {
            setFoundUser(scannedUser);
            setPhase('exchanging');
            setTimeout(async () => {
              try {
                await sendRequest.mutateAsync(scannedUser.id);
              } catch {
                // Already friends
              }
              if (activeDropId) {
                await friendDropSync.completeDrop(activeDropId);
              }
            }, 1500);
          }
        });
      }
    }, [activeDropId, sendRequest]),
    onConfirmed: useCallback(() => {
      if (phase !== 'exchanging') {
        setPhase('exchanging');
        haptics.impact();
      }
    }, [phase]),
    onCompleted: useCallback(async () => {
      setPhase('success');
      haptics.success();
      
      const targetUserId = foundUser?.id;
      if (targetUserId) {
        try {
          const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
          setTimeout(() => {
            setIsActive(false);
            setPhase('idle');
            setFoundUser(null);
            setActiveDropId(null);
            setIsQrOwner(false);
            navigate(`/messages/${conversation.id}`);
          }, 3000);
        } catch {
          setTimeout(() => {
            setIsActive(false);
            setPhase('idle');
            setFoundUser(null);
            setActiveDropId(null);
            setIsQrOwner(false);
          }, 3000);
        }
      }
    }, [foundUser?.id, createConversation, navigate]),
  });
  
  const nativeFriendDrop = useNativeFriendDrop({
    enabled: isActive,
    onPeerFound: (peer) => {
      setFoundUser({
        id: peer.userId,
        username: peer.username,
        display_name: peer.displayName,
        avatar_url: peer.avatarUrl,
      });
      setPhase('found');
      stopScanning();
    },
    onPeerConnected: (peer) => {
      handleAutoAdd(peer.userId);
    },
  });

  const toggleQrExpand = useCallback(() => {
    setIsQrExpanded(prev => !prev);
    haptics.tap();
  }, []);

  const myProfileUrl = activeDropId 
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username 
      ? `https://vybehub.app/add-friend/${user?.id}`
      : '';
  
  const primaryHex = getPrimaryHex();
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=${primaryHex}&format=svg&ecc=H&margin=2`
    : '';

  const handleAutoAdd = useCallback(async (userId: string) => {
    if (phase === 'exchanging' || phase === 'success') return;
    
    setPhase('exchanging');
    haptics.impact();
    
    try {
      await sendRequest.mutateAsync(userId);
      setPhase('success');
      haptics.success();
      setTimeout(handleClose, 2500);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        setPhase('success');
        setTimeout(handleClose, 1500);
      }
    }
  }, [phase, sendRequest]);

  const handleBump = useCallback(async () => {
    if (!profile?.username || !user) return;
    
    // Open UI instantly
    setIsActive(true);
    haptics.impact();
    setPhase('activated');
    setTimeout(() => { haptics.success(); }, 300);
    
    // Create drop in background
    friendDropSync.createDrop().then((drop) => {
      if (drop) setActiveDropId(drop.id);
    });
    
    if (nativeFriendDrop.isAvailable) {
      nativeFriendDrop.startSession();
    }
    
    // Start camera AFTER entrance animation (350ms)
    setTimeout(async () => {
      try {
        let stream = getPreloadedStream();
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
          });
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          startScanLoopRef.current();
        }
      } catch (err) {
        console.warn('[AutoFriendDrop] Camera access failed:', err);
      }
    }, 350);
  }, [profile?.username, user, nativeFriendDrop, friendDropSync]);

  useSwingDetection({
    enabled: !isActive && !!profile?.username,
    threshold: 6,
    swingWindow: 500,
    cooldown: 3000,
    onSwing: handleBump,
  });

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();

    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) {
      toast.error('This code has expired');
      setPhase('activated');
      return;
    }

    setActiveDropId(dropId);
    setIsQrOwner(false);

    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) {
        setFoundUser(ownerProfile);
        setPhase('exchanging');
      }
    }
  }, [friendDropSync, stopScanning]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
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
      toast.error('Could not find user');
      handleClose();
    }
  }, [stopScanning]);

  const startScanLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const scanFrame = async () => {
      if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code) {
        const url = code.data;
        const dropMatch = url?.match(/\/friend-drop\/([a-zA-Z0-9-]+)/);
        if (dropMatch) {
          await handleDropScan(dropMatch[1]);
          return;
        }
        const userMatch = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
        if (userMatch && userMatch[1] !== user?.id) {
          handleFoundUser(userMatch[1]);
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }, [user?.id, handleDropScan, handleFoundUser]);

  startScanLoopRef.current = startScanLoop;

  const startScanning = useCallback(async () => {
    try {
      let stream = getPreloadedStream();
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
      }
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      startScanLoop();
    } catch (error) {
      console.error('Camera error:', error);
    }
  }, [startScanLoop]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;

    setPhase('exchanging');
    haptics.impact();

    try {
      if (activeDropId) {
        await friendDropSync.confirmDrop(activeDropId);
      }
    } catch (e) {
      console.warn('[FriendDrop] Confirm failed:', e);
    }

    try {
      await sendRequest.mutateAsync(foundUser.id);
      
      try {
        if (activeDropId) {
          await friendDropSync.completeDrop(activeDropId);
        }
      } catch (e) {
        console.warn('[FriendDrop] Complete failed:', e);
      }
      
      if (!activeDropId) {
        setPhase('success');
        haptics.success();
        autoCloseAfterSuccess();
      }
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already linked!');
        try {
          if (activeDropId) {
            await friendDropSync.completeDrop(activeDropId);
          } else {
            setPhase('success');
            autoCloseAfterSuccess();
          }
        } catch (e) {
          setPhase('success');
          autoCloseAfterSuccess();
        }
      } else {
        toast.error('Failed to send request');
        setPhase('found');
      }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync, autoCloseAfterSuccess]);

  const handleClose = useCallback(async () => {
    stopScanning();
    if (activeDropId && phase !== 'success') {
      await friendDropSync.cancelDrop(activeDropId);
    }
    if (nativeFriendDrop.isActive) {
      await nativeFriendDrop.stopSession();
    }
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
    setIsQrOwner(false);
    setCreatedConversationId(null);
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync, phase]);

  useEffect(() => {
    return () => { stopScanning(); };
  }, [stopScanning]);

  if (!profile?.username) return null;

  return (
    <>
      {/* Bump indicator pill */}
      {!isActive && !isDismissed && isMobile && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fade-in" style={{ animationDuration: '300ms' }}>
          <button
            onClick={handleBump}
            className="friendlink-pill relative flex items-center gap-2.5 px-5 py-3 rounded-lg border active:scale-[0.97] transition-transform duration-150 touch-manipulation overflow-hidden"
            style={{
              background: 'hsl(var(--background) / 0.92)',
              borderColor: 'hsl(var(--primary) / 0.25)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <div className="friendlink-shimmer absolute inset-0 pointer-events-none rounded-lg" />
            
            <div className="friendlink-icon-wrap p-1.5 rounded-md relative z-[1]" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
              {hasWebNFC ? (
                <Radio className="h-4 w-4 text-primary" />
              ) : nativeFriendDrop.isAvailable ? (
                <Bluetooth className="h-4 w-4 text-primary" />
              ) : (
                <Zap className="h-4 w-4 text-primary" />
              )}
            </div>
            <div className="flex flex-col items-start relative z-[1]">
              <span className="text-[9px] text-primary font-mono font-bold tracking-[0.25em]">
                FRIEND LINK
              </span>
              <span className="text-[7px] text-muted-foreground font-mono tracking-[0.15em]">
                {hasWebNFC
                  ? 'TAP PHONES'
                  : nativeFriendDrop.isAvailable 
                    ? 'PROXIMITY'
                    : 'SHAKE TO ACTIVATE'}
              </span>
            </div>
            <div className="flex items-end gap-[2px] relative z-[1] h-4">
              {[0,1,2,3].map(i => (
                <div
                  key={i}
                  className="friendlink-bar w-[3px] rounded-full"
                  style={{ 
                    background: 'hsl(var(--primary))',
                    animationDelay: `${i * 150}ms`,
                  }}
                />
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsDismissed(true); }}
              className="ml-0.5 p-1 rounded-md hover:bg-primary/10 transition-colors touch-manipulation relative z-[1]"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </button>
        </div>
      )}

      {/* Full-screen modal — all CSS animations, zero framer-motion */}
      {isActive && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 cyber-backdrop-enter"
            onClick={handleClose}
          />
          
          {/* Centered content */}
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto">

              {/* ── ACTIVATED PHASE ── */}
              {phase === 'activated' && (
                <div className="cyber-card-enter flex flex-col items-center">
                  <div className="relative w-72 rounded-lg overflow-hidden cyber-card-lite">
                    {/* HUD header */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-2 relative z-[4]">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full cyber-dot-pulse"
                          style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 8px hsl(var(--primary) / 0.6)' }}
                        />
                        <div>
                          <h3 className="font-mono text-xs font-bold tracking-[0.2em] text-primary">
                            FRIEND LINK
                          </h3>
                          <p className="text-[8px] font-mono text-muted-foreground tracking-[0.3em]">
                            <span className="cyber-blink">▸</span> SCANNING
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-sm" onClick={handleClose}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Live Scanner */}
                    <div
                      className="relative aspect-square mx-3 mb-2 rounded-sm overflow-hidden border"
                      style={{ borderColor: 'hsl(var(--primary) / 0.3)' }}
                    >
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      <canvas ref={canvasRef} className="hidden" />
                      
                      {/* Scanning beam */}
                      <div className="cyber-scan-beam" />
                      
                      {/* Corner brackets */}
                      <div className="absolute inset-0 pointer-events-none">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="cyber-corner-bracket"
                            style={{
                              top: i < 2 ? 8 : 'auto',
                              bottom: i >= 2 ? 8 : 'auto',
                              left: i % 2 === 0 ? 8 : 'auto',
                              right: i % 2 === 1 ? 8 : 'auto',
                              borderTopWidth: i < 2 ? 2 : 0,
                              borderBottomWidth: i >= 2 ? 2 : 0,
                              borderLeftWidth: i % 2 === 0 ? 2 : 0,
                              borderRightWidth: i % 2 === 1 ? 2 : 0,
                            }}
                          />
                        ))}
                        
                        {/* HUD text */}
                        <div className="absolute top-2 left-2 right-2 flex justify-between">
                          <span className="text-[7px] font-mono" style={{ color: 'hsl(var(--primary) / 0.7)' }}>
                            OPTICAL.SCAN//v2.4
                          </span>
                          <span className="text-[7px] font-mono cyber-blink" style={{ color: 'hsl(var(--primary) / 0.7)' }}>
                            ● LIVE
                          </span>
                        </div>
                        
                        <div className="absolute bottom-2 left-2 right-2 flex justify-between">
                          <span className="text-[6px] font-mono" style={{ color: 'hsl(var(--primary) / 0.5)' }}>
                            RES: 640×480
                          </span>
                          <span className="text-[6px] font-mono cyber-blink" style={{ color: 'hsl(var(--primary) / 0.5)', animationDuration: '2s' }}>
                            QR.DECODE: READY
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* QR Code Section */}
                    {!nativeFriendDrop.isAvailable && (
                      <div className="px-3 pb-2">
                        <div className="flex items-center gap-3 p-2 rounded-sm border relative overflow-hidden" style={{ borderColor: 'hsl(var(--primary) / 0.2)', background: 'hsl(var(--primary) / 0.03)' }}>
                          <ExpandableQR
                            qrCodeUrl={qrCodeUrl}
                            isExpanded={isQrExpanded}
                            onToggle={toggleQrExpand}
                            avatarUrl={profile?.avatar_url}
                            username={profile?.username}
                          />
                          <div className="flex-1 min-w-0 relative z-[1]">
                            <p className="text-[8px] font-mono text-muted-foreground tracking-[0.3em]">YOUR ID</p>
                            <p className="font-mono text-xs text-foreground truncate">@{profile?.username}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Native nearby peers */}
                    {nativeFriendDrop.isAvailable && nativeFriendDrop.nearbyPeers.length > 0 && (
                      <div className="px-3 pb-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground tracking-wider">
                          <Wifi className="h-3 w-3 text-primary" />
                          <span>NEARBY NODES</span>
                        </div>
                        {nativeFriendDrop.nearbyPeers.slice(0, 2).map((peer) => (
                          <button
                            key={peer.peerId}
                            className="w-full flex items-center gap-2 p-2 rounded-sm border transition-colors"
                            style={{ borderColor: 'hsl(var(--primary) / 0.15)', background: 'hsl(var(--primary) / 0.03)' }}
                            onClick={() => {
                              setFoundUser({
                                id: peer.userId,
                                username: peer.username,
                                display_name: peer.displayName,
                                avatar_url: peer.avatarUrl,
                              });
                              setPhase('found');
                            }}
                          >
                            <Avatar className="h-8 w-8 rounded-sm">
                              <AvatarImage src={peer.avatarUrl || ''} />
                              <AvatarFallback className="text-xs font-mono rounded-sm">{peer.username[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-mono font-medium flex-1 text-left truncate">{peer.displayName || peer.username}</span>
                            <Zap className="h-3 w-3 text-primary" />
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {/* Footer */}
                    <div className="px-4 pb-3 pt-1 flex items-center justify-between relative z-[2]">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full cyber-dot-pulse"
                          style={{ background: 'hsl(142 76% 50%)' }}
                        />
                        <p className="text-[9px] font-mono text-muted-foreground tracking-wider">SCAN TARGET CODE</p>
                      </div>
                      <div className="flex gap-0.5 items-end h-3">
                        {[0,1,2,3,4].map(i => (
                          <div
                            key={i}
                            className="friendlink-bar w-[2px] rounded-full"
                            style={{ 
                              background: 'hsl(var(--primary) / 0.6)',
                              animationDelay: `${i * 120}ms`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── FOUND PHASE ── */}
              {phase === 'found' && foundUser && (
                <div className="cyber-card-enter w-72 rounded-lg overflow-hidden cyber-card-lite relative">
                  <div className="relative p-6 flex flex-col items-center gap-4 z-[1]">
                    {/* Avatar */}
                    <div className="relative cyber-phase-avatar">
                      <div
                        className="absolute -inset-2 rounded-lg cyber-ring-spin"
                        style={{
                          background: 'conic-gradient(from 0deg, hsl(var(--primary) / 0.5), transparent, hsl(var(--accent) / 0.3), transparent, hsl(var(--primary) / 0.5))',
                          padding: '1px',
                        }}
                      >
                        <div className="w-full h-full rounded-lg bg-background" />
                      </div>
                      <Avatar className="h-24 w-24 rounded-lg border-2 border-primary/30 relative shadow-2xl">
                        <AvatarImage src={foundUser.avatar_url || ''} className="rounded-lg" />
                        <AvatarFallback className="text-2xl font-mono font-bold rounded-lg bg-primary/10 text-primary">
                          {foundUser.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    
                    <div className="text-center cyber-phase-text">
                      <h3 className="text-xl font-bold font-mono">
                        {foundUser.display_name || foundUser.username}
                      </h3>
                      <p className="text-muted-foreground text-xs font-mono tracking-wider">@{foundUser.username}</p>
                    </div>

                    <div className="flex gap-3 w-full cyber-phase-buttons">
                      <Button 
                        variant="outline"
                        className="flex-1 rounded-sm font-mono text-xs border-muted-foreground/20"
                        onClick={handleClose}
                      >
                        ABORT
                      </Button>
                      <Button 
                        className="flex-1 rounded-sm font-mono text-xs gap-1.5"
                        onClick={handleAddFriend}
                        style={{ boxShadow: '0 0 20px hsl(var(--primary) / 0.3)' }}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        LINK UP
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── EXCHANGING PHASE ── */}
              {phase === 'exchanging' && (
                <div
                  className="cyber-card-enter w-80 rounded-lg overflow-hidden relative cyber-card-lite"
                  style={{ minHeight: 300 }}
                >
                  <div className="relative flex flex-col items-center justify-center p-6 gap-5 z-[1]" style={{ minHeight: 260 }}>
                    {/* My avatar flying out */}
                    <div className="absolute z-20 cyber-fly-out">
                      <Avatar className="h-20 w-20 rounded-lg border-2 border-primary/40 shadow-xl">
                        <AvatarImage src={profile?.avatar_url || ''} className="rounded-lg" />
                        <AvatarFallback className="text-xl font-mono font-bold rounded-lg">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </div>
                    
                    {/* Their avatar flying in */}
                    <div className="relative z-10 cyber-fly-in">
                      <Avatar className="h-24 w-24 rounded-lg border-2 border-primary/40 shadow-2xl">
                        <AvatarImage src={foundUser?.avatar_url || ''} className="rounded-lg" />
                        <AvatarFallback className="text-2xl font-mono font-bold rounded-lg">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </div>
                    
                    <div className="text-center z-10 cyber-phase-text">
                      <p className="text-sm font-mono font-bold tracking-wider cyber-sync-text" style={{ color: 'hsl(var(--primary))' }}>
                        SYNCING DATA...
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        {foundUser?.display_name || foundUser?.username}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SUCCESS PHASE ── */}
              {phase === 'success' && (
                <div
                  className="cyber-card-enter w-80 rounded-lg overflow-hidden shadow-2xl relative cyber-card-lite"
                  style={{ minHeight: 300 }}
                >
                  <div className="relative flex flex-col items-center justify-center p-6 gap-3 z-[1]" style={{ minHeight: 260 }}>
                    {/* Both avatars */}
                    <div className="relative flex items-center justify-center h-28 z-10">
                      <div className="absolute cyber-slide-left">
                        <Avatar className="h-16 w-16 rounded-lg border-2 border-primary/30 shadow-xl">
                          <AvatarImage src={profile?.avatar_url || ''} className="rounded-lg" />
                          <AvatarFallback className="text-lg font-mono font-bold rounded-lg">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </div>
                      
                      <div className="absolute cyber-slide-right">
                        <Avatar className="h-16 w-16 rounded-lg border-2 border-primary/30 shadow-xl">
                          <AvatarImage src={foundUser?.avatar_url || ''} className="rounded-lg" />
                          <AvatarFallback className="text-lg font-mono font-bold rounded-lg">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </div>
                      
                      {/* Shield check */}
                      <div className="absolute z-10 cyber-check-pop">
                        <div className="w-10 h-10 rounded-sm flex items-center justify-center"
                          style={{ 
                            background: 'hsl(var(--primary))',
                            boxShadow: '0 0 20px hsl(var(--primary) / 0.5)',
                          }}
                        >
                          <Check className="h-5 w-5 text-primary-foreground" strokeWidth={3} />
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-center z-10 cyber-phase-text">
                      <h3 className="text-lg font-bold font-mono tracking-wider" style={{ color: 'hsl(var(--primary))' }}>
                        LINK ESTABLISHED
                      </h3>
                      <p className="text-muted-foreground mt-1 text-xs font-mono">
                        {foundUser?.display_name || foundUser?.username} synced
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-3 text-primary/70 cyber-phase-buttons">
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-mono tracking-wider">OPENING CHANNEL...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}
