import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SignedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

export function SignedImage({ src, className, fallback, ...props }: SignedImageProps) {
  const signedUrl = useSignedUrl(src);

  if (!signedUrl) {
    return fallback || <Skeleton className={cn("w-full h-full", className)} />;
  }

  return <img src={signedUrl} className={className} {...props} />;
}

interface SignedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
}

export function SignedVideo({ src, className, fallback, ...props }: SignedVideoProps) {
  const signedUrl = useSignedUrl(src);

  if (!signedUrl) {
    return fallback || <Skeleton className={cn("w-full h-full", className)} />;
  }

  return <video src={signedUrl} className={className} {...props} />;
}

interface SignedAvatarImageProps {
  src: string | null | undefined;
  className?: string;
}

export function SignedAvatarImage({ src, className }: SignedAvatarImageProps) {
  const signedUrl = useSignedUrl(src);
  
  if (!signedUrl) return null;
  
  return <img src={signedUrl} className={cn("aspect-square h-full w-full", className)} />;
}
