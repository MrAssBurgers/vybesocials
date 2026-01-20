import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PersonalQRCodeProps {
  data: string;
  size?: number;
}

// Simple QR code generator using canvas
// We'll use the external API but overlay the profile picture and theme colors
export function PersonalQRCode({ data, size = 200 }: PersonalQRCodeProps) {
  const { profile } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qrLoaded, setQrLoaded] = useState(false);
  
  // Get CSS custom properties for theming
  const getPrimaryColor = () => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const primary = style.getPropertyValue('--primary').trim();
    // Convert HSL to hex for QR code API
    if (primary) {
      // Parse HSL values
      const hslMatch = primary.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%?\s+(\d+(?:\.\d+)?)%?/);
      if (hslMatch) {
        const h = parseFloat(hslMatch[1]);
        const s = parseFloat(hslMatch[2]) / 100;
        const l = parseFloat(hslMatch[3]) / 100;
        return hslToHex(h, s, l);
      }
    }
    return 'a855f7'; // fallback purple
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const primaryColor = getPrimaryColor();
    
    // Generate QR with primary color
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=transparent&color=${primaryColor}&margin=0&qzone=2`;
    
    const qrImage = new Image();
    qrImage.crossOrigin = 'anonymous';
    
    qrImage.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, size, size);
      
      // Draw rounded rectangle background with gradient
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#0a0a0a');
      gradient.addColorStop(0.5, '#1a1a1a');
      gradient.addColorStop(1, '#0a0a0a');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, 16);
      ctx.fill();
      
      // Draw QR code
      ctx.drawImage(qrImage, 0, 0, size, size);
      
      // Create center cutout for profile picture
      const centerSize = size * 0.28;
      const centerX = (size - centerSize) / 2;
      const centerY = (size - centerSize) / 2;
      
      // Draw glow effect behind the center circle
      const glowGradient = ctx.createRadialGradient(
        size / 2, size / 2, centerSize * 0.3,
        size / 2, size / 2, centerSize * 0.8
      );
      glowGradient.addColorStop(0, `#${primaryColor}40`);
      glowGradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, centerSize * 0.8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw dark circle background for profile pic
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, centerSize / 2 + 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw border ring
      ctx.strokeStyle = `#${primaryColor}`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, centerSize / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
      
      setQrLoaded(true);
      setIsLoading(false);
    };
    
    qrImage.onerror = () => {
      setIsLoading(false);
    };
    
    qrImage.src = qrUrl;
  }, [data, size]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative inline-block"
    >
      {/* Outer glow effect */}
      <div 
        className="absolute -inset-4 rounded-3xl opacity-30 blur-xl"
        style={{ 
          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.3) 100%)' 
        }}
      />
      
      {/* Main QR container */}
      <div className="relative rounded-2xl overflow-hidden p-4 liquid-glass border border-primary/30">
        <div className="relative">
          {/* Canvas for QR */}
          <canvas 
            ref={canvasRef} 
            width={size} 
            height={size}
            className="rounded-xl"
          />
          
          {/* Profile picture overlay */}
          {qrLoaded && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="relative">
                {/* Animated ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  className="absolute -inset-1 rounded-full"
                  style={{
                    background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--primary) / 0.2), hsl(var(--primary)))'
                  }}
                />
                
                <Avatar className="w-14 h-14 border-2 border-background relative">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                    {profile?.username?.[0]?.toUpperCase() || 'V'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </motion.div>
          )}
          
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-xl">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
              />
            </div>
          )}
        </div>
        
        {/* Username badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-3 text-center"
        >
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary">
            @{profile?.username || 'vybe'}
          </span>
        </motion.div>
      </div>
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-xl -translate-x-1 -translate-y-1" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-xl translate-x-1 -translate-y-1" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-xl -translate-x-1 translate-y-1" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-xl translate-x-1 translate-y-1" />
    </motion.div>
  );
}