import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ShareExportProps {
  postId: string;
  caption?: string;
  mediaUrl?: string;
  authorUsername?: string;
  onClose: () => void;
}

/**
 * Viral Share Export — generates a branded image card for sharing to TikTok/Reels/Stories.
 * Uses Canvas API to render a VYBE-branded frame with watermark + QR code.
 */
export function ShareExport({ postId, caption, mediaUrl, authorUsername, onClose }: ShareExportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const generateCard = useCallback(async () => {
    setGenerating(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // 9:16 vertical format for Reels/TikTok/Stories
      canvas.width = 1080;
      canvas.height = 1920;

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bg.addColorStop(0, '#0a0a0f');
      bg.addColorStop(0.5, '#111128');
      bg.addColorStop(1, '#0a0a0f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Decorative accent line
      const accent = ctx.createLinearGradient(0, 0, canvas.width, 0);
      accent.addColorStop(0, 'transparent');
      accent.addColorStop(0.3, 'hsl(250, 85%, 60%)');
      accent.addColorStop(0.7, 'hsl(280, 85%, 60%)');
      accent.addColorStop(1, 'transparent');
      ctx.fillStyle = accent;
      ctx.fillRect(0, 200, canvas.width, 3);

      // Load and draw media if available
      if (mediaUrl) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = mediaUrl;
          });

          // Center-crop into the card area
          const cardY = 250;
          const cardH = 1100;
          const cardW = canvas.width - 120;
          const cardX = 60;

          // Rounded rect clip
          ctx.save();
          ctx.beginPath();
          const r = 32;
          ctx.moveTo(cardX + r, cardY);
          ctx.lineTo(cardX + cardW - r, cardY);
          ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + r);
          ctx.lineTo(cardX + cardW, cardY + cardH - r);
          ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH);
          ctx.lineTo(cardX + r, cardY + cardH);
          ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - r);
          ctx.lineTo(cardX, cardY + r);
          ctx.quadraticCurveTo(cardX, cardY, cardX + r, cardY);
          ctx.clip();

          // Draw image covering the area
          const scale = Math.max(cardW / img.width, cardH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          ctx.drawImage(img, cardX + (cardW - drawW) / 2, cardY + (cardH - drawH) / 2, drawW, drawH);
          ctx.restore();

          // Subtle border
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cardX + r, cardY);
          ctx.lineTo(cardX + cardW - r, cardY);
          ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + r);
          ctx.lineTo(cardX + cardW, cardY + cardH - r);
          ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH);
          ctx.lineTo(cardX + r, cardY + cardH);
          ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - r);
          ctx.lineTo(cardX, cardY + r);
          ctx.quadraticCurveTo(cardX, cardY, cardX + r, cardY);
          ctx.stroke();
        } catch {
          // Media load failed — show text-only card
        }
      }

      // Caption text
      if (caption) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';

        const maxWidth = canvas.width - 160;
        const words = caption.split(' ');
        let line = '';
        let y = mediaUrl ? 1450 : 800;
        const lineHeight = 56;

        for (const word of words) {
          const test = line + word + ' ';
          if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line.trim(), canvas.width / 2, y);
            line = word + ' ';
            y += lineHeight;
            if (y > 1650) break;
          } else {
            line = test;
          }
        }
        if (line.trim()) ctx.fillText(line.trim(), canvas.width / 2, y);
      }

      // Author tag
      if (authorUsername) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '32px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`@${authorUsername}`, canvas.width / 2, mediaUrl ? 1530 : 900);
      }

      // VYBE watermark (bottom)
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Made on VYBE', canvas.width / 2, 1820);

      // Small VYBE logo accent
      ctx.fillStyle = 'hsl(250, 85%, 60%)';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 1860, 6, 0, Math.PI * 2);
      ctx.fill();

      // QR placeholder (bottom-right corner)
      const qrSize = 120;
      const qrX = canvas.width - qrSize - 60;
      const qrY = canvas.height - qrSize - 60;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SCAN', qrX + qrSize / 2, qrY + qrSize / 2 - 5);
      ctx.fillText('ME', qrX + qrSize / 2, qrY + qrSize / 2 + 15);

      const url = canvas.toDataURL('image/png');
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to generate share card:', err);
      toast.error('Failed to generate share card');
    } finally {
      setGenerating(false);
    }
  }, [mediaUrl, caption, authorUsername]);

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `vybe-${postId.slice(0, 8)}.png`;
    a.click();
    toast.success('Image saved!');
  };

  const handleShare = async () => {
    if (!previewUrl) return;

    try {
      const blob = await (await fetch(previewUrl)).blob();
      const file = new File([blob], `vybe-${postId.slice(0, 8)}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Check this out on VYBE',
          files: [file],
        });
      } else {
        handleDownload();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        handleDownload();
      }
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm liquid-glass-card rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Share to Reels / TikTok</h3>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!previewUrl ? (
            <Button
              className="w-full gradient-animated"
              onClick={generateCard}
              disabled={generating}
            >
              {generating ? 'Generating...' : '✨ Generate Share Card'}
            </Button>
          ) : (
            <>
              <div className="rounded-xl overflow-hidden border border-border/50">
                <img src={previewUrl} alt="Share card preview" className="w-full" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" /> Save
                </Button>
                <Button className="flex-1 gradient-animated" onClick={handleShare}>
                  <Share2 className="h-4 w-4 mr-2" /> Share
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
