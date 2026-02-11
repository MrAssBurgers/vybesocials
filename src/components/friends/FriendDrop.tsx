import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, QrCode, Camera, 
  ArrowLeftRight, Heart, Copy, Share2, ScanLine, Sparkles, Nfc, Smartphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync, FriendDrop as FriendDropType } from '@/hooks/useFriendDropSync';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import { useNFC } from '@/hooks/useNFC';
import { useNativeFriendDrop } from '@/hooks/useNativeFriendDrop';

interface FriendDropProps {
  variant?: 'button' | 'icon' | 'banner';
}

type DropPhase = 'idle' | 'scanning' | 'detected' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

const smoothSpring = { type: "spring" as const, stiffness: 400, damping: 30 };
const gentleSpring = { type: "spring" as const, stiffness: 300, damping: 26 };

// --- Main idle screen: QR + Scanner side by side ---
function MainScreen({
  profile,
  qrCodeUrl,
  wasScanned,
  onStartScan,
  onCopy,
  onShare,
  videoRef,
  canvasRef,
  isScanning,
  onStopScan,
  nfcActive,
  nfcSupported,
}: {
  profile: any;
  qrCodeUrl: string;
  wasScanned: boolean;
  onStartScan: () => void;
  onCopy: () => void;
  onShare: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isScanning: boolean;
  onStopScan: () => void;
  nfcActive: boolean;
  nfcSupported: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-5 py-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <VybeMiniIcon size={22} animated showSparkles />
        <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          FriendDrop
        </h3>
        <VybeMiniIcon size={22} animated showSparkles />
      </div>

      {/* Scanned indicator */}
      <AnimatePresence>
        {wasScanned && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25"
          >
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-500 font-medium">Someone scanned your code!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column: QR code + Scanner — equal size */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {/* Left: QR Code Card */}
        <motion.div
          className="rounded-2xl overflow-hidden relative aspect-square"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ ...gentleSpring, delay: 0.05 }}
          style={{ boxShadow: '0 4px 24px hsl(var(--primary) / 0.15)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-accent" />
          {/* Removed shimmer animation for performance */}
          <div className="relative w-full h-full p-3 flex flex-col items-center justify-between">
            {/* Mini avatar + name */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Avatar className="h-5 w-5 border border-white/40">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="text-[8px] bg-white/20 text-white">
                  {profile?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-white/90 text-[10px] font-medium truncate max-w-[70px]">
                @{profile?.username?.trim()}
              </span>
            </div>
            
            {/* QR Code — fills remaining space */}
            <div className="flex-1 w-full flex items-center justify-center py-1.5">
              <div className="w-full aspect-square rounded-xl bg-white p-2 relative z-10">
                <img
                  src={qrCodeUrl}
                  alt="Your QR Code"
                  className="w-full h-full rounded-md"
                  style={{ imageRendering: 'crisp-edges' }}
                />
                {/* Center avatar overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-white shadow-sm bg-white">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-bold text-[8px]">
                        {profile?.username?.[0]?.toUpperCase() || 'V'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Share row */}
            <div className="flex gap-1 shrink-0">
              <button onClick={onCopy} className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[9px]">
                <Copy className="h-2.5 w-2.5" /> Copy
              </button>
              <button onClick={onShare} className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[9px]">
                <Share2 className="h-2.5 w-2.5" /> Share
              </button>
            </div>
          </div>
        </motion.div>

        {/* Right: Scanner — same size as QR */}
        <motion.div
          className="rounded-2xl overflow-hidden relative aspect-square border border-border/40 bg-card/30 backdrop-blur-sm"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ ...gentleSpring, delay: 0.1 }}
        >
          {isScanning ? (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Scanner overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/20" />
                {/* Corner brackets */}
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="absolute w-6 h-6"
                    style={{
                      top: i < 2 ? 10 : 'auto',
                      bottom: i >= 2 ? 10 : 'auto',
                      left: i % 2 === 0 ? 10 : 'auto',
                      right: i % 2 === 1 ? 10 : 'auto',
                    }}
                  >
                    <div 
                      className="w-full h-full border-primary"
                      style={{
                        borderTopWidth: i < 2 ? 2 : 0,
                        borderBottomWidth: i >= 2 ? 2 : 0,
                        borderLeftWidth: i % 2 === 0 ? 2 : 0,
                        borderRightWidth: i % 2 === 1 ? 2 : 0,
                        borderTopLeftRadius: i === 0 ? 8 : 0,
                        borderTopRightRadius: i === 1 ? 8 : 0,
                        borderBottomLeftRadius: i === 2 ? 8 : 0,
                        borderBottomRightRadius: i === 3 ? 8 : 0,
                      }}
                    />
                  </div>
                ))}
                {/* Scan line */}
                <motion.div
                  className="absolute left-3 right-3 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-primary/70 to-transparent"
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                />
              </div>
              <button
                onClick={onStopScan}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 backdrop-blur text-white text-[10px] font-medium hover:bg-black/70 transition-colors z-10"
              >
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={onStartScan}
              className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 hover:bg-accent/5 transition-colors"
            >
              <motion.div
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 border border-primary/20 flex items-center justify-center"
              >
                <Camera className="h-6 w-6 text-primary" />
              </motion.div>
              <div className="text-center">
                <p className="text-xs font-semibold text-foreground">Scan Code</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Tap to open camera</p>
              </div>
            </button>
          )}
        </motion.div>
      </div>

      {/* NFC status + hint */}
      {nfcSupported ? (
        <div className="flex items-center gap-1.5 text-[10px]">
          <Nfc className={`h-3.5 w-3.5 ${nfcActive ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          <span className={nfcActive ? 'text-primary font-medium' : 'text-muted-foreground'}>
            {nfcActive ? 'NFC active — tap phones together' : 'NFC available'}
          </span>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center">
          Show your code or scan a friend's to connect
        </p>
      )}
    </motion.div>
  );
}

// --- Detected Phase ---
function DetectedPhase() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-6 py-16"
    >
        <motion.div
          className="relative"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...smoothSpring, bounce: 0.3 }}
        >
        <motion.div
          className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl"
          animate={{ 
            boxShadow: [
              '0 0 20px hsl(var(--primary) / 0.3)',
              '0 0 45px hsl(var(--primary) / 0.5)',
              '0 0 20px hsl(var(--primary) / 0.3)',
            ]
          }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Check className="h-10 w-10 text-primary-foreground" />
        </motion.div>

        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/30"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.7, ease: "easeOut" }}
          />
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-base font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
      >
        Code Detected
      </motion.p>
    </motion.div>
  );
}

// --- Found Phase ---
function FoundPhase({
  foundUser,
  onCancel,
  onAdd,
  isPending,
}: {
  foundUser: FoundUser;
  onCancel: () => void;
  onAdd: () => void;
  isPending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center gap-5 py-6"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={gentleSpring}
        className="relative"
      >
        <motion.div 
          className="absolute -inset-4 rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
        />
        <Avatar className="h-24 w-24 border-[3px] border-primary/30 relative shadow-lg">
          <AvatarImage src={foundUser.avatar_url || undefined} />
          <AvatarFallback className="text-2xl bg-primary/10 text-primary">
            {foundUser.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-center space-y-1"
      >
        <h3 className="text-xl font-bold">
          {foundUser.display_name || foundUser.username}
        </h3>
        <p className="text-muted-foreground text-sm">@{foundUser.username?.trim()}</p>
        {foundUser.bio && (
          <p className="text-sm text-muted-foreground/80 max-w-[240px] mt-2 line-clamp-2">{foundUser.bio}</p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="flex gap-3"
      >
        <Button variant="outline" onClick={onCancel} className="rounded-xl px-5">
          Cancel
        </Button>
        <Button onClick={onAdd} className="rounded-xl px-5 gap-2" disabled={isPending}>
          <UserPlus className="h-4 w-4" />
          Add Friend
        </Button>
      </motion.div>
    </motion.div>
  );
}

// --- Exchanging Phase ---
function ExchangingPhase({
  myAvatar,
  myUsername,
  theirAvatar,
  theirUsername,
}: {
  myAvatar?: string | null;
  myUsername?: string | null;
  theirAvatar?: string | null;
  theirUsername?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-8 py-14"
    >
      <div className="relative flex items-center gap-5">
        <motion.div
          animate={{ x: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <Avatar className="border-[3px] border-primary/30 shadow-lg" style={{ width: 68, height: 68 }}>
            <AvatarImage src={myAvatar || undefined} />
            <AvatarFallback className="text-lg">{myUsername?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>

        {/* Themed VYBE icon instead of heart */}
        <motion.div
          animate={{ scale: [0.9, 1.1, 0.9], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        >
          <VybeMiniIcon size={28} animated showSparkles />
        </motion.div>

        <motion.div
          animate={{ x: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <Avatar className="border-[3px] border-accent/30 shadow-lg" style={{ width: 68, height: 68 }}>
            <AvatarImage src={theirAvatar || undefined} />
            <AvatarFallback className="text-lg">{theirUsername?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>
      </div>

      <motion.p
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="text-muted-foreground font-medium"
      >
        Connecting...
      </motion.p>
    </motion.div>
  );
}

// --- Success Phase - themed to user's VYBE colors ---
function SuccessPhase({ foundUser }: { foundUser: FoundUser | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-6 py-10 relative overflow-hidden"
    >
      {/* Themed background glow */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.08) 0%, transparent 70%)',
        }}
      />

      {/* Big VYBE checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...smoothSpring, delay: 0.1, bounce: 0.35 }}
        className="relative"
      >
        <motion.div
          className="w-24 h-24 rounded-full flex items-center justify-center relative"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
          }}
          animate={{
            boxShadow: [
              '0 0 25px hsl(var(--primary) / 0.3)',
              '0 0 50px hsl(var(--primary) / 0.45)',
              '0 0 25px hsl(var(--primary) / 0.3)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        >
          <Check className="h-10 w-10 text-primary-foreground" />
        </motion.div>

        {/* Themed confetti particles - reduced count */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
              top: '50%',
              left: '50%',
            }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1.2, 0],
              x: Math.cos((i * Math.PI * 2) / 6) * 65,
              y: Math.sin((i * Math.PI * 2) / 6) * 65,
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.7, delay: 0.15 + i * 0.04 }}
          />
        ))}
        
        {/* Sparkle ring */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={`ring-${i}`}
            className="absolute inset-0 rounded-full"
            style={{ border: '1.5px solid hsl(var(--primary) / 0.3)' }}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 1.5, delay: 0.2 + i * 0.4, ease: "easeOut" }}
          />
        ))}
      </motion.div>

      {/* Friend info */}
      {foundUser && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex items-center gap-3"
        >
          <Avatar className="h-10 w-10 border-2 border-primary/20">
            <AvatarImage src={foundUser.avatar_url || undefined} />
            <AvatarFallback className="text-sm bg-primary/10 text-primary">
              {foundUser.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm">{foundUser.display_name || foundUser.username}</p>
            <p className="text-xs text-muted-foreground">@{foundUser.username}</p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-center"
      >
        <h3 className="text-lg font-bold flex items-center gap-2 justify-center">
          <VybeMiniIcon size={18} animated showSparkles />
          Friend Added!
          <VybeMiniIcon size={18} animated showSparkles />
        </h3>
        <p className="text-muted-foreground text-sm mt-1">You can now message each other</p>
      </motion.div>
    </motion.div>
  );
}


// ===== MAIN COMPONENT =====
export function FriendDrop({ variant = 'button' }: FriendDropProps) {
  const { user, profile } = useAuth();
  const sendRequest = useSendFriendRequest();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<DropPhase>('idle');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [wasScanned, setWasScanned] = useState(false);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [nfcActive, setNfcActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // NFC integration
  const { hasWebNFC, isSupported: nfcSupported, shareProfile: nfcShareProfile, stopScan: nfcStopScan } = useNFC();
  const nativeFriendDrop = useNativeFriendDrop();

  const fetchUser = async (userId: string): Promise<FoundUser | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch {
      return null;
    }
  };

  const friendDropSync = useFriendDropSync({
    enabled: isOpen,
    onScanned: useCallback((drop) => {
      setWasScanned(true);
      haptics.success();
      if (drop.to_user_id) {
        fetchUser(drop.to_user_id).then((scannedUser) => {
          if (scannedUser) {
            setFoundUser(scannedUser);
            setPhase('found');
          }
        });
      }
    }, []),
    onConfirmed: useCallback(() => {
      setPhase('exchanging');
      haptics.impact();
    }, []),
    onCompleted: useCallback(() => {
      setPhase('success');
      haptics.success();
    }, []),
  });
  
  const myProfileUrl = activeDropId 
    ? `https://vybehub.app/friend-drop/${activeDropId}`
    : profile?.username 
      ? `https://vybehub.app/add-friend/${user?.id}`
      : '';
  
  const qrCodeUrl = myProfileUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(myProfileUrl)}&bgcolor=ffffff&color=000000&format=svg&ecc=H&margin=2`
    : '';

  const stopScanning = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsScanning(false);
  }, []);

  const handleDropScan = useCallback(async (dropId: string) => {
    stopScanning();
    haptics.success();
    setPhase('detected');

    const scannedDrop = await friendDropSync.scanDrop(dropId);
    if (!scannedDrop) {
      toast.error('This code has expired');
      setPhase('idle');
      return;
    }

    setActiveDropId(dropId);

    if (scannedDrop.from_user_id) {
      setTimeout(async () => {
        const ownerProfile = await fetchUser(scannedDrop.from_user_id);
        if (ownerProfile) {
          setFoundUser(ownerProfile);
          setPhase('found');
        }
      }, 1000);
    }
  }, [friendDropSync, stopScanning]);

  const handleOpen = useCallback(async () => {
    if (!profile?.username) {
      toast.error('Complete your profile first');
      return;
    }
    setIsOpen(true);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setIsScanning(false);
    
    const drop = await friendDropSync.createDrop();
    if (drop) {
      setActiveDropId(drop.id);
    }
  }, [profile?.username, friendDropSync]);

  const startScanning = useCallback(async () => {
    setIsScanning(true);
    haptics.tap();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

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
          inversionAttempts: 'dontInvert',
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
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Could not access camera');
      setIsScanning(false);
    }
  }, [user?.id, handleDropScan]);

  const handleFoundUser = useCallback(async (userId: string) => {
    stopScanning();
    haptics.success();
    setPhase('detected');

    setTimeout(async () => {
      const userData = await fetchUser(userId);
      if (userData) {
        setFoundUser(userData);
        setPhase('found');
        haptics.impact();
      } else {
        toast.error('Could not find user');
        setPhase('idle');
      }
    }, 1200);
  }, [stopScanning]);

  // Auto-start NFC when dialog opens
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    
    let cancelled = false;
    const startNFC = async () => {
      try {
        if (hasWebNFC) {
          const started = await nfcShareProfile(user.id, async (theirUserId) => {
            if (theirUserId !== user.id) {
              handleFoundUser(theirUserId);
            }
          });
          if (started && !cancelled) setNfcActive(true);
        }
        if (nativeFriendDrop.isAvailable) {
          await nativeFriendDrop.startSession();
          if (!cancelled) setNfcActive(true);
        }
      } catch (e) {
        console.log('[FriendDrop] NFC auto-start failed:', e);
      }
    };
    
    startNFC();
    return () => { cancelled = true; };
  }, [isOpen, user?.id, hasWebNFC, nfcShareProfile, nativeFriendDrop, handleFoundUser]);

  const handleAddFriend = useCallback(async () => {
    if (!foundUser) return;

    setPhase('exchanging');
    haptics.impact();

    if (activeDropId) {
      await friendDropSync.confirmDrop(activeDropId);
    }

    try {
      await sendRequest.mutateAsync(foundUser.id);
      
      if (activeDropId) {
        await friendDropSync.completeDrop(activeDropId);
      }
      
      setPhase('success');
      haptics.success();
      
      setTimeout(() => handleClose(), 2500);
    } catch (error: any) {
      if (error?.message?.includes('already')) {
        toast.info('Already friends or request pending!');
        setPhase('success');
        setTimeout(handleClose, 1500);
      } else {
        toast.error('Failed to send request');
        setPhase('found');
      }
    }
  }, [foundUser, sendRequest, activeDropId, friendDropSync]);

  const handleClose = useCallback(async () => {
    stopScanning();
    nfcStopScan();
    if (nativeFriendDrop.isAvailable) {
      await nativeFriendDrop.stopSession();
    }
    setNfcActive(false);
    if (activeDropId) {
      await friendDropSync.cancelDrop(activeDropId);
    }
    setIsOpen(false);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setActiveDropId(null);
    setIsScanning(false);
  }, [stopScanning, activeDropId, friendDropSync, nfcStopScan, nativeFriendDrop]);

  useEffect(() => {
    return () => { stopScanning(); };
  }, [stopScanning]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(myProfileUrl);
    toast.success('Link copied!');
    haptics.tap();
  }, [myProfileUrl]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Add me on VYBE!', text: 'Add me as a friend on VYBE', url: myProfileUrl });
      } catch { copyLink(); }
    } else { copyLink(); }
  }, [myProfileUrl, copyLink]);

  const renderContent = () => {
    switch (phase) {
      case 'idle':
      case 'scanning':
        return (
          <MainScreen
            key="main"
            profile={profile}
            qrCodeUrl={qrCodeUrl}
            wasScanned={wasScanned}
            onStartScan={startScanning}
            onCopy={copyLink}
            onShare={shareLink}
            videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>}
            isScanning={isScanning}
            onStopScan={stopScanning}
            nfcActive={nfcActive}
            nfcSupported={nfcSupported || nativeFriendDrop.isAvailable}
          />
        );
      case 'detected':
        return <DetectedPhase key="detected" />;
      case 'found':
        return foundUser ? (
          <FoundPhase
            key="found"
            foundUser={foundUser}
            onCancel={() => { setFoundUser(null); setPhase('idle'); }}
            onAdd={handleAddFriend}
            isPending={sendRequest.isPending}
          />
        ) : null;
      case 'exchanging':
        return (
          <ExchangingPhase
            key="exchanging"
            myAvatar={profile?.avatar_url}
            myUsername={profile?.username}
            theirAvatar={foundUser?.avatar_url}
            theirUsername={foundUser?.username}
          />
        );
      case 'success':
        return <SuccessPhase key="success" foundUser={foundUser} />;
      default:
        return null;
    }
  };

  const renderTrigger = () => {
    switch (variant) {
      case 'icon':
        return (
          <Button variant="ghost" size="icon" onClick={handleOpen}>
            <UserPlus className="h-5 w-5" />
          </Button>
        );
      case 'banner':
        return (
          <motion.button
            onClick={handleOpen}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 flex items-center gap-4"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <ArrowLeftRight className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="text-left">
              <h4 className="font-semibold">FriendDrop</h4>
              <p className="text-sm text-muted-foreground">Add friends instantly with QR</p>
            </div>
            <Sparkles className="ml-auto h-5 w-5 text-primary shrink-0" />
          </motion.button>
        );
      default:
        return (
          <Button onClick={handleOpen} className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            FriendDrop
          </Button>
        );
    }
  };

  return (
    <>
      {renderTrigger()}

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[420px] p-0 border-0 bg-transparent shadow-none rounded-3xl overflow-visible [&>button]:hidden">
          {/* Wallet container */}
          <motion.div
            className="relative w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {/* Wallet back layer - appears first */}
            <motion.div
              className="absolute -bottom-4 left-1/2 w-[90%] h-8 rounded-b-2xl"
              style={{ 
                x: '-50%',
                background: 'linear-gradient(to bottom, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.03))',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))',
              }}
              initial={{ opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.05, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              className="absolute -bottom-6 left-1/2 w-[80%] h-6 rounded-b-xl"
              style={{ 
                x: '-50%',
                background: 'linear-gradient(to bottom, hsl(var(--primary) / 0.06), transparent)',
              }}
              initial={{ opacity: 0, scaleX: 0.4 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.1, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Card sliding up out of wallet */}
            <motion.div
              className="relative rounded-3xl bg-background/95 backdrop-blur-xl p-5 overflow-hidden will-change-transform"
              initial={{ y: 100, scaleX: 0.9, scaleY: 0.6, opacity: 0 }}
              animate={{ y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 32,
                opacity: { duration: 0.12 },
              }}
              style={{
                transformOrigin: 'bottom center',
                boxShadow: '0 -2px 30px hsl(var(--primary) / 0.08), 0 16px 48px rgba(0,0,0,0.12)',
              }}
            >
              {/* Top edge gleam */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
              />

              <AnimatePresence mode="wait">
                {renderContent()}
              </AnimatePresence>

              {phase !== 'success' && phase !== 'exchanging' && phase !== 'detected' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="absolute top-3 right-3 h-8 w-8 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </motion.div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}
