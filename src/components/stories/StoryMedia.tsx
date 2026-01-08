import { useSignedUrl } from '@/hooks/useSignedUrl';

interface StoryMediaProps {
  mediaUrl: string;
  mediaType: string;
}

export function StoryMedia({ mediaUrl, mediaType }: StoryMediaProps) {
  const signedUrl = useSignedUrl(mediaUrl);

  if (!signedUrl) {
    return <div className="w-full h-full bg-muted animate-pulse" />;
  }

  if (mediaType === 'video') {
    return (
      <video
        src={signedUrl}
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
      />
    );
  }

  return (
    <img
      src={signedUrl}
      alt=""
      className="w-full h-full object-cover"
    />
  );
}
