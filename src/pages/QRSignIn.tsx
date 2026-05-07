import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, Loader2, ShieldCheck, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { VYBELogo } from '@/components/ui/VYBELogo';

type Phase = 'loading' | 'ready' | 'approved' | 'expired' | 'denied' | 'error';

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
      const { data, error } = await supabase.functions.invoke('auth-qr', {
        body: { action: 'create' },
      });
      if (error) throw error;
      const n = (data as any)?.nonce as string;
      const ttl = ((data as any)?.expiresInSec as number) || 180;
      if (!n) throw new Error('No nonce');
      setNonce(n);
      setSecondsLeft(ttl);
      const dataUrl = await QRCode.toDataURL(`vybe-qr:${n}`, {
        margin: 1,
        width: 320,
        color: { dark: '#0B0B10', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
      setPhase('ready');
    } catch (e) {
      console.error('[QRSignIn] create failed', e);
      setPhase('error');
      toast.error('Could not generate QR code');
    }
  }, []);

  // Initial create
  useEffect(() => { create(); return () => stopTimers(); }, [create]);

  // Countdown + poll loop while ready
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
        const { data } = await supabase.functions.invoke('auth-qr', {
          body: { action: 'poll', nonce },
        });
        const status = (data as any)?.status;
        if (status === 'approved') {
          stopTimers();
          setPhase('approved');
          // Redeem for an action link
          const { data: r, error } = await supabase.functions.invoke('auth-qr', {
            body: { action: 'redeem', nonce },
          });
          if (error) throw error;
          const link = (r as any)?.actionLink as string | undefined;
          if (link) {
            // Navigate the browser to the magic link to establish a session
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
      } catch (e) {
        // Soft-fail; keep polling
      }
    }, 2000);

    return () => stopTimers();
  }, [phase, nonce]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 bg-background">
      <button
        onClick={() => navigate('/auth')}
        className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Back to sign-in"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex flex-col items-center mb-6">
        <VYBELogo className="w-10 h-10 mb-3" />
        <h1 className="text-2xl font-bold">Sign in with QR</h1>
        <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
          Open VYBE on a signed-in device and go to Settings → Security → Scan.
        </p>
      </div>

      <Card className="p-6 w-full max-w-sm flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="relative w-[280px] h-[280px] rounded-2xl bg-white flex items-center justify-center overflow-hidden"
        >
          {qrDataUrl && phase !== 'expired' && phase !== 'approved' ? (
            <img src={qrDataUrl} alt="QR sign-in code" className="w-full h-full" />
          ) : phase === 'loading' ? (
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          ) : phase === 'approved' ? (
            <div className="flex flex-col items-center gap-2 text-foreground">
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
              <div className="text-sm font-medium">Approved — signing in…</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-foreground">
              <QrCode className="w-10 h-10 text-muted-foreground" />
              <div className="text-sm font-medium">
                {phase === 'denied' ? 'Sign-in denied' : phase === 'error' ? 'Something went wrong' : 'Code expired'}
              </div>
            </div>
          )}
        </motion.div>

        <div className="mt-4 text-xs text-muted-foreground">
          {phase === 'ready' && <>Expires in <span className="font-mono">{mm}:{ss}</span></>}
          {phase === 'expired' && 'Refresh to generate a new code'}
          {phase === 'denied' && 'You denied this sign-in on the other device'}
          {phase === 'approved' && 'Hang tight while we open your account'}
          {phase === 'loading' && 'Preparing…'}
          {phase === 'error' && 'Try refreshing the code'}
        </div>

        {(phase === 'expired' || phase === 'denied' || phase === 'error') && (
          <Button onClick={create} className="mt-4 w-full">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh code
          </Button>
        )}
      </Card>

      <button
        onClick={() => navigate('/auth')}
        className="mt-6 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Use email instead
      </button>
    </div>
  );
}
