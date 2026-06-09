/** Videos longer than this are `video` (YouTube-style); shorter are `short` (clips). */
export const LONG_VIDEO_THRESHOLD_SEC = 60;

export function resolveVideoContentType(file: File): Promise<'short' | 'video'> {
  if (!file.type.startsWith('video/')) {
    return Promise.resolve('short');
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const finish = (type: 'short' | 'video') => {
      URL.revokeObjectURL(url);
      resolve(type);
    };

    video.onloadedmetadata = () => {
      finish(video.duration > LONG_VIDEO_THRESHOLD_SEC ? 'video' : 'short');
    };
    video.onerror = () => finish('short');
    video.src = url;
  });
}
