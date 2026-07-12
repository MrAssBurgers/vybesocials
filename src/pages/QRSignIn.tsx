import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, ShieldCheck, QrCode, Smartphone, Settings, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { VybeLiquidText } from '@/components/ui/VybeLiquidText';
import { cn } from '@/lib/utils';

type Phase = 'loading' | 'ready' | 'approved' | 'expired' | 'denied' | 'error';

const QR_COLORS = {
  dark: '#1a1028',
  light: '#f8f6fb',
};

const STEPS = [
  { icon: Smartphone, label: 'Open VYBE on a device where you\'re already signed in' },
  { icon: Settings, label: 'Go to Settings → Security' },
  { icon: ScanLine, label: 'Tap Scan and point at this code' },
];

/**
 * Signed-out device QR display page.
 * Renders a QR code (encoding `vybe-qr:<nonce>`) that a signed-in device
 * scans via Settings → Security → "Quick Sign-In with QR". Polls
 * `auth-qr` action=poll every 2s and, once approved, calls action=redeem
 * to mint a magic link, then navigates to it to establish the session.
 */
export default function QRSignIn() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [nonce, setNonce] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  const create = useCallback(async () => {
    stopTimers();
    setPhase('loading');
    setQrDataUrl(null);
    setNonce(null);
    try {
      const { data, error } = await db.functions.invoke('auth-qr', {
        body: { action: 'create' },
      });
      if (error) throw error;
      const n = (data as any)?.nonce as string;
      const ttl = ((data as any)?.expiresInSec as number) || 180;
      if (!n) throw new Error('No nonce');
      setNonce(n);
      setSecondsLeft(ttl);
      const dataUrl = await QRCode.toDataURL(`vybe-qr:${n}`, {
        margin: 2,
        width: 280,
        errorCorrectionLevel: 'M',
        color: QR_COLORS,
      });
      setQrDataUrl(dataUrl);
      setPhase('ready');
    } catch (e) {
      console.error('[QRSignIn] create failed', e);
      setPhase('error');
      toast.error('Could not generate QR code');
    }
  }, []);

  useEffect(() => { create(); return () => stopTimers(); }, [create]);

  useEffect(() => {
    if (phase !== 'ready' || !nonce) return;

    tickRef.current = window.setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          stopTimers();
          setPhase('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await db.functions.invoke('auth-qr', {
          body: { action: 'poll', nonce },
        });
        const status = (data as any)?.status;
        if (status === 'approved') {
          stopTimers();
          setPhase('approved');
          const { data: r, error } = await db.functions.invoke('auth-qr', {
            body: { action: 'redeem', nonce },
          });
          if (error) throw error;
          const link = (r as any)?.actionLink as string | undefined;
          if (link) {
            window.location.href = link;
          } else {
            toast.error('Sign-in link missing');
            setPhase('error');
          }
        } else if (status === 'denied') {
          stopTimers();
          setPhase('denied');
        } else if (status === 'expired' || status === 'not_found') {
          stopTimers();
          setPhase('expired');
        }
      } catch {
        // Soft-fail; keep polling
      }
    }, 2000);

    return () => stopTimers();
  }, [phase, nonce]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const showQr = qrDataUrl && phase !== 'expired' && phase !== 'approved';
  const needsRefresh = phase === 'expired' || phase === 'denied' || phase === 'error';

  const statusMessage = (() => {
    switch (phase) {
      case 'ready': return 'Waiting for approval on your other device…';
      case 'expired': return 'This code expired — generate a fresh one';
      case 'denied': return 'Sign-in was denied on the other device';
      case 'approved': return 'Approved — opening your account…';
      case 'loading': return 'Generating your secure sign-in code…';
      case 'error': return 'Something went wrong — try again';
      default: return '';
    }
  })();

  return (
    <div
      data-auth-shell
      className="fixed inset-0 z-50 overflow-hidden overscroll-none flex items-center justify-center px-4 py-8 bg-background"
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[min(100vw,520px)] h-[min(100vw,520px)] rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.22) 0%, transparent 65%)',
            filter: 'blur(48px)',
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-25"
          style={{
            background: 'radial-gradient(circle, hsl(var(--accent) / 0.3) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => navigate('/auth')}
        className="fixed top-[max(0.75rem,var(--sat,0px))] left-[var(--app-gutter-x,max(0.75rem,env(safe-area-inset-left,0px)))] z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/70 hover:bg-background/90 border border-white/10 text-xs text-foreground/80 hover:text-foreground backdrop-blur-md transition-colors"
        aria-label="Back to sign-in"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[400px] mx-auto flex flex-col gap-4"
      >
        <div className="liquid-glass-card rounded-2xl border border-white/[0.08] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.55)] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div
                  aria-hidden
                  className="absolute -inset-2 rounded-full opacity-40 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, hsl(var(--primary) / 0.55) 0%, transparent 70%)',
                    filter: 'blur(10px)',
                  }}
                />
                <VYBELogo size="sm" showText={false} className="relative z-10" />
              </div>
              <div className="min-w-0">
                <VybeLiquidText as="h1" className="text-lg font-display font-bold leading-tight">
                  Sign in with QR
                </VybeLiquidText>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Fast, secure — no password on this device
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-5 flex flex-col items-center">
            {/* QR frame */}
            <div className="relative p-[3px] rounded-[1.35rem] bg-gradient-to-br from-primary/80 via-accent/70 to-primary/80 shadow-[0_8px_32px_-8px_hsl(var(--primary)/0.45)]">
              <div className="rounded-[1.2rem] bg-[#f8f6fb] p-3 shadow-inner">
                <div className="relative w-[min(72vw,248px)] h-[min(72vw,248px)] sm:w-[248px] sm:h-[248px] rounded-xl overflow-hidden">
                  <AnimatePresence mode="wait">
                    {showQr ? (
                      <motion.img
                        key="qr"
                        src={qrDataUrl}
                        alt="QR sign-in code"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="w-full h-full object-contain"
                      />
                    ) : phase === 'loading' ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-muted/20 to-muted/5"
                      >
                        <div className="relative">
                          <QrCode className="w-14 h-14 text-muted-foreground/25" strokeWidth={1.25} />
                          <motion.div
                            className="absolute inset-x-1 h-0.5 rounded-full bg-primary/50"
                            animate={{ top: ['12%', '88%', '12%'] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </div>
                        <div className="flex gap-1">
                          {[0, 0.15, 0.3].map((delay, i) => (
                            <motion.span
                              key={i}
                              className="block h-1.5 w-1.5 rounded-full bg-primary/70"
                              animate={{ opacity: [0.35, 1, 0.35] }}
                              transition={{ duration: 1.1, repeat: Infinity, delay }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    ) : phase === 'approved' ? (
                      <motion.div
                        key="approved"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-emerald-500/10"
                      >
                        <ShieldCheck className="w-11 h-11 text-emerald-500" />
                        <p className="text-sm font-semibold text-foreground">Approved</p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="inactive"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/15 px-4 text-center"
                      >
                        <QrCode className="w-10 h-10 text-muted-foreground/50" strokeWidth={1.5} />
                        <p className="text-sm font-medium text-foreground">
                          {phase === 'denied' ? 'Sign-in denied' : phase === 'error' ? 'Couldn\'t load code' : 'Code expired'}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Status row */}
            <div className="mt-4 flex flex-col items-center gap-2 w-full">
              <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-[280px]">
                {statusMessage}
              </p>
              {phase === 'ready' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Expires {mm}:{ss}
                </span>
              )}
            </div>

            {needsRefresh && (
              <Button onClick={create} className="mt-4 w-full h-10 rounded-xl" variant="vybeLiquid">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Generate new code
              </Button>
            )}
          </div>

          {/* Steps */}
          <div className="px-5 py-4 border-t border-white/[0.06] bg-white/[0.015] space-y-2.5">
            {STEPS.map(({ icon: Icon, label }, i) => (
              <div key={label} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary mt-0.5">
                  {i + 1}
                </span>
                <div className="flex items-start gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                  <p className="text-[11px] text-muted-foreground leading-snug">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/auth')}
          className={cn(
            'w-full h-10 rounded-xl border-white/10 bg-secondary/15',
            'text-sm text-muted-foreground hover:text-foreground',
          )}
        >
          Use email instead
        </Button>
      </motion.div>
    </div>
  );
}
