import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface SignedAvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

/** Avatar that signs Firebase Storage URLs before display. */
export const SignedAvatar = memo(function SignedAvatar({
  src,
  alt = '',
  fallback = '?',
  className,
  imageClassName,
  fallbackClassName,
}: SignedAvatarProps) {
  const signedUrl = useSignedUrl(src);
  const displaySrc = signedUrl || src || undefined;

  return (
    <Avatar className={className}>
      <AvatarImage src={displaySrc} alt={alt} className={cn('object-cover', imageClassName)} />
      <AvatarFallback className={fallbackClassName}>
        {fallback.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
});
