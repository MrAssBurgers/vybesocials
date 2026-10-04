import { fetchWithTimeout } from '@/lib/withTimeout';

export async function resolveCaptureFile(mediaUrl: string, mediaType: 'photo' | 'video', mediaFile?: File): Promise<File> {
  if (mediaFile) return mediaFile;
  const response = await fetchWithTimeout(mediaUrl, {}, 30_000);
  if (!response.ok) throw new Error('This capture could not be loaded. Return to the camera and try again.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('This capture is empty. Return to the camera and try again.');
  const type = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
  return new File([blob], `capture.${mediaType === 'video' ? 'mp4' : 'jpg'}`, { type });
}
