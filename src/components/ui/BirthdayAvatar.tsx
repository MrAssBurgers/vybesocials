import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface BirthdayAvatarProps {
  src?: string | null;
  fallback: string;
  isBirthday?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Avatar with birthday decorations — crown on top, cake icon bottom-left.
 * Like Snapchat/Facebook birthday indicators.
 */
export const BirthdayAvatar = memo(function BirthdayAvatar({
  src,
  fallback,
  isBirthday = false,
  className,
  size = 'md',
}: BirthdayAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  };

  const crownSize = {
    sm: 'text-[10px] -top-2.5 left-1/2 -translate-x-1/2',
    md: 'text-xs -top-3 left-1/2 -translate-x-1/2',
    lg: 'text-sm -top-3.5 left-1/2 -translate-x-1/2',
  };

  const cakeSize = {
    sm: 'text-[8px] -bottom-0.5 -left-0.5',
    md: 'text-[10px] -bottom-0.5 -left-1',
    lg: 'text-xs -bottom-1 -left-1',
  };

  return (
    <div className="relative inline-flex">
      <Avatar className={cn(sizeClasses[size], isBirthday && 'ring-2 ring-amber-400/60', className)}>
        <AvatarImage src={src || undefined} />
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      {isBirthday && (
        <>
          {/* Crown on top */}
          <span className={cn('absolute pointer-events-none z-10 drop-shadow-md', crownSize[size])}>
            👑
          </span>
          {/* Cake bottom-left */}
          <span className={cn('absolute pointer-events-none z-10 drop-shadow-sm', cakeSize[size])}>
            🎂
          </span>
        </>
      )}
    </div>
  );
});
