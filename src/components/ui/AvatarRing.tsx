import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AvatarRingProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'default' | 'online' | 'calling' | 'ringing';
  pulse?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-20 w-20',
  '2xl': 'h-28 w-28',
};

const ringThicknessMap = {
  sm: 'ring-[2px]',
  md: 'ring-[2px]',
  lg: 'ring-[3px]',
  xl: 'ring-[3px]',
  '2xl': 'ring-[4px]',
};

const variantStyles = {
  default: 'ring-border/30',
  online: 'ring-green-500/50',
  calling: 'ring-green-500',
  ringing: 'ring-primary',
};

export function AvatarRing({
  children,
  size = 'md',
  variant = 'default',
  pulse = false,
  className,
}: AvatarRingProps) {
  return (
    <div 
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        sizeMap[size],
        ringThicknessMap[size],
        variantStyles[variant],
        pulse && "animate-pulse",
        className
      )}
    >
      {/* Ring container - exactly matches avatar size */}
      <div className={cn(
        "absolute inset-0 rounded-full",
        ringThicknessMap[size],
        variantStyles[variant],
        variant === 'ringing' && "animate-ping"
      )} />
      
      {/* Avatar content - fills container exactly */}
      <div className="relative w-full h-full rounded-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// Specific variant for call screens with perfect sizing
interface CallAvatarProps {
  src?: string | null;
  fallback: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isRinging?: boolean;
  isConnected?: boolean;
}

export function CallAvatar({
  src,
  fallback,
  size = '2xl',
  isRinging = false,
  isConnected = false,
}: CallAvatarProps) {
  const avatarSizes = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
    xl: 'h-20 w-20 text-2xl',
    '2xl': 'h-28 w-28 text-4xl',
  };

  const ringOffsets = {
    sm: '-inset-1',
    md: '-inset-1',
    lg: '-inset-1.5',
    xl: '-inset-2',
    '2xl': '-inset-3',
  };

  return (
    <div className={cn("relative", avatarSizes[size])}>
      {/* Outer animated ring for ringing state */}
      {isRinging && (
        <>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "absolute rounded-full border-2 border-primary/40",
                ringOffsets[size]
              )}
              style={{
                animation: `ping 2s cubic-bezier(0, 0, 0.2, 1) infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </>
      )}
      
      {/* Static ring */}
      <div 
        className={cn(
          "absolute rounded-full",
          ringOffsets[size],
          "ring-4",
          isConnected ? "ring-green-500/30" : isRinging ? "ring-primary/30" : "ring-white/10"
        )}
      />

      {/* Avatar */}
      <div className={cn(
        "relative rounded-full overflow-hidden bg-gradient-to-br from-primary/50 to-primary/20 flex items-center justify-center",
        avatarSizes[size]
      )}>
        {src ? (
          <img 
            src={src} 
            alt="Avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-semibold text-white">
            {fallback}
          </span>
        )}
      </div>

      {/* Online indicator for connected calls */}
      {isConnected && (
        <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />
      )}
    </div>
  );
}
