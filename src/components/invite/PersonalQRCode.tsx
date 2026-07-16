import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthOptional } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPrimaryHex } from '@/lib/themeColor';

interface PersonalQRCodeProps {
  data: string;
  size?: number;
}

export function PersonalQRCode({ data, size = 220 }: PersonalQRCodeProps) {
  const auth = useAuthOptional();
  const profile = auth?.profile ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  const primaryHex = getPrimaryHex();
  
  // QR code with white background for scannability, colored foreground
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=${primaryHex}&margin=1&qzone=2&ecc=H`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative inline-block"
    >
      {/* Outer glow effect */}
      <div 
        className="absolute -inset-6 rounded-3xl opacity-20 blur-2xl"
        style={{ 
          background: `linear-gradient(135deg, #${primaryHex} 0%, #${primaryHex}40 100%)` 
        }}
      />
      
      {/* Main QR container */}
      <div className="relative rounded-2xl overflow-hidden p-3 liquid-glass border border-primary/30">
        <div className="relative bg-white rounded-xl p-3 shadow-inner">
          {/* QR Code Image */}
          <img 
            src={qrUrl} 
            alt="QR Code"
            width={size}
            height={size}
            className="block rounded-lg"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            style={{ display: isLoading ? 'none' : 'block' }}
          />
          
          {/* Loading skeleton */}
          {isLoading && (
            <div 
              className="bg-muted/20 rounded-lg flex items-center justify-center"
              style={{ width: size, height: size }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
              />
            </div>
          )}
          
          {/* Error state */}
          {hasError && (
            <div 
              className="bg-muted/10 rounded-lg flex items-center justify-center text-muted-foreground text-sm"
              style={{ width: size, height: size }}
            >
              Failed to load QR
            </div>
          )}
          
          {/* Profile picture overlay - centered on QR */}
          {!isLoading && !hasError && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="relative">
                {/* White background circle to cover QR center */}
                <div className="absolute inset-[-6px] bg-white rounded-full" />
                
                {/* Animated ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-[-4px] rounded-full"
                  style={{
                    background: `conic-gradient(from 0deg, #${primaryHex}, #${primaryHex}40, #${primaryHex})`
                  }}
                />
                
                {/* Profile avatar */}
                <Avatar className="w-14 h-14 border-[3px] border-white relative shadow-lg">
                  <AvatarImage src={profile?.avatar_url || ''} />
                  <AvatarFallback 
                    className="font-bold text-lg text-white"
                    style={{ backgroundColor: `#${primaryHex}` }}
                  >
                    {profile?.username?.[0]?.toUpperCase() || 'V'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Username badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-3 text-center"
        >
          <span 
            className="px-4 py-1.5 rounded-full text-xs font-semibold inline-block"
            style={{ 
              backgroundColor: `#${primaryHex}30`,
              color: `#${primaryHex}`
            }}
          >
            @{profile?.username || 'vybe'}
          </span>
        </motion.div>
      </div>
      
      {/* Corner accents */}
      <div 
        className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl-lg -translate-x-1 -translate-y-1"
        style={{ borderColor: `#${primaryHex}` }}
      />
      <div 
        className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr-lg translate-x-1 -translate-y-1"
        style={{ borderColor: `#${primaryHex}` }}
      />
      <div 
        className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl-lg -translate-x-1 translate-y-1"
        style={{ borderColor: `#${primaryHex}` }}
      />
      <div 
        className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br-lg translate-x-1 translate-y-1"
        style={{ borderColor: `#${primaryHex}` }}
      />
    </motion.div>
  );
}