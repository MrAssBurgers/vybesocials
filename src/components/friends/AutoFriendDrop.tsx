import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, Smartphone, QrCode, Nfc, MessageCircle, Share2, Loader2 } from 'lucide-react';
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

/* ─── CSS-only confetti keyframes (injected once) ─── */
const CONFETTI_STYLE_ID = 'friend-link-confetti';
function ensureConfettiStyles() {
  if (document.getElementById(CONFETTI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CONFETTI_STYLE_ID;
  style.textContent = `
    @keyframes fl-confetti {
      0% { transform: translate(0,0) scale(1); opacity:1; }
      100% { transform: translate(var(--cx), var(--cy)) scale(0); opacity:0; }
    }
    @keyframes fl-scan-line {
      0% { top: 8%; }
      50% { top: 88%; }
      100% { top: 8%; }
    }
    @keyframes fl-ring-pulse {
      0% { transform: scale(0.7); opacity:0.6; }
      100% { transform: scale(2.2); opacity:0; }
    }
    @keyframes fl-phone-slide-l {
      0%,100% { transform: translateX(0) rotate(-12deg); }
      50% { transform: translateX(12px) rotate(-4deg); }
    }
    @keyframes fl-phone-slide-r {
      0%,100% { transform: translateX(0) rotate(12deg); }
      50% { transform: translateX(-12px) rotate(4deg); }
    }
    @keyframes fl-avatar-glow {
      0%,100% { box-shadow: 0 0 0 0 hsl(var(--primary)/0.3); }
      50% { box-shadow: 0 0 20px 6px hsl(var(--primary)/0.15); }
    }
    @keyframes fl-spin-ring {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes fl-check-bounce {
      0% { transform: scale(0); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

const CONFETTI_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  '#FF6B6B',
  '#4ECDC4',
  '#FFE66D',
  '#A78BFA',
  '#F472B6',
  '#34D399',
];

function ConfettiBurst() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {CONFETTI_COLORS.map((color, i) => {
        const angle = (i / CONFETTI_COLORS.length) * 360;
        const dist = 60 + Math.random() * 40;
        const cx = `${Math.cos((angle * Math.PI) / 180) * dist}px`;
        const cy = `${Math.sin((angle * Math.PI) / 180) * dist}px`;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
            style={{
              background: color,
              '--cx': cx,
              '--cy': cy,
              animation: 'fl-confetti 0.7s ease-out forwards',
              animationDelay: `${i * 40}ms`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

export function AutoFriendDrop() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const sendRequest = useSendFriendRequest();
  const createConversation = useCreateConversation();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('qr');
  const [qrLoaded, setQrLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startScanLoopRef = useRef<() => void>(() => {});
  const createdConversationIdRef = useRef<string | null>(null);

  useEffect(() => { ensureConfettiStyles(); }, []);

  // ─── Data helpers ───
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

  // ─── Drop sync handlers ───
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

  // ─── QR URL ───
  const primaryHex = getPrimaryHex();
  const myProfileUrl = activeDropId
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username ? `https://vybehub.app/add-friend/${user?.id}` : '';
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=${primaryHex}&format=svg&ecc=H&margin=2`
    : '';

  // ─── Actions ───
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
    setCameraReady(false);
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
      if (!cameraReady) setCameraReady(true);
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
  }, [user?.id, handleDropScan, handleFoundUser, cameraReady]);

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
    setQrLoaded(false);
    haptics.impact();
    setPhase('activated');
    setTimeout(() => haptics.success(), 300);
    friendDropSync.createDrop().then((drop) => { if (drop) setActiveDropId(drop.id); });
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

  const handleShare = useCallback(async () => {
    if (!myProfileUrl) return;
    const shareData = { title: 'Add me on VYBE', text: `Add me on VYBE! @${profile?.username}`, url: myProfileUrl };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(myProfileUrl);
        toast.success('Link copied!');
      }
    } catch {}
  }, [myProfileUrl, profile?.username]);

  useEffect(() => { return () => { stopScanning(); }; }, [stopScanning]);

  useEffect(() => {
    if (isActive && activeTab === 'nfc' && nativeFriendDrop.isAvailable && !nativeFriendDrop.isActive) {
      nativeFriendDrop.startSession();
    }
  }, [isActive, activeTab, nativeFriendDrop]);

  if (!profile?.username) return null;

  // ─── Phase overlays ───
  const renderPhase = () => {
    if (phase === 'found' && foundUser) return (
      <div className="p-6 flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-300">
        {/* Glow behind avatar */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-accent/20 blur-xl scale-150" />
          <Avatar className="h-24 w-24 relative ring-4 ring-primary/20" style={{ animation: 'fl-avatar-glow 2s ease-in-out infinite' }}>
            <AvatarImage src={foundUser.avatar_url || ''} />
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {foundUser.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
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
    );

    if (phase === 'exchanging') return (
      <div className="p-8 flex flex-col items-center gap-5 animate-in fade-in duration-300" style={{ minHeight: 260 }}>
        <div className="relative flex items-center justify-center">
          <Avatar className="h-16 w-16 -mr-3 ring-2 ring-card z-10">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          {/* Spinning ring between avatars */}
          <div className="relative w-8 h-8 -mx-1 z-20 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/40"
              style={{ animation: 'fl-spin-ring 1s linear infinite' }}
            />
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          </div>
          <Avatar className="h-16 w-16 -ml-3 ring-2 ring-card">
            <AvatarImage src={foundUser?.avatar_url || ''} />
            <AvatarFallback className="font-bold">{foundUser?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-primary">Adding friend...</p>
          <p className="text-xs text-muted-foreground mt-1">{foundUser?.display_name || foundUser?.username}</p>
        </div>
      </div>
    );

    if (phase === 'success') return (
      <div className="relative p-8 flex flex-col items-center gap-5 animate-in fade-in duration-300" style={{ minHeight: 260 }}>
        <ConfettiBurst />
        <div className="relative flex items-center justify-center">
          <Avatar className="h-14 w-14 -mr-2 ring-2 ring-card z-10">
            <AvatarImage src={profile?.avatar_url || ''} />
            <AvatarFallback className="font-bold">{profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center -mx-1 z-20 ring-2 ring-card"
            style={{ animation: 'fl-check-bounce 0.5s ease-out' }}
          >
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
    );

    return null;
  };

  return (
    <>
      {/* Full-screen modal */}
      {isActive && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={handleClose} />

          <div className="relative z-10 w-full max-w-sm mx-auto bg-card rounded-t-3xl sm:rounded-2xl border border-border/40 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-foreground/15" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-2 pb-2">
              <h2 className="text-base font-semibold text-foreground">Friend Link</h2>
              <div className="flex items-center gap-1">
                <button onClick={handleShare} className="p-2 rounded-full hover:bg-muted/60 transition-colors" aria-label="Share">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                </button>
                <button onClick={handleClose} className="p-2 rounded-full hover:bg-muted/60 transition-colors" aria-label="Close">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Phase overlays */}
            {(phase === 'found' || phase === 'exchanging' || phase === 'success') ? renderPhase() : (
              /* Tabbed content */
              <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pb-4">
                <TabsList className="w-full mb-3">
                  <TabsTrigger value="qr" className="flex-1 gap-1.5 text-xs">
                    <QrCode className="h-3.5 w-3.5" /> QR Code
                  </TabsTrigger>
                  <TabsTrigger value="nfc" className="flex-1 gap-1.5 text-xs">
                    <Nfc className="h-3.5 w-3.5" /> NFC
                  </TabsTrigger>
                </TabsList>

                {/* ─── QR Tab ─── */}
                <TabsContent value="qr" className="space-y-3">
                  {/* Snapcode-style QR card */}
                  <div className="flex flex-col items-center p-5 rounded-2xl bg-card border border-border/40">
                    <div className="relative">
                      {/* Loading skeleton */}
                      {!qrLoaded && (
                        <div className="w-52 h-52 rounded-xl bg-muted/40 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                        </div>
                      )}
                      {/* QR image — white bg container for contrast */}
                      <div className={`bg-white rounded-xl p-2 ${!qrLoaded ? 'hidden' : ''}`}>
                        <img
                          src={qrCodeUrl}
                          alt="My QR Code"
                          className="w-48 h-48"
                          onLoad={() => setQrLoaded(true)}
                        />
                      </div>
                      {/* Avatar overlay with pulse ring */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative">
                          <div
                            className="absolute inset-0 rounded-xl"
                            style={{ animation: 'fl-avatar-glow 2.5s ease-in-out infinite' }}
                          />
                          <div className="w-11 h-11 rounded-xl bg-white border-2 border-primary/20 overflow-hidden shadow-md">
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
                    </div>
                    {/* Name */}
                    <div className="mt-3 text-center">
                      {(profile as any)?.display_name && (
                        <p className="text-sm font-semibold text-foreground">{(profile as any).display_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-medium">@{profile?.username}</p>
                    </div>
                    {/* Share button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 rounded-full gap-1.5 text-xs"
                      onClick={handleShare}
                    >
                      <Share2 className="h-3.5 w-3.5" /> Share My Code
                    </Button>
                  </div>

                  {/* Scanner */}
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black border border-border/40">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Scanning laser line */}
                    <div
                      className="absolute left-[10%] right-[10%] h-0.5 pointer-events-none z-10"
                      style={{
                        background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)',
                        animation: 'fl-scan-line 2.5s ease-in-out infinite',
                        boxShadow: '0 0 12px 2px hsl(var(--primary)/0.4)',
                      }}
                    />

                    {/* Corner brackets — larger, glowing */}
                    <div className="absolute inset-0 pointer-events-none p-3">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="absolute"
                          style={{
                            width: 28,
                            height: 28,
                            top: i < 2 ? 10 : 'auto',
                            bottom: i >= 2 ? 10 : 'auto',
                            left: i % 2 === 0 ? 10 : 'auto',
                            right: i % 2 === 1 ? 10 : 'auto',
                            borderColor: 'hsl(var(--primary))',
                            borderTopWidth: i < 2 ? 3 : 0,
                            borderBottomWidth: i >= 2 ? 3 : 0,
                            borderLeftWidth: i % 2 === 0 ? 3 : 0,
                            borderRightWidth: i % 2 === 1 ? 3 : 0,
                            borderRadius: 6,
                            filter: 'drop-shadow(0 0 4px hsl(var(--primary)/0.5))',
                          }}
                        />
                      ))}
                    </div>

                    {/* Status label */}
                    <div className="absolute bottom-3 left-0 right-0 text-center z-10">
                      <span className="text-[11px] text-white/90 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm font-medium">
                        Point at a friend's QR code
                      </span>
                    </div>
                  </div>
                </TabsContent>

                {/* ─── NFC Tab ─── */}
                <TabsContent value="nfc" className="space-y-3">
                  <div className="flex flex-col items-center py-10 gap-5">
                    {/* Animated phones + ripple rings */}
                    <div className="relative w-40 h-28 flex items-center justify-center">
                      {/* Concentric ripple rings */}
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/30"
                          style={{
                            width: 40,
                            height: 40,
                            animation: 'fl-ring-pulse 2s ease-out infinite',
                            animationDelay: `${i * 600}ms`,
                          }}
                        />
                      ))}
                      {/* Center glow dot */}
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary/50 animate-pulse z-10" />
                      {/* Left phone */}
                      <Smartphone
                        className="h-16 w-16 text-primary/60 absolute left-2"
                        style={{ animation: 'fl-phone-slide-l 3s ease-in-out infinite' }}
                      />
                      {/* Right phone */}
                      <Smartphone
                        className="h-16 w-16 text-primary/60 absolute right-2"
                        style={{ animation: 'fl-phone-slide-r 3s ease-in-out infinite' }}
                      />
                    </div>

                    <div className="text-center">
                      <h3 className="text-sm font-semibold text-foreground">Hold phones together</h3>
                      <p className="text-xs text-muted-foreground mt-1.5 max-w-[220px] mx-auto">
                        {nativeFriendDrop.isAvailable
                          ? 'NFC is ready — tap phones to connect'
                          : 'NFC is not available on this device. Use QR code instead.'}
                      </p>
                    </div>

                    {/* NFC not available info card */}
                    {!nativeFriendDrop.isAvailable && (
                      <div className="w-full p-3 rounded-xl bg-muted/30 border border-border/30">
                        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                          Your device doesn't support NFC. Switch to the <span className="font-semibold text-foreground">QR Code</span> tab to add friends instantly.
                        </p>
                      </div>
                    )}

                    {/* Nearby peers */}
                    {nativeFriendDrop.nearbyPeers.length > 0 && (
                      <div className="w-full space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <p className="text-[11px] text-muted-foreground font-medium px-1">Nearby</p>
                        {nativeFriendDrop.nearbyPeers.map((peer) => (
                          <button
                            key={peer.peerId}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/40 hover:bg-muted/40 transition-colors active:scale-[0.98]"
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

            {/* Safe area padding */}
            <div className="pb-safe" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}
    </>
  );
}
