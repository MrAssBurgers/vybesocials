import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, Sparkles, QrCode, Camera, 
  ArrowLeftRight, Heart, Copy, Share2, ScanLine
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useFriendDropSync, FriendDrop as FriendDropType } from '@/hooks/useFriendDropSync';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';
import jsQR from 'jsqr';

interface FriendDropProps {
  variant?: 'button' | 'icon' | 'banner';
}

type DropPhase = 'idle' | 'showing' | 'scanning' | 'detected' | 'found' | 'exchanging' | 'success';

interface FoundUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

// Smooth spring preset
const smoothSpring = { type: "spring" as const, stiffness: 300, damping: 28 };
const gentleSpring = { type: "spring" as const, stiffness: 200, damping: 24 };

// --- QR Code Component ---
const ProfileQR = memo(function ProfileQR({
  qrCodeUrl,
  avatarUrl,
  username,
}: {
  qrCodeUrl: string;
  avatarUrl?: string | null;
  username?: string | null;
}) {
  return (
    <motion.div
      className="relative"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={smoothSpring}
    >
      <div className="relative w-52 h-52 rounded-2xl bg-white p-3 shadow-lg shadow-primary/10">
        <img
          src={qrCodeUrl}
          alt="QR Code"
          className="w-full h-full rounded-lg"
        />
        {/* Avatar overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full overflow-hidden border-[3px] border-white shadow-md bg-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt={username || ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-bold text-sm">
                {username?.[0]?.toUpperCase() || 'V'}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// --- Pulse Ring ---
function PulseRing({ delay = 0, color = 'primary' }: { delay?: number; color?: string }) {
  return (
    <motion.div
      className={`absolute inset-0 rounded-full border-2 border-${color}`}
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: 2.2, opacity: 0 }}
      transition={{ repeat: Infinity, duration: 2, delay, ease: "easeOut" }}
    />
  );
}

// --- Idle Phase ---
function IdlePhase({ onShowProfile, onScan }: { onShowProfile: () => void; onScan: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-8 py-8"
    >
      {/* Animated icon */}
      <div className="relative">
        <motion.div
          className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/20"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        >
          <ArrowLeftRight className="h-10 w-10 text-primary-foreground" />
        </motion.div>
        <PulseRing delay={0} />
        <PulseRing delay={0.7} />
      </div>

      <div className="text-center space-y-1.5">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          FriendDrop
        </h3>
        <p className="text-muted-foreground text-sm">
          Share profiles instantly with QR
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[260px]">
        <Button onClick={onShowProfile} className="w-full gap-2 h-12 rounded-xl" size="lg">
          <QrCode className="h-5 w-5" />
          Show My Code
        </Button>
        <Button onClick={onScan} variant="outline" className="w-full gap-2 h-12 rounded-xl" size="lg">
          <Camera className="h-5 w-5" />
          Scan Code
        </Button>
      </div>
    </motion.div>
  );
}

// --- Showing Phase ---
function ShowingPhase({
  profile,
  qrCodeUrl,
  wasScanned,
  onSwitchToScanner,
  onCopy,
  onShare,
}: {
  profile: any;
  qrCodeUrl: string;
  wasScanned: boolean;
  onSwitchToScanner: () => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center gap-5 py-4"
    >
      {/* Scanned indicator */}
      <AnimatePresence>
        {wasScanned && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={smoothSpring}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 border border-emerald-500/25"
          >
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-emerald-500 font-medium">Code scanned!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile card */}
      <motion.div 
        className="relative w-[280px] rounded-3xl overflow-hidden"
        initial={{ rotateY: -15 }}
        animate={{ rotateY: 0 }}
        transition={gentleSpring}
        style={{
          boxShadow: wasScanned 
            ? '0 8px 40px rgba(16, 185, 129, 0.25)' 
            : '0 8px 40px hsl(var(--primary) / 0.2)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-accent" />
        
        {/* Subtle shimmer */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 1 }}
        />
        
        <div className="relative p-6 flex flex-col items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-white/20 blur-sm" />
            <Avatar className="h-20 w-20 border-[3px] border-white/40 relative">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="text-xl bg-white/20 text-white">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          
          <div className="text-center text-white">
            <h3 className="text-lg font-bold">{profile?.username}</h3>
            <p className="text-white/70 text-sm">@{profile?.username?.trim()}</p>
          </div>
          
          {/* QR Code */}
          <ProfileQR
            qrCodeUrl={qrCodeUrl}
            avatarUrl={profile?.avatar_url}
            username={profile?.username}
          />
          
          {/* Share actions */}
          <div className="flex gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={onCopy}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={onShare}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
          </div>
        </div>
      </motion.div>

      <Button 
        variant="ghost" 
        onClick={onSwitchToScanner}
        className="gap-2 text-muted-foreground rounded-xl"
      >
        <Camera className="h-4 w-4" />
        Switch to Scanner
      </Button>
    </motion.div>
  );
}

// --- Scanning Phase ---
function ScanningPhase({
  videoRef,
  canvasRef,
  onCancel,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center gap-5 py-4"
    >
      <div className="relative w-full max-w-[280px] aspect-square rounded-3xl overflow-hidden bg-black/90 shadow-2xl">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/40" />
          
          {/* Corner brackets */}
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute w-10 h-10"
              style={{
                top: i < 2 ? 28 : 'auto',
                bottom: i >= 2 ? 28 : 'auto',
                left: i % 2 === 0 ? 28 : 'auto',
                right: i % 2 === 1 ? 28 : 'auto',
              }}
            >
              <div 
                className="w-full h-full border-primary/80"
                style={{
                  borderTopWidth: i < 2 ? 2.5 : 0,
                  borderBottomWidth: i >= 2 ? 2.5 : 0,
                  borderLeftWidth: i % 2 === 0 ? 2.5 : 0,
                  borderRightWidth: i % 2 === 1 ? 2.5 : 0,
                  borderTopLeftRadius: i === 0 ? 14 : 0,
                  borderTopRightRadius: i === 1 ? 14 : 0,
                  borderBottomLeftRadius: i === 2 ? 14 : 0,
                  borderBottomRightRadius: i === 3 ? 14 : 0,
                }}
              />
            </div>
          ))}
          
          {/* Scan line */}
          <motion.div
            className="absolute left-7 right-7 h-[2px] rounded-full bg-gradient-to-r from-transparent via-primary/80 to-transparent"
            animate={{ top: ['25%', '75%', '25%'] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <ScanLine className="h-4 w-4" />
        Point at their code
      </p>

      <Button variant="ghost" onClick={onCancel} className="rounded-xl text-muted-foreground">
        Cancel
      </Button>
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
        transition={{ ...smoothSpring, bounce: 0.4 }}
      >
        <motion.div
          className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl"
          animate={{ 
            boxShadow: [
              '0 0 20px hsl(var(--primary) / 0.3)',
              '0 0 50px hsl(var(--primary) / 0.5)',
              '0 0 20px hsl(var(--primary) / 0.3)',
            ]
          }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Check className="h-12 w-12 text-primary-foreground" />
        </motion.div>

        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-primary/40"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-lg font-semibold text-primary"
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
      className="flex flex-col items-center gap-6 py-8"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={gentleSpring}
        className="relative"
      >
        <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-xl" />
        <Avatar className="h-24 w-24 border-[3px] border-primary/30 relative shadow-lg">
          <AvatarImage src={foundUser.avatar_url || undefined} />
          <AvatarFallback className="text-2xl bg-primary/10">
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
        <Button variant="outline" onClick={onCancel} className="rounded-xl px-6">
          Cancel
        </Button>
        <Button onClick={onAdd} className="rounded-xl px-6 gap-2" disabled={isPending}>
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
      <div className="relative flex items-center gap-6">
        <motion.div
          animate={{ x: [0, 12, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <Avatar className="h-18 w-18 border-[3px] border-primary/30 shadow-lg" style={{ width: 72, height: 72 }}>
            <AvatarImage src={myAvatar || undefined} />
            <AvatarFallback className="text-lg">{myUsername?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>

        <motion.div
          animate={{ scale: [0.9, 1.15, 0.9] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        >
          <Heart className="h-7 w-7 text-pink-500 fill-pink-500 drop-shadow-sm" />
        </motion.div>

        <motion.div
          animate={{ x: [0, -12, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <Avatar className="h-18 w-18 border-[3px] border-accent/30 shadow-lg" style={{ width: 72, height: 72 }}>
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

// --- Success Phase ---
function SuccessPhase() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-6 py-14"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...smoothSpring, delay: 0.1, bounce: 0.4 }}
        className="relative"
      >
        <motion.div
          className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl"
          animate={{
            boxShadow: [
              '0 0 30px rgba(16, 185, 129, 0.25)',
              '0 0 60px rgba(16, 185, 129, 0.4)',
              '0 0 30px rgba(16, 185, 129, 0.25)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        >
          <Check className="h-12 w-12 text-white" />
        </motion.div>

        {/* Confetti particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2.5 h-2.5 rounded-full"
            style={{
              background: i % 3 === 0 ? 'hsl(var(--primary))' : i % 3 === 1 ? 'hsl(var(--accent))' : '#10b981',
              top: '50%',
              left: '50%',
            }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1, 0.5],
              x: Math.cos((i * Math.PI) / 4) * 80,
              y: Math.sin((i * Math.PI) / 4) * 80,
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <h3 className="text-xl font-bold mb-1">Friend Added!</h3>
        <p className="text-muted-foreground text-sm">You can now message each other</p>
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
    
    const drop = await friendDropSync.createDrop();
    if (drop) {
      setActiveDropId(drop.id);
    }
  }, [profile?.username, friendDropSync]);

  const showMyProfile = useCallback(() => {
    setPhase('showing');
    haptics.impact();
  }, []);

  const startScanning = useCallback(async () => {
    setPhase('scanning');
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
      setPhase('idle');
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
    if (activeDropId) {
      await friendDropSync.cancelDrop(activeDropId);
    }
    setIsOpen(false);
    setPhase('idle');
    setFoundUser(null);
    setWasScanned(false);
    setActiveDropId(null);
  }, [stopScanning, activeDropId, friendDropSync]);

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
        return <IdlePhase onShowProfile={showMyProfile} onScan={startScanning} />;
      case 'showing':
        return (
          <ShowingPhase
            profile={profile}
            qrCodeUrl={qrCodeUrl}
            wasScanned={wasScanned}
            onSwitchToScanner={() => { setPhase('idle'); setWasScanned(false); }}
            onCopy={copyLink}
            onShare={shareLink}
          />
        );
      case 'scanning':
        return (
          <ScanningPhase
            videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            canvasRef={canvasRef as React.RefObject<HTMLCanvasElement>}
            onCancel={() => { stopScanning(); setPhase('idle'); }}
          />
        );
      case 'detected':
        return <DetectedPhase />;
      case 'found':
        return foundUser ? (
          <FoundPhase
            foundUser={foundUser}
            onCancel={() => { setFoundUser(null); setPhase('idle'); }}
            onAdd={handleAddFriend}
            isPending={sendRequest.isPending}
          />
        ) : null;
      case 'exchanging':
        return (
          <ExchangingPhase
            myAvatar={profile?.avatar_url}
            myUsername={profile?.username}
            theirAvatar={foundUser?.avatar_url}
            theirUsername={foundUser?.username}
          />
        );
      case 'success':
        return <SuccessPhase />;
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
        <DialogContent className="sm:max-w-md p-6 border-0 bg-background/95 backdrop-blur-2xl rounded-3xl overflow-hidden [&>button]:hidden">
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>

          {phase !== 'success' && phase !== 'exchanging' && phase !== 'detected' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="absolute top-4 right-4 h-9 w-9 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
