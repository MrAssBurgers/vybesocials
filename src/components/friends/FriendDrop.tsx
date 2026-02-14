import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, X, Check, QrCode, Camera, 
  ArrowLeftRight, Heart, Copy, Share2, ScanLine, Sparkles, Nfc, Smartphone,
  Zap, Shield, Radio
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
import { preloadCameraStream, getPreloadedStream } from '@/hooks/useCameraPreload';

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

const cyberSpring = { type: "spring" as const, stiffness: 500, damping: 28 };
const glitchSpring = { type: "spring" as const, stiffness: 600, damping: 22 };

// === CYBER HUD HEADER ===
function CyberHeader() {
  return (
    <div className="flex items-center gap-3 justify-center">
      <motion.div
        className="h-px flex-1 max-w-[40px]"
        style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6))' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      />
      <motion.h3
        className="text-sm font-mono font-bold tracking-[0.3em] uppercase cyber-glow-text"
        style={{ color: 'hsl(var(--primary))' }}
        initial={{ opacity: 0, letterSpacing: '0.6em' }}
        animate={{ opacity: 1, letterSpacing: '0.3em' }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        FRIEND LINK
      </motion.h3>
      <motion.div
        className="h-px flex-1 max-w-[40px]"
        style={{ background: 'linear-gradient(90deg, hsl(var(--primary) / 0.6), transparent)' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      />
    </div>
  );
}

// --- Main idle screen: QR + Scanner ---
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
      className="flex flex-col items-center gap-4 py-3"
    >
      <CyberHeader />

      {/* Scanned indicator */}
      <AnimatePresence>
        {wasScanned && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm border"
            style={{
              borderColor: 'hsl(var(--primary) / 0.4)',
              background: 'hsl(var(--primary) / 0.08)',
              boxShadow: '0 0 12px hsl(var(--primary) / 0.2)',
            }}
          >
            <Zap className="h-3.5 w-3.5" style={{ color: 'hsl(var(--primary))' }} />
            <span className="text-xs font-mono" style={{ color: 'hsl(var(--primary))' }}>
              SIGNAL DETECTED — HANDSHAKE INITIATED
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column: QR code + Scanner */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {/* Left: QR Code Card */}
        <motion.div
          className="rounded-lg overflow-hidden relative aspect-square cyber-card"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ ...cyberSpring, delay: 0.05 }}
        >
          {/* Cyber grid overlay */}
          <div className="absolute inset-0 cyber-grid-bg opacity-50 pointer-events-none z-0" />
          
          <div className="relative w-full h-full p-3 flex flex-col items-center justify-between z-[1]">
            {/* Mini avatar + name */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="cyber-avatar-ring rounded-full">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                    {profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[9px] font-mono text-primary/80 truncate max-w-[70px]">
                @{profile?.username?.trim()}
              </span>
            </div>
            
            {/* QR Code */}
            <div className="flex-1 w-full flex items-center justify-center py-1.5">
              <div className="w-full aspect-square rounded-sm bg-white p-2 relative z-10"
                style={{ boxShadow: '0 0 20px hsl(var(--primary) / 0.15)' }}
              >
                <img
                  src={qrCodeUrl}
                  alt="Your QR Code"
                  className="w-full h-full rounded-sm"
                  style={{ imageRendering: 'crisp-edges' }}
                />
                {/* Center avatar overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-7 h-7 rounded-sm overflow-hidden border-2 border-primary/30 shadow-sm bg-white">
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
              <button onClick={onCopy} className="flex items-center gap-0.5 px-2 py-0.5 rounded-sm text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors text-[9px] font-mono">
                <Copy className="h-2.5 w-2.5" /> COPY
              </button>
              <button onClick={onShare} className="flex items-center gap-0.5 px-2 py-0.5 rounded-sm text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors text-[9px] font-mono">
                <Share2 className="h-2.5 w-2.5" /> SHARE
              </button>
            </div>
          </div>
        </motion.div>

        {/* Right: Scanner */}
        <motion.div
          className="rounded-lg overflow-hidden relative aspect-square cyber-card"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ ...cyberSpring, delay: 0.1 }}
        >
          {isScanning ? (
            <>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Cyber scanner overlay */}
              <div className="absolute inset-0 pointer-events-none cyber-scanline-overlay">
                {/* Corner brackets with glow */}
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
                  <span className="text-[7px] font-mono text-primary/60">SCANNING</span>
                  <motion.span
                    className="text-[7px] font-mono text-primary/60"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    ● LIVE
                  </motion.span>
                </div>
              </div>
              <button
                onClick={onStopScan}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm text-[10px] font-mono font-medium z-10 border"
                style={{
                  background: 'hsl(var(--background) / 0.8)',
                  borderColor: 'hsl(var(--primary) / 0.3)',
                  color: 'hsl(var(--primary))',
                  backdropFilter: 'blur(8px)',
                }}
              >
                TERMINATE
              </button>
            </>
          ) : (
            <button
              onClick={onStartScan}
              className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 hover:bg-primary/5 transition-colors cyber-grid-bg"
            >
              <motion.div
                className="w-14 h-14 rounded-lg flex items-center justify-center border"
                style={{
                  borderColor: 'hsl(var(--primary) / 0.3)',
                  background: 'hsl(var(--primary) / 0.08)',
                  boxShadow: '0 0 20px hsl(var(--primary) / 0.1)',
                }}
                animate={{ boxShadow: ['0 0 20px hsl(var(--primary) / 0.1)', '0 0 30px hsl(var(--primary) / 0.25)', '0 0 20px hsl(var(--primary) / 0.1)'] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Camera className="h-6 w-6 text-primary" />
              </motion.div>
              <div className="text-center">
                <p className="text-[10px] font-mono font-semibold text-primary">SCAN TARGET</p>
                <p className="text-[8px] font-mono text-muted-foreground mt-0.5">TAP TO INIT</p>
              </div>
            </button>
          )}
        </motion.div>
      </div>

      {/* NFC status */}
      {nfcSupported ? (
        <motion.div
          className="flex items-center gap-2 px-3 py-1.5 rounded-sm border"
          style={{
            borderColor: nfcActive ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--border) / 0.3)',
            background: nfcActive ? 'hsl(var(--primary) / 0.05)' : 'transparent',
          }}
          animate={nfcActive ? { boxShadow: ['0 0 0 hsl(var(--primary) / 0)', '0 0 15px hsl(var(--primary) / 0.2)', '0 0 0 hsl(var(--primary) / 0)'] } : {}}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Radio className={`h-3.5 w-3.5 ${nfcActive ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`text-[9px] font-mono ${nfcActive ? 'text-primary' : 'text-muted-foreground'}`}>
            {nfcActive ? 'PROXIMITY LINK ACTIVE' : 'NFC STANDBY'}
          </span>
        </motion.div>
      ) : (
        <p className="text-[9px] font-mono text-muted-foreground text-center tracking-wider">
          DISPLAY CODE OR SCAN TO ESTABLISH LINK
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
        transition={{ ...glitchSpring, bounce: 0.3 }}
      >
        <motion.div
          className="w-24 h-24 rounded-lg flex items-center justify-center relative"
          style={{
            background: 'hsl(var(--primary) / 0.1)',
            border: '2px solid hsl(var(--primary) / 0.5)',
          }}
          animate={{ 
            boxShadow: [
              '0 0 20px hsl(var(--primary) / 0.3), inset 0 0 20px hsl(var(--primary) / 0.1)',
              '0 0 50px hsl(var(--primary) / 0.5), inset 0 0 30px hsl(var(--primary) / 0.2)',
              '0 0 20px hsl(var(--primary) / 0.3), inset 0 0 20px hsl(var(--primary) / 0.1)',
            ]
          }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Shield className="h-10 w-10 text-primary" />
          
          {/* Glitch effect */}
          <motion.div
            className="absolute inset-0 rounded-lg border border-primary/30"
            animate={{ 
              x: [-1, 1, -1, 0],
              opacity: [0, 0.5, 0, 0.3],
            }}
            transition={{ repeat: Infinity, duration: 0.3, ease: "linear" }}
          />
        </motion.div>

        {/* Pulse rings */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-lg"
            style={{ border: '1px solid hsl(var(--primary) / 0.3)' }}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.5, ease: "easeOut" }}
          />
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center"
      >
        <p className="text-sm font-mono font-bold tracking-wider cyber-glow-text" style={{ color: 'hsl(var(--primary))' }}>
          SIGNAL ACQUIRED
        </p>
        <p className="text-[10px] font-mono text-muted-foreground mt-1">DECRYPTING IDENTITY...</p>
      </motion.div>
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
      {/* Avatar with cyber ring */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={cyberSpring}
        className="relative"
      >
        {/* Rotating border */}
        <motion.div
          className="absolute -inset-3 rounded-lg"
          style={{
            background: 'conic-gradient(from 0deg, hsl(var(--primary) / 0.6), transparent, hsl(var(--accent) / 0.4), transparent, hsl(var(--primary) / 0.6))',
            padding: '1px',
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
        >
          <div className="w-full h-full rounded-lg bg-background" />
        </motion.div>
        
        <Avatar className="h-24 w-24 rounded-lg border-2 border-primary/30 relative shadow-lg"
          style={{ boxShadow: '0 0 30px hsl(var(--primary) / 0.2)' }}
        >
          <AvatarImage src={foundUser.avatar_url || undefined} className="rounded-lg" />
          <AvatarFallback className="text-2xl bg-primary/10 text-primary rounded-lg font-mono">
            {foundUser.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Status indicator */}
        <motion.div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-sm flex items-center justify-center z-10"
          style={{ background: 'hsl(var(--primary))', boxShadow: '0 0 10px hsl(var(--primary) / 0.5)' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, ...glitchSpring }}
        >
          <Check className="h-3 w-3 text-primary-foreground" />
        </motion.div>
      </motion.div>

      {/* User info */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-center space-y-1"
      >
        <motion.h3
          className="text-xl font-bold font-mono"
          style={{ animation: 'cyber-text-decode 0.5s ease-out forwards' }}
        >
          {foundUser.display_name || foundUser.username}
        </motion.h3>
        <p className="text-muted-foreground text-xs font-mono tracking-wider">@{foundUser.username?.trim()}</p>
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
        <Button variant="outline" onClick={onCancel} className="rounded-sm px-5 font-mono text-xs border-muted-foreground/30">
          ABORT
        </Button>
        <Button 
          onClick={onAdd} 
          className="rounded-sm px-5 gap-2 font-mono text-xs" 
          disabled={isPending}
          style={{ boxShadow: '0 0 20px hsl(var(--primary) / 0.3)' }}
        >
          <Zap className="h-3.5 w-3.5" />
          LINK UP
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
      className="flex flex-col items-center gap-8 py-14 relative"
    >
      {/* Data stream particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-px rounded-full"
          style={{
            height: 8 + Math.random() * 16,
            background: 'hsl(var(--primary) / 0.5)',
            left: `${20 + Math.random() * 60}%`,
            boxShadow: '0 0 4px hsl(var(--primary) / 0.3)',
          }}
          animate={{ 
            y: [100, -100],
            opacity: [0, 0.8, 0],
          }}
          transition={{ duration: 1 + Math.random(), delay: i * 0.15, repeat: Infinity, ease: "linear" }}
        />
      ))}

      <div className="relative flex items-center gap-8">
        <motion.div
          animate={{ x: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        >
          <Avatar className="rounded-lg cyber-avatar-ring shadow-lg" style={{ width: 64, height: 64 }}>
            <AvatarImage src={myAvatar || undefined} className="rounded-lg" />
            <AvatarFallback className="text-lg font-mono rounded-lg">{myUsername?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>

        {/* Connection beam */}
        <motion.div
          className="flex items-center gap-1"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1 }}
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-0.5 rounded-full"
              style={{ background: 'hsl(var(--primary))' }}
              animate={{ scaleX: [0.5, 1.5, 0.5], opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
            />
          ))}
        </motion.div>

        <motion.div
          animate={{ x: [0, -8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        >
          <Avatar className="rounded-lg cyber-avatar-ring shadow-lg" style={{ width: 64, height: 64 }}>
            <AvatarImage src={theirAvatar || undefined} className="rounded-lg" />
            <AvatarFallback className="text-lg font-mono rounded-lg">{theirUsername?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>
      </div>

      <motion.div className="text-center">
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="text-sm font-mono font-bold tracking-wider cyber-glow-text"
          style={{ color: 'hsl(var(--primary))' }}
        >
          SYNCING DATA...
        </motion.p>
        <p className="text-[10px] font-mono text-muted-foreground mt-1">ESTABLISHING FRIEND LINK</p>
      </motion.div>
    </motion.div>
  );
}

// --- Success Phase ---
function SuccessPhase({ foundUser }: { foundUser: FoundUser | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center gap-6 py-10 relative overflow-hidden"
    >
      {/* Grid background flash */}
      <motion.div
        className="absolute inset-0 cyber-grid-bg pointer-events-none"
        initial={{ opacity: 0.3 }}
        animate={{ opacity: 0.05 }}
        transition={{ duration: 1 }}
      />

      {/* Success icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...glitchSpring, delay: 0.1, bounce: 0.35 }}
        className="relative"
      >
        <motion.div
          className="w-24 h-24 rounded-lg flex items-center justify-center relative"
          style={{
            background: 'hsl(var(--primary) / 0.15)',
            border: '2px solid hsl(var(--primary) / 0.5)',
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
          <Check className="h-10 w-10 text-primary" />
        </motion.div>

        {/* Glitch particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-sm"
            style={{
              background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
              top: '50%',
              left: '50%',
              boxShadow: `0 0 6px ${i % 2 === 0 ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--accent) / 0.5)'}`,
            }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1.2, 0],
              x: Math.cos((i * Math.PI * 2) / 8) * 70,
              y: Math.sin((i * Math.PI * 2) / 8) * 70,
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.7, delay: 0.15 + i * 0.04 }}
          />
        ))}
        
        {/* Expanding rings */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={`ring-${i}`}
            className="absolute inset-0 rounded-lg"
            style={{ border: '1px solid hsl(var(--primary) / 0.3)' }}
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
          <Avatar className="h-10 w-10 rounded-lg border border-primary/30 cyber-avatar-ring">
            <AvatarImage src={foundUser.avatar_url || undefined} className="rounded-lg" />
            <AvatarFallback className="text-sm bg-primary/10 text-primary rounded-lg font-mono">
              {foundUser.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm font-mono">{foundUser.display_name || foundUser.username}</p>
            <p className="text-xs text-muted-foreground font-mono">@{foundUser.username}</p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-center"
      >
        <h3 className="text-lg font-bold font-mono flex items-center gap-2 justify-center cyber-glow-text" style={{ color: 'hsl(var(--primary))' }}>
          <Zap className="h-4 w-4" />
          LINK ESTABLISHED
          <Zap className="h-4 w-4" />
        </h3>
        <p className="text-muted-foreground text-xs font-mono mt-1 tracking-wider">NEURAL SYNC COMPLETE</p>
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
    preloadCameraStream();
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
            className="w-full p-4 rounded-lg border flex items-center gap-4 cyber-card"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div 
              className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'hsl(var(--primary) / 0.1)',
                border: '1px solid hsl(var(--primary) / 0.3)',
                boxShadow: '0 0 20px hsl(var(--primary) / 0.15)',
              }}
              animate={{ boxShadow: ['0 0 20px hsl(var(--primary) / 0.15)', '0 0 30px hsl(var(--primary) / 0.3)', '0 0 20px hsl(var(--primary) / 0.15)'] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Zap className="h-6 w-6 text-primary" />
            </motion.div>
            <div className="text-left">
              <h4 className="font-semibold font-mono text-sm tracking-wider">FRIEND LINK</h4>
              <p className="text-xs text-muted-foreground font-mono">Sync with nearby users</p>
            </div>
            <Radio className="ml-auto h-5 w-5 text-primary shrink-0 animate-pulse" />
          </motion.button>
        );
      default:
        return (
          <Button onClick={handleOpen} className="gap-2 font-mono text-xs rounded-sm">
            <Zap className="h-4 w-4" />
            FRIEND LINK
          </Button>
        );
    }
  };

  return (
    <>
      {renderTrigger()}

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[380px] p-0 border-0 bg-transparent shadow-none rounded-lg overflow-visible [&>button]:hidden">
          {/* Cyber container */}
          <motion.div
            className="relative w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {/* Card rising from bottom */}
            <motion.div
              className="relative rounded-lg cyber-card p-4 overflow-hidden will-change-transform"
              initial={{ y: 120, scaleX: 0.88, scaleY: 0.6, opacity: 0 }}
              animate={{ y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 32,
                opacity: { duration: 0.12 },
              }}
              style={{
                transformOrigin: 'bottom center',
              }}
            >
              {/* Top edge gleam */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-px z-10"
                style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent)' }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
              />

              {/* Close button */}
              <button 
                onClick={handleClose}
                className="absolute top-3 right-3 z-20 p-1.5 rounded-sm border transition-colors"
                style={{
                  borderColor: 'hsl(var(--muted-foreground) / 0.2)',
                  background: 'hsl(var(--background) / 0.5)',
                }}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              <AnimatePresence mode="wait">
                {renderContent()}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}
