interface Props {
  url: string;
  mediaType: 'image' | 'video' | 'gif' | null;
  className?: string;
}

export function AnnouncementMediaPreview({ url, mediaType, className = '' }: Props) {
  if (!url) return null;

  if (mediaType === 'video') {
    return (
      <video
        src={url}
        controls
        muted
        autoPlay
        playsInline
        className={`w-full rounded-2xl object-cover ${className}`}
      />
    );
  }

  if (mediaType === 'gif') {
    return (
      <video
        src={url}
        loop
        muted
        autoPlay
        playsInline
        className={`w-full rounded-2xl object-cover ${className}`}
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`w-full rounded-2xl object-cover ${className}`}
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  );
}
