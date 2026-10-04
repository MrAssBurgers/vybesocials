import type { ComponentProps } from 'react';
import { AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';

export function CommunityAvatarImage({ src, ...props }: ComponentProps<typeof AvatarImage>) {
  const resolved = useSignedUrl(src);
  return <AvatarImage {...props} src={resolved || undefined} />;
}
