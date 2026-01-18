import { useState, useCallback } from 'react';
import { Share2, Copy, QrCode, Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  url: string;
  title?: string;
  text?: string;
  className?: string;
  variant?: 'ghost' | 'outline' | 'default';
  size?: 'default' | 'sm' | 'icon' | 'icon-sm';
  showLabel?: boolean;
}

export function ShareButton({
  url,
  title = 'Check this out on VYBE',
  text = 'Join me on VYBE!',
  className,
  variant = 'ghost',
  size = 'icon-sm',
  showLabel = false,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  
  const handleShare = useCallback(async () => {
    // Use native share if available
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
        analytics.track('post_liked'); // Track share action
        return;
      } catch (error) {
        // User cancelled or share failed, fall through to copy
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error);
        }
      }
    }
    
    // Fallback to copy
    await handleCopy();
  }, [url, title, text]);
  
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  }, [url]);
  
  // Simple QR code using an external service
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=1a1a1a&color=ffffff`;
  
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={variant} 
            size={size}
            className={cn("gap-2", className)}
          >
            <Share2 className="h-4 w-4" />
            {showLabel && <span>Share</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy}>
            {copied ? (
              <Check className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy Link'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowQR(true)}>
            <QrCode className="h-4 w-4 mr-2" />
            QR Code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* QR Code Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">Share via QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-4 bg-white rounded-xl">
              <img 
                src={qrCodeUrl} 
                alt="QR Code" 
                className="w-48 h-48"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Scan this code to open the link
            </p>
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={handleCopy}
            >
              <Link2 className="h-4 w-4" />
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
