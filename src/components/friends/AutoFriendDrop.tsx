import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, Smartphone, QrCode, Nfc, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const sendRequest = useSendFriendRequest();
  const createConversation = useCreateConversation();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('qr');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startScanLoopRef = useRef<() => void>(() => {});
  const createdConversationIdRef = useRef<string | null>(null);

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch { return null; }
  };

  const autoCloseAfterSuccess = useCallback(async (friendId?: string) => {
    const targetUserId = friendId || foundUser?.id;
    if (targetUserId) {
      try {
        const conversation = await createConversation.mutateAsync({ memberIds: [targetUserId] });
        createdConversationIdRef.current = conversation.id;
      } catch {}
    }
    setTimeout(() => {
      const convId = createdConversationIdRef.current;
      setIsActive(false);
      setPhase('idle');
      setFoundUser(null);
      setActiveDropId(null);
      createdConversationIdRef.current = null;
      if (convId) navigate(`/messages/${convId}`);
    }, 3000);
  }, [foundUser?.id, createConversation, navigate]);

  const handleOnScanned = useCallback((drop: any) => {
    haptics.success();
    if (drop.to_user_id) {
      fetchUser(drop.to_user_id).then((scannedUser) => {
        if (scannedUser) {
          setFoundUser(scannedUser);
          setPhase('exchanging');
          setTimeout(async () => {
            try { await sendRequest.mutateAsync(scannedUser.id); } catch {}
            if (activeDropId) await friendDropSync.completeDrop(activeDropId);
          }, 1500);
        }
      });
    }
  }, [activeDropId, sendRequest]);

  const handleOnConfirmed = useCallback(() => {
    if (phase !== 'exchanging') { setPhase('exchanging'); haptics.impact(); }
  }, [phase]);

  const handleOnCompleted = useCallback(async () => {
    setPhase('success');
    haptics.success();
    autoCloseAfterSuccess();
  }, [autoCloseAfterSuccess]);

  const friendDropSync = useFriendDropSync({
    enabled: isActive,
    onScanned: handleOnScanned,
    onConfirmed: handleOnConfirmed,
    onCompleted: handleOnCompleted,
  });

  const nativeFriendDrop = useNativeFriendDrop({
    enabled: isActive && activeTab === 'nfc',
    onPeerFound: (peer) => {
      setFoundUser({ id: peer.userId, username: peer.username, display_name: peer.displayName, avatar_url: peer.avatarUrl });
      setPhase('found');
      stopScanning();
    },
    onPeerConnected: (peer) => handleAutoAdd(peer.userId),
  });

  const primaryHex = getPrimaryHex();
  const myProfileUrl = activeDropId
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username ? `https://vybehub.app/add-friend/${user?.id}` : '';
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
      autoCloseAfterSuccess(userId);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        setPhase('success');
        autoCloseAfterSuccess(userId);
      }
    }
  }, [phase, sendRequest, autoCloseAfterSuccess]);

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();
    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) { toast.error('This code has expired'); return; }
    setActiveDropId(dropId);
    if (scannedDrop.from_user_id) {
      const ownerProfile = await fetchUser(scannedDrop.from_user_id);
      if (ownerProfile) { setFoundUser(ownerProfile); setPhase('exchanging'); }
    }
  }, [friendDropSync, stopScanning]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('found');
    try {
      const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', userId).single();
      if (error) throw error;
      setFoundUser(data);
    } catch { toast.error('Could not find user'); handleClose(); }
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
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code) {
        const url = code.data;
        const dropMatch = url?.match(/\/friend-drop\/([a-zA-Z0-9-]+)/);
        if (dropMatch) { await handleDropScan(dropMatch[1]); return; }
        const userMatch = url?.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
        if (userMatch && userMatch[1] !== user?.id) { handleFoundUser(userMatch[1]); return; }
      }
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };
    scanFrame();
  }, [user?.id, handleDropScan, handleFoundUser]);

  startScanLoopRef.current = startScanLoop;

  const startCamera = useCallback(async () => {
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
      console.warn('[FriendLink] Camera access failed:', err);
    }
  }, []);

  const handleBump = useCallback(async () => {
    if (!profile?.username || !user) return;
    setIsActive(true);
    haptics.impact();
    setPhase('activated');
    setTimeout(() => haptics.success(), 300);
    friendDropSync.createDrop().then((drop) => { if (drop) setActiveDropId(drop.id); });
    // Start camera after entrance animation
    setTimeout(startCamera, 350);
  }, [profile?.username, user, friendDropSync, startCamera]);

  useSwingDetection({
    enabled: !isActive && !!profile?.username,
    threshold: 6,
    swingWindow: 500,
    cooldown: 3000,
    onSwing: handleBump,
  });

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;
    setPhase('exchanging');
    haptics.impact();
    try { if (activeDropId) await friendDropSync.confirmDrop(activeDropId); } catch {}
    try {
      await sendRequest.mutateAsync(foundUser.id);
      try { if (activeDropId) await friendDropSync.completeDrop(activeDropId); } catch {}
      if (!activeDropId) { setPhase('success'); haptics.success(); autoCloseAfterSuccess(); }
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        try { if (activeDropId) await friendDropSync.completeDrop(activeDropId); } catch { setPhase('success'); autoCloseAfterSuccess(); }
      } else { toast.error('Failed to send request'); setPhase('found'); }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync, autoCloseAfterSuccess]);

  const handleClose = useCallback(async () => {
    stopScanning();
    if (activeDropId && phase !== 'success') await friendDropSync.cancelDrop(activeDropId);
    if (nativeFriendDrop.isActive) await nativeFriendDrop.stopSession();
    setIsActive(false);
    setPhase('idle');
    setFoundUser(null);
    setActiveDropId(null);
  }, [stopScanning, nativeFriendDrop, activeDropId, friendDropSync, phase]);

  useEffect(() => { return () => { stopScanning(); }; }, [stopScanning]);

  // Start NFC when switching to NFC tab
  useEffect(() => {
    if (isActive && activeTab === 'nfc' && nativeFriendDrop.isAvailable && !nativeFriendDrop.isActive) {
      nativeFriendDrop.startSession();
    }
  }, [isActive, activeTab, nativeFriendDrop]);

  if (!profile?.username) return null;

  return (
    <>
      {/* Floating pill — tap to open */}
      {!isActive && isMobile && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
          <button
            onClick={handleBump}
            className="group relative flex items-center gap-2.5 px-5 py-3 rounded-full active:scale-[0.95] transition-all duration-200"
          >
            {/* Animated gradient border */}
            <span className="absolute inset-0 rounded-full seamless-gradient-strip opacity-80" />
            {/* Inner fill */}
            <span className="absolute inset-[1.5px] rounded-full bg-card/95 backdrop-blur-xl" />
            {/* Glow */}
            <span className="absolute inset-0 rounded-full bg-primary/10 blur-lg group-hover:bg-primary/20 transition-colors" />
            {/* Content */}
            <QrCode className="relative z-10 h-4 w-4 text-primary" />
            <span className="relative z-10 text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Friend Link
            </span>
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full border border-primary/30 animate-ping opacity-20" />
          </button>
        </div>
      )}

      {/* Bottom sheet — anchored above the bottom nav */}
      {isActive && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={handleClose}
          />
          <div
            className="fixed inset-x-0 mx-auto w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border/40 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300"
            style={{
              zIndex: 9999,
              bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
              maxHeight: '85vh',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
              <h2 className="text-base font-semibold text-foreground">Friend Link</h2>
              <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>


            {/* Phases: found / exchanging / success override tabs */}
            {phase === 'found' && foundUser && (
              <div className="p-6 flex flex-col items-center gap-4 animate-in fade-in duration-200">
                <Avatar className="h-24 w-24 ring-4 ring-primary/20">
                  <AvatarImage src={foundUser.avatar_url || ''} />
                  <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                    {foundUser.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <h3 className="text-lg font-bold">{foundUser.display_name || foundUser.username}</h3>
                  <p className="text-sm text-muted-foreground">@{foundUser.username}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <Button variant="outline" className="flex-1 rounded-full" onClick={handleClose}>Cancel</Button>
                  <Button className="flex-1 rounded-full gap-1.5" onClick={handleAddFriend}>
                    <Check className="h-4 w-4" /> Add Friend
                  </Button>
                </div>
              </div>
            )}

            {phase === 'exchanging' && (
              <div className="p-8 flex flex-col items-center gap-4 animate-in fade-in duration-200" style={{ minHeight: 260 }}>
                <div className="relative flex items-center justify-center">
                  <Avatar className="h-16 w-16 -mr-3 ring-2 ring-card z-10">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Avatar className="h-16 w-16 -ml-3 ring-2 ring-card">
                    <AvatarImage src={foundUser?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary animate-pulse">Adding friend...</p>
                  <p className="text-xs text-muted-foreground mt-1">{foundUser?.display_name || foundUser?.username}</p>
                </div>
              </div>
            )}

            {phase === 'success' && (
              <div className="p-8 flex flex-col items-center gap-4 animate-in fade-in duration-200" style={{ minHeight: 260 }}>
                <div className="relative flex items-center justify-center">
                  <Avatar className="h-14 w-14 -mr-2 ring-2 ring-card z-10">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center -mx-1 z-20 ring-2 ring-card">
                    <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />
                  </div>
                  <Avatar className="h-14 w-14 -ml-2 ring-2 ring-card">
                    <AvatarImage src={foundUser?.avatar_url || ''} />
                    <AvatarFallback className="font-bold">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold text-primary">Friend Added!</h3>
                  <p className="text-xs text-muted-foreground mt-1">{foundUser?.display_name || foundUser?.username}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span className="text-[11px]">Opening chat...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tabbed scanner — only show during activated phase */}
            {phase === 'activated' && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pb-4">
                <TabsList className="w-full mb-3">
                  <TabsTrigger value="qr" className="flex-1 gap-1.5 text-xs">
                    <QrCode className="h-3.5 w-3.5" /> QR Code
                  </TabsTrigger>
                  <TabsTrigger value="nfc" className="flex-1 gap-1.5 text-xs">
                    <Nfc className="h-3.5 w-3.5" /> NFC
                  </TabsTrigger>
                </TabsList>

                {/* QR Tab */}
                <TabsContent value="qr" className="space-y-3">
                  {/* My QR code */}
                  <div className="flex flex-col items-center p-4 bg-white rounded-xl">
                    <div className="relative">
                      <img src={qrCodeUrl} alt="My QR Code" className="w-48 h-48" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-lg bg-white border-2 border-primary/20 overflow-hidden shadow-sm">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold">
                              {profile?.username?.[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-black/60 mt-2 font-medium">@{profile?.username}</p>
                  </div>

                  {/* Scanner */}
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/5 border border-border/40">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />
                    {/* Corner brackets */}
                    <div className="absolute inset-0 pointer-events-none p-3">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="absolute w-5 h-5"
                          style={{
                            top: i < 2 ? 12 : 'auto',
                            bottom: i >= 2 ? 12 : 'auto',
                            left: i % 2 === 0 ? 12 : 'auto',
                            right: i % 2 === 1 ? 12 : 'auto',
                            borderColor: 'hsl(var(--primary))',
                            borderTopWidth: i < 2 ? 3 : 0,
                            borderBottomWidth: i >= 2 ? 3 : 0,
                            borderLeftWidth: i % 2 === 0 ? 3 : 0,
                            borderRightWidth: i % 2 === 1 ? 3 : 0,
                            borderRadius: 2,
                          }}
                        />
                      ))}
                    </div>
                    <div className="absolute bottom-3 left-0 right-0 text-center">
                      <span className="text-[11px] text-white/80 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                        Point at a friend's QR code
                      </span>
                    </div>
                  </div>
                </TabsContent>

                {/* NFC Tab */}
                <TabsContent value="nfc" className="space-y-3">
                  <div className="flex flex-col items-center py-8 gap-4">
                    {/* Phone illustration */}
                    <div className="relative">
                      <div className="flex items-center gap-1">
                        <Smartphone className="h-16 w-16 text-primary/40 -rotate-12 transition-transform" />
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-ping" />
                          <div className="w-1 h-1 rounded-full bg-primary/40 animate-ping" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-ping" style={{ animationDelay: '300ms' }} />
                        </div>
                        <Smartphone className="h-16 w-16 text-primary/40 rotate-12 transition-transform" />
                      </div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-sm font-semibold text-foreground">Hold phones together</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {nativeFriendDrop.isAvailable
                          ? 'NFC is ready — tap phones to connect'
                          : 'NFC is not available on this device'}
                      </p>
                    </div>

                    {/* Nearby peers */}
                    {nativeFriendDrop.nearbyPeers.length > 0 && (
                      <div className="w-full space-y-1.5">
                        <p className="text-[11px] text-muted-foreground font-medium px-1">Nearby</p>
                        {nativeFriendDrop.nearbyPeers.map((peer) => (
                          <button
                            key={peer.peerId}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/40 hover:bg-muted/40 transition-colors"
                            onClick={() => {
                              setFoundUser({ id: peer.userId, username: peer.username, display_name: peer.displayName, avatar_url: peer.avatarUrl });
                              setPhase('found');
                            }}
                          >
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={peer.avatarUrl || ''} />
                              <AvatarFallback className="text-sm font-semibold">{peer.username[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium flex-1 text-left truncate">{peer.displayName || peer.username}</span>
                            <Nfc className="h-3.5 w-3.5 text-primary" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}

          </div>
        </>
      )}
    </>
  );
}
