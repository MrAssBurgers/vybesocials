import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QrCode, Loader2, ShieldCheck, ShieldX, MapPin, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { parseQrSignInNonce } from '@/lib/qrSignIn';
import { db } from '@/lib/firebase';

interface ScannedNonce {
  nonce: string;
  ip?: string;
  city?: string;
  country?: string;
  device?: string;
}

/**
 * Settings card to scan a QR code shown by a signed-out device. After scan,
 * shows a confirmation modal with device/location details and approves
 * via auth-qr (action=claim).
 */
export function QrSignInScannerCard() {
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<ScannedNonce | null>(null);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  const startScan = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        if (v.readyState >= 2) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            {/* Expect URLs like https://vybehub.app/auth/qr/claim?nonce=…  or raw nonce text */}
            const nonce = parseNonce(code.data);
            if (nonce) {
              stopCamera();
              setScanning(false);
              await pollNonce(nonce);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      stopCamera();
      setScanning(false);
      toast.error(e?.message || 'Could not access camera');
    }
  };

  const pollNonce = async (nonce: string) => {
    setBusy(true);
    try {
      const { data, error } = await db.functions.invoke('auth-qr', {
        body: { action: 'poll', nonce },
      });
      if (error) throw error;
      const status = (data as { status?: string } | null)?.status;
      if (status === 'expired' || status === 'not_found') {
        toast.error('That QR code has expired. Refresh it on the other device.');
        return;
      }
      if (status !== 'pending') {
        toast.error('That QR code is no longer valid.');
        return;
      }
      // Metadata comes from the callable (Firestore rules block unsigned create docs).
      const m = ((data as { metadata?: Record<string, any> } | null)?.metadata || {}) as Record<string, any>;
      setPending({
        nonce,
        ip: typeof m.ip === 'string' ? m.ip : undefined,
        city: m.geo?.city,
        country: m.geo?.country,
        device: typeof m.device === 'string' ? m.device : undefined,
      });
    } catch (e: any) {
      toast.error('Could not look up QR code');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (intent: 'approve' | 'deny') => {
    if (!pending) return;
    setBusy(true);
    try {
      const { error } = await db.functions.invoke('auth-qr', {
        body: { action: 'claim', nonce: pending.nonce, intent },
      });
      if (error) throw error;
      toast.success(intent === 'approve' ? 'Signed in on the other device' : 'Sign-in denied');
      setPending(null);
    } catch {
      toast.error('Could not respond');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    stopCamera();
    setScanning(false);
  };

  return (
    <>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <QrCode className="w-5 h-5 mt-0.5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">Quick Sign-In with QR</div>
                <div className="text-xs text-muted-foreground">
                  Scan the QR code shown by a signed-out device to sign it in instantly.
                </div>
              </div>
              <Button size="sm" onClick={startScan}>Scan</Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={scanning} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan QR code</DialogTitle>
            <DialogDescription>Point your camera at the QR code shown on your other device.</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <Button variant="ghost" onClick={close}>Cancel</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pending} onOpenChange={(v) => { if (!v) setPending(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve this sign-in?</DialogTitle>
            <DialogDescription>This will sign in to your VYBE account on the other device.</DialogDescription>
          </DialogHeader>
          {pending && (
            <div className="space-y-2.5 p-3 rounded-xl bg-muted/40">
              <div className="flex items-center gap-2 text-sm">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{pending.device || 'Unknown device'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>{[pending.city, pending.country].filter(Boolean).join(', ') || pending.ip || 'Unknown location'}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => respond('deny')}>
              <ShieldX className="w-4 h-4 mr-1.5" /> Deny
            </Button>
            <Button disabled={busy} onClick={() => respond('approve')}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4 mr-1.5" /> Approve</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function parseNonce(data: string): string | null {
  return parseQrSignInNonce(data);
}
